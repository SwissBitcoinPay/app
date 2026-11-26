import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { Received } from "@/features/settings/declarations-copy";
import { invoiceNetwork, type InvoiceProof } from "@/features/terminal/invoice";
import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import { FINAL_DELAY_SECONDS, type Settlement } from "@/features/terminal/useSale";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { inBatches } from "@/lib/batches";
import { paidPreimage, type Invoice } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import {
  PAYMENT_LINK_TIMEOUT_MS,
  fetchLinkCopies,
  fetchOwnerFinalLists,
  ownerFinalLinkEvent,
  type LinkCopy
} from "@/lib/payment-link/link";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { payloadOfSale, type SharedSale } from "@/lib/payment-link/payload";
import { nowUnix } from "@/lib/rates/snapshot";
import type { OwnerDevice } from "@/lib/settings/merchant";
import {
  assistantSecretKey,
  deriveIssueKey,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  memberSecret,
  ownerDeviceSecret,
  type MemberKeys,
  type TeamKeys
} from "@/lib/team/keys";
import { fetchLinks } from "@/lib/team/member-records";
import { isIssuedAddress } from "@/lib/team/onchain-lot";
import type { Assistant, RemovedSeat, TeamMember } from "@/lib/team/roster";

import {
  existingFinal,
  finalOf,
  isProvisionalCancel,
  isValidFinal,
  ownerSettlementOf,
  publishFinal,
  type FinalizeOutcome
} from "./finalize";

/*
 * The owner's reconciliation of the payment links its employees and its own devices made: a
 * device that never comes back must not leave links that never get
 * their final version. With the account open, the owner reads the links each made (their records,
 * readable by the device and the owner only: each link's author, its sale's key and its relays,
 * src/lib/team/member-records.ts), then each link from its own relays by its author
 * (src/lib/payment-link/link.ts: events others publish at its address never count). A link without
 * a final version, whose sale ended long enough ago for its own device to have published one, is
 * followed for a moment (SaleSettler) and gets the owner's final version, signed with the owner's
 * key of that sale (owner-key.ts). unsettled.ts reads the same links to tell whether one is not
 * final yet.
 */

/**
 * How far back the links are reconciled: a year (an owner who opens the
 * account once a year still settles the links of a device that never came back). Not further: the
 * amount due of a sale paid in a currency is proven with the point of its hour, which CoinGecko
 * gives for 365 days (HISTORY_DAYS, src/lib/rates/sources.ts). The links' records have an author of
 * their own (member-records.ts): a year of them is read without the year's sales.
 */
export const OWNER_FINALS_LOOKBACK_SECONDS = 365 * 24 * 3600;
/**
 * The owner waits this much longer than the device that made the link (FINAL_DELAY_SECONDS after
 * the sale's last invoice): that device publishes first when it can.
 */
export const OWNER_FINALS_MARGIN_SECONDS = 3600;

/** Whose links the owner reads: an employee, an assistant, or one of its own devices. */
export type LinkHolder = {
  id: string;
  keys: MemberKeys;
  /**
   * An employee or an assistant: its record of a link names the owner's tag of its on-chain address
   * (src/lib/team/onchain-lot.ts). The owner's own devices take theirs from the wallet, untagged.
   */
  employee: boolean;
  /**
   * An assistant: an employee's keys from its own secret
   * (deriveAssistantKeys), whose links are its invoices'. "By" names it, never as an employee.
   */
  assistant?: true;
  /**
   * An employee removed from the team: its removal and REMOVED_SEAT_GRACE_SECONDS (Unix seconds).
   * A record its keys date later is not its own (whoever kept them): never
   * read. A record dated before is read: whoever holds its keys can date one so, which findUnsettled
   * then counts only as long as a sale of the point of sale lasts.
   */
  until?: number;
};

/**
 * The `employees` (the roster's, src/features/team/roster.ts), the owner's `devices` (the
 * settings') and the `assistants` (the roster's), whose links the owner reads.
 */
export function linkHolders(
  team: TeamKeys,
  employees: readonly TeamMember[],
  devices: readonly OwnerDevice[],
  assistants: readonly Pick<Assistant, "id">[] = []
): LinkHolder[] {
  return [
    ...employees.map((member) => ({
      id: member.id,
      keys: deriveMemberKeys(memberSecret(team, member.id)),
      employee: true
    })),
    ...devices.map((device) => ({
      id: device.id,
      keys: deriveMemberKeys(ownerDeviceSecret(team, device.id)),
      employee: false
    })),
    ...assistants.map(({ id }) => assistantHolder(team, id))
  ];
}

/** The assistant `id` as a holder of links. */
function assistantHolder(team: TeamKeys, id: string): LinkHolder {
  return {
    id,
    keys: deriveAssistantKeys(assistantSecretKey(team, id)).member,
    employee: true,
    assistant: true
  };
}

/**
 * The employees and the assistants `removed` from the team (each once, its first removal), whose
 * links the owner still reads (`until`: LinkHolder); those removed before `since` left out, and
 * those of `except` (in the team again: an id is never reused, a removal is final).
 */
export function removedHolders(
  team: TeamKeys,
  removed: readonly RemovedSeat[],
  {
    since = Number.NEGATIVE_INFINITY,
    except = []
  }: { since?: number; except?: readonly string[] } = {}
): LinkHolder[] {
  const first = new Map<
    string,
    { role: "employee" | "assistant"; id: string; removedAt: number }
  >();
  for (const seat of removed) {
    if (seat.role === "integration" || except.includes(seat.id)) continue;
    const key = `${seat.role}:${seat.id}`;
    const known = first.get(key);
    if (!known || seat.removedAt < known.removedAt) {
      first.set(key, { role: seat.role, id: seat.id, removedAt: seat.removedAt });
    }
  }
  return [...first.values()]
    .filter(({ removedAt }) => removedAt >= since)
    .map(({ role, id, removedAt }) => ({
      ...(role === "assistant"
        ? assistantHolder(team, id)
        : { id, keys: deriveMemberKeys(memberSecret(team, id)), employee: true }),
      until: removedAt + REMOVED_SEAT_GRACE_SECONDS
    }));
}

/**
 * Whose links the owner settles (OwnerLinksFinalizer.tsx): the roster's employees and assistants,
 * those removed within the year too (their removal never waits for their links,
 * src/features/team/owner.ts removeEmployee, removeAssistant: the owner settles those made before
 * it), and the owner's `devices`.
 */
export function settlingHolders(
  team: TeamKeys,
  roster: {
    employees: readonly TeamMember[];
    assistants: readonly Pick<Assistant, "id">[];
    removed: readonly RemovedSeat[];
  },
  devices: readonly OwnerDevice[],
  now: number = nowUnix()
): LinkHolder[] {
  return [
    ...linkHolders(team, roster.employees, devices, roster.assistants),
    ...removedHolders(team, roster.removed, {
      since: now - OWNER_FINALS_LOOKBACK_SECONDS,
      except: [...roster.employees, ...roster.assistants].map(({ id }) => id)
    })
  ];
}

/** A link of an employee's sale without a final version: the owner settles its sale. */
export type OwnerFinalJob = {
  /** Hex: the link's author, which names it and which the owner's final version names. */
  id: string;
  saleKey: Uint8Array;
  sale: SharedSale;
  /** The link itself, published again with the owner's final version (it names the owner key). */
  linkEvent: NostrEvent;
  /**
   * Whether the sale's on-chain address is one the owner gave the employee: the employee's record
   * of the link names it with the owner's tag (src/lib/team/onchain-lot.ts). Only then does the
   * owner vouch for an on-chain payment (never for one of its own devices', untagged).
   */
  onchainVerified: boolean;
  /** The link's relays (its record's): its sale is followed and finalized there. */
  relays: readonly string[];
  /**
   * Its sale's tolerance of on-chain underpayments, as its holder's record of the link says it
   * (basis points, src/lib/onchain/tolerance.ts): the owner settles the sale as its device would.
   */
  tolerance: number;
};

/** A link as its holder's record names it (no holder: one of this device's pending links). */
export type RecordedLink = {
  author: string;
  key: Uint8Array;
  holder: LinkHolder | null;
  /** When its holder says it made it (its record's `createdAt`); null for this device's own. */
  createdAt: number | null;
  onchainTag: string | null;
  relays: readonly string[];
  /** Its sale's tolerance (the record's; none for one of this device's pending links). */
  tolerance: number;
};

/** A link without a final version of its own: the copy the relays hold, the link's or none. */
export type OpenLink = { recorded: RecordedLink; copy: LinkCopy | null };

/** Holders whose records are read at once (inBatches): a big team in several rounds. */
export const HOLDERS_AT_ONCE = 5;

/** `items` grouped by their relays: each group is read on its own list. */
export function byRelays<T extends { relays: readonly string[] }>(items: Iterable<T>): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = JSON.stringify(item.relays);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return [...groups.values()];
}

/**
 * The links `holders` made in the last year (OWNER_FINALS_LOOKBACK_SECONDS), and `extra` ones (this
 * device's pending links), that have no final version of their own, each read on its own relays.
 * `unread`: links of relays that could not be read. With `accountRelays` (the account's, which
 * gave the records), links none of whose relays answered and that name none of them are left
 * out: a payer's page reads a link on the relays its URL names, so nobody can
 * open these either; otherwise a record naming relays that do not exist (whoever opened an
 * employee's invitation first can write one) would hold back for a year the
 * employee's removal, a change of relays and the account's deletion. A link naming one of the
 * account's relays that did not answer is unread: that relay may only be out of reach a moment.
 * A removed employee's records dated after its removal (`until`) are left out, and those `keep`
 * refuses, before any link is read. The records are read on `recordsRelays` (the device's relays
 * by default), each link on its own relays. Null when the records could not be read.
 */
export async function openLinks(
  holders: readonly LinkHolder[],
  now: number = nowUnix(),
  extra: readonly Omit<RecordedLink, "holder" | "onchainTag" | "tolerance" | "createdAt">[] = [],
  {
    accountRelays,
    recordsRelays,
    keep = () => true
  }: {
    accountRelays?: readonly string[];
    recordsRelays?: readonly string[];
    keep?: (recorded: RecordedLink) => boolean;
  } = {}
): Promise<{ open: OpenLink[]; unread: number } | null> {
  const links = new Map<string, RecordedLink>();
  const read = await inBatches(holders, HOLDERS_AT_ONCE, async (holder) => {
    const records = await fetchLinks(
      holder.keys,
      now - OWNER_FINALS_LOOKBACK_SECONDS,
      recordsRelays
    );
    return records && { holder, records };
  });
  if (read === null) return null;
  for (const { holder, records } of read) {
    for (const record of records) {
      if (holder.until !== undefined && record.createdAt > holder.until) continue;
      const recorded: RecordedLink = {
        author: record.link,
        key: hexToBytes(record.saleKey),
        holder,
        createdAt: record.createdAt,
        onchainTag: record.onchainTag,
        relays: record.relays,
        tolerance: record.tolerance ?? 0
      };
      if (keep(recorded)) links.set(record.link, recorded);
    }
  }
  for (const link of extra) {
    if (!links.has(link.author))
      links.set(link.author, {
        ...link,
        holder: null,
        createdAt: null,
        onchainTag: null,
        tolerance: 0
      });
  }
  if (links.size === 0) return { open: [], unread: 0 };
  const network = invoiceNetwork();
  const open: OpenLink[] = [];
  let unread = 0;
  for (const group of byRelays(links.values())) {
    const { relays } = group[0]!;
    const copies = await fetchLinkCopies(group, network, relays);
    if (copies === null) {
      if (accountRelays && !relays.some((relay) => accountRelays.includes(relay))) continue;
      unread += group.length;
      continue;
    }
    for (const recorded of group) {
      const found = copies.get(recorded.author) ?? [];
      // Its own final version: done.
      if (found.some(({ link }) => link.kind === "sale" && link.sale.final !== null)) continue;
      open.push({ recorded, copy: found.find(({ link }) => link.kind === "sale") ?? null });
    }
  }
  return { open, unread };
}

/**
 * Among `links` (each its author, the sale's key and the owner key it names), those whose owner's
 * final version is on their relays, read list by list; given `settled`, only those one of whose
 * owner's final versions it keeps. Null when a list could not be read.
 */
export async function withOwnerFinals(
  links: readonly { author: string; key: Uint8Array; owner: string; relays: readonly string[] }[],
  settled: (copy: LinkCopy) => boolean = () => true
): Promise<Set<string> | null> {
  const finals = new Set<string>();
  if (links.length === 0) return finals;
  const network = invoiceNetwork();
  for (const group of byRelays(links)) {
    const found = await fetchOwnerFinalLists(group, network, group[0]!.relays);
    if (found === null) return null;
    for (const [author, copies] of found) if (copies.some(settled)) finals.add(author);
  }
  return finals;
}

/**
 * The links among `open` whose copy names this business (its link owner key, which the owner signs
 * with, and its registry key) and that `accept` keeps, as jobs of the owner. `onchainVerified` only
 * for an address the owner gave the employee (the owner's tag its record of the link carries). A
 * link no relay holds cannot be opened by a payer: never a job.
 */
export function ownerJobsOf(
  team: TeamKeys,
  open: readonly OpenLink[],
  accept: (sale: SharedSale) => boolean = () => true
): OwnerFinalJob[] {
  const owner = deriveLinkOwner(team).publicKey;
  const registryKey = bytesToHex(deriveRegistryKey(team));
  const issueKey = deriveIssueKey(team);
  const jobs: OwnerFinalJob[] = [];
  for (const { recorded, copy } of open) {
    if (copy?.link.kind !== "sale") continue;
    const { sale } = copy.link;
    if (sale.owner !== owner || bytesToHex(sale.registryKey) !== registryKey || !accept(sale)) {
      continue;
    }
    const { author, key, holder, onchainTag, relays, tolerance } = recorded;
    jobs.push({
      id: author,
      saleKey: key,
      sale,
      linkEvent: copy.event,
      onchainVerified:
        holder !== null &&
        holder.employee &&
        sale.onchainAddress !== null &&
        onchainTag !== null &&
        isIssuedAddress(issueKey, holder.id, sale.onchainAddress, onchainTag),
      relays,
      tolerance
    });
  }
  return jobs;
}

/**
 * The links `holders` made in the last year (OWNER_FINALS_LOOKBACK_SECONDS) that have no final
 * version yet, the link's own nor the owner's, once their sale ended more than FINAL_DELAY_SECONDS +
 * OWNER_FINALS_MARGIN_SECONDS ago, or while it lasts (a sale paid in full is
 * settled at once, an invoice's months before its end; SaleSettler finds the others pending). A
 * link the owner canceled provisionally (isProvisionalCancel: every owner's final version of it
 * one) is followed alike, its settlement replacing the cancellation (publishOwnerFinal). A
 * link counts only when it names this business (its Lightning address, registry key and owner key).
 * Each link is read on its own relays; the links of relays that could not be read wait for the next
 * round. Null when the records could not be read.
 */
export async function findOwnerFinalJobs(
  team: TeamKeys,
  holders: readonly LinkHolder[],
  lightningAddress: string,
  now: number = nowUnix()
): Promise<OwnerFinalJob[] | null> {
  const owner = deriveLinkOwner(team).publicKey;
  const found = await openLinks(holders, now);
  if (found === null) return null;
  const candidates = ownerJobsOf(
    team,
    found.open,
    (sale) =>
      sale.lightningAddress === lightningAddress &&
      (sale.endsAt + FINAL_DELAY_SECONDS + OWNER_FINALS_MARGIN_SECONDS <= now ||
        (sale.startsAt <= now && now < sale.endsAt))
  );
  const jobs: OwnerFinalJob[] = [];
  for (const group of byRelays(candidates)) {
    // A relay that missed the owner's latest final version may still send the cancellation it
    // replaced: one final version that is not a provisional cancellation settles the link.
    const finals = await withOwnerFinals(
      group.map(({ id, saleKey, relays }) => ({ author: id, key: saleKey, owner, relays })),
      (copy) => !isProvisionalCancel(copy)
    );
    if (finals === null) continue;
    jobs.push(...group.filter((job) => !finals.has(job.id)));
  }
  return jobs;
}

/**
 * The proof of the owner's wallet for its jobs' invoices (SaleSettler's `proof`): the owner
 * settles a link up to a year after its sale, when the LNURL server may no
 * longer know its invoices (its "Not found" would tell an expired sale), while the wallet keeps
 * what it received. `received`: the wallet's payments received (readWallet, its whole history once
 * a sync reached the network). An invoice the wallet never received is "unpaid"; one received,
 * "paid" with the preimage the wallet released (else the one LUD-21 gives, `lud21`), checked
 * against its hash; "unknown" otherwise (not proven yet, never a guess).
 */
export function walletProof(
  received: readonly Received[],
  lud21: (invoice: Invoice) => Promise<string | null> = (invoice) =>
    paidPreimage(invoice).catch(() => null)
): InvoiceProof {
  const byHash = new Map(received.map((payment) => [payment.hash, payment]));
  const proves = (preimage: string | null, hash: string): preimage is string =>
    preimage !== null &&
    /^[0-9a-f]{64}$/.test(preimage) &&
    bytesToHex(sha256(hexToBytes(preimage))) === hash;
  return async (invoice) => {
    const hash = invoice.decoded.paymentHash.toLowerCase();
    const payment = byHash.get(hash);
    if (!payment) return { status: "unpaid" };
    if (!payment.completed) return { status: "unknown" };
    const preimage = proves(payment.preimage, hash) ? payment.preimage : await lud21(invoice);
    return proves(preimage, hash)
      ? { status: "paid", preimage, paidAt: new Date(payment.at * 1000) }
      : { status: "unknown" };
  };
}

/**
 * Publishes the owner's final version of `job`'s link from its sale's settlement, unless a final
 * version is there by then (the employee's device may have come back). Over a provisional
 * cancellation (isProvisionalCancel), the owner's settlement of the sale (ownerSettlementOf: paid,
 * underpaid, or canceled for good). The link itself goes again to every relay with it: a payer's
 * page finds the owner's final version through the owner key the link names.
 */
export async function publishOwnerFinal(
  team: TeamKeys,
  job: OwnerFinalJob,
  settlement: Settlement,
  now: number = nowUnix()
): Promise<FinalizeOutcome> {
  if (settlement.finalFrom > now) return "notReady";
  try {
    const ownerSecret = deriveLinkOwner(team).secretKey;
    const signer = saleOwnerSecretKey(ownerSecret, job.saleKey);
    // The link's relays: where its payer's page looks, and where a majority must hold the final.
    const { relays } = job;
    const existing = await existingFinal(job.id, job.saleKey, job.sale.owner, signer, relays);
    if (existing === null) return "failed";
    const canceled = existing !== false && isProvisionalCancel(existing);
    if (existing && !canceled) return "alreadyFinal";
    // Paid on-chain: only to an address the owner gave the employee (its tag in the employee's
    // record of the link). An employee's modified app could name an address of its own: the owner never vouches
    // for a payment it did not receive, and the employee's device publishes that version itself.
    if (settlement.onchain !== null && !job.onchainVerified) return "failed";
    const payload = payloadOfSale(job.sale);
    const final = canceled ? ownerSettlementOf(settlement, job.id) : finalOf(settlement, job.id);
    if (!isValidFinal(payload, final)) {
      logFailure("Refused final version of a payment link", final);
      return "failed";
    }
    await publishToRelays(
      job.linkEvent,
      {
        relays,
        timeoutMs: PAYMENT_LINK_TIMEOUT_MS,
        channel: "anonymous",
        authKey: signer
      },
      { quorum: "majority" }
    );
    const event = ownerFinalLinkEvent(ownerSecret, job.id, job.saleKey, payload, final, now);
    await publishFinal(event, signer, relays);
    return "published";
  } catch (error) {
    logFailure("Publishing the owner's final version failed", error);
    return "failed";
  }
}
