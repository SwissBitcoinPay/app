import { hmac } from "@noble/hashes/hmac.js";
import { epochSealFor } from "@/lib/nostr/epochs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelaysPaged, type RelayCall } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  openRecord,
  sealRecord,
  sealWithinRelays
} from "@/lib/nostr/record";
import { isMonth, setDigest } from "@/lib/registry/archive";
import type { ArchiveKeys } from "@/lib/team/keys";

import { MAX_NOTE_LENGTH, type LegacyHistoryRow } from "./history";

/*
 * The history copied from the v2 account (history.ts) on the
 * account's relays: for information only, shown in "Wallet" and its exports with the
 * account's own movements, never in its balance. Written and read by the owner's devices only
 * (deriveLegacyHistoryKeys), sealed (NIP-44) for them.
 *
 * As the owner's copy of the declarations (src/lib/registry/archive.ts), whose shape it follows:
 * one copy per month (UTC) of the rows' dates, cut in parts each under 64 kB (what strfry takes),
 * at an address of its month and its rank. Every part names how many there are and the hash of the
 * whole month's rows (`set`): a month is read only once every part of one copy is there, never half
 * a month. Signed again each year by the owner's devices (strfry refuses events over 3 years old).
 * One state record says a copy was started (`done` null: "Settings" offers to finish it) or that
 * the whole history was copied (`done`, its date).
 *
 * Never change the records' types, their format, their addresses nor their keys once released: the
 * copies of every migrated account are there.
 */

const RECORD_TYPE = "legacy-history-month";

/** Format of a part's value: 1. */
const HISTORY_VERSION = 1;

const STATE_TYPE = "legacy-history-state";

/** Format of the state's value: 1. */
const STATE_VERSION = 1;

/** Plaintexts are padded to multiples of this: the size tells little of the month. */
const BLOCK = 256;

/** Largest plaintext of a part, in bytes: its sealed event stays under 64 kB (as archive.ts). */
export const MAX_PART_BYTES = 40_000;

/** More parts than a month of any business: anything above is refused rather than read. */
const MAX_PARTS = 10_000;

const HEX_32 = /^[0-9a-f]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;

/** One part of a month's copy. */
export type HistoryPart = {
  /** "YYYY-MM", in UTC: the month of its rows' dates. */
  month: string;
  /** Its rank, from 0. */
  part: number;
  /** How many parts the copy has. */
  parts: number;
  /** Hex: setDigest of every row's `ref` of the copy (all its parts). */
  set: string;
  /** Its rows, by `ref`, ascending. */
  rows: LegacyHistoryRow[];
};

/** When the whole history was copied (Unix seconds); null: a copy was started, not finished. */
export type HistoryState = { done: number | null };

/** The opaque `d` tag of part `part` of `month`'s copy. */
export function historyPartAddress(keys: ArchiveKeys, month: string, part: number): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`history/${month}/${part}`)));
}

/** The opaque `d` tag of the state. */
export function historyStateAddress(keys: ArchiveKeys): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes("history/state")));
}

function rowValue(row: LegacyHistoryRow): Record<string, unknown> {
  return {
    ref: row.ref,
    kind: row.kind,
    channel: row.channel,
    at: row.at,
    // A safe integer: below 2^53 sats, beyond all the bitcoin there is.
    sats: Number(row.sats),
    fiat: row.fiat && {
      minor: row.fiat.minor,
      digits: row.fiat.digits,
      currency: row.fiat.currency
    },
    note: row.note,
    rate: row.rate && { price: row.rate.price, currency: row.rate.currency }
  };
}

function partValue(part: HistoryPart): Record<string, unknown> {
  return {
    version: HISTORY_VERSION,
    month: part.month,
    part: part.part,
    parts: part.parts,
    set: part.set,
    rows: part.rows.map(rowValue)
  };
}

function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

/**
 * The parts of `month`'s copy holding `rows` (each `ref` once), by `ref` ascending, each part
 * filled up to MAX_PART_BYTES. A month without rows has none: nothing is written for it.
 */
export function historyParts(
  month: string,
  rows: Iterable<LegacyHistoryRow>,
  /** Each part's plaintext at most: smaller for parts sealed at an epoch (EPOCH_PART_BYTES). */
  maxBytes: number = MAX_PART_BYTES
): HistoryPart[] {
  if (!isMonth(month)) throw new Error(`Not a month: ${month}`);
  const byRef = new Map<string, LegacyHistoryRow>();
  for (const row of rows) byRef.set(row.ref, row);
  const sorted = [...byRef.values()].sort((a, b) => (a.ref < b.ref ? -1 : 1));
  if (sorted.length === 0) return [];
  const set = setDigest(sorted.map(({ ref }) => ref));
  const frame = jsonBytes({
    t: RECORD_TYPE,
    v: partValue({ month, part: MAX_PARTS, parts: MAX_PARTS, set, rows: [] })
  });
  const groups: LegacyHistoryRow[][] = [[]];
  let size = frame;
  for (const row of sorted) {
    const bytes = jsonBytes(rowValue(row)) + 1;
    if (size + bytes > maxBytes && groups[groups.length - 1]!.length > 0) {
      groups.push([]);
      size = frame;
    }
    groups[groups.length - 1]!.push(row);
    size += bytes;
  }
  return groups.map((group, part) => ({ month, part, parts: groups.length, set, rows: group }));
}

/** The signed record of `part`, dated `createdAt`. */
export function historyPartEvent(
  keys: ArchiveKeys,
  part: HistoryPart,
  createdAt: number
): NostrEvent {
  return sealWithinRelays({
    type: RECORD_TYPE,
    value: partValue(part),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: historyPartAddress(keys, part.month, part.part),
    createdAt,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

/** The signed record of `state`, dated `createdAt`. */
export function historyStateEvent(
  keys: ArchiveKeys,
  state: HistoryState,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: STATE_TYPE,
    value: { version: STATE_VERSION, done: state.done },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: historyStateAddress(keys),
    createdAt,
    block: BLOCK,
    epoch: epochSealFor(keys.encryptionKey)
  });
}

function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseRow(value: unknown): LegacyHistoryRow | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const kind = v.kind;
  if (kind !== "sale" && kind !== "withdraw" && kind !== "referral" && kind !== "receipt") {
    return null;
  }
  const channel = v.channel;
  if (
    kind === "sale"
      ? !(channel === "pos" || channel === "link" || channel === "integration")
      : channel !== null
  ) {
    return null;
  }
  if (typeof v.ref !== "string" || !HEX_32.test(v.ref) || !isSeconds(v.at)) return null;
  if (typeof v.sats !== "number" || !Number.isSafeInteger(v.sats) || v.sats < 0) return null;
  if (typeof v.note !== "string" || v.note.length > MAX_NOTE_LENGTH) return null;
  let fiat: LegacyHistoryRow["fiat"] = null;
  if (v.fiat !== null) {
    if (v.fiat === undefined || typeof v.fiat !== "object") return null;
    const { minor, digits, currency } = v.fiat as Record<string, unknown>;
    if (typeof minor !== "number" || !Number.isSafeInteger(minor) || minor < 0) return null;
    if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 8) {
      return null;
    }
    if (typeof currency !== "string" || !CURRENCY.test(currency)) return null;
    fiat = { minor, digits, currency };
  }
  let rate: LegacyHistoryRow["rate"] = null;
  if (v.rate !== null) {
    if (v.rate === undefined || typeof v.rate !== "object") return null;
    const { price, currency } = v.rate as Record<string, unknown>;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    if (typeof currency !== "string" || !CURRENCY.test(currency)) return null;
    rate = { price, currency };
  }
  return {
    ref: v.ref,
    kind,
    channel: channel as LegacyHistoryRow["channel"],
    at: v.at,
    sats: BigInt(v.sats),
    fiat,
    note: v.note,
    rate
  };
}

/** A part's value: null when invalid. Throws NewerRecordError for a newer version. */
export function parseHistoryPart(value: unknown): HistoryPart | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > HISTORY_VERSION) throw new NewerRecordError();
  if (
    v.version !== HISTORY_VERSION ||
    !isMonth(v.month) ||
    !Number.isSafeInteger(v.parts) ||
    (v.parts as number) < 1 ||
    (v.parts as number) > MAX_PARTS ||
    !Number.isSafeInteger(v.part) ||
    (v.part as number) < 0 ||
    (v.part as number) >= (v.parts as number) ||
    typeof v.set !== "string" ||
    !HEX_32.test(v.set) ||
    !Array.isArray(v.rows) ||
    v.rows.length === 0
  ) {
    return null;
  }
  const rows: LegacyHistoryRow[] = [];
  for (const value of v.rows as unknown[]) {
    const row = parseRow(value);
    // Ascending, each row once: as historyParts writes them.
    if (!row || (rows.length > 0 && rows[rows.length - 1]!.ref >= row.ref)) return null;
    rows.push(row);
  }
  return { month: v.month, part: v.part as number, parts: v.parts as number, set: v.set, rows };
}

/** The state's value: null when invalid. Throws NewerRecordError for a newer version. */
export function parseHistoryState(value: unknown): HistoryState | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > STATE_VERSION) throw new NewerRecordError();
  if (v.version !== STATE_VERSION) return null;
  return v.done === null || isSeconds(v.done) ? { done: v.done } : null;
}

/** A part's newest readable record. */
export type HistoryPartEntry = { part: HistoryPart; event: NostrEvent };

/** What a read of the history gave. */
export type HistoryAnswers = {
  /** By address, each part's newest readable record. */
  parts: Map<string, HistoryPartEntry>;
  /** Addresses whose newest record is of a newer format: neither read nor written over. */
  newer: Set<string>;
  /** Per relay that answered, the date of the newest copy it holds of each address. */
  held: Map<string, Map<string, number>>;
  /** The newest copy of each address, as it is (of a newer format included). */
  events: Map<string, NostrEvent>;
  /** The state, when the newest record at its address is readable. */
  state: { state: HistoryState; event: NostrEvent } | null;
};

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

function newerThan(event: NostrEvent, other: NostrEvent | undefined): boolean {
  return (
    !other ||
    event.created_at > other.created_at ||
    (event.created_at === other.created_at && event.id < other.id)
  );
}

type Opened =
  | { status: "part"; event: NostrEvent; part: HistoryPart }
  | { status: "state"; event: NostrEvent; state: HistoryState }
  | { status: "newer"; event: NostrEvent };

/**
 * The parts and the state among the events relays sent (queryRelaysPaged's answers): each event
 * checked once (openRecord: author, decryption, type, `d` tag against its month and rank, or the
 * state's, signature); of an address on several relays, the newest copy (then the lowest id).
 */
export function historyOf(
  keys: ArchiveKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): HistoryAnswers {
  const opened = new Map<string, Opened>();
  const open = (value: unknown): Opened | null => {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string") {
      const known = opened.get(id);
      if (known) return known;
    }
    const asPart = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const part = parseHistoryPart(payload);
        return part && addressOf(event) === historyPartAddress(keys, part.month, part.part)
          ? part
          : null;
      }
    });
    let read: Opened | null =
      asPart === null
        ? null
        : asPart.status === "ok"
          ? { status: "part", event: asPart.event, part: asPart.value }
          : { status: "newer", event: asPart.event };
    if (!read) {
      const asState = openRecord(value, {
        type: STATE_TYPE,
        encryptionKey: keys.encryptionKey,
        address: historyStateAddress(keys),
        author: keys.nostr.publicKey,
        parse: parseHistoryState
      });
      read =
        asState === null
          ? null
          : asState.status === "ok"
            ? { status: "state", event: asState.event, state: asState.value }
            : { status: "newer", event: asState.event };
    }
    if (!read) return null;
    opened.set(read.event.id, read);
    return read;
  };
  const newestPart = new Map<string, HistoryPartEntry>();
  const newestAny = new Map<string, Opened>();
  const held = new Map<string, Map<string, number>>();
  for (const [relay, values] of answers) {
    const ofRelay = new Map<string, number>();
    held.set(relay, ofRelay);
    for (const value of values) {
      const read = open(value);
      if (!read) continue;
      const address = addressOf(read.event);
      if (address === undefined) continue;
      ofRelay.set(address, Math.max(ofRelay.get(address) ?? -1, read.event.created_at));
      if (newerThan(read.event, newestAny.get(address)?.event)) newestAny.set(address, read);
      if (read.status === "part" && newerThan(read.event, newestPart.get(address)?.event)) {
        newestPart.set(address, { part: read.part, event: read.event });
      }
    }
  }
  const parts = new Map<string, HistoryPartEntry>();
  const newer = new Set<string>();
  const events = new Map<string, NostrEvent>();
  let state: HistoryAnswers["state"] = null;
  for (const [address, read] of newestAny) {
    events.set(address, read.event);
    if (read.status === "newer") newer.add(address);
    else if (read.status === "state") state = { state: read.state, event: read.event };
    else parts.set(address, newestPart.get(address)!);
  }
  return { parts, newer, held, events, state };
}

/** A month as the copies tell it. */
export type HistoryMonth = {
  month: string;
  /**
   * Every part of one copy is there (the newest at its address, all naming the same count and
   * `set`, their rows hashing to it), none of a newer format: only then are its rows shown.
   */
  copied: boolean;
  /** Its rows, when `copied`; empty otherwise (never half a month). */
  rows: LegacyHistoryRow[];
  /** The `set` of the whole copy, when `copied`. */
  set: string | null;
  /** An address of the month holds a record of a newer format: never written over. */
  newer: boolean;
};

/** `month` as `parts` and `newer` (historyOf's, and what was written since) tell it. */
export function historyMonth(
  keys: ArchiveKeys,
  month: string,
  parts: ReadonlyMap<string, HistoryPartEntry>,
  newer: ReadonlySet<string>
): HistoryMonth {
  const first = parts.get(historyPartAddress(keys, month, 0))?.part;
  const ranks = first?.parts ?? 1;
  let isNewer = false;
  for (let rank = 0; rank < Math.max(ranks, 1); rank += 1) {
    if (newer.has(historyPartAddress(keys, month, rank))) isNewer = true;
  }
  const none = { month, copied: false, rows: [], set: null, newer: isNewer };
  if (!first || isNewer) return none;
  const whole: HistoryPart[] = [];
  for (let rank = 0; rank < first.parts; rank += 1) {
    const part = parts.get(historyPartAddress(keys, month, rank))?.part;
    if (!part || part.month !== month || part.parts !== first.parts || part.set !== first.set) {
      return none;
    }
    whole.push(part);
  }
  const rows = whole.flatMap((part) => part.rows);
  const refs = rows.map(({ ref }) => ref);
  if (new Set(refs).size !== refs.length || setDigest(refs) !== first.set) return none;
  return { month, copied: true, rows, set: first.set, newer: false };
}

/** The months `parts` hold a part of, ascending. */
export function historyMonths(parts: ReadonlyMap<string, HistoryPartEntry>): string[] {
  return [...new Set([...parts.values()].map(({ part }) => part.month))].sort();
}

/** What relays hold of the history (one author, every month), read page by page. */
export function historyFilter(keys: ArchiveKeys) {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/**
 * The history's records the relays of `call` hold, read page by page, whole answers only. Never
 * rejects: relays that did not answer, or not to the end, are left out.
 */
export function fetchHistoryAnswers(
  keys: ArchiveKeys,
  call: RelayCall
): Promise<Map<string, unknown[]>> {
  return queryRelaysPaged(historyFilter(keys), call, { whole: true, quorum: "majority" });
}
