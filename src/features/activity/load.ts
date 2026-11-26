import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { isProvisionalCancel } from "@/features/payment-link/finalize";
import { byRelays, linkHolders, type LinkHolder } from "@/features/payment-link/owner-finals";
import { getMemberKeys } from "@/features/team/member";
import { openTeam } from "@/features/team/owner";
import { knownRoster, readRoster, type Roster } from "@/features/team/roster";
import { INVOICE_EXPIRY_SECONDS, invoiceNetwork } from "@/features/terminal/invoice";
import { readRecoveredTransactions } from "@/features/wallet/funds-recovery";
import {
  betterCopy,
  fetchLinkCopies,
  fetchOwnerFinalCopies,
  type LinkCopy
} from "@/lib/payment-link/link";
import type { PaymentLinkPayload, SharedSale } from "@/lib/payment-link/payload";
import { loadPendingLinks } from "@/lib/payment-link/pending";
import { nowUnix } from "@/lib/rates/snapshot";
import { monthOf, type ArchivedSale } from "@/lib/registry/archive";
import { deriveSaleKeys, ownerDeclarationsOf } from "@/lib/registry/registry";
import type { OwnerDevice } from "@/lib/settings/merchant";
import {
  deriveLinkOwner,
  deriveRegistryKey,
  deriveRegistryReader,
  type TeamKeys
} from "@/lib/team/keys";
import { fetchMemberRecords, fetchProfiles, type MemberRecords } from "@/lib/team/member-records";
import type { TeamMember } from "@/lib/team/roster";

import { archiveEverRead, isArchivable, knownMonth, readArchive } from "./archive";
import {
  linkedSalesOf,
  readTeamLinks,
  teamLinkHolders,
  withLinkedSale,
  type LinkedSale
} from "./declared-links";
import type { ActivityBy, DeclaredSale, LinkInfo, LinkOutcome, RecordedSale } from "./model";
import {
  readIntegrationOrders,
  type AddressReads,
  type IntegrationOrder,
  type WalletView
} from "./integration-orders";
import { readOnchainSales, type OnchainSales, type ReceivedDeposit } from "./onchain-sales";
import { NO_SEATS, takerResolver, type Seats } from "./takers";

/*
 * Reads what the activity lists (model.ts) from the relays: the employees' records (their sales and
 * payment links, readable by the employee and the owner, src/lib/team/member-records.ts), each link
 * by its author with its final version (src/lib/payment-link/link.ts), and, for the owner, the
 * registry's declarations of the wallet's payments (src/lib/registry/). Never from anyone else's
 * events: each read names its authors, or opens with a key only the business holds.
 */

/**
 * How far back the employees' sales and links are read for the lists: a month (past it, a sale is
 * told by its declaration, and a link by its payments). The owner's reconciliation of the links
 * goes back a year (OWNER_FINALS_LOOKBACK_SECONDS).
 */
export const ACTIVITY_LOOKBACK_SECONDS = 31 * 24 * 3600;

/** A payment link to read: its author, its sale's key, and what this device knows of it. */
type LinkRef = {
  id: string;
  key: Uint8Array;
  createdAt: number;
  by: ActivityBy | null;
  /** This device's own pending link (pending.ts): its sale, should no relay answer. */
  payload: PaymentLinkPayload | null;
  /** Where the link is (its URL's relays): its record's, a pending link's own. */
  relays: readonly string[];
};

/**
 * A link's final outcome as a row needs it (model.ts), null without a final version; `provisional`
 * for a cancellation its sale's settlement may still replace (isProvisionalCancel).
 */
export function outcomeOf(sale: SharedSale, provisional = false): LinkOutcome | null {
  const { final } = sale;
  if (!final) return null;
  return {
    ...(provisional ? { provisional: true as const } : {}),
    status: final.status,
    received: final.received,
    due: final.due,
    lightning: final.lightning.map(({ decoded }) => decoded.paymentHash),
    transactions: final.onchain?.transactions.map(({ txid }) => txid) ?? [],
    transactionsAt: new Map(
      // Unix milliseconds in the final version (FinalTransaction), seconds here.
      final.onchain?.transactions.map(({ txid, receivedAt }) => [
        txid,
        Math.floor(receivedAt / 1000)
      ]) ?? []
    )
  };
}

function bestOf(copies: readonly LinkCopy[] | undefined): LinkCopy | null {
  return (copies ?? []).reduce<LinkCopy | null>((best, copy) => betterCopy(best, copy), null);
}

/**
 * What a link must name to be one of the business's (the owner's view, as owner-finals.ts): its
 * link owner key, its registry key and, when known, its Lightning address.
 */
type Business = { owner: string; registryKey: string; lightningAddress: string | null };

function namesBusiness(sale: SharedSale, business: Business): boolean {
  return (
    sale.owner === business.owner &&
    bytesToHex(sale.registryKey) === business.registryKey &&
    (business.lightningAddress === null || sale.lightningAddress === business.lightningAddress)
  );
}

/**
 * Each link as its relays hold it (each read on its own list), with its final version: the link's
 * own, else the owner's (asked for every link without its own, signed by the owner key the link
 * names; of two, the one that counts, betterCopy: its settlement of a sale it canceled replaces the
 * cancellation). Not only once its sale ended: the owner cancels a link still payable ("Cancel the
 * invoice", an employee's removal), and a sent invoice is payable for months; read only after its
 * due date, its cancellation would show "Open" again on the next read. A link no relay holds shows
 * from this device's pending link, without its outcome; else it is left out. Given `business`, a
 * copy that does not name it is left out too: an employee's modified app could record a link of
 * another Lightning address, or naming another owner key; and the owner's final versions are asked
 * at once with the links (the owner key every link must name is known): one after the other, a
 * relay that never answers held the list for its timeout twice.
 */
async function readLinks(
  refs: readonly LinkRef[],
  network: string,
  business: Business | null = null
): Promise<LinkInfo[]> {
  if (refs.length === 0) return [];
  const readOwnerFinals = async (
    wanted: readonly LinkRef[],
    ownerOf: (ref: LinkRef) => string
  ): Promise<Map<string, LinkCopy>> => {
    const found = new Map<string, LinkCopy>();
    await Promise.all(
      byRelays(wanted).map(async (group) => {
        const finals = await fetchOwnerFinalCopies(
          group.map((ref) => ({ author: ref.id, key: ref.key, owner: ownerOf(ref) })),
          network,
          group[0]!.relays
        ).catch(() => null);
        for (const [author, copy] of finals ?? []) found.set(author, copy);
      })
    );
    return found;
  };
  const early = business ? readOwnerFinals(refs, () => business.owner) : null;
  const copies = new Map<string, LinkCopy[]>();
  await Promise.all(
    byRelays(refs).map(async (group) => {
      const found = await fetchLinkCopies(
        group.map(({ id, key }) => ({ author: id, key })),
        network,
        group[0]!.relays
      );
      for (const [author, list] of found ?? []) copies.set(author, list);
    })
  );
  const sales = new Map<string, SharedSale>();
  for (const ref of refs) {
    const best = bestOf(copies.get(ref.id));
    if (best?.link.kind !== "sale") continue;
    if (business && !namesBusiness(best.link.sale, business)) continue;
    sales.set(ref.id, best.link.sale);
  }
  const unsettled = new Set(
    refs.filter((ref) => {
      const sale = sales.get(ref.id);
      return sale !== undefined && sale.final === null;
    })
  );
  const ownerFinals =
    (await early) ?? (await readOwnerFinals([...unsettled], (ref) => sales.get(ref.id)!.owner));
  const links: LinkInfo[] = [];
  for (const ref of refs) {
    // Only for a link without a final version of its own, as its copy names the business.
    const owned = unsettled.has(ref) ? ownerFinals.get(ref.id) : undefined;
    const sale =
      (owned?.link.kind === "sale" ? owned.link.sale : undefined) ?? sales.get(ref.id) ?? null;
    const known = sale ?? ref.payload;
    if (!known) continue;
    links.push({
      id: ref.id,
      saleAuthor: deriveSaleKeys(ref.key).nostr.publicKey,
      key: ref.key,
      relays: ref.relays,
      createdAt: ref.createdAt,
      fiat: known.fiat,
      note: known.note,
      endsAt: known.endsAt,
      final: sale ? outcomeOf(sale, owned !== undefined && isProvisionalCancel(owned)) : null,
      by: ref.by
    });
  }
  return links;
}

/** This device's own payment links not settled yet (pending.ts), as links to read. */
async function pendingRefs(network: string, by: ActivityBy | null): Promise<LinkRef[]> {
  const pending = await loadPendingLinks(network);
  return pending.map((link) => ({
    id: link.id,
    key: hexToBytes(link.key),
    createdAt: link.createdAt,
    by,
    payload: link.payload,
    relays: link.relays
  }));
}

/**
 * A sale's span before one of its invoices (sightingsOf): a sale lasts INVOICE_EXPIRY_SECONDS,
 * with a margin for the clocks of its devices.
 */
const SALE_SPAN_SECONDS = INVOICE_EXPIRY_SECONDS + 5 * 60;

/**
 * The transactions a sale's device recorded paying its address (`team-sale-tx`, the latest date of
 * each): those of the same device, at the address its record names, recorded from the sale's span
 * before the invoice on (an address is shown again only once read unpaid, onchain-pool.ts).
 */
function sightingsOf(
  records: MemberRecords,
  sale: MemberRecords["sales"][number]
): NonNullable<RecordedSale["onchain"]> | null {
  const address = sale.onchainAddress;
  if (address === null) return null;
  const from = sale.createdAt - SALE_SPAN_SECONDS;
  return {
    address,
    sightings: records.sightings
      .filter((sighting) => sighting.address === address && sighting.at >= from)
      .map(({ txid, at }) => ({ txid, at }))
  };
}

function recordedSales(records: MemberRecords, by: ActivityBy | null): RecordedSale[] {
  return records.sales.map((sale) => ({
    paymentHash: sale.paymentHash,
    fiat: sale.fiat,
    note: sale.note,
    sats: BigInt(sale.sats),
    createdAt: sale.createdAt,
    expiresAt: sale.expiresAt,
    paidAt: sale.paidAt,
    sale: sale.sale,
    underpaid: sale.underpaid
      ? {
          at: sale.underpaid.at,
          received: BigInt(sale.underpaid.received),
          due: sale.underpaid.due === null ? null : BigInt(sale.underpaid.due),
          transactions: sale.underpaid.transactions
        }
      : null,
    onchain: sightingsOf(records, sale),
    saleKey: sale.saleKey ? hexToBytes(sale.saleKey) : null,
    by
  }));
}

function linkRefs(records: MemberRecords, by: ActivityBy | null): LinkRef[] {
  return records.links.map((link) => ({
    id: link.link,
    key: hexToBytes(link.saleKey),
    createdAt: link.createdAt,
    by,
    payload: null,
    relays: link.relays
  }));
}

/** Adds `more` to `refs`, a link known twice once (the relays' record first). */
function mergeRefs(refs: LinkRef[], more: readonly LinkRef[]): LinkRef[] {
  const known = new Map(refs.map((ref) => [ref.id, ref]));
  for (const ref of more) {
    const found = known.get(ref.id);
    if (found) found.payload ??= ref.payload;
    else known.set(ref.id, ref);
  }
  return [...known.values()];
}

/**
 * What the owner's list adds to the wallet (ownerActivity): the sales and links of its employees
 * and of its own devices.
 */
export type OwnerRecords = {
  sales: RecordedSale[];
  links: LinkInfo[];
  /**
   * Employees and devices whose records no relay gave: their sales show without who took them
   * until the next read, their open invoices not at all.
   */
  unread: number;
  /** The team's employees as "By" shows them (name, photo), by id: a sale's taker names one. */
  members: ReadonlyMap<string, ActivityBy>;
  /**
   * The roster (src/features/team/roster.ts) once a majority of the relays gave it since the
   * account opened: whose marks vouch for a sale (model.ts). Null before: none does yet.
   */
  roster: Roster | null;
};

/**
 * A link the owner knows of besides the records: an invoice's of "New invoice", the owner's ("You",
 * `by` absent) or an assistant's (`by` names it).
 */
export type KnownLink = {
  id: string;
  key: string;
  createdAt: number;
  relays: readonly string[];
  by?: ActivityBy;
};

/**
 * The sales and links of `members` (the team's employees: a removed one's records are no longer
 * read, its declarations' mark still names it) and of the owner's own `devices` (member.ts,
 * recordSale: "You") of the last ACTIVITY_LOOKBACK_SECONDS, with this device's own pending links,
 * and the links of the invoices sent (`invoiceLinks`, src/features/invoices/: payable for months,
 * they are read whatever their age).
 */
export async function readOwnerRecords(
  team: TeamKeys,
  members: readonly TeamMember[],
  now: number,
  lightningAddress: string | null = null,
  devices: readonly OwnerDevice[] = [],
  invoiceLinks: readonly KnownLink[] = []
): Promise<OwnerRecords> {
  const network = invoiceNetwork();
  const business: Business = {
    owner: deriveLinkOwner(team).publicKey,
    registryKey: bytesToHex(deriveRegistryKey(team)),
    lightningAddress
  };
  const since = now - ACTIVITY_LOOKBACK_SECONDS;
  // The employees and the owner's devices, as the owner's finalization reads them.
  const holders = linkHolders(team, members, devices);
  const names = new Map(members.map((member) => [member.id, member.name]));
  // Their photos, for "By" (one query, as "Employees"): their initials when not read.
  const profiles = fetchProfiles(holders.filter(({ employee }) => employee)).catch(() => null);
  // Every holder at once: the calls share one connection per relay (relay.ts queues what passes
  // its subscriptions). A few at a time, each round waited for the slowest relay: a relay that
  // never answers held each round for the whole timeout (an invoice open at a point of sale showed
  // 70 s late with 20 devices, under test). A holder whose records no relay gave is unread.
  const read = await Promise.all(
    holders.map(async ({ id, keys, employee }) => ({
      by: employee
        ? ({ kind: "member", id, name: names.get(id) ?? "" } as const)
        : ({ kind: "you" } as const),
      records: await fetchMemberRecords(keys, since).catch(() => null)
    }))
  );
  const avatars = await profiles;
  const people = new Map<string, ActivityBy>(
    members.map(({ id, name }) => [
      id,
      { kind: "member", id, name, ...(avatars ? { avatar: avatars.get(id)?.avatar ?? null } : {}) }
    ])
  );
  const sales: RecordedSale[] = [];
  let refs: LinkRef[] = [];
  let unread = 0;
  for (const { by: holder, records } of read) {
    const by: ActivityBy =
      holder.kind === "member" && avatars
        ? { ...holder, avatar: avatars.get(holder.id)?.avatar ?? null }
        : holder;
    if (!records) {
      unread += 1;
      continue;
    }
    sales.push(...recordedSales(records, by));
    refs = mergeRefs(refs, linkRefs(records, by));
  }
  refs = mergeRefs(refs, await pendingRefs(network, { kind: "you" }));
  refs = mergeRefs(
    refs,
    invoiceLinks.map((link) => ({
      id: link.id,
      key: hexToBytes(link.key),
      createdAt: link.createdAt,
      by: link.by ?? ({ kind: "you" } as const),
      payload: null,
      relays: link.relays
    }))
  );
  const links = await readLinks(refs, network, business);
  return { sales, links, unread, members: people, roster: null };
}

/**
 * readOwnerRecords for the open account, whose point of sale takes payments with
 * `lightningAddress`. Rejects with TeamError "noAccount" without one (never throws: its callers
 * handle the rejection).
 */
export async function loadOwnerRecords(
  now: number,
  lightningAddress: string | null = null,
  invoiceLinks: readonly KnownLink[] = []
): Promise<OwnerRecords> {
  const { team, settings } = openTeam();
  const records = (employees: readonly TeamMember[]) =>
    readOwnerRecords(team, employees, now, lightningAddress, settings.devices, invoiceLinks);
  // The records are read while the roster is, for the employees this device knows (its last
  // read): each read waits for the slowest relay, one after the other they doubled the wait.
  const known = knownRoster(team)?.roster.employees ?? null;
  const early = known ? records(known).catch(() => null) : null;
  const read = await readRoster(team, settings.relays);
  const employees = read.roster.employees;
  // The same employees (an employee added, or renamed, meanwhile: read again with the roster's
  // list); those removed meanwhile are left out, as their records are no longer read.
  const same =
    known !== null &&
    employees.every((member) =>
      known.some(({ id, name }) => id === member.id && name === member.name)
    );
  const found = same ? await early : null;
  const result = found ? withoutRemoved(found, employees) : await records(employees);
  return { ...result, roster: read.everRead ? read.roster : null };
}

/**
 * `records` without the sales, links and people of employees no longer in `employees`. An
 * assistant's links (its invoices', read whatever their age and its removal) stay.
 */
export function withoutRemoved(
  records: OwnerRecords,
  employees: readonly TeamMember[]
): OwnerRecords {
  const ids = new Set(employees.map(({ id }) => id));
  const kept = (by: ActivityBy | null) =>
    by?.kind !== "member" || by.assistant === true || ids.has(by.id);
  return {
    ...records,
    sales: records.sales.filter((sale) => kept(sale.by)),
    links: records.links.filter((link) => kept(link.by)),
    members: new Map([...records.members].filter(([id]) => ids.has(id)))
  };
}

export type { Seats } from "./takers";

/**
 * The registry's declarations of `paymentHashes` (the wallet's payments received), read with the
 * business's reading key: which sale each paid, its fiat amount and note, and who took it as its
 * mark tells (among the owner's devices and `seats`). Null when fewer than a majority of the relays
 * answered.
 */
export async function readDeclarations(
  team: TeamKeys,
  paymentHashes: readonly string[],
  seats: Seats = NO_SEATS,
  /**
   * Whose records name the business's payment links (teamLinkHolders): a sale one of them shared
   * is told by its link, never by its declarations (declared-links.ts). None: as declared.
   */
  holders: readonly LinkHolder[] = []
): Promise<Map<string, DeclaredSale[]> | null> {
  const network = invoiceNetwork();
  const registryKey = deriveRegistryKey(team);
  const found = await ownerDeclarationsOf(
    { key: registryKey, reader: deriveRegistryReader(team) },
    paymentHashes,
    network
  );
  if (found === null) return null;
  const authors = [...found.values()].flatMap((declarations) =>
    declarations.map(({ author }) => author)
  );
  let linked: ReadonlyMap<string, LinkedSale> = new Map();
  if (holders.length > 0 && authors.length > 0) {
    // A link may be missing until every holder's records are read: asked again later.
    const links = await readTeamLinks(holders);
    if (links === null) return null;
    ({ sales: linked } = await linkedSalesOf(links, authors, network, {
      owner: deriveLinkOwner(team).publicKey,
      registryKey
    }));
  }
  const takerOf = takerResolver(team, seats);
  return new Map(
    [...found].map(([hash, declarations]) => [
      hash,
      declarations.flatMap(({ author, fiat, note, taker, saleKey }) => {
        const declared: DeclaredSale = {
          author,
          fiat,
          note,
          taker: takerOf(taker, author),
          key: saleKey
        };
        const told = withLinkedSale(declared, hash, linked);
        return told ? [told] : [];
      })
    ])
  );
}

/** A payment the wallet received, as "Wallet" asks its declarations: hash and date. */
export type ReceivedPayment = { hash: string; at: number };

/** A sale as the owner's copy of the declarations keeps it (archive.ts), for "Wallet". */
function declaredOfArchive(sale: ArchivedSale): DeclaredSale {
  const { by } = sale;
  return {
    author: sale.sale,
    fiat: sale.fiat,
    note: sale.note,
    ...(by.role === "owner"
      ? { taker: { kind: "you" }, archivedBy: { kind: "you" } }
      : by.role === "employee"
        ? {
            taker: { kind: "member", id: by.id },
            archivedBy: { kind: "member", id: by.id, name: by.name }
          }
        : by.role === "assistant"
          ? {
              // An assistant's mark is a member's (takers.ts); "By" tells it is an assistant.
              taker: { kind: "member", id: by.id },
              archivedBy: { kind: "member", id: by.id, name: by.name, assistant: true }
            }
          : {
              taker: { kind: "integration", id: by.id },
              archivedBy: { kind: "integration", id: by.id, name: by.name }
            })
  };
}

/**
 * The declarations of `payments` for the open account. A payment of a month the owner's copy holds
 * (archive.ts, a month over a year old) is told by the copy alone: its sale, or none, whatever the
 * registry holds. The others by the registry (readDeclarations), their marks told against the
 * roster as the relays give it now (an integration created a moment ago names its first sale).
 * Null, as without a majority's answer, until a majority of the relays gave the roster since the
 * account opened (a mark is never told against a roster that may miss a seat or a removal), and,
 * when a payment is a year old, the copies (it may be in a month copied): "Wallet" asks again.
 * Rejects with TeamError "noAccount" without one.
 */
export async function loadDeclarations(
  payments: readonly ReceivedPayment[],
  now: number = nowUnix()
): Promise<Map<string, DeclaredSale[]> | null> {
  const { team, settings } = openTeam();
  await readRoster(team, settings.relays);
  const known = knownRoster(team);
  if (!known?.everRead) return null;
  if (payments.some(({ at }) => isArchivable(at, now))) {
    await readArchive(team, settings.relays);
    if (!archiveEverRead(team)) return null;
  }
  const result = new Map<string, DeclaredSale[]>();
  const rest: string[] = [];
  // Each month told once: a year of payments falls in a dozen of them.
  const months = new Map<string, ReturnType<typeof knownMonth>>();
  const monthAt = (at: number) => {
    const name = monthOf(at);
    let month = months.get(name);
    if (!month) {
      month = knownMonth(team, name);
      months.set(name, month);
    }
    return month;
  };
  for (const { hash, at } of payments) {
    const month = isArchivable(at, now) ? monthAt(at) : null;
    if (!month?.copied) {
      rest.push(hash);
      continue;
    }
    const sale = month.sales.get(hash);
    result.set(hash, sale ? [declaredOfArchive(sale)] : []);
  }
  if (rest.length > 0) {
    const found = await readDeclarations(
      team,
      rest,
      known.roster,
      teamLinkHolders(team, known.roster, settings.devices)
    );
    if (found === null) return null;
    for (const [hash, declared] of found) result.set(hash, declared);
  }
  return result;
}

/**
 * The sales of `deposits` for the open account (onchain-sales.ts), as loadDeclarations tells the
 * Lightning payments': a deposit of a month the owner's copy holds is told by the copy alone (its
 * integration's sale, or none), the others by the integrations' witnesses and the registry. Null
 * until a majority of the relays gave the roster since the account opened, and, when a deposit is
 * a year old, the copies. Rejects with TeamError "noAccount" without one.
 */
export async function loadOnchainSales(
  deposits: readonly ReceivedDeposit[],
  now: number = nowUnix()
): Promise<OnchainSales | null> {
  const { team, settings } = openTeam();
  await readRoster(team, settings.relays);
  const known = knownRoster(team);
  if (!known?.everRead) return null;
  if (deposits.some(({ at }) => isArchivable(at, now))) {
    await readArchive(team, settings.relays);
    if (!archiveEverRead(team)) return null;
  }
  const sales = new Map<string, DeclaredSale[]>();
  const rest: ReceivedDeposit[] = [];
  const months = new Map<string, ReturnType<typeof knownMonth>>();
  for (const deposit of deposits) {
    const name = isArchivable(deposit.at, now) ? monthOf(deposit.at) : null;
    let month = name === null ? undefined : months.get(name);
    if (name !== null && !month) {
      month = knownMonth(team, name);
      months.set(name, month);
    }
    if (!month?.copied) {
      rest.push(deposit);
      continue;
    }
    const sale = month.deposits.get(deposit.txid);
    sales.set(deposit.txid, sale ? [declaredOfArchive({ ...sale, hash: sale.txid })] : []);
  }
  if (rest.length === 0) return { sales, retry: [] };
  const found = await readOnchainSales(team, rest, {
    seats: known.roster,
    relays: settings.relays
  });
  for (const [txid, sale] of found.sales) sales.set(txid, sale);
  return { sales, retry: found.retry };
}

/**
 * The integrations' orders paid on-chain not final yet (integration-orders.ts), of the last
 * ACTIVITY_LOOKBACK_SECONDS, for the open account, as `wallet` leaves them to tell. Null until a
 * majority of the relays gave the roster since the account opened (an integration's mark is never
 * told against a roster that may miss it), or without a majority's answer. The roster is read here
 * only until then: loadOwnerRecords reads it again at each of its reads, on the same screen.
 * `reads`: what the explorer listed at the orders' addresses, kept from one read to the next
 * (readIntegrationOrders). Rejects with TeamError "noAccount" without an account.
 */
export async function loadIntegrationOrders(
  wallet: WalletView,
  reads: AddressReads,
  now: number = nowUnix()
): Promise<IntegrationOrder[] | null> {
  const { team, settings } = openTeam();
  if (!knownRoster(team)?.everRead) await readRoster(team, settings.relays);
  const known = knownRoster(team);
  if (!known?.everRead) return null;
  return readIntegrationOrders(team, wallet, {
    seats: known.roster,
    relays: settings.relays,
    since: now - ACTIVITY_LOOKBACK_SECONDS,
    now,
    reads
  });
}

/**
 * The transactions that brought funds back to the open account's wallet `walletId`
 * (funds-recovery.ts), by txid, with the value each recovered: their deposits are "Funds recovered"
 * (model.ts). Null when fewer than a majority of the relays answered (such a deposit unread would
 * be told a reception). Rejects with TeamError "noAccount" without an account.
 */
export async function loadRecoveredTransactions(
  walletId: string
): Promise<ReadonlyMap<string, bigint> | null> {
  const { team, settings } = openTeam();
  return readRecoveredTransactions(team, walletId, { kind: "account" }, settings.relays);
}

/** An employee's own sales and links (memberActivity). */
export type MemberActivityData = { sales: RecordedSale[]; links: LinkInfo[] };

/**
 * This employee's sales and payment links of the last ACTIVITY_LOOKBACK_SECONDS, with this device's
 * pending links. Null when no relay answered (or on a device that is not an employee's).
 */
export async function loadMemberActivity(now: number): Promise<MemberActivityData | null> {
  const keys = await getMemberKeys();
  if (!keys) return null;
  const network = invoiceNetwork();
  const records = await fetchMemberRecords(keys, now - ACTIVITY_LOOKBACK_SECONDS);
  if (!records) return null;
  const refs = mergeRefs(linkRefs(records, null), await pendingRefs(network, null));
  const links = await readLinks(refs, network);
  return { sales: recordedSales(records, null), links };
}
