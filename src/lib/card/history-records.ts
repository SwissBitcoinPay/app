import { bytesToHex } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import {
  cardMovementValue,
  cardWithdrawalNoteValue,
  parseCardMovement,
  parseCardWithdrawalNote,
  type CardMovement,
  type CardWithdrawalNote
} from "./card-movement";
import { CARD_SALT, type CardWalletOf } from "./keys";
import { monthHeadValue, parseMonthHead, type MonthHead } from "./month-head";
import {
  CARD_PAYMENTS_KEPT_MS,
  cardPaymentEntryValue,
  parseCardPaymentEntry,
  type CardPaymentEntry
} from "./payment-entry";

/*
 * The account's card payments on its relays (the history of the cards on Nostr, for the web app
 * and the account's other phones): one sealed record per tap, at an opaque
 * address, written again with each write of the phone's log (payment-log.ts), and dropped by the
 * relays once the log drops it (NIP-40, CARD_PAYMENTS_KEPT_MS). Its author is a key of its own,
 * neither the cards' (card-record.ts) nor the payees' (payee-records.ts). A relay sees when a
 * record was written, never what it holds: card, amount, merchant, invoice and proof are inside.
 *
 * Each write of an entry is dated after the one before (its revision added to the tap's second):
 * a relay keeps the latest copy of an address, and of two as old the one of the lower id (NIP-01).
 *
 * The recharges and returns of each card (card-movement.ts) are
 * records of the same author, of a type and at addresses of their own (`card-movement`, by card and
 * wallet payment), dated and dropped the same way: an app of before knows neither, and leaves them.
 * So are the heads of the copies of each card's wallet's months (month-head.ts, history-months.ts),
 * which never expire, and the notes of the withdrawals (card-movement.ts, CardWithdrawalNote), which
 * never expire either: they tell a withdrawal from a return for good, whatever the age of its
 * payment in the card's wallet. Every entry names the card's wallet it belongs to (keys.ts, CardWalletOf): a
 * card added again after its deletion shows none of its earlier wallet's.
 *
 * IRREVERSIBLE: the salt and the `info` strings of these keys and addresses (vectors in
 * card-history.test.ts), and the format (HISTORY_FORMAT_VERSION): a change needs a new version,
 * which the older apps read as "newer".
 */

const RECORD_TYPE = "card-payment";
const MOVEMENT_TYPE = "card-movement";
const MONTH_HEAD_TYPE = "card-history-month";
const WITHDRAWAL_TYPE = "card-withdrawal";
/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 1024;

/**
 * 2 (each payment's value on the relays): the entry of the log's
 * format 4 (payment-entry.ts, with its value), with its revision. 1 (the log's format 2, without a
 * value) is no longer read.
 */
export const HISTORY_FORMAT_VERSION = 2;

/**
 * 2: a withdrawal too (card-movement.ts), written in this format only, so that an app
 * of before leaves it ("newer") and still reads the recharges and returns, written in 1. 1:
 * a movement of a card's wallet, a recharge or a return, with its revision.
 */
export const MOVEMENT_FORMAT_VERSION = 2;

/** The format a movement is written in: the oldest that has its kind (MOVEMENT_FORMAT_VERSION). */
function movementVersionOf(movement: CardMovement): number {
  return movement.kind === "withdrawal" ? 2 : 1;
}

/** 1: a withdrawal's note (card-movement.ts, CardWithdrawalNote). */
export const WITHDRAWAL_FORMAT_VERSION = 1;

/** The keys of the history's records. In memory only, wiped with the card root they come from. */
export type HistoryRecordKeys = {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  addressKey: Uint8Array;
};

export function deriveHistoryRecordKeys(root: Uint8Array): HistoryRecordKeys {
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(deriveKey(root, CARD_SALT, "history-nostr-secret-key/v1")),
    encryptionKey: deriveKey(root, CARD_SALT, "history-encryption-key/v1"),
    addressKey: deriveKey(root, CARD_SALT, "history-address-key/v1")
  };
}

export function wipeHistoryRecordKeys(keys: HistoryRecordKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/** The `d` tag of a tap's record: 32 bytes, hex. Tells neither the tap nor its card. */
export function historyAddress(keys: HistoryRecordKeys, id: string): string {
  return bytesToHex(deriveKey(keys.addressKey, CARD_SALT, `history-entry-address/v1/${id}`));
}

/** A write of a tap's entry: the entry, and how many writes came before it (payment-log.ts). */
export type HistoryCopy = { entry: CardPaymentEntry; revision: number };

/** A copy's record date: its tap's second, plus its revision. */
export function historyCreatedAt({ entry, revision }: HistoryCopy): number {
  return Math.floor(entry.at / 1000) + revision;
}

/** When the relays drop a tap's records: when the log drops its entry. */
export function historyExpiresAt(entry: CardPaymentEntry): number {
  return Math.floor((entry.at + CARD_PAYMENTS_KEPT_MS) / 1000);
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A copy's value: the entry as the log writes it (amounts as JSON numbers), with its revision. */
export function historyValue({ entry, revision }: HistoryCopy): Record<string, unknown> {
  return { ...cardPaymentEntryValue(entry), version: HISTORY_FORMAT_VERSION, revision };
}

/** A copy, checked whole; null when out of shape. Of a newer version: `newer`. */
export function parseHistoryValue(value: unknown): HistoryCopy | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > HISTORY_FORMAT_VERSION) return "newer";
  if (v.version !== HISTORY_FORMAT_VERSION || !isRevision(v.revision)) return null;
  const entry = parseCardPaymentEntry(v);
  return entry ? { entry, revision: v.revision } : null;
}

/** The signed record of a copy, dated after its earlier ones, dropped with the log's entry. */
export function historyEvent(keys: HistoryRecordKeys, copy: HistoryCopy): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: historyValue(copy),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: historyAddress(keys, copy.entry.id),
    createdAt: historyCreatedAt(copy),
    expiresAt: historyExpiresAt(copy.entry),
    block: BLOCK
  });
}

/** What relays hold of the history: every record of its author (paged: they may be many). */
export function historyFilter(keys: HistoryRecordKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/** A write of a card's movement: the movement, and how many writes came before it. */
export type MovementCopy = { movement: CardMovement; revision: number };

/** The key of a movement among the history's: its card and its wallet's payment. */
export function movementKey(movement: Pick<CardMovement, "cardId" | "id">): string {
  return `${movement.cardId}/${movement.id}`;
}

/** The `d` tag of a movement's record: 32 bytes, hex. Tells neither the card nor the payment. */
export function movementAddress(
  keys: HistoryRecordKeys,
  movement: Pick<CardMovement, "cardId" | "id">
): string {
  return bytesToHex(
    deriveKey(keys.addressKey, CARD_SALT, `history-movement-address/v1/${movementKey(movement)}`)
  );
}

/** A movement's record date: its second, plus its revision. */
export function movementCreatedAt({ movement, revision }: MovementCopy): number {
  return Math.floor(movement.at / 1000) + revision;
}

/** When the relays drop a movement's record: as a tap's, once the copy of its month holds it. */
export function movementExpiresAt(movement: CardMovement): number {
  return Math.floor((movement.at + CARD_PAYMENTS_KEPT_MS) / 1000);
}

/** A movement's copy's value: the movement as written, with its revision. */
export function movementValue({ movement, revision }: MovementCopy): Record<string, unknown> {
  return { ...cardMovementValue(movement), version: movementVersionOf(movement), revision };
}

/** A movement's copy, checked whole; null when out of shape. Of a newer version: `newer`. */
export function parseMovementCopy(value: unknown): MovementCopy | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > MOVEMENT_FORMAT_VERSION) return "newer";
  if ((v.version !== 1 && v.version !== 2) || !isRevision(v.revision)) return null;
  const movement = parseCardMovement(v, v.version >= 2);
  return movement ? { movement, revision: v.revision } : null;
}

/** The signed record of a movement's copy, dated after its earlier ones. */
export function movementEvent(keys: HistoryRecordKeys, copy: MovementCopy): NostrEvent {
  return sealRecord({
    type: MOVEMENT_TYPE,
    value: movementValue(copy),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: movementAddress(keys, copy.movement),
    createdAt: movementCreatedAt(copy),
    expiresAt: movementExpiresAt(copy.movement),
    block: BLOCK
  });
}

/** The `d` tag of a withdrawal's note: 32 bytes, hex. Tells neither the card nor the payment. */
export function withdrawalAddress(
  keys: HistoryRecordKeys,
  note: Pick<CardWithdrawalNote, "cardId" | "id">
): string {
  return bytesToHex(
    deriveKey(keys.addressKey, CARD_SALT, `history-withdrawal-address/v1/${movementKey(note)}`)
  );
}

/** A withdrawal's note as written, with its version. */
export function withdrawalValue(note: CardWithdrawalNote): Record<string, unknown> {
  return { ...cardWithdrawalNoteValue(note), version: WITHDRAWAL_FORMAT_VERSION };
}

/** A withdrawal's note, checked whole; null when out of shape. Of a newer version: `newer`. */
export function parseWithdrawalValue(value: unknown): CardWithdrawalNote | "newer" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > WITHDRAWAL_FORMAT_VERSION) return "newer";
  if (v.version !== WITHDRAWAL_FORMAT_VERSION) return null;
  return parseCardWithdrawalNote(v);
}

/**
 * The signed record of a withdrawal's note, dated `createdAt` (when it was written, in seconds):
 * written again as it is when a withdrawal is tried again. Never expires (see above).
 */
export function withdrawalEvent(
  keys: HistoryRecordKeys,
  note: CardWithdrawalNote,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: WITHDRAWAL_TYPE,
    value: withdrawalValue(note),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: withdrawalAddress(keys, note),
    createdAt,
    block: BLOCK
  });
}

/** A month of a card's wallet: what a month's copy is of. */
export type CardWalletMonth = Pick<MonthHead, "cardId" | "walletGeneration" | "month">;

/** The `d` tag of the head of a card's wallet's month's copy: 32 bytes, hex. Tells neither. */
export function monthHeadAddress(
  keys: HistoryRecordKeys,
  { cardId, walletGeneration, month }: CardWalletMonth
): string {
  return bytesToHex(
    deriveKey(
      keys.addressKey,
      CARD_SALT,
      `history-month-head/v1/${cardId}/${walletGeneration}/${month}`
    )
  );
}

/** The signed head of a month's copy, dated `createdAt` (when the copy was made or signed again). */
export function monthHeadEvent(
  keys: HistoryRecordKeys,
  head: MonthHead,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: MONTH_HEAD_TYPE,
    value: monthHeadValue(head),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: monthHeadAddress(keys, head),
    createdAt,
    block: BLOCK
  });
}

/** The key of a card's wallet's month among the heads. */
export function monthKey({ cardId, walletGeneration, month }: CardWalletMonth): string {
  return `${cardId}/${walletGeneration}/${month}`;
}

/** A month's head as the relays hold it: the head, and when it was signed. */
export type HeadCopy = { head: MonthHead; createdAt: number };

export type HistoryRead = {
  /** By tap, its latest copy. */
  copies: Map<string, HistoryCopy>;
  /** By movement (movementKey), its latest copy. */
  movements: Map<string, MovementCopy>;
  /** By card's wallet's month (monthKey), the head of its copy: the newest one signed. */
  heads: Map<string, HeadCopy>;
  /** The withdrawals' notes, by their payment (movementKey). */
  withdrawals: Map<string, CardWithdrawalNote>;
  /**
   * The addresses holding a record of a newer format: some taps or movements are left out (a newer
   * app reads them), never written over.
   */
  newerAt: Set<string>;
  /** Some record is of a newer format (`newerAt` is not empty). */
  newer: boolean;
  /** Relays that answered. */
  answered: number;
};

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

type Opened =
  | { kind: "tap"; copy: HistoryCopy }
  | { kind: "movement"; copy: MovementCopy }
  | { kind: "head"; head: MonthHead }
  | { kind: "withdrawal"; note: CardWithdrawalNote };

/**
 * One relay's copy, if it is a record of the history, a tap's, a movement's, a month's head or a
 * withdrawal's note: opened once.
 */
function openHistoryRecord(keys: HistoryRecordKeys, value: unknown) {
  return openRecord<Opened>(value, {
    type: [RECORD_TYPE, MOVEMENT_TYPE, MONTH_HEAD_TYPE, WITHDRAWAL_TYPE],
    encryptionKey: keys.encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event, type) => {
      if (type === RECORD_TYPE) {
        const copy = parseHistoryValue(payload);
        if (copy === "newer") throw new NewerRecordError();
        return copy &&
          event.created_at === historyCreatedAt(copy) &&
          dTag(event) === historyAddress(keys, copy.entry.id)
          ? { kind: "tap", copy }
          : null;
      }
      if (type === WITHDRAWAL_TYPE) {
        const note = parseWithdrawalValue(payload);
        if (note === "newer") throw new NewerRecordError();
        return note && dTag(event) === withdrawalAddress(keys, note)
          ? { kind: "withdrawal", note }
          : null;
      }
      if (type === MONTH_HEAD_TYPE) {
        const head = parseMonthHead(payload);
        if (head === "newer") throw new NewerRecordError();
        return head && dTag(event) === monthHeadAddress(keys, head) ? { kind: "head", head } : null;
      }
      const copy = parseMovementCopy(payload);
      if (copy === "newer") throw new NewerRecordError();
      return copy &&
        event.created_at === movementCreatedAt(copy) &&
        dTag(event) === movementAddress(keys, copy.movement)
        ? { kind: "movement", copy }
        : null;
    }
  });
}

/**
 * What relays sent of the history of the cards' wallets `of` takes: every copy of their taps, of
 * their movements and of their months' heads, each checked whole as historyOf checks it (its card's
 * wallet read inside), for a deletion request to name ("Delete the card",
 * src/features/card/card-erasure.ts) with the heads, whose parts it names too. A copy of a newer
 * format tells no card: it is not among them.
 */
export function cardHistoryEvents(
  keys: HistoryRecordKeys,
  answers: ReadonlyMap<string, readonly unknown[]>,
  of: (wallet: CardWalletOf) => boolean
): { events: NostrEvent[]; heads: MonthHead[] } {
  const events = new Map<string, NostrEvent>();
  const heads = new Map<string, MonthHead>();
  for (const list of answers.values()) {
    for (const value of list) {
      const opened = openHistoryRecord(keys, value);
      if (!opened || opened.status === "newer") continue;
      const read = opened.value;
      const wallet: CardWalletOf =
        read.kind === "tap"
          ? read.copy.entry
          : read.kind === "movement"
            ? read.copy.movement
            : read.kind === "withdrawal"
              ? read.note
              : read.head;
      if (!of(wallet)) continue;
      events.set(opened.event.id, opened.event);
      if (read.kind === "head") {
        const { head } = read;
        heads.set(
          `${head.cardId} ${head.walletGeneration} ${head.month} ${head.set} ${head.parts}`,
          head
        );
      }
    }
  }
  return { events: [...events.values()], heads: [...heads.values()] };
}

/**
 * The taps and movements among the events relays sent: each copy checked whole (its date and
 * address its own), then the latest of each kept (on a tie, the one of the lower id: the one
 * relays keep).
 */
export function historyOf(
  keys: HistoryRecordKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): HistoryRead {
  const taps = new Map<string, { copy: HistoryCopy; id: string }>();
  const movements = new Map<string, { copy: MovementCopy; id: string }>();
  const heads = new Map<string, { copy: HeadCopy; id: string }>();
  // A note says the same each time it is written: any copy of it is the note.
  const withdrawals = new Map<string, CardWithdrawalNote>();
  const newerAt = new Set<string>();
  const seen = new Set<string>();
  /** Whether a copy of `revision` and event `id` goes before the one kept. */
  const later = (
    known: { copy: { revision: number }; id: string } | undefined,
    revision: number,
    id: string
  ) =>
    !known || revision > known.copy.revision || (revision === known.copy.revision && id < known.id);
  for (const events of answers.values()) {
    for (const value of events) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) continue;
      const opened = openHistoryRecord(keys, value);
      if (!opened) continue;
      seen.add(opened.event.id);
      if (opened.status === "newer") {
        const address = dTag(opened.event);
        if (address) newerAt.add(address);
        continue;
      }
      const read = opened.value;
      if (read.kind === "tap") {
        const tap = read.copy.entry.id;
        if (later(taps.get(tap), read.copy.revision, opened.event.id)) {
          taps.set(tap, { copy: read.copy, id: opened.event.id });
        }
      } else if (read.kind === "withdrawal") {
        withdrawals.set(movementKey(read.note), read.note);
      } else if (read.kind === "movement") {
        const key = movementKey(read.copy.movement);
        if (later(movements.get(key), read.copy.revision, opened.event.id)) {
          movements.set(key, { copy: read.copy, id: opened.event.id });
        }
      } else {
        // The newest signed (on a tie, the lower id: the one relays keep).
        const key = monthKey(read.head);
        const known = heads.get(key);
        const at = opened.event.created_at;
        if (
          !known ||
          at > known.copy.createdAt ||
          (at === known.copy.createdAt && opened.event.id < known.id)
        ) {
          heads.set(key, { copy: { head: read.head, createdAt: at }, id: opened.event.id });
        }
      }
    }
  }
  return {
    copies: new Map([...taps].map(([tap, { copy }]) => [tap, copy])),
    movements: new Map([...movements].map(([key, { copy }]) => [key, copy])),
    heads: new Map([...heads].map(([key, { copy }]) => [key, copy])),
    withdrawals,
    newerAt,
    newer: newerAt.size > 0,
    answered: answers.size
  };
}
