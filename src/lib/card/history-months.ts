import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import { CARD_SALT, isWalletGeneration, sameCardWallet, type CardWalletOf } from "./keys";
import {
  historyValue,
  movementKey,
  movementValue,
  parseHistoryValue,
  parseMovementCopy,
  type HistoryCopy,
  type MovementCopy
} from "./history-records";
import {
  MAX_MONTH_PARTS,
  MONTH_FORMAT_VERSION,
  isMonth,
  monthSet,
  sortedEntries,
  type MonthEntry,
  type MonthHead
} from "./month-head";

/*
 * The copies of a card's history, month by month (the whole history kept, without limit, as
 * "Wallet"'s, written again each year). The records
 * of each tap and movement (history-records.ts) live 90 days on the relays; once a month is over, a
 * device of the account copies every entry of the card's wallet that month (each of a card's
 * wallets has copies of its own: keys.ts, CardWalletOf), then signs the copy again each year:
 * strfry refuses events over 3 years old.
 *
 * A copy is its head (month-head.ts: a small record of the history's author, read with the taps
 * and movements) and its parts: each a sealed record under 64 kB (what strfry takes by default),
 * of an author of their own, so that no read of the history by author fetches them: the parts of a
 * month are read by address, when that month is shown or copied again. Their address names the
 * copy's set: two devices copying the same entries write the same parts, and the parts of a copy
 * made again (an entry of the month written again since) are new ones, which its head names; the
 * former ones are no longer read. Pure.
 *
 * IRREVERSIBLE: the salt and the `info` strings of these keys and addresses (vectors in
 * card-history-months.test.ts), and the format (MONTH_FORMAT_VERSION).
 */

const PART_TYPE = "card-history-month-part";
/** Parts are padded as the history's records: their size tells little of the month. */
const BLOCK = 1024;

/**
 * Largest plaintext of a part, in bytes (its JSON, before padding): sealed (NIP-44, base64), its
 * event stays under the 64 kB strfry takes by default (as the owner's copies, archive.ts).
 */
export const MAX_PART_BYTES = 40_000;

/** The keys of the copies' parts. In memory only, wiped with the card root they come from. */
export type MonthPartKeys = {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  addressKey: Uint8Array;
};

export function deriveMonthPartKeys(root: Uint8Array): MonthPartKeys {
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(deriveKey(root, CARD_SALT, "history-month-nostr-secret-key/v1")),
    encryptionKey: deriveKey(root, CARD_SALT, "history-month-encryption-key/v1"),
    addressKey: deriveKey(root, CARD_SALT, "history-month-address-key/v1")
  };
}

export function wipeMonthPartKeys(keys: MonthPartKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/** A part of a month's copy. */
export type MonthPart = {
  cardId: string;
  walletGeneration: number;
  month: string;
  /** The copy's set (month-head.ts). */
  set: string;
  /** Its rank, from 0, of `parts`. */
  part: number;
  parts: number;
  taps: HistoryCopy[];
  movements: MovementCopy[];
};

/** The `d` tag of a part: 32 bytes, hex. Tells neither the card, the month nor the copy. */
export function monthPartAddress(
  keys: MonthPartKeys,
  {
    cardId,
    walletGeneration,
    month,
    set,
    part
  }: Pick<MonthPart, "cardId" | "walletGeneration" | "month" | "set" | "part">
): string {
  return bytesToHex(
    deriveKey(
      keys.addressKey,
      CARD_SALT,
      `history-month-part/v1/${cardId}/${walletGeneration}/${month}/${set}/${part}`
    )
  );
}

/** The entries of a copy of `taps` and `movements` (month-head.ts), in their order. */
export function monthEntries(
  taps: readonly HistoryCopy[],
  movements: readonly MovementCopy[]
): MonthEntry[] {
  return sortedEntries([
    ...taps.map(({ entry, revision }): MonthEntry => ["t", entry.id, revision]),
    ...movements.map(({ movement, revision }): MonthEntry => ["m", movementKey(movement), revision])
  ]);
}

/** A part's value, as written: its taps and movements as their records' values. */
export function monthPartValue(part: MonthPart): Record<string, unknown> {
  return {
    version: MONTH_FORMAT_VERSION,
    cardId: part.cardId,
    walletGeneration: part.walletGeneration,
    month: part.month,
    set: part.set,
    part: part.part,
    parts: part.parts,
    taps: part.taps.map(historyValue),
    movements: part.movements.map(movementValue)
  };
}

type Item =
  | { at: number; key: string; kind: "tap"; copy: HistoryCopy; bytes: number }
  | { at: number; key: string; kind: "movement"; copy: MovementCopy; bytes: number };

/** The bytes of `value`'s JSON (UTF-8). */
function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

function byTime(a: Item, b: Item): number {
  return a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/**
 * The copy of the card's wallet's month `month` holding `taps` and `movements` (each of that wallet
 * and month): its head and its parts, in time order, each part's JSON within MAX_PART_BYTES. Throws
 * when there is nothing to copy, or more than MAX_MONTH_PARTS parts.
 */
export function monthCopy(
  { cardId, walletGeneration }: CardWalletOf,
  month: string,
  taps: readonly HistoryCopy[],
  movements: readonly MovementCopy[]
): { head: MonthHead; parts: MonthPart[] } {
  const entries = monthEntries(taps, movements);
  if (entries.length === 0) throw new Error("Nothing to copy");
  const set = monthSet(entries);
  // Each entry's bytes in its part (UTF-8, as it is sealed), its separator counted: an upper bound of
  // the part's JSON. Never its UTF-16 length: a name in Cyrillic or CJK takes two or three bytes a
  // character, and a part counted so could go past the 64 kB a relay takes.
  const items: Item[] = [
    ...taps.map((copy): Item => ({
      at: copy.entry.at,
      key: `t/${copy.entry.id}`,
      kind: "tap",
      copy,
      bytes: jsonBytes(historyValue(copy)) + 1
    })),
    ...movements.map((copy): Item => ({
      at: copy.movement.at,
      key: `m/${movementKey(copy.movement)}`,
      kind: "movement",
      copy,
      bytes: jsonBytes(movementValue(copy)) + 1
    }))
  ].sort(byTime);
  const empty = jsonBytes(
    monthPartValue({
      cardId,
      walletGeneration,
      month,
      set,
      part: MAX_MONTH_PARTS,
      parts: MAX_MONTH_PARTS,
      taps: [],
      movements: []
    })
  );
  // Filled in order: a part takes the next entry while it stays within the bound.
  const groups: { taps: HistoryCopy[]; movements: MovementCopy[] }[] = [];
  let group = { taps: [] as HistoryCopy[], movements: [] as MovementCopy[] };
  let bytes = empty;
  for (const item of items) {
    if (bytes + item.bytes > MAX_PART_BYTES && group.taps.length + group.movements.length > 0) {
      groups.push(group);
      group = { taps: [], movements: [] };
      bytes = empty;
    }
    if (item.kind === "tap") group.taps.push(item.copy);
    else group.movements.push(item.copy);
    bytes += item.bytes;
  }
  groups.push(group);
  if (groups.length > MAX_MONTH_PARTS) throw new Error("Too many parts for one month");
  const parts = groups.map((held, part) => ({
    cardId,
    walletGeneration,
    month,
    set,
    part,
    parts: groups.length,
    ...held
  }));
  return {
    head: { cardId, walletGeneration, month, parts: groups.length, set },
    parts
  };
}

/** The signed record of a part, dated `createdAt` (its copy's). */
export function monthPartEvent(
  keys: MonthPartKeys,
  part: MonthPart,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: PART_TYPE,
    value: monthPartValue(part),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: monthPartAddress(keys, part),
    createdAt,
    block: BLOCK
  });
}

/**
 * A part's value, checked whole (each copy in it too); null when out of shape. Newer: `newer`;
 * throws NewerRecordError for a copy in it of a newer format.
 */
export function parseMonthPart(value: unknown): MonthPart | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > MONTH_FORMAT_VERSION) return "newer";
  if (
    v.version !== MONTH_FORMAT_VERSION ||
    typeof v.cardId !== "string" ||
    !/^[0-9a-f]{32}$/.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !isMonth(v.month) ||
    typeof v.set !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.set) ||
    typeof v.parts !== "number" ||
    !Number.isInteger(v.parts) ||
    v.parts < 1 ||
    v.parts > MAX_MONTH_PARTS ||
    typeof v.part !== "number" ||
    !Number.isInteger(v.part) ||
    v.part < 0 ||
    v.part >= v.parts ||
    !Array.isArray(v.taps) ||
    !Array.isArray(v.movements)
  ) {
    return null;
  }
  const wallet = { cardId: v.cardId, walletGeneration: v.walletGeneration };
  const taps: HistoryCopy[] = [];
  for (const item of v.taps) {
    const copy = parseHistoryValue(item);
    if (copy === "newer") throw new NewerRecordError();
    if (!copy || !sameCardWallet(copy.entry, wallet)) return null;
    taps.push(copy);
  }
  const movements: MovementCopy[] = [];
  for (const item of v.movements) {
    const copy = parseMovementCopy(item);
    if (copy === "newer") throw new NewerRecordError();
    if (!copy || !sameCardWallet(copy.movement, wallet)) return null;
    movements.push(copy);
  }
  return {
    ...wallet,
    month: v.month,
    set: v.set,
    part: v.part,
    parts: v.parts,
    taps,
    movements
  };
}

/**
 * At most this many parts' addresses per read: relays bound the size of a filter, and the parts
 * of a copy share one second (paging by date cannot get past what a relay sends of one second).
 */
export const PARTS_PER_READ = 50;

/** The addresses of the parts `head` names, in their order. */
export function monthPartAddresses(keys: MonthPartKeys, head: MonthHead): string[] {
  return Array.from({ length: head.parts }, (_, part) => monthPartAddress(keys, { ...head, part }));
}

/** What relays hold of the parts `heads` name: by address, PARTS_PER_READ a read. */
export function monthPartsFilters(keys: MonthPartKeys, heads: readonly MonthHead[]): RelayFilter[] {
  const addresses = heads.flatMap((head) => monthPartAddresses(keys, head));
  const filters: RelayFilter[] = [];
  for (let start = 0; start < addresses.length; start += PARTS_PER_READ) {
    filters.push({
      kinds: [RECORD_KIND],
      authors: [keys.nostr.publicKey],
      "#d": addresses.slice(start, start + PARTS_PER_READ)
    });
  }
  return filters;
}

/** A copy read back: its entries, if every part was there, and when its parts were signed. */
export type MonthCopyRead = {
  /** Every part of the head there, their entries those its set names: the copy, whole. */
  complete: boolean;
  taps: HistoryCopy[];
  movements: MovementCopy[];
  /** The oldest date of its parts' copies read (Unix seconds), null when none. */
  oldestAt: number | null;
  /** A part of a newer format: never written over. */
  newer: boolean;
  /**
   * Every copy of its parts the relays sent (of a newer format too), each once: what a deletion
   * request names (the copy replaced, history-copies.ts; the card deleted, card-erasure.ts).
   */
  events: NostrEvent[];
};

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/**
 * The copy `head` names, among the events relays sent: each part checked whole (its address, its
 * copy's set, its card's wallet and month), the newest copy of each kept; whole only when every
 * part is there and their entries are exactly those the head's set names.
 */
export function monthCopyOf(
  keys: MonthPartKeys,
  head: MonthHead,
  answers: ReadonlyMap<string, readonly unknown[]>
): MonthCopyRead {
  const found = new Map<number, { part: MonthPart; at: number }>();
  let newer = false;
  const seen = new Set<string>();
  const events: NostrEvent[] = [];
  for (const sent of answers.values()) {
    for (const value of sent) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) continue;
      const opened = openRecord<MonthPart>(value, {
        type: PART_TYPE,
        encryptionKey: keys.encryptionKey,
        address: () => true,
        author: keys.nostr.publicKey,
        parse: (payload, event) => {
          const part = parseMonthPart(payload);
          if (part === "newer") throw new NewerRecordError();
          return part &&
            sameCardWallet(part, head) &&
            part.month === head.month &&
            part.set === head.set &&
            part.parts === head.parts &&
            dTag(event) === monthPartAddress(keys, part)
            ? part
            : null;
        }
      });
      if (!opened) continue;
      seen.add(opened.event.id);
      events.push(opened.event);
      if (opened.status === "newer") {
        newer = true;
        continue;
      }
      const at = opened.event.created_at;
      const known = found.get(opened.value.part);
      // Of two copies of a part (the same content), the oldest tells when it was last signed.
      if (!known || at < known.at) found.set(opened.value.part, { part: opened.value, at });
    }
  }
  const parts = [...found.values()];
  const taps = parts.flatMap(({ part }) => part.taps);
  const movements = parts.flatMap(({ part }) => part.movements);
  const entries = monthEntries(taps, movements);
  const complete = found.size === head.parts && monthSet(entries) === head.set;
  return {
    complete,
    taps,
    movements,
    oldestAt: parts.length > 0 ? Math.min(...parts.map(({ at }) => at)) : null,
    newer,
    events
  };
}
