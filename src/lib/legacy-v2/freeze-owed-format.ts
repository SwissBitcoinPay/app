/*
 * The accounts this device migrated whose v2 account is not frozen yet (src/features/migration/
 * freeze.ts): noted as soon as the account exists, forgotten once
 * the v2 server answered the freeze (done, or refused for good), so that "Settings" offers it
 * again ("Freeze my old account") when the end of the migration could not, the app closed
 * meanwhile. Their wallet ids only (public keys, already on the device), in the secure storage as
 * the app's other values (freeze-owed-store.ts; the browser's localStorage on the web).
 *
 * IRREVERSIBLE: the key's name (wiped by "Log out", device-wipe.ts) and the format: a change
 * needs a new `version`, and a value of a newer one is never written over.
 */

/** The secure storage's key. */
export const LEGACY_FREEZE_OWED_KEY = "legacy-v2-freeze-owed";

/** 1: the wallet ids. */
export const LEGACY_FREEZE_OWED_VERSION = 1;

/** More accounts than one device migrates: the oldest go beyond. */
export const MAX_FREEZES_OWED = 16;

const WALLET_ID = /^[0-9a-f]{2,130}$/;

/** A value of a newer version than this app writes. */
export class NewerFreezeOwedError extends Error {
  constructor() {
    super("A newer app's list of the v2 accounts to freeze");
    this.name = "NewerFreezeOwedError";
  }
}

/**
 * The stored wallet ids; empty when none or out of shape (one id out of shape: left out);
 * NewerFreezeOwedError when of a newer version.
 */
export function parseFreezeOwed(text: string | null): string[] {
  if (text === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (value === null || typeof value !== "object") return [];
  const owed = value as Record<string, unknown>;
  if (typeof owed.version === "number" && owed.version > LEGACY_FREEZE_OWED_VERSION) {
    throw new NewerFreezeOwedError();
  }
  if (owed.version !== LEGACY_FREEZE_OWED_VERSION || !Array.isArray(owed.wallets)) return [];
  const wallets = owed.wallets.filter(
    (id): id is string => typeof id === "string" && WALLET_ID.test(id)
  );
  return [...new Set(wallets)].slice(-MAX_FREEZES_OWED);
}

/** The value stored for `wallets` (lower-case ids, at most MAX_FREEZES_OWED, the newest kept). */
export function freezeOwedText(wallets: readonly string[]): string {
  return JSON.stringify({
    version: LEGACY_FREEZE_OWED_VERSION,
    wallets: [...new Set(wallets)].slice(-MAX_FREEZES_OWED)
  });
}
