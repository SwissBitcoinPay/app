import { bytesToHex } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey } from "@/lib/nostr/keys";
import { NewerRecordError, newestRecord, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import { cardStatesFilter, type CardRecordKeys } from "./card-record";
import { CARD_SALT, isWalletGeneration, type CardWalletOf } from "./keys";

/*
 * The order of the account's cards in "Cards" (chosen on any of its devices, the same on all of
 * them), in one sealed record on the account's relays
 * (src/lib/nostr/record.ts, channel "account"). Its author and encryption key are the cards'
 * records' (card-record.ts): what reads, copies or erases those records by author takes it too
 * (a change of the account's relays, relays-move.ts; "Delete account", account-deletion.ts).
 * Its type is its own: the apps before it open the cards' records by type, and skip it. At one
 * opaque address; the newest copy wins (a change made on two devices at once keeps the later one).
 *
 * The order names each card's wallet (CardWalletOf), not the card alone: a card deleted then added
 * again pays from its next wallet (card-record.ts, `walletGeneration`), and is a new card here too,
 * placed after the ordered ones, as any card added (orderCards). Cards the order does not name
 * keep the order they had before it existed.
 *
 * IRREVERSIBLE: the `info` string of its address (vector in card-order.test.ts), its type, and its
 * format: a change needs a new `version` and a migration from the older ones.
 */

const ORDER_TYPE = "card-order";
/**
 * Records are padded to multiples of this many bytes (record.ts): thirteen cards fit in one block
 * (67 bytes each), so that the relays never tell an account's ten cards from one.
 */
const BLOCK = 1024;

/** 1: the cards' wallets, first to last, and when the order was chosen. */
export const CARD_ORDER_VERSION = 1;

/**
 * Most cards an order names: a value naming more is refused, a longer list is cut (cardOrderOf,
 * orderToSave). Far above what an account holds (ten at most, as expected).
 */
export const MAX_ORDERED_CARDS = 256;

export type CardOrder = {
  /** The cards' wallets, first to last, each card once. */
  cards: CardWalletOf[];
  /** Unix seconds: when it was chosen, its record's `created_at`. */
  updatedAt: number;
};

/** The `d` tag of the order's record: 32 bytes, hex. Tells nothing of the cards. */
export function cardOrderAddress(keys: CardRecordKeys): string {
  return bytesToHex(deriveKey(keys.addressKey, CARD_SALT, "card-order-address/v1"));
}

function isCardId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** The record's value of `order`. */
export function cardOrderValue(order: CardOrder): unknown {
  return {
    version: CARD_ORDER_VERSION,
    cards: order.cards.map(({ cardId, walletGeneration }) => ({ cardId, walletGeneration })),
    updatedAt: order.updatedAt
  };
}

/** An order from a record's value, checked whole. Null when invalid; NewerRecordError when newer. */
export function parseCardOrder(value: unknown): CardOrder | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > CARD_ORDER_VERSION) throw new NewerRecordError();
  if (
    v.version !== CARD_ORDER_VERSION ||
    !isUnixSeconds(v.updatedAt) ||
    !Array.isArray(v.cards) ||
    v.cards.length > MAX_ORDERED_CARDS
  ) {
    return null;
  }
  const cards: CardWalletOf[] = [];
  const ids = new Set<string>();
  for (const entry of v.cards as unknown[]) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const { cardId, walletGeneration } = entry as Record<string, unknown>;
    if (!isCardId(cardId) || !isWalletGeneration(walletGeneration) || ids.has(cardId)) return null;
    ids.add(cardId);
    cards.push({ cardId, walletGeneration });
  }
  return { cards, updatedAt: v.updatedAt };
}

/** The signed record of `order`, dated its `updatedAt`. */
export function cardOrderEvent(keys: CardRecordKeys, order: CardOrder): NostrEvent {
  return sealRecord({
    type: ORDER_TYPE,
    value: cardOrderValue(order),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: cardOrderAddress(keys),
    createdAt: order.updatedAt,
    block: BLOCK
  });
}

/** What relays hold at the order's address only (its author's records there). */
export function cardOrderFilter(keys: CardRecordKeys): RelayFilter {
  return { ...cardStatesFilter(keys), "#d": [cardOrderAddress(keys)] };
}

export type CardOrderRead = {
  /** The newest order readable, null when none (or when a newer app's copy is newer still). */
  order: CardOrder | null;
  /** A relay holds a copy of a newer format: never written over (a newer app decided it). */
  newer: boolean;
  /** `created_at` of the newest copy, readable or not: a new order is dated after it. */
  newestAt: number | null;
};

/**
 * The order among the events relays sent (the cards' records read by author, or its address
 * alone): each copy checked (openRecord: its author, address, signature, and its value's date as
 * its event's), the newest wins.
 */
export function cardOrderOf(keys: CardRecordKeys, answers: Map<string, unknown[]>): CardOrderRead {
  const address = cardOrderAddress(keys);
  const read = newestRecord(answers, (value) =>
    openRecord(value, {
      type: ORDER_TYPE,
      encryptionKey: keys.encryptionKey,
      address,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const order = parseCardOrder(payload);
        return order && order.updatedAt === event.created_at ? order : null;
      }
    })
  );
  const readableAt = read.newest?.event.created_at ?? null;
  const newestAt =
    readableAt === null && read.newestUnreadable === null
      ? null
      : Math.max(readableAt ?? -1, read.newestUnreadable ?? -1);
  const stale = read.newestUnreadable !== null && read.newestUnreadable >= (readableAt ?? -1);
  return {
    order: read.newest && !stale ? read.newest.value : null,
    newer: read.newestUnreadable !== null,
    newestAt
  };
}

/**
 * The order to save for `cards` (first to last, the cards shown), dated `now` or just after the
 * newest copy the relays hold (`after`), so that it wins over it. At most MAX_ORDERED_CARDS.
 */
export function orderToSave(
  cards: readonly CardWalletOf[],
  now: number,
  after: number | null
): CardOrder {
  return {
    cards: cards
      .slice(0, MAX_ORDERED_CARDS)
      .map(({ cardId, walletGeneration }) => ({ cardId, walletGeneration })),
    updatedAt: Math.max(now, (after ?? -1) + 1)
  };
}

/** The newer of two orders known (null: none), by when each was chosen. */
export function newerCardOrder(a: CardOrder | null, b: CardOrder | null): CardOrder | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/**
 * `cards` in `order`: the cards' wallets it names first, as it orders them, then the others in the
 * order they come in (a card added since, or added again: its wallet is another).
 */
export function orderCards<T extends CardWalletOf>(
  cards: readonly T[],
  order: CardOrder | null
): T[] {
  if (!order || order.cards.length === 0) return [...cards];
  const rank = new Map(order.cards.map((entry, index) => [entry.cardId, { entry, index }]));
  const placed = (card: T) => {
    const ranked = rank.get(card.cardId);
    return ranked && ranked.entry.walletGeneration === card.walletGeneration ? ranked.index : null;
  };
  const ordered = cards.filter((card) => placed(card) !== null);
  ordered.sort((a, b) => placed(a)! - placed(b)!);
  return [...ordered, ...cards.filter((card) => placed(card) === null)];
}
