import { File } from "expo-file-system";

import { sameRelayList } from "@/lib/relays/list";

import { cardDirectory } from "./card-files";
import { laterEntry, mergedPayments, readExtensionPayments } from "./extension-records";
import { isErasedData } from "./card-record";
import type { MovementValue } from "./movement-value";
import {
  CARD_PAYMENTS_KEPT_MS,
  cardPaymentEntryValue,
  NewerCardPaymentsError,
  isSpent,
  isValued,
  parseCardPaymentEntry,
  type CardPaymentEntry
} from "./payment-entry";

/*
 * The card payments of this phone (relay contract v2; its directory: card-files.ts): for the holder
 * to check what the cards paid, and for the limits that bound it (a card's payments over 24 sliding
 * hours, per hour, an invoice never paid twice). A payment is logged as "sending" before the wallet
 * sends it, so that an interruption counts it as spent: the limits never undercount. A tap whose
 * invoice is refused as it comes (out of shape, of bounds, expired…) is not logged: its tap is not
 * checked then, no card is known. Each entry keeps the invoice, who it paid with the proof of it,
 * and the preimage once paid: the holder's proof in a dispute. Each one is also published, sealed,
 * on the account's relays (the cards managed on the web too; src/features/card/history-sync.ts),
 * where the web app and the account's other phones read it: the log keeps which of its writes a
 * majority took. Same API on the web, without cards: payment-log.web.ts.
 */

export type { CardPaymentEntry, CardPaymentOutcome, CardPaymentPayee } from "./payment-entry";
export { CARD_PAYMENTS_KEPT_MS, NewerCardPaymentsError, isSpent } from "./payment-entry";

/** IRREVERSIBLE: the directory and file of the log. Never rename them. */
export const CARD_PAYMENTS_DIR_NAME = "card-payments";
const FILE_NAME = "log.json";

/**
 * 4 (each payment's value kept with it, each card's wallet anew):
 * each entry with its value once worked out (movement-value.ts), and the generation of the card's
 * wallet that paid it. 3 (the history on the account's relays): each entry
 * with its revision (how many times it was written again) and the revision a majority of the relays
 * took, the log with the relays those were taken by. 2: each entry keeps the
 * invoice, who it paid and the proof of it (the payee's metadata, the verify URL and its answer,
 * payee-proof.ts), then the preimage. A log of 1 to 3 is no longer read (no data of before to
 * keep): as an unreadable one, empty.
 */
const FORMAT_VERSION = 4;
const MAX_ENTRIES = 2000;

/** An entry as the log keeps it: with its writes, and what the relays took of them. */
type Kept = {
  entry: CardPaymentEntry;
  /** 0 when first written, one more at each write of the same tap. */
  revision: number;
  /** The revision a majority of `publishedTo` took; null for none. */
  published: number | null;
};

type Log = {
  entries: Kept[];
  /** The relays `published` was taken by: another list has none of them yet. */
  publishedTo: string[] | null;
};

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function logFile(): File {
  return new File(cardDirectory(CARD_PAYMENTS_DIR_NAME, FILE_NAME), FILE_NAME);
}

/** An entry with its revision and what the relays took of it. */
function parseKept(value: unknown): Kept | null {
  const entry = parseCardPaymentEntry(value);
  if (!entry) return null;
  const v = value as Record<string, unknown>;
  if (!isRevision(v.revision) || !(v.published === null || isRevision(v.published))) return null;
  if (v.published !== null && v.published > v.revision) return null;
  return { entry, revision: v.revision, published: v.published };
}

/**
 * The log, newest last. Unreadable (it is written whole, then moved over the old one: only a
 * damaged storage gives that): empty, the limits then count from now on. A newer format:
 * NewerCardPaymentsError (staging gets OTA rollbacks).
 */
function read(): Log {
  const empty: Log = { entries: [], publishedTo: null };
  const file = logFile();
  if (!file.exists) return empty;
  let value: unknown;
  try {
    value = JSON.parse(file.textSync());
  } catch {
    return empty;
  }
  if (value === null || typeof value !== "object") return empty;
  const v = value as { version?: unknown; entries?: unknown; publishedTo?: unknown };
  if (typeof v.version === "number" && v.version > FORMAT_VERSION) {
    throw new NewerCardPaymentsError("A newer app wrote the card payments");
  }
  if (!Array.isArray(v.entries) || v.version !== FORMAT_VERSION) return empty;
  const publishedTo =
    Array.isArray(v.publishedTo) && v.publishedTo.every((relay) => typeof relay === "string")
      ? (v.publishedTo as string[])
      : null;
  return {
    entries: v.entries.map(parseKept).filter((kept) => kept !== null),
    publishedTo
  };
}

function write(log: Log): void {
  const directory = cardDirectory(CARD_PAYMENTS_DIR_NAME, FILE_NAME);
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${FILE_NAME}.tmp`);
  draft.writeSync(
    JSON.stringify({
      version: FORMAT_VERSION,
      publishedTo: log.publishedTo,
      entries: log.entries.map(({ entry, revision, published }) => ({
        ...cardPaymentEntryValue(entry),
        revision,
        published
      }))
    })
  );
  draft.moveSync(new File(directory, FILE_NAME), { overwrite: true });
}

/** One change at a time, in order. */
let last: Promise<unknown> = Promise.resolve();

function inTurn<T>(change: () => T): Promise<T> {
  const run = last.then(change, change);
  last = run.catch(() => undefined);
  return run;
}

/**
 * The phone's card payments of the last 90 days, newest last: the app's log and, on an iPhone,
 * those the extension logged that the app has not taken in yet (extension-records.ts), each
 * payment once. NewerCardPaymentsError.
 */
export function loadCardPayments(): Promise<CardPaymentEntry[]> {
  return inTurn(() =>
    mergedPayments(
      read().entries.map(({ entry }) => entry),
      readExtensionPayments()
    )
  );
}

/**
 * Adds the entry, or replaces the one of its tap (same `id`), as its next revision; drops the
 * entries past CARD_PAYMENTS_KEPT_MS before `entry.at`. NewerCardPaymentsError, nothing written.
 */
export function logCardPayment(entry: CardPaymentEntry): Promise<void> {
  // Never an entry the log could not read back.
  const written = { ...cardPaymentEntryValue(entry), revision: 0, published: null };
  if (parseKept(written) === null) {
    return Promise.reject(new Error("Not an entry of the card payments"));
  }
  return inTurn(() => {
    const log = read();
    write({ ...log, entries: upserted(log.entries, entry) });
  });
}

/**
 * `entries` with `entry` added, or in place of the one of its tap (same `id`) as its next
 * revision; the entries past CARD_PAYMENTS_KEPT_MS before `entry.at` dropped.
 */
function upserted(entries: readonly Kept[], entry: CardPaymentEntry): Kept[] {
  const previous = entries.find((kept) => kept.entry.id === entry.id);
  // Its value, once worked out, is never worked out again; a payment that did not leave has none.
  const value = isValued(entry) ? (entry.value ?? previous?.entry.value ?? null) : null;
  const kept = entries.filter(
    (old) => old.entry.id !== entry.id && old.entry.at > entry.at - CARD_PAYMENTS_KEPT_MS
  );
  kept.push({
    entry: { ...entry, value },
    revision: previous ? previous.revision + 1 : 0,
    published: previous?.published ?? null
  });
  return trimmed(kept, entry.at);
}

/**
 * Takes into the log the payments the iOS extension logged (extension-records.ts) that it does
 * not hold yet, or holds still "sending" where the extension ended them, each as its next
 * revision: then published as the app's own (history-sync.ts). Resolves with how many were taken.
 * NewerCardPaymentsError, nothing written.
 */
export function takeExtensionPayments(): Promise<number> {
  return inTurn(() => {
    const extension = readExtensionPayments();
    if (extension.length === 0) return 0;
    const log = read();
    let entries: Kept[] = log.entries;
    let taken = 0;
    for (const entry of extension) {
      const known = entries.find((kept) => kept.entry.id === entry.id)?.entry;
      if (known && laterEntry(known, entry) === known) continue;
      // Never an entry the log could not read back.
      if (parseKept({ ...cardPaymentEntryValue(entry), revision: 0, published: null }) === null) {
        continue;
      }
      entries = upserted(entries, entry);
      taken += 1;
    }
    if (taken > 0) write({ ...log, entries });
    return taken;
  });
}

/**
 * The payments whose value is not known yet and could be worked out at `now` (ms): that left (or
 * may have), from CoinGecko's history (`since`, ms). NewerCardPaymentsError.
 */
export function loadCardPaymentsToValue(since: number): Promise<CardPaymentEntry[]> {
  return inTurn(() =>
    read()
      .entries.map(({ entry }) => entry)
      .filter((entry) => entry.value === null && isValued(entry) && entry.at >= since)
  );
}

/**
 * Keeps these values (by entry id) of the entries still without one, each as its entry's next
 * revision (published again with it). NewerCardPaymentsError.
 */
export function setCardPaymentValues(values: ReadonlyMap<string, MovementValue>): Promise<void> {
  return inTurn(() => {
    if (values.size === 0) return;
    const log = read();
    let changed = false;
    const entries = log.entries.map((kept) => {
      const value = values.get(kept.entry.id);
      if (!value || kept.entry.value !== null || !isValued(kept.entry)) return kept;
      changed = true;
      return { ...kept, entry: { ...kept.entry, value }, revision: kept.revision + 1 };
    });
    if (changed) write({ ...log, entries });
  });
}

/** A write of an entry to publish: the entry, and its revision. */
export type CardPaymentCopy = { entry: CardPaymentEntry; revision: number };

/**
 * The entries whose latest write no majority of `relays` took, but those past
 * CARD_PAYMENTS_KEPT_MS at `now` (their records would have expired). Another list than the one the
 * log names: all of them. NewerCardPaymentsError.
 */
export function loadCardPaymentsToPublish(
  relays: readonly string[],
  now: number
): Promise<CardPaymentCopy[]> {
  return inTurn(() => {
    const log = read();
    const same = log.publishedTo !== null && sameRelayList(log.publishedTo, relays);
    return log.entries
      .filter(
        ({ entry, revision, published }) =>
          entry.at + CARD_PAYMENTS_KEPT_MS > now && (!same || published !== revision)
      )
      .map(({ entry, revision }) => ({ entry, revision }));
  });
}

/**
 * Keeps that a majority of `relays` took these writes (by entry id, the revision taken), each
 * unless the entry was written again meanwhile. Another list than the one the log names: what the
 * others took is forgotten first. NewerCardPaymentsError.
 */
export function markCardPaymentsPublished(
  relays: readonly string[],
  published: ReadonlyMap<string, number>
): Promise<void> {
  return inTurn(() => {
    const log = read();
    const same = log.publishedTo !== null && sameRelayList(log.publishedTo, relays);
    write({
      publishedTo: [...relays],
      entries: log.entries.map((kept) => {
        const taken = published.get(kept.entry.id);
        if (taken === kept.revision) return { ...kept, published: taken };
        return same ? kept : { ...kept, published: null };
      })
    });
  });
}

/**
 * Forgets the payments of the cards' wallets `erased` says are erased (card-record.ts,
 * erasedGenerations; "Delete the card": all their data erased, src/features/card/
 * card-erasure.ts): never shown nor published again. Resolves with how many it forgot.
 * NewerCardPaymentsError.
 */
export function forgetCardPayments(erased: ReadonlyMap<string, number>): Promise<number> {
  return inTurn(() => {
    const log = read();
    const kept = log.entries.filter(({ entry }) => !isErasedData(entry, erased));
    const forgotten = log.entries.length - kept.length;
    if (forgotten > 0) write({ ...log, entries: kept });
    return forgotten;
  });
}

/** What the limits count: a card's payments of the last 24 hours (card-limits.ts). */
const COUNTED_MS = 24 * 3600 * 1000;

/**
 * At most MAX_ENTRIES, the oldest dropped first, but never a payment the limits still count: more
 * than 2 000 entries in a day are refusals (a card pays 60 times an hour at most).
 */
function trimmed(entries: Kept[], now: number): Kept[] {
  let excess = entries.length - MAX_ENTRIES;
  if (excess <= 0) return entries;
  return entries.filter(({ entry }) => {
    if (excess === 0 || (isSpent(entry) && entry.at > now - COUNTED_MS)) return true;
    excess -= 1;
    return false;
  });
}
