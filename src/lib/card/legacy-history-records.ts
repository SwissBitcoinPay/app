import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { setDigest } from "@/lib/registry/archive";
import type { LegacyCardRow } from "@/lib/legacy-v2/card-history";
import { MAX_NOTE_LENGTH } from "@/lib/legacy-v2/history";

import { ISSUER_NUMBER } from "./card-record";
import { CARD_SALT, isWalletGeneration, type CardWalletOf } from "./keys";

/*
 * The copy of a v2 card's history (src/lib/legacy-v2/card-history.ts) on the account's relays:
 * for information only, shown in the card's "History"
 * among its movements (src/features/card/history-view.ts), never in its balance nor its limits.
 * Written and read by the account's devices only, sealed (NIP-44) with keys of its own, derived
 * from the card root: neither the cards' records' (card-record.ts), the history's
 * (history-records.ts) nor the payees' authors.
 *
 * One copy per card's wallet (keys.ts, CardWalletOf: a card added again after its deletion shows
 * none of it, as the rest of its history), whole: the v2 card is closed by its migration, its
 * history ends there. Cut in parts each under 64 kB (what strfry takes), at an address of its card,
 * its wallet's generation and its rank. Every part names how many there are and the hash of the
 * whole copy's rows (`set`): a copy is read only once every part of it is there, never half of it.
 * A copy of a card whose v2 history holds nothing is one part without a row: copied, empty.
 * Signed again each year by the account's devices (strfry refuses events over 3 years old); never
 * expire. Beside it, the number printed on the v2 card (`LegacyCardNumber`), written as the
 * migration ends: the copy can still be made from there when the card's issuer visual could not be
 * kept (its number goes with it, card-record.ts), its PIN asked.
 *
 * IRREVERSIBLE: the salt, the `info` strings and the addresses (vectors in
 * card-legacy-history.test.ts), the records' types and their format (a change needs a new version,
 * which older apps read as "newer"). A part's version 2 adds each row's note; a part
 * of version 1, written before, is read as it is, its rows without a note (a copy made is not
 * made again for them), and signed again as it is, a version 1: as
 * a version 2, each of its rows a note longer, a full part would no longer fit what a relay takes.
 */

const PART_TYPE = "card-legacy-history";
const NUMBER_TYPE = "card-legacy-number";

/** Format of a part's value: 1, then 2 (each row's note). */
export const LEGACY_PART_VERSION = 2;
/** Format of a number's value: 1. */
export const LEGACY_NUMBER_VERSION = 1;

/** Plaintexts are padded to multiples of this: the size tells little of the copy. */
const BLOCK = 256;

/** Largest plaintext of a part, in bytes: its sealed event stays under 64 kB (as archive.ts). */
export const MAX_LEGACY_PART_BYTES = 40_000;

/** More parts than any card's history: anything above is refused rather than read. */
const MAX_PARTS = 1_000;

const HEX_32 = /^[0-9a-f]{64}$/;
const CARD_ID = /^[0-9a-f]{32}$/;
const CURRENCY = /^[A-Z]{3}$/;

export type LegacyHistoryKeys = {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  addressKey: Uint8Array;
};

export function deriveLegacyHistoryKeys(root: Uint8Array): LegacyHistoryKeys {
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(deriveKey(root, CARD_SALT, "legacy-history-nostr-secret-key/v1")),
    encryptionKey: deriveKey(root, CARD_SALT, "legacy-history-encryption-key/v1"),
    addressKey: deriveKey(root, CARD_SALT, "legacy-history-address-key/v1")
  };
}

export function wipeLegacyHistoryKeys(keys: LegacyHistoryKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/** One part of a card's copy. */
export type LegacyCopyPart = CardWalletOf & {
  /** Its format: LEGACY_PART_VERSION as a copy writes it, 1 as one read of before notes. */
  version: 1 | typeof LEGACY_PART_VERSION;
  /** Its rank, from 0. */
  part: number;
  /** How many parts the copy has. */
  parts: number;
  /** Hex: setDigest of every row's `ref` of the copy (all its parts). */
  set: string;
  /** Its rows, by `ref`, ascending. */
  rows: LegacyCardRow[];
};

/** The number printed on a migrated v2 card, kept for its copy (see above). */
export type LegacyCardNumber = CardWalletOf & { number: string };

/** The `d` tag of part `part` of `wallet`'s copy: 32 bytes, hex. Tells neither card nor rank. */
export function legacyPartAddress(
  keys: LegacyHistoryKeys,
  wallet: CardWalletOf,
  part: number
): string {
  return bytesToHex(
    deriveKey(
      keys.addressKey,
      CARD_SALT,
      `legacy-history-part/v1/${wallet.cardId}/${wallet.walletGeneration}/${part}`
    )
  );
}

/** The `d` tag of `wallet`'s printed number: 32 bytes, hex. */
export function legacyNumberAddress(keys: LegacyHistoryKeys, wallet: CardWalletOf): string {
  return bytesToHex(
    deriveKey(
      keys.addressKey,
      CARD_SALT,
      `legacy-history-number/v1/${wallet.cardId}/${wallet.walletGeneration}`
    )
  );
}

function rowValue(row: LegacyCardRow, version: LegacyCopyPart["version"]): Record<string, unknown> {
  const value: Record<string, unknown> = {
    ref: row.ref,
    kind: row.kind,
    at: row.at,
    // Safe integers (checked as the rows are read: card-history.ts).
    sats: Number(row.sats),
    feeMsat: Number(row.feeMsat),
    value: row.value && {
      minor: row.value.minor,
      digits: row.value.digits,
      currency: row.value.currency
    }
  };
  // Version 1 had no note (its rows' notes are "": parseRow).
  if (version !== 1) value.note = row.note;
  return value;
}

function partValue(part: LegacyCopyPart): Record<string, unknown> {
  return {
    version: part.version,
    cardId: part.cardId,
    walletGeneration: part.walletGeneration,
    part: part.part,
    parts: part.parts,
    set: part.set,
    rows: part.rows.map((row) => rowValue(row, part.version))
  };
}

function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

/**
 * The parts of `wallet`'s copy holding `rows` (each `ref` once), by `ref` ascending, each part
 * filled up to MAX_LEGACY_PART_BYTES. No row: one part without any (copied, empty).
 */
export function legacyCopyParts(
  wallet: CardWalletOf,
  rows: Iterable<LegacyCardRow>
): LegacyCopyPart[] {
  const byRef = new Map<string, LegacyCardRow>();
  for (const row of rows) byRef.set(row.ref, row);
  const sorted = [...byRef.values()].sort((a, b) => (a.ref < b.ref ? -1 : 1));
  for (const row of sorted) {
    // Never written as another number: refused rather than rounded (hard rule 3).
    if (
      row.sats > BigInt(Number.MAX_SAFE_INTEGER) ||
      row.feeMsat > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error("A row of the v2 history is beyond a safe integer");
    }
  }
  const set = setDigest(sorted.map(({ ref }) => ref));
  const base = {
    version: LEGACY_PART_VERSION as LegacyCopyPart["version"],
    cardId: wallet.cardId,
    walletGeneration: wallet.walletGeneration,
    set
  };
  const frame = jsonBytes({
    t: PART_TYPE,
    v: partValue({ ...base, part: MAX_PARTS, parts: MAX_PARTS, rows: [] })
  });
  const groups: LegacyCardRow[][] = [[]];
  let size = frame;
  for (const row of sorted) {
    const bytes = jsonBytes(rowValue(row, LEGACY_PART_VERSION)) + 1;
    if (size + bytes > MAX_LEGACY_PART_BYTES && groups[groups.length - 1]!.length > 0) {
      groups.push([]);
      size = frame;
    }
    groups[groups.length - 1]!.push(row);
    size += bytes;
  }
  return groups.map((group, part) => ({ ...base, part, parts: groups.length, rows: group }));
}

/** The signed record of `part`, dated `createdAt`. */
export function legacyPartEvent(
  keys: LegacyHistoryKeys,
  part: LegacyCopyPart,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: PART_TYPE,
    value: partValue(part),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: legacyPartAddress(keys, part, part.part),
    createdAt,
    block: BLOCK
  });
}

/** The signed record of `number`, dated `createdAt`. */
export function legacyNumberEvent(
  keys: LegacyHistoryKeys,
  number: LegacyCardNumber,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: NUMBER_TYPE,
    value: {
      version: LEGACY_NUMBER_VERSION,
      cardId: number.cardId,
      walletGeneration: number.walletGeneration,
      number: number.number
    },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: legacyNumberAddress(keys, number),
    createdAt,
    block: BLOCK
  });
}

function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A row of a part of `version` (1 or 2): null when invalid. */
function parseRow(value: unknown, version: number): LegacyCardRow | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  // Version 1 had no note: none.
  const note = version === 1 ? "" : v.note;
  if (typeof note !== "string" || note.length > MAX_NOTE_LENGTH) return null;
  if (v.kind !== "payment" && v.kind !== "recharge") return null;
  if (typeof v.ref !== "string" || !HEX_32.test(v.ref) || !isSeconds(v.at)) return null;
  if (!isCount(v.sats) || v.sats === 0 || !isCount(v.feeMsat)) return null;
  let rowValue: LegacyCardRow["value"] = null;
  if (v.value !== null) {
    if (!v.value || typeof v.value !== "object" || Array.isArray(v.value)) return null;
    const { minor, digits, currency } = v.value as Record<string, unknown>;
    if (!isCount(minor)) return null;
    if (typeof digits !== "number" || !Number.isInteger(digits) || digits < 0 || digits > 4) {
      return null;
    }
    if (typeof currency !== "string" || !CURRENCY.test(currency) || currency === "BTC") {
      return null;
    }
    rowValue = { minor, digits, currency };
  }
  return {
    ref: v.ref,
    kind: v.kind,
    at: v.at,
    sats: BigInt(v.sats),
    feeMsat: BigInt(v.feeMsat),
    value: rowValue,
    note
  };
}

/** A part's value: null when invalid. Throws NewerRecordError for a newer version. */
export function parseLegacyPart(value: unknown): LegacyCopyPart | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > LEGACY_PART_VERSION) {
    throw new NewerRecordError();
  }
  if (
    (v.version !== 1 && v.version !== LEGACY_PART_VERSION) ||
    typeof v.cardId !== "string" ||
    !CARD_ID.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !Number.isSafeInteger(v.parts) ||
    (v.parts as number) < 1 ||
    (v.parts as number) > MAX_PARTS ||
    !Number.isSafeInteger(v.part) ||
    (v.part as number) < 0 ||
    (v.part as number) >= (v.parts as number) ||
    typeof v.set !== "string" ||
    !HEX_32.test(v.set) ||
    !Array.isArray(v.rows)
  ) {
    return null;
  }
  // Only a copy of one part holds no row (an empty history): a part of more is never empty.
  if (v.rows.length === 0 && v.parts !== 1) return null;
  const rows: LegacyCardRow[] = [];
  for (const value of v.rows as unknown[]) {
    const row = parseRow(value, v.version);
    // Ascending, each row once: as legacyCopyParts writes them.
    if (!row || (rows.length > 0 && rows[rows.length - 1]!.ref >= row.ref)) return null;
    rows.push(row);
  }
  return {
    version: v.version as LegacyCopyPart["version"],
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    part: v.part as number,
    parts: v.parts as number,
    set: v.set,
    rows
  };
}

/** A number's value: null when invalid. Throws NewerRecordError for a newer version. */
export function parseLegacyNumber(value: unknown): LegacyCardNumber | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > LEGACY_NUMBER_VERSION) {
    throw new NewerRecordError();
  }
  if (
    v.version !== LEGACY_NUMBER_VERSION ||
    typeof v.cardId !== "string" ||
    !CARD_ID.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    typeof v.number !== "string" ||
    !ISSUER_NUMBER.test(v.number)
  ) {
    return null;
  }
  return { cardId: v.cardId, walletGeneration: v.walletGeneration, number: v.number };
}

/** A part's newest readable record. */
export type LegacyPartEntry = { part: LegacyCopyPart; event: NostrEvent };

/** A number's newest readable record. */
export type LegacyNumberEntry = { number: LegacyCardNumber; event: NostrEvent };

/** What a read of the copies gave. */
export type LegacyHistoryAnswers = {
  /** By address, each part's newest readable record. */
  parts: Map<string, LegacyPartEntry>;
  /** By address, each number's newest readable record. */
  numbers: Map<string, LegacyNumberEntry>;
  /** Addresses whose newest record is of a newer format: neither read nor written over. */
  newer: Set<string>;
  /** Per relay that answered, the date of the newest copy it holds of each address. */
  held: Map<string, Map<string, number>>;
  /** The newest copy of each address, as it is (of a newer format included). */
  events: Map<string, NostrEvent>;
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
  | { status: "part"; event: NostrEvent; part: LegacyCopyPart }
  | { status: "number"; event: NostrEvent; number: LegacyCardNumber }
  | { status: "newer"; event: NostrEvent };

/**
 * The parts and numbers among the events relays sent (queryRelaysPaged's answers): each event
 * checked once (openRecord: author, decryption, type, `d` tag against its card, wallet and rank,
 * signature); of an address on several relays, the newest copy (then the lowest id).
 */
export function legacyHistoryOf(
  keys: LegacyHistoryKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): LegacyHistoryAnswers {
  const opened = new Map<string, Opened | null>();
  const open = (value: unknown): Opened | null => {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string" && opened.has(id)) return opened.get(id)!;
    const read = openRecord<
      { kind: "part"; part: LegacyCopyPart } | { kind: "number"; number: LegacyCardNumber }
    >(value, {
      type: [PART_TYPE, NUMBER_TYPE],
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event, type) => {
        if (type === PART_TYPE) {
          const part = parseLegacyPart(payload);
          return part && addressOf(event) === legacyPartAddress(keys, part, part.part)
            ? { kind: "part", part }
            : null;
        }
        const number = parseLegacyNumber(payload);
        return number && addressOf(event) === legacyNumberAddress(keys, number)
          ? { kind: "number", number }
          : null;
      }
    });
    const result: Opened | null =
      read === null
        ? null
        : read.status === "newer"
          ? { status: "newer", event: read.event }
          : read.value.kind === "part"
            ? { status: "part", event: read.event, part: read.value.part }
            : { status: "number", event: read.event, number: read.value.number };
    if (typeof id === "string") opened.set(id, result);
    return result;
  };
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
    }
  }
  const parts = new Map<string, LegacyPartEntry>();
  const numbers = new Map<string, LegacyNumberEntry>();
  const newer = new Set<string>();
  const events = new Map<string, NostrEvent>();
  for (const [address, read] of newestAny) {
    events.set(address, read.event);
    if (read.status === "newer") newer.add(address);
    else if (read.status === "part") parts.set(address, { part: read.part, event: read.event });
    else numbers.set(address, { number: read.number, event: read.event });
  }
  return { parts, numbers, newer, held, events };
}

/** A card's copy as the parts tell it. */
export type LegacyCopy = {
  /**
   * Every part of one copy is there (the newest at its address, all naming the same count and
   * `set`, their rows hashing to it), none of a newer format: only then are its rows shown.
   */
  copied: boolean;
  /** Its rows, when `copied`; empty otherwise (never half a copy). */
  rows: LegacyCardRow[];
  /** An address of the copy holds a record of a newer format: never written over. */
  newer: boolean;
  /** Its parts' newest records, when `copied`. */
  events: NostrEvent[];
};

/** `wallet`'s copy as `parts` and `newer` (legacyHistoryOf's) tell it. */
export function legacyCopyOf(
  keys: LegacyHistoryKeys,
  wallet: CardWalletOf,
  parts: ReadonlyMap<string, LegacyPartEntry>,
  newer: ReadonlySet<string>
): LegacyCopy {
  const first = parts.get(legacyPartAddress(keys, wallet, 0))?.part;
  const ranks = Math.max(first?.parts ?? 1, 1);
  let isNewer = false;
  for (let rank = 0; rank < ranks; rank += 1) {
    if (newer.has(legacyPartAddress(keys, wallet, rank))) isNewer = true;
  }
  const none: LegacyCopy = { copied: false, rows: [], newer: isNewer, events: [] };
  if (!first || isNewer) return none;
  const whole: LegacyPartEntry[] = [];
  for (let rank = 0; rank < first.parts; rank += 1) {
    const entry = parts.get(legacyPartAddress(keys, wallet, rank));
    if (!entry || entry.part.parts !== first.parts || entry.part.set !== first.set) return none;
    whole.push(entry);
  }
  const rows = whole.flatMap(({ part }) => part.rows);
  const refs = rows.map(({ ref }) => ref);
  if (new Set(refs).size !== refs.length || setDigest(refs) !== first.set) return none;
  return { copied: true, rows, newer: false, events: whole.map(({ event }) => event) };
}

/** What relays hold of the copies (one author, every card): read page by page. */
export function legacyHistoryFilter(keys: LegacyHistoryKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}
