/*
 * The accounts this device migrated whose v2 history is still to be said "to copy" on their relays
 * (src/features/migration/history-import.ts: markLegacyHistoryPending): kept on the device until a
 * majority of the account's relays holds the history's state, so that "Settings" offers the copy
 * whatever the network did at the migration's end, and the mark is written at a later opening.
 * Their wallet ids only (public keys, already on the device), in the secure storage as the app's
 * other values (history-owed-store.ts; the browser's localStorage on the web).
 *
 * IRREVERSIBLE: the key's name (wiped by "Log out", device-wipe.ts) and the format: a change
 * needs a new `version`, and a value of a newer one is never written over.
 */

/** The secure storage's key. */
export const LEGACY_HISTORY_OWED_KEY = "legacy-v2-history-owed";

/** 1: the wallet ids. */
export const LEGACY_HISTORY_OWED_VERSION = 1;

/** More accounts than one device migrates: the oldest go beyond. */
export const MAX_OWED = 16;

const WALLET_ID = /^[0-9a-f]{2,130}$/;

/** A value of a newer version than this app writes. */
export class NewerHistoryOwedError extends Error {
  constructor() {
    super("A newer app's list of the v2 histories to mark");
    this.name = "NewerHistoryOwedError";
  }
}

/**
 * The stored wallet ids; empty when none or out of shape (one id out of shape: left out);
 * NewerHistoryOwedError when of a newer version.
 */
export function parseHistoryOwed(text: string | null): string[] {
  if (text === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (value === null || typeof value !== "object") return [];
  const owed = value as Record<string, unknown>;
  if (typeof owed.version === "number" && owed.version > LEGACY_HISTORY_OWED_VERSION) {
    throw new NewerHistoryOwedError();
  }
  if (owed.version !== LEGACY_HISTORY_OWED_VERSION || !Array.isArray(owed.wallets)) return [];
  const wallets = owed.wallets.filter(
    (id): id is string => typeof id === "string" && WALLET_ID.test(id)
  );
  return [...new Set(wallets)].slice(-MAX_OWED);
}

/** The value stored for `wallets` (lower-case ids, at most MAX_OWED, the newest kept). */
export function historyOwedText(wallets: readonly string[]): string {
  return JSON.stringify({
    version: LEGACY_HISTORY_OWED_VERSION,
    wallets: [...new Set(wallets)].slice(-MAX_OWED)
  });
}
