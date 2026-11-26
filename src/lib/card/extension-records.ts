import { Directory, File } from "expo-file-system";

import { NewerRecordError } from "@/lib/nostr/record";

import { cardSharedContainer } from "./app-group";
import type { CardState } from "./card-record";
import { EXTENSION_DIR_NAME } from "./extension-dir";
import {
  NewerCardPaymentsError,
  parseCardPaymentEntry,
  type CardPaymentEntry
} from "./payment-entry";

/*
 * What the iOS notification service extension records of the card payments it runs, in its own
 * files of the app group's container (docs/ios-card-payments.md, "Shared state": one writer per
 * file): the payments it logged (each as the app's log keeps one, payment-entry.ts), and the last
 * counter of each card's taps it took. Written by the extension only
 * (src/lib/engine/card-records.ts); read by both, merged with the app's own:
 * - a tap's counter is checked against both (states.ts, checkTapCounter): a tap the extension
 *   took is never taken again by the app, nor the reverse;
 * - the limits count both logs (payment-log.ts), the same payment once;
 * - the app takes the extension's payments into its own log at its next sync (history-sync.ts).
 * Nowhere but on an iPhone whose build has the extension: elsewhere, nothing.
 *
 * IRREVERSIBLE: the directory's and the files' names and formats, which installed extensions
 * write and installed apps read. A newer format is never taken for none: a reader refuses then
 * (NewerCardPaymentsError, NewerExtensionTapsError).
 */

export const EXTENSION_CARDS_DIR_NAME = "cards";
export const EXTENSION_PAYMENTS_FILE = "payments.json";
export const EXTENSION_TAPS_FILE = "taps.json";
export const EXTENSION_RECORDS_VERSION = 1;

/** The last counter of a card's taps the extension took, with the keys and wallet it was for. */
export type ExtensionTap = { keyVersion: number; walletGeneration: number; lastCounter: number };

/**
 * Thrown when a newer extension wrote its taps: no tap of any card is taken then. A record of a
 * newer format, as a card's on the relays (the payment refuses it as such: "newerApp").
 */
export class NewerExtensionTapsError extends NewerRecordError {}

/** The extension's directory of card records; null where the build has no app group. */
export function extensionCardsDirectory(): Directory | null {
  const shared = cardSharedContainer();
  return shared
    ? new Directory(shared.container, EXTENSION_DIR_NAME, EXTENSION_CARDS_DIR_NAME)
    : null;
}

/** The JSON of `name`, null when absent or unreadable (written beside then moved: damaged only). */
function readJson(name: string): Record<string, unknown> | null {
  const directory = extensionCardsDirectory();
  if (!directory) return null;
  const file = new File(directory, name);
  if (!file.exists) return null;
  try {
    const value: unknown = JSON.parse(file.textSync());
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** The payments the extension logged, oldest first. NewerCardPaymentsError for a newer format. */
export function readExtensionPayments(): CardPaymentEntry[] {
  const value = readJson(EXTENSION_PAYMENTS_FILE);
  if (!value) return [];
  if (typeof value.version === "number" && value.version > EXTENSION_RECORDS_VERSION) {
    throw new NewerCardPaymentsError("A newer extension wrote its card payments");
  }
  if (value.version !== EXTENSION_RECORDS_VERSION || !Array.isArray(value.entries)) return [];
  return value.entries
    .map((entry) => parseCardPaymentEntry(entry))
    .filter((entry): entry is CardPaymentEntry => entry !== null);
}

/**
 * The last counter of each card's taps the extension took, by card id. Read synchronously: a
 * tap's check awaits nothing up to its write (states.ts). NewerExtensionTapsError for a newer
 * format.
 */
export function readExtensionTaps(): Map<string, ExtensionTap> {
  const taps = new Map<string, ExtensionTap>();
  const value = readJson(EXTENSION_TAPS_FILE);
  if (!value) return taps;
  if (typeof value.version === "number" && value.version > EXTENSION_RECORDS_VERSION) {
    throw new NewerExtensionTapsError();
  }
  if (value.version !== EXTENSION_RECORDS_VERSION) return taps;
  const cards = value.cards;
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) return taps;
  for (const [cardId, tap] of Object.entries(cards as Record<string, unknown>)) {
    if (!/^[0-9a-f]{32}$/.test(cardId) || !tap || typeof tap !== "object") continue;
    const t = tap as Record<string, unknown>;
    if (!isCount(t.keyVersion) || !isCount(t.walletGeneration) || !isCount(t.lastCounter)) {
      continue;
    }
    taps.set(cardId, {
      keyVersion: t.keyVersion,
      walletGeneration: t.walletGeneration,
      lastCounter: t.lastCounter
    });
  }
  return taps;
}

/**
 * The counter the extension took last for that card, with those keys and that wallet; null when
 * none (another card's keys or wallet are another card's taps).
 */
export function extensionTapCounter(
  taps: ReadonlyMap<string, ExtensionTap>,
  cardId: string,
  keyVersion: number,
  walletGeneration: number
): number | null {
  const tap = taps.get(cardId);
  return tap && tap.keyVersion === keyVersion && tap.walletGeneration === walletGeneration
    ? tap.lastCounter
    : null;
}

/**
 * Which of two entries of one payment (the same `id`), the app's and the extension's, tells it:
 * the one that ended it, rather than one still "sending" (the app may have settled one the
 * extension could not finish); else the app's, which took the extension's in.
 */
export function laterEntry(app: CardPaymentEntry, extension: CardPaymentEntry): CardPaymentEntry {
  return app.outcome === "sending" && extension.outcome !== "sending" ? extension : app;
}

/**
 * The app's log and the extension's payments as one, each payment once: the app's in its order,
 * each in place of its own entry when the extension's tells it (laterEntry), then the extension's
 * the app does not hold, in theirs. No payment of the app's moves.
 */
export function mergedPayments(
  app: readonly CardPaymentEntry[],
  extension: readonly CardPaymentEntry[]
): CardPaymentEntry[] {
  if (extension.length === 0) return [...app];
  const byId = new Map(extension.map((entry) => [entry.id, entry]));
  const merged = app.map((entry) => {
    const other = byId.get(entry.id);
    if (!other) return entry;
    byId.delete(entry.id);
    return laterEntry(entry, other);
  });
  return [...merged, ...byId.values()];
}

/**
 * Each card of `states` with its last counter raised to the one the iOS extension took, and its
 * hashes deposited at least that far: its taps are spent, and the next write keeps it.
 * Unreadable (a newer extension's): as kept, each tap's check refuses then (states.ts,
 * checkTapCounter).
 */
export function raiseToExtensionTaps(states: Map<string, CardState>): void {
  let taps: Map<string, ExtensionTap>;
  try {
    taps = readExtensionTaps();
  } catch {
    return;
  }
  for (const [cardId, state] of states) {
    const counter = extensionTapCounter(taps, cardId, state.keyVersion, state.walletGeneration);
    if (counter === null || counter <= state.lastCounter) continue;
    states.set(cardId, {
      ...state,
      lastCounter: counter,
      depositedThrough: Math.max(state.depositedThrough, counter)
    });
  }
}
