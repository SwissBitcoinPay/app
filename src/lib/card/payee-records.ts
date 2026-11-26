import { bytesToHex } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import {
  NewerRecordError,
  RECORD_KIND,
  openRecord,
  sealRecord,
  type OpenedRecord
} from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import { CARD_SALT, type CardWalletOf } from "./keys";
import {
  PAYEE_FORMAT_VERSION,
  mergePayeeModes,
  mergePayees,
  parsePayee,
  parsePayeeMode,
  payeeModeValue,
  payeeValue,
  type PayeeEntry,
  type PayeeModeEntry,
  type RemotePayees
} from "./payee-book";

/*
 * Whom each of the account's cards pays without asking (payee-book.ts), on the account's relays
 * (the cards are managed on the web too): for each card's wallet, one sealed
 * record for the holder's mode, one per merchant ever approved for it, at opaque addresses
 * (src/lib/nostr/record.ts, channel "account") that name the card's wallet: a card added again
 * after its deletion writes at others, which neither a copy of its earlier book nor the requests
 * erasing it (src/features/card/card-erasure.ts) ever touch. Their author is a key of their own,
 * not the cards' (card-record.ts): a reader of the cards by author never gets these records, which
 * may outnumber what a relay sends at once. A relay sees neither a card, nor a merchant's address,
 * nor whether it is approved.
 *
 * The records of version 1 (one book for every card) are left as they are: they are no card's
 * (payee-book.ts, PAYEE_FORMAT_VERSION), "Delete account" erases them by author. But the
 * former mode's address holds the books' marker (formatMarkerEvent): an app of format 1 looks for
 * the mode there only, and would otherwise go on paying the merchants of its book whatever each
 * card's mode is now.
 *
 * IRREVERSIBLE: the salt and the `info` strings of these keys and addresses (vectors in
 * payee-records.test.ts), and the format (payee-book.ts).
 */

const MODE_TYPE = "card-payee-mode";
const PAYEE_TYPE = "card-payee";
/** Records are padded to multiples of this many bytes (record.ts): they all look alike. */
const BLOCK = 1024;

/** The keys of the payees' records. In memory only, wiped with the card root they come from. */
export type PayeeRecordKeys = {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  addressKey: Uint8Array;
};

export function derivePayeeRecordKeys(root: Uint8Array): PayeeRecordKeys {
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    nostr: nostrKeys(deriveKey(root, CARD_SALT, "payees-nostr-secret-key/v1")),
    encryptionKey: deriveKey(root, CARD_SALT, "payees-encryption-key/v1"),
    addressKey: deriveKey(root, CARD_SALT, "payees-address-key/v1")
  };
}

export function wipePayeeRecordKeys(keys: PayeeRecordKeys): void {
  keys.nostr.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  keys.addressKey.fill(0);
}

/**
 * The `d` tag of the mode's record of format 1, one book for every card (released: its vector is
 * in payee-records.test.ts). Since format 2 it holds the books' marker (formatMarkerEvent).
 */
export function formerModeAddress(keys: PayeeRecordKeys): string {
  return bytesToHex(deriveKey(keys.addressKey, CARD_SALT, "payee-mode-address/v1"));
}

/**
 * What format 2 keeps at the former mode's address: a mode's value of a version above 1, which an
 * app of format 1 reads as a newer app's (its book is then not whole: it pays no card, and its
 * holder changes nothing of it), and this app as no card's (it names none).
 */
const FORMAT_MARKER = { version: PAYEE_FORMAT_VERSION, books: "per-card" } as const;

/** The signed books' marker, dated `createdAt` (after any record of its address seen). */
export function formatMarkerEvent(keys: PayeeRecordKeys, createdAt: number): NostrEvent {
  return sealRecord({
    type: MODE_TYPE,
    value: FORMAT_MARKER,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: formerModeAddress(keys),
    createdAt,
    block: BLOCK
  });
}

/** The `d` tag of a card's wallet's mode's record: 32 bytes, hex. Never tells the card. */
export function payeeModeAddress(
  keys: PayeeRecordKeys,
  { cardId, walletGeneration }: CardWalletOf
): string {
  return bytesToHex(
    deriveKey(keys.addressKey, CARD_SALT, `payee-mode-address/v2/${cardId}/${walletGeneration}`)
  );
}

/**
 * The `d` tag of a merchant's record for a card's wallet: 32 bytes, hex. Tells neither. `id`: its
 * Lightning address, or its node's key (payee-book.ts), which never reads as an address.
 */
export function payeeAddress(
  keys: PayeeRecordKeys,
  { cardId, walletGeneration }: CardWalletOf,
  id: string
): string {
  return bytesToHex(
    deriveKey(keys.addressKey, CARD_SALT, `payee-address/v2/${cardId}/${walletGeneration}/${id}`)
  );
}

/** The signed record of a card's mode, dated its `updatedAt`. */
export function payeeModeEvent(keys: PayeeRecordKeys, entry: PayeeModeEntry): NostrEvent {
  return sealRecord({
    type: MODE_TYPE,
    value: payeeModeValue(entry),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: payeeModeAddress(keys, entry),
    createdAt: entry.updatedAt,
    block: BLOCK
  });
}

/** The signed record of a merchant's entry, dated its `updatedAt`. */
export function payeeEvent(keys: PayeeRecordKeys, entry: PayeeEntry): NostrEvent {
  return sealRecord({
    type: PAYEE_TYPE,
    value: payeeValue(entry),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: payeeAddress(keys, entry, entry.id),
    createdAt: entry.updatedAt,
    block: BLOCK
  });
}

/** What relays hold of the payees: every record of their author (paged: they may be many). */
export function payeesFilter(keys: PayeeRecordKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

export type PayeesRead = {
  /**
   * By card id, then by its wallets' generations, what the relays hold of each wallet's book (an
   * earlier wallet's, left on a relay that missed its erasure, too: never one of the card's now).
   */
  cards: Map<string, Map<number, RemotePayees>>;
  /**
   * Addresses (`d` tags) holding a record of a newer format: the books read are not whole (a newer
   * app decided something this one cannot read), and these records are never written over.
   */
  newer: Set<string>;
  /**
   * The former mode's address (formerModeAddress) as the relays that answered hold it: how many
   * of them lack the books' marker (their newest record there is another, or none), the date of
   * the newest record there, and whether one is of a newer format (never written over).
   */
  former: { lacking: number; newestAt: number | null; newer: boolean };
  /** Relays that answered. */
  answered: number;
};

type Opened = { kind: "mode"; entry: PayeeModeEntry } | { kind: "payee"; entry: PayeeEntry };

function dTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/**
 * One relay's copy, if it is a record of the payees: checked whole (openRecord), opened once
 * whichever type it is. Their addresses name a card the reader cannot tell in advance: each is
 * checked against the value it holds.
 */
function openPayeeRecord(keys: PayeeRecordKeys, value: unknown): OpenedRecord<Opened> | null {
  return openRecord<Opened>(value, {
    type: [PAYEE_TYPE, MODE_TYPE],
    encryptionKey: keys.encryptionKey,
    address: () => true,
    author: keys.nostr.publicKey,
    parse: (payload, event, type) => {
      if (type === PAYEE_TYPE) {
        const entry = parsePayee(payload);
        if (entry === "newer") throw new NewerRecordError();
        return entry &&
          event.created_at === entry.updatedAt &&
          dTag(event) === payeeAddress(keys, entry, entry.id)
          ? { kind: "payee", entry }
          : null;
      }
      const entry = parsePayeeMode(payload);
      if (entry === "newer") throw new NewerRecordError();
      return entry &&
        event.created_at === entry.updatedAt &&
        dTag(event) === payeeModeAddress(keys, entry)
        ? { kind: "mode", entry }
        : null;
    }
  });
}

/**
 * What relays sent of the books of the cards' wallets `of` takes: every copy of their modes'
 * records and of their merchants' records, each checked whole (openPayeeRecord), for a deletion
 * request to name ("Delete the card", src/features/card/card-erasure.ts). A copy of a newer
 * format tells no card: it is not among them.
 */
export function cardPayeeEvents(
  keys: PayeeRecordKeys,
  answers: ReadonlyMap<string, readonly unknown[]>,
  of: (wallet: CardWalletOf) => boolean
): NostrEvent[] {
  const events = new Map<string, NostrEvent>();
  for (const list of answers.values()) {
    for (const value of list) {
      const opened = openPayeeRecord(keys, value);
      if (!opened || opened.status === "newer" || !of(opened.value.entry)) continue;
      events.set(opened.event.id, opened.event);
    }
  }
  return [...events.values()];
}

/** What a record at the former mode's address is: the books' marker, or a mode of format 1. */
function openFormer(
  keys: PayeeRecordKeys,
  address: string,
  value: unknown
): OpenedRecord<"marker" | "former"> | null {
  return openRecord<"marker" | "former">(value, {
    type: MODE_TYPE,
    encryptionKey: keys.encryptionKey,
    address,
    author: keys.nostr.publicKey,
    parse: (payload) => {
      if (!payload || typeof payload !== "object") return null;
      const v = payload as Record<string, unknown>;
      if (typeof v.version === "number" && v.version > PAYEE_FORMAT_VERSION) {
        throw new NewerRecordError();
      }
      if (v.version === PAYEE_FORMAT_VERSION && v.books === FORMAT_MARKER.books) return "marker";
      return v.version === 1 ? "former" : null;
    }
  });
}

/** How the relays that answered hold the former mode's address (PayeesRead.former). */
function formerOf(
  keys: PayeeRecordKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): PayeesRead["former"] {
  const address = formerModeAddress(keys);
  const opened = new Map<string, OpenedRecord<"marker" | "former"> | null>();
  let lacking = 0;
  let newestAt: number | null = null;
  let newer = false;
  for (const events of answers.values()) {
    let newest: { at: number; marker: boolean } | null = null;
    for (const value of events) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id !== "string") continue;
      if (!opened.has(id)) opened.set(id, openFormer(keys, address, value));
      const record = opened.get(id);
      if (!record) continue;
      const at = record.event.created_at;
      newestAt = Math.max(newestAt ?? at, at);
      if (record.status === "newer") {
        newer = true;
        continue;
      }
      // Of two as old, the marker: it is published after any copy it saw.
      if (!newest || at > newest.at || (at === newest.at && record.value === "marker")) {
        newest = { at, marker: record.value === "marker" };
      }
    }
    if (!newest?.marker) lacking += 1;
  }
  return { lacking, newestAt, newer };
}

/**
 * The payees among the events relays sent: each copy checked, then merged by card's wallet and
 * entry.
 */
export function payeesOf(
  keys: PayeeRecordKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): PayeesRead {
  type Book = { mode: PayeeModeEntry | null; payees: Map<string, PayeeEntry> };
  const cards = new Map<string, Map<number, Book>>();
  const bookOf = ({ cardId, walletGeneration }: CardWalletOf): Book => {
    const wallets = cards.get(cardId) ?? new Map<number, Book>();
    cards.set(cardId, wallets);
    let book = wallets.get(walletGeneration);
    if (!book) {
      book = { mode: null, payees: new Map() };
      wallets.set(walletGeneration, book);
    }
    return book;
  };
  const newer = new Set<string>();
  const seen = new Set<string>();
  for (const events of answers.values()) {
    for (const value of events) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) continue;
      const opened = openPayeeRecord(keys, value);
      if (!opened) continue;
      seen.add(opened.event.id);
      if (opened.status === "newer") {
        const address = dTag(opened.event);
        if (address) newer.add(address);
        continue;
      }
      const read = opened.value;
      const book = bookOf(read.entry);
      if (read.kind === "mode") {
        book.mode = book.mode ? mergePayeeModes(book.mode, read.entry) : read.entry;
      } else {
        const known = book.payees.get(read.entry.id);
        book.payees.set(read.entry.id, known ? mergePayees(known, read.entry) : read.entry);
      }
    }
  }
  return { cards, newer, former: formerOf(keys, answers), answered: answers.size };
}
