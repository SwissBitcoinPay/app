import { File } from "expo-file-system";

import {
  EXTENSION_PAYMENTS_FILE,
  EXTENSION_RECORDS_VERSION,
  EXTENSION_TAPS_FILE,
  extensionCardsDirectory,
  readExtensionPayments,
  readExtensionTaps,
  type ExtensionTap
} from "@/lib/card/extension-records";
import {
  CARD_PAYMENTS_KEPT_MS,
  cardPaymentEntryValue,
  parseCardPaymentEntry,
  type CardPaymentEntry
} from "@/lib/card/payment-entry";

/*
 * The writer of the iOS extension's card records (src/lib/card/extension-records.ts, which says
 * what they are and who reads them): in the extension's engine only, the one writer of these
 * files. Each write is of the whole file, written beside then moved over it: never read half
 * written. A file of a newer format is never written over (the reader throws then).
 */

/** At most this many payments kept: far more than a card pays in CARD_PAYMENTS_KEPT_MS. */
const MAX_PAYMENTS = 2000;

/** A tap's counter at or below the one taken last: never taken again. */
export class ExtensionTapSeenError extends Error {}

function writeJson(name: string, value: unknown): void {
  const directory = extensionCardsDirectory();
  if (!directory) throw new Error("No app group shared with the app");
  directory.create({ intermediates: true, idempotent: true });
  const draft = new File(directory, `${name}.tmp`);
  draft.writeSync(JSON.stringify(value));
  draft.moveSync(new File(directory, name), { overwrite: true });
}

/**
 * Logs `entry`, or puts it in place of the one of its tap (same `id`): the payments past
 * CARD_PAYMENTS_KEPT_MS before it dropped, MAX_PAYMENTS at most. NewerCardPaymentsError.
 */
export function writeExtensionPayment(entry: CardPaymentEntry): void {
  // Never an entry the readers could not read back.
  if (parseCardPaymentEntry(cardPaymentEntryValue(entry)) === null) {
    throw new Error("Not an entry of the card payments");
  }
  const kept = readExtensionPayments().filter(
    (old) => old.id !== entry.id && old.at > entry.at - CARD_PAYMENTS_KEPT_MS
  );
  kept.push(entry);
  kept.sort((a, b) => a.at - b.at);
  writeJson(EXTENSION_PAYMENTS_FILE, {
    version: EXTENSION_RECORDS_VERSION,
    entries: kept.slice(-MAX_PAYMENTS).map(cardPaymentEntryValue)
  });
}

/**
 * Takes the tap of `counter` of that card (its keys' version, its wallet's generation): refused
 * (ExtensionTapSeenError) unless above `known`, the last counter the app kept of it, and above the
 * one the extension took last for those keys and that wallet. Synchronous: nothing comes between
 * the check and the write. Returns that last one (null: none), for releaseExtensionTap.
 * NewerExtensionTapsError.
 */
export function recordExtensionTap(
  cardId: string,
  keyVersion: number,
  walletGeneration: number,
  counter: number,
  known: number
): number | null {
  if (!/^[0-9a-f]{32}$/.test(cardId) || !Number.isSafeInteger(counter) || counter < 0) {
    throw new Error("Not a card's tap");
  }
  const taps = readExtensionTaps();
  const taken = taps.get(cardId);
  const last =
    taken && taken.keyVersion === keyVersion && taken.walletGeneration === walletGeneration
      ? Math.max(known, taken.lastCounter)
      : known;
  if (counter <= last) throw new ExtensionTapSeenError();
  taps.set(cardId, { keyVersion, walletGeneration, lastCounter: counter });
  writeTaps(taps);
  return taken && taken.keyVersion === keyVersion && taken.walletGeneration === walletGeneration
    ? taken.lastCounter
    : null;
}

/**
 * Gives back a tap the extension took but did not pay, for the app to take it (a payment handed
 * over to it, relay-session.ts): its counter back to `previous` (null: none), only while it is still
 * the last one taken for those keys and that wallet. Its relay offers its session to the app
 * alone, which takes it once. NewerExtensionTapsError.
 */
export function releaseExtensionTap(
  cardId: string,
  keyVersion: number,
  walletGeneration: number,
  counter: number,
  previous: number | null
): void {
  const taps = readExtensionTaps();
  const taken = taps.get(cardId);
  if (
    !taken ||
    taken.keyVersion !== keyVersion ||
    taken.walletGeneration !== walletGeneration ||
    taken.lastCounter !== counter
  ) {
    return;
  }
  if (previous === null) taps.delete(cardId);
  else taps.set(cardId, { keyVersion, walletGeneration, lastCounter: previous });
  writeTaps(taps);
}

function writeTaps(taps: ReadonlyMap<string, ExtensionTap>): void {
  writeJson(EXTENSION_TAPS_FILE, {
    version: EXTENSION_RECORDS_VERSION,
    cards: Object.fromEntries(taps)
  });
}
