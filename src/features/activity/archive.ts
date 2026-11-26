import { bytesToHex } from "@noble/hashes/utils.js";

import { ownerEpochSettled } from "@/features/team/export-epochs";
import { epochSealFor } from "@/lib/nostr/epochs";
import { majority } from "@/config/registry";
import {
  getAccountSettings,
  getAccountTeamKeys,
  subscribeAccount
} from "@/features/account/session";
import { refreshLinks } from "@/features/payment-link/link-refresh";
import { linkHolders, type LinkHolder } from "@/features/payment-link/owner-finals";
import {
  queued,
  readWalletReceipts,
  type Received,
  type ReceivedDeposit
} from "@/features/settings/declarations-copy";
import { readRoster } from "@/features/team/roster";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { inBatches } from "@/lib/batches";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, publishAgain, publishToRelays, type RelayCall } from "@/lib/nostr/pool";
import { EPOCH_PART_BYTES, signedAt } from "@/lib/nostr/record";
import { nowUnix } from "@/lib/rates/snapshot";
import {
  archiveOf,
  archivedMonth,
  fetchArchiveAnswers,
  monthEnd,
  monthOf,
  monthPartEvent,
  monthParts,
  monthStart,
  nextMonth,
  MAX_PART_BYTES,
  partAddress,
  previousMonth,
  setDigest,
  stateAddress,
  stateEvent,
  type ArchiveAnswers,
  type ArchivedDeposit,
  type ArchivedLink,
  type ArchivedMonth,
  type ArchivedSale,
  type PartEntry,
  type StateEntry
} from "@/lib/registry/archive";
import { openRecordLinkKey } from "@/lib/payment-link/sealed-key";
import { settledDeclarationsOf } from "@/lib/registry/registry";
import {
  deriveArchiveKeys,
  deriveLinkKeyReader,
  deriveLinkOwner,
  deriveRegistryKey,
  deriveRegistryReader,
  type TeamKeys
} from "@/lib/team/keys";
import { fetchLinkRecords } from "@/lib/team/member-records";
import { memberOf } from "@/lib/team/roster";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import {
  linkedSalesOf,
  readTeamLinks,
  teamLinkHolders,
  withLinkedSale,
  type LinkedSale,
  type TeamLinks
} from "./declared-links";
import { readOnchainSales } from "./onchain-sales";
import { archivedTaker, takerResolver, type Seats } from "./takers";

/** Who took a sale, from its declaration's mark (takerResolver). */
type TakerOf = ReturnType<typeof takerResolver>;

/*
 * The owner's copy of a month's declarations and payment links (src/lib/registry/archive.ts), as
 * the owner's devices write and read it. Once a month is over ARCHIVE_AGE_SECONDS old, at an
 * opening of the account, the device copies what "Wallet" makes of its payments' declarations, and
 * the links the employees and the owner's devices made then (with each link's key, sealed for the
 * owner in its record: sealed-key.ts), signed by the copy's own author, then signs each copy again
 * once a year (ARCHIVE_REFRESH_SECONDS), its links' newest versions with it (link-refresh.ts):
 * strfry refuses events over 3 years old, a declaration only its sale's key signs, and a link only
 * its own. "Wallet" then reads the copy for that month's payments, never the registry: whatever is
 * declared there later changes nothing.
 *
 * The wallet is connected for it only when a month is due (the wallet's keys are loaded only while
 * something needs them): the account's state (ArchiveState) tells how far its history was gone
 * through. An account without one is a new account (its first opening, right after its sign-up,
 * writes it): nothing of its wallet is old enough yet, the state starts at the latest month a copy
 * could hold, without reading the wallet.
 *
 * What this device knows of the copies only grows while the account is open (as the roster, src/
 * features/team/roster.ts): a part read or written is never forgotten. It is forgotten as soon as
 * the account closes: the copies hold the links' signing keys (ArchivedLink.key), never kept longer
 * than their account (AGENTS.md).
 */

/** A month is copied once its last payment is this old: the request's year. */
export const ARCHIVE_AGE_SECONDS = 365 * 24 * 60 * 60;

/** A part unchanged for this long is signed again, dated then: strfry refuses events over 3 years old. */
export const ARCHIVE_REFRESH_SECONDS = 365 * 24 * 60 * 60;

/**
 * At most one copy round per this long while the account stays open: each one reads the copies,
 * and the wallet's whole history when a month is due.
 */
export const ARCHIVE_INTERVAL_SECONDS = 24 * 60 * 60;

/** How much the relays told of the copies. */
export type ArchiveStatus = "read" | "partial" | "unread";

export type ArchiveRead = {
  /** This read's answers. */
  answers: ArchiveAnswers;
  relays: readonly string[];
  status: ArchiveStatus;
  /** A read of a majority of the account's relays completed since the account opened. */
  everRead: boolean;
};

type Known = {
  team: TeamKeys;
  /** Every part read or written since the account opened, its newest copy, by address. */
  parts: Map<string, PartEntry>;
  /** Addresses whose newest record is of a newer format: neither read nor written over. */
  newer: Set<string>;
  everRead: boolean;
  /** The reads running, by relays: a read asked meanwhile is that one. */
  reads: Map<string, Promise<ArchiveRead>>;
  /** The account's state, its newest copy read or written; null while none is known. */
  state: StateEntry | null;
  /** The state's newest record is of a newer format: neither read nor written over. */
  stateNewer: boolean;
  /** When the last complete round ended (archiveDeclarations). */
  lastRound: number | null;
  /** By address, the date of the newest record this device signed there (signedAt). */
  signed: Map<string, number>;
};

let known: Known | null = null;

// The account closed (or another one opened): what this device knew of its copies goes with it.
subscribeAccount(() => {
  if (known && getAccountTeamKeys() !== known.team) known = null;
});

/** What this device knows of `team`'s copies: another account's is forgotten. */
function knownOf(team: TeamKeys): Known {
  if (known?.team !== team) {
    known = {
      team,
      parts: new Map(),
      newer: new Set(),
      everRead: false,
      reads: new Map(),
      state: null,
      stateNewer: false,
      lastRound: null,
      signed: new Map()
    };
  }
  return known;
}

/** Adds a part read or written, unless an as new or newer copy of its address is known. */
function learn(state: Known, address: string, entry: PartEntry): void {
  const before = state.parts.get(address);
  if (!before || entry.event.created_at > before.event.created_at) state.parts.set(address, entry);
}

/** Adds the account's state read or written: the one that went furthest (then the newest). */
function learnState(state: Known, entry: StateEntry): void {
  const before = state.state;
  if (
    !before ||
    entry.state.through > before.state.through ||
    (entry.state.through === before.state.through &&
      entry.event.created_at > before.event.created_at)
  ) {
    state.state = entry;
  }
}

/**
 * A call to `relays` as the copies' author: a relay may only take an author's events from that
 * author. Its key derives again at each authentication: refused once the account closes.
 */
function archiveCall(team: TeamKeys, relays: readonly string[]): RelayCall {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account",
    authKey: () => deriveArchiveKeys(team).nostr.secretKey
  };
}

/**
 * The copies on `relays` (every month ever, page by page), learnt. One read at a time per list.
 * Rejects only when the account's team keys are wiped (the account closed).
 */
export function readArchive(team: TeamKeys, relays: readonly string[]): Promise<ArchiveRead> {
  const state = knownOf(team);
  const id = JSON.stringify(relays);
  let read = state.reads.get(id);
  if (!read) {
    read = readNow(state, relays).finally(() => state.reads.delete(id));
    state.reads.set(id, read);
  }
  return read;
}

async function readNow(state: Known, relays: readonly string[]): Promise<ArchiveRead> {
  const raw = await fetchArchiveAnswers(
    deriveArchiveKeys(state.team),
    archiveCall(state.team, relays)
  );
  // Derived again: wiped meanwhile (the account closed), nothing read is kept.
  const answers = archiveOf(deriveArchiveKeys(state.team), raw);
  for (const [address, entry] of answers.parts) learn(state, address, entry);
  for (const address of answers.newer) state.newer.add(address);
  if (answers.state) learnState(state, answers.state);
  if (answers.newer.has(stateAddress(deriveArchiveKeys(state.team)))) state.stateNewer = true;
  const status: ArchiveStatus =
    raw.size === 0 ? "unread" : raw.size >= majority(relays.length) ? "read" : "partial";
  if (status === "read") state.everRead = true;
  return { answers, relays, status, everRead: state.everRead };
}

/** `month` as this device knows the copies (readArchive, and its own writes). */
export function knownMonth(team: TeamKeys, month: string): ArchivedMonth {
  const state = knownOf(team);
  return archivedMonth(deriveArchiveKeys(team), month, state.parts, state.newer);
}

/** Whether a read of a majority of the account's relays gave the copies since the account opened. */
export function archiveEverRead(team: TeamKeys): boolean {
  return knownOf(team).everRead;
}

/** Whether a payment the wallet received at `at` is in a month old enough to be copied. */
export function isArchivable(at: number, now: number): boolean {
  return monthEnd(monthOf(at)) + ARCHIVE_AGE_SECONDS <= now;
}

/** The latest month old enough to be copied at `now`: ended ARCHIVE_AGE_SECONDS ago or more. */
export function lastArchivableMonth(now: number): string {
  return previousMonth(monthOf(now - ARCHIVE_AGE_SECONDS));
}

/** What a round of copies did. */
export type ArchiveRound = {
  /** Months copied (or copied again: a copy that missed what another held). */
  copied: string[];
  /** Months left for a later round: undecided payments, relays out of reach. */
  left: string[];
  /** The latest month gone through since (the account's state), null when unknown. */
  through: string | null;
  /** Records signed again (ARCHIVE_REFRESH_SECONDS). */
  refreshed: number;
};

/**
 * A round of the owner's copy of the declarations, for the open account, after the copies of the
 * declarations under way (the same queue reads the wallet): at most once per
 * ARCHIVE_INTERVAL_SECONDS while the account stays open (`force`: tests, a change of relays). Null
 * when it did not run (no account, too soon, the roster or the copies not read to the end from a
 * majority of the relays, the wallet busy or offline). Never rejects.
 */
export function archiveDeclarations(
  now: () => number = nowUnix,
  force = false
): Promise<ArchiveRound | null> {
  return queued(async () => {
    try {
      return await roundNow(now, force);
    } catch (error) {
      // The account closed meanwhile (its keys wiped), the wallet busy or offline.
      logFailure("Copying the declarations failed", error);
      return null;
    }
  });
}

async function roundNow(now: () => number, force: boolean): Promise<ArchiveRound | null> {
  const team = getAccountTeamKeys();
  const relays = getAccountSettings()?.relays;
  if (!team || !relays) return null;
  const state = knownOf(team);
  if (!force && state.lastRound !== null && now() - state.lastRound < ARCHIVE_INTERVAL_SECONDS) {
    return null;
  }
  // Who took each sale, as "Wallet" tells it, and whose links the copies keep: from the roster a
  // majority of the relays gave to the end.
  const roster = await readRoster(team, relays, TEAM_TIMEOUT_MS.background, { whole: true });
  if (roster.status !== "read") return null;
  // The account's export epoch first (export-epochs.ts): what a withdrawn grant read never opens it.
  await ownerEpochSettled();
  const read = await readArchive(team, relays);
  if (read.status !== "read") return null;
  const round: ArchiveRound = { copied: [], left: [], through: null, refreshed: 0 };
  const last = lastArchivableMonth(now());
  // A newer app's state: it goes through the wallet itself.
  if (!state.stateNewer) {
    const through = state.state?.state.through ?? null;
    if (through === null) {
      // A new account: nothing of its wallet is old enough yet.
      if (await publishState(team, relays, last, now())) round.through = last;
    } else if (through >= last) {
      round.through = through;
    } else {
      round.through = through;
      const receipts = await readWalletReceipts();
      if (receipts === null || getAccountTeamKeys() !== team) return null;
      const byMonth = new Map<string, Received[]>();
      for (const payment of receipts.payments) {
        const month = monthOf(payment.at);
        if (month > through && month <= last) {
          byMonth.set(month, [...(byMonth.get(month) ?? []), payment]);
        }
      }
      const depositsByMonth = new Map<string, ReceivedDeposit[]>();
      for (const deposit of receipts.deposits) {
        const month = monthOf(deposit.at);
        if (month > through && month <= last) {
          depositsByMonth.set(month, [...(depositsByMonth.get(month) ?? []), deposit]);
        }
      }
      // Whose payment links the copies keep: every employee and assistant (its invoices' links),
      // removed ones included, and the owner's devices.
      const holders = linkHolders(
        team,
        [
          ...roster.roster.employees,
          ...roster.roster.removed.filter(({ role }) => role === "employee").map(memberOf)
        ],
        getAccountSettings()?.devices ?? [],
        [
          ...roster.roster.assistants,
          ...roster.roster.removed.filter(({ role }) => role === "assistant")
        ]
      );
      // Every seat's mark key, derived once for the round, when a month first needs it.
      let resolver: TakerOf | null = null;
      const takers = () => (resolver ??= takerResolver(team, roster.roster));
      // The team's links, read once for the round when a month first needs them (a failed read is
      // asked again by the next month that needs it).
      let teamLinksRead: Promise<TeamLinks | null> | null = null;
      const teamLinks = () => {
        teamLinksRead ??= readTeamLinks(
          teamLinkHolders(team, roster.roster, getAccountSettings()?.devices ?? []),
          relays
        ).then((links) => {
          if (links === null) teamLinksRead = null;
          return links;
        });
        return teamLinksRead;
      };
      let reached = last;
      // Each month, its links even without a payment.
      for (let month = nextMonth(through); month <= last; month = nextMonth(month)) {
        const done = await copyMonth(team, relays, month, {
          received: byMonth.get(month) ?? [],
          deposits: depositsByMonth.get(month) ?? [],
          seats: roster.roster,
          takers,
          holders,
          teamLinks,
          now: now()
        });
        if (done === "copied") round.copied.push(month);
        if (done === "copied" || done === "done") continue;
        // The months from it on, at a later round.
        reached = previousMonth(month);
        for (let later = month; later <= last; later = nextMonth(later)) round.left.push(later);
        break;
      }
      if (reached > through && (await publishState(team, relays, reached, now()))) {
        round.through = reached;
      }
    }
  }
  round.refreshed = await refreshArchive(team, relays, now());
  await repairArchive(team, read);
  if (round.left.length === 0 && round.through !== null) state.lastRound = now();
  return round;
}

/**
 * Publishes the account's state, gone through `through` (never back from a state known to have
 * gone further): true once a majority of `relays` took it. Never rejects but when the account
 * closed.
 */
async function publishState(
  team: TeamKeys,
  relays: readonly string[],
  through: string,
  now: number
): Promise<boolean> {
  const state = knownOf(team);
  const known = state.state;
  const furthest = known && known.state.through > through ? known.state.through : through;
  const keys = deriveArchiveKeys(team);
  const event = stateEvent(
    keys,
    { through: furthest },
    signedAt(state.signed, stateAddress(keys), Math.max(now, (known?.event.created_at ?? -1) + 1))
  );
  const took = await publishToRelays(event, archiveCall(team, relays), { quorum: "majority" });
  if (took.length > 0) learnState(state, { state: { through: furthest }, event });
  return took.length >= majority(relays.length);
}

/**
 * Copies `month` (its payments `received`, the links `holders` made then), unless it is copied
 * already: every payment and link an earlier copy held, the payments the registry ties to one sale
 * someone the owner trusts vouches for (takers.ts), and the month's links, with the key each
 * device sealed for the owner (sealed-key.ts); then their newest copies signed again
 * (link-refresh.ts). "copied" now; "done" already (or a part of a newer format: a newer app's copy;
 * or nothing to keep); "left" for later (an undecided payment, links not read to the end from a
 * majority of the relays, fewer than a majority took a part, the registry out of reach). Never
 * rejects but when the account closed.
 */
async function copyMonth(
  team: TeamKeys,
  relays: readonly string[],
  month: string,
  {
    received,
    deposits,
    seats,
    takers,
    holders,
    teamLinks,
    now
  }: {
    received: readonly Received[];
    /** The month's deposits: the integrations' orders paid on-chain among them (onchain-sales.ts). */
    deposits: readonly ReceivedDeposit[];
    seats: Seats;
    /** Who took a sale, from its mark (takerResolver of `seats`). */
    takers: () => TakerOf;
    holders: readonly LinkHolder[];
    /** The team's links (readTeamLinks), read once per round when a month first needs them. */
    teamLinks: () => Promise<TeamLinks | null>;
    now: number;
  }
): Promise<"copied" | "done" | "left"> {
  const before = knownMonth(team, month);
  if (before.newer) return "done";
  // Copied, with every payment and link any copy of it holds: nothing to do.
  if (
    before.copied &&
    before.set === setDigest(before.sales.keys()) &&
    before.linkSet === setDigest(before.links.keys()) &&
    before.onchainSet === setDigest(before.deposits.keys())
  ) {
    return "done";
  }
  const sales = new Map(before.sales);
  const links = new Map(before.links);
  const onchain = new Map<string, ArchivedDeposit>(before.deposits);
  if (!before.copied) {
    const undecided = received.filter(({ hash }) => !sales.has(hash));
    const settled = await settledDeclarationsOf(
      { key: deriveRegistryKey(team), reader: deriveRegistryReader(team) },
      undecided.map(({ hash }) => hash),
      invoiceNetwork(),
      { relays }
    );
    if (settled === null) return "left";
    const takerOf = takers();
    // A sale the team shared as a link is kept as its link tells it, never as a declaration its
    // payer could write again (declared-links.ts): read before anything is copied, for good.
    const declared = [...settled.values()].flatMap((found) =>
      found.status === "unique" ? [found.declaration] : []
    );
    let linked: ReadonlyMap<string, LinkedSale> = new Map();
    if (declared.length > 0) {
      const recorded = await teamLinks();
      if (recorded === null) return "left";
      const read = await linkedSalesOf(
        recorded,
        declared.map(({ author }) => author),
        invoiceNetwork(),
        { owner: deriveLinkOwner(team).publicKey, registryKey: deriveRegistryKey(team) },
        relays
      );
      // A link of the team no relay gave: the month waits rather than keep its declaration.
      if (read.unread.size > 0) return "left";
      linked = read.sales;
    }
    for (const { hash, at } of undecided) {
      const found = settled.get(hash);
      // Left out (one claim of a newer format): the month waits for a newer app's copy.
      if (!found) return "left";
      if (found.status !== "unique") continue;
      const told = withLinkedSale(
        { ...found.declaration, taker: takerOf(found.declaration.taker, found.declaration.author) },
        hash,
        linked
      );
      if (!told) continue;
      const { author, fiat, note, taker } = told;
      const by = archivedTaker(taker, at, seats);
      if (by) sales.set(hash, { hash, sale: author, fiat, note, by });
    }
    const made = await monthLinks(team, relays, month, holders);
    if (made === null) return "left";
    for (const link of made) if (!links.has(link.link)) links.set(link.link, link);
    // The integrations' orders paid on-chain: as "Wallet" tells them (onchain-sales.ts).
    const undecidedDeposits = deposits.filter(({ txid }) => !onchain.has(txid));
    if (undecidedDeposits.length > 0) {
      const found = await readOnchainSales(team, undecidedDeposits, { seats, relays });
      // A witness or a lease out of reach, or of a newer format: the month waits.
      if (found.retry.length > 0) return "left";
      for (const { txid, at } of undecidedDeposits) {
        const [sale, ...others] = found.sales.get(txid) ?? [];
        if (!sale || others.length > 0) continue;
        // When it was paid (its witness's date), not when the wallet claimed it.
        const by = archivedTaker(sale.taker ?? null, sale.paidAt ?? at, seats);
        if (by) {
          onchain.set(txid, { txid, sale: sale.author, fiat: sale.fiat, note: sale.note, by });
        }
      }
    }
  }
  // Nothing of the month to decide: no payment received, no link.
  if (
    received.length === 0 &&
    deposits.length === 0 &&
    sales.size === 0 &&
    links.size === 0 &&
    onchain.size === 0
  ) {
    return "done";
  }
  if (
    !(await publishMonth(
      team,
      relays,
      month,
      sales.values(),
      links.values(),
      onchain.values(),
      now
    ))
  ) {
    return "left";
  }
  await refreshLinks(team, [...links.values()], now).catch((error: unknown) => {
    // Signed again at the copy's next refresh.
    logFailure("Signing the month's links again failed", error);
  });
  return "copied";
}

/**
 * The payment links `holders` made in `month`, from their records on `relays` (by the links'
 * author), each with its key opened (sealed-key.ts; null when its record has none, or another
 * link's). Null when a holder's records were not read to the end from a majority of the relays.
 */
async function monthLinks(
  team: TeamKeys,
  relays: readonly string[],
  month: string,
  holders: readonly LinkHolder[]
): Promise<ArchivedLink[] | null> {
  // A record names the key its link's key is sealed for: the link key reader, or the registry's
  // reading key (records of an older app).
  const readers = {
    linkKeyReader: deriveLinkKeyReader(team),
    registryReader: deriveRegistryReader(team)
  };
  const read = await inBatches(holders, COPIES_AT_ONCE, async (holder) => {
    const found = await fetchLinkRecords(
      holder.keys,
      monthStart(month),
      monthEnd(month) - 1,
      relays
    );
    return found.answered >= majority(relays.length) ? found.links : null;
  });
  if (read === null || read.some((links) => links === null)) return null;
  return read.flatMap((links) =>
    links!.map((record) => {
      const key = openRecordLinkKey(record, readers, record.link);
      return {
        link: record.link,
        saleKey: record.saleKey,
        key: key === null ? null : bytesToHex(key),
        relays: [...record.relays]
      };
    })
  );
}

/**
 * Publishes the parts of `month`'s copy holding `sales` and `links`: true once a majority took
 * each.
 */
async function publishMonth(
  team: TeamKeys,
  relays: readonly string[],
  month: string,
  sales: Iterable<ArchivedSale>,
  links: Iterable<ArchivedLink>,
  deposits: Iterable<ArchivedDeposit>,
  now: number
): Promise<boolean> {
  const keys = deriveArchiveKeys(team);
  const state = knownOf(team);
  // Cut smaller when sealed at an export epoch (record.ts): sealed twice, it stays under 64 kB.
  const parts = monthParts(
    month,
    sales,
    links,
    deposits,
    epochSealFor(keys.encryptionKey) ? EPOCH_PART_BYTES : MAX_PART_BYTES
  );
  const call = archiveCall(team, relays);
  const events = parts.map((part) => {
    const address = partAddress(keys, part.month, part.part);
    // After any copy of its address known: the relays keep the newest.
    const after = state.parts.get(address)?.event.created_at ?? -1;
    const createdAt = signedAt(state.signed, address, Math.max(now, after + 1));
    return { address, part, event: monthPartEvent(keys, part, createdAt) };
  });
  const took = await inBatches(events, COPIES_AT_ONCE, async ({ address, part, event }) => {
    const held = await publishToRelays(event, call, { quorum: "majority" });
    if (held.length > 0) learn(state, address, { part, event });
    return held.length >= majority(relays.length);
  });
  return took !== null && took.every(Boolean);
}

/**
 * Signs again, dated `now`, every part known unchanged for ARCHIVE_REFRESH_SECONDS, to every relay
 * of `relays`, its links first (refreshLinks; those it could not sign again wait for the part's
 * next refresh): a part is a year away from its next refresh once a majority took it, and only
 * then; else it is due again at the next round, its links too. Resolves with how many a majority
 * took. Never rejects.
 */
async function refreshArchive(
  team: TeamKeys,
  relays: readonly string[],
  now: number
): Promise<number> {
  try {
    const keys = deriveArchiveKeys(team);
    const state = knownOf(team);
    // A part holding a link's key in clear (an older app's), at once: sealed then.
    const due = [...state.parts].filter(
      ([address, { event, clearKeys }]) =>
        (clearKeys === true || now - event.created_at > ARCHIVE_REFRESH_SECONDS) &&
        !state.newer.has(address)
    );
    const call = archiveCall(team, relays);
    const quorum = majority(relays.length);
    const refreshed = await inBatches(due, COPIES_AT_ONCE, async ([address, { part, event }]) => {
      // Its links first: a part refreshed is a year away from its next refresh. A link whose relays
      // gave no majority is not signed again (refreshLinks), but never holds the part back: the
      // part decides the month's sales, while a link's relays (a list the account left) may never
      // answer again.
      if ((await refreshLinks(team, part.links, now)) === null) {
        logFailure("Signing a month's links again: too few of their relays answered");
      }
      const again = monthPartEvent(
        keys,
        part,
        signedAt(state.signed, address, Math.max(now, event.created_at + 1))
      );
      const took = await publishToRelays(again, call, { quorum: "majority" });
      if (took.length < quorum) return false;
      learn(state, address, { part, event: again });
      return true;
    });
    let count = (refreshed ?? []).filter(Boolean).length;
    const known = state.state;
    if (known && !state.stateNewer && now - known.event.created_at > ARCHIVE_REFRESH_SECONDS) {
      const again = stateEvent(
        keys,
        known.state,
        signedAt(state.signed, stateAddress(keys), Math.max(now, known.event.created_at + 1))
      );
      if ((await publishToRelays(again, call, { quorum: "majority" })).length >= quorum) {
        learnState(state, { state: known.state, event: again });
        count += 1;
      }
    }
    return count;
  } catch (error) {
    logFailure("Refreshing the copies of the declarations failed", error);
    return 0;
  }
}

/**
 * Gives each newest copy `read` gave (of a newer format too, as it is) to the relays that answered
 * without it: a relay that lost one holds it again. Never rejects.
 */
async function repairArchive(team: TeamKeys, read: ArchiveRead): Promise<void> {
  try {
    const known = knownOf(team);
    const stateAt = stateAddress(deriveArchiveKeys(team));
    const lacking = [...read.answers.events].flatMap(([address, event]) => {
      const newest = address === stateAt ? known.state?.event : known.parts.get(address)?.event;
      // Written or refreshed since the read: that copy went to every relay already.
      if (newest && newest.created_at > event.created_at) return [];
      const relays = [...read.answers.held]
        .filter(([, held]) => (held.get(address) ?? -1) < event.created_at)
        .map(([relay]) => relay);
      return relays.length > 0 ? [{ event, relays }] : [];
    });
    await inBatches(lacking, COPIES_AT_ONCE, async ({ event, relays }) => {
      await publishAgain(event, archiveCall(team, relays), { quorum: "majority" });
      return true;
    });
  } catch (error) {
    logFailure("Repairing the copies of the declarations failed", error);
  }
}

/**
 * Copies every copy of the declarations the relays `before` hold (each address's newest, as it is:
 * of a newer format too) to the relays `next`, for a change of the account's relays: "Wallet" reads
 * them there afterwards. True once a majority of `next` holds each one (those `before` shares with
 * `next` and that sent it count), false when `before` gave no majority's answer or `next` did not
 * take one. Never rejects.
 */
export async function copyArchive(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  try {
    const read = await readArchive(team, before);
    if (read.status !== "read") return false;
    const events: NostrEvent[] = [...read.answers.events.values()];
    const held = await inBatches(events, COPIES_AT_ONCE, async (event) => {
      const address = event.tags.find(([name]) => name === "d")?.[1] ?? "";
      const holding = next.filter(
        (relay) => (read.answers.held.get(relay)?.get(address) ?? -1) >= event.created_at
      );
      const missing = next.filter((relay) => !holding.includes(relay));
      const took =
        missing.length > 0
          ? await publishAgain(event, archiveCall(team, missing), {
              quorum: { count: majority(next.length) - holding.length }
            })
          : [];
      return holding.length + took.length >= majority(next.length);
    });
    return held !== null && held.every(Boolean);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying the declarations' copies to the new relays failed", error);
    return false;
  }
}
