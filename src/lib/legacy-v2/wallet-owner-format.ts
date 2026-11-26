/*
 * Which account the v2 wallet's words on this device go to (src/features/migration/wallet-owner.ts):
 * the account its owner migrated, or opened, from the v2 app's own session on this very device. The
 * words left by the v2 app prove nothing of who holds the phone: without this record, a device given
 * away after "Log out" would let any account opened on it take that wallet's money. The account's
 * wallet id only (a public key, already on the device), in the secure storage as the app's other
 * values (wallet-owner-store.ts; nothing on the web, where the v2 app leaves no words).
 *
 * IRREVERSIBLE: the key's name (wiped by "Log out", device-wipe.ts) and the format: a change
 * needs a new `version`, and a value of a newer one is never written over.
 */

/** The secure storage's key. */
export const LEGACY_WALLET_OWNER_KEY = "legacy-v2-wallet-owner";

/** 1: the account's wallet id. */
export const LEGACY_WALLET_OWNER_VERSION = 1;

const WALLET_ID = /^[0-9a-f]{2,130}$/;

/** A value of a newer version than this app writes. */
export class NewerLegacyWalletOwnerError extends Error {
  constructor() {
    super("A newer app's owner of the v2 wallet");
    this.name = "NewerLegacyWalletOwnerError";
  }
}

/**
 * The stored wallet id (lower case); null when none or out of shape; NewerLegacyWalletOwnerError
 * when of a newer version.
 */
export function parseLegacyWalletOwner(text: string | null): string | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const owner = value as Record<string, unknown>;
  if (typeof owner.version === "number" && owner.version > LEGACY_WALLET_OWNER_VERSION) {
    throw new NewerLegacyWalletOwnerError();
  }
  if (owner.version !== LEGACY_WALLET_OWNER_VERSION) return null;
  return typeof owner.wallet === "string" && WALLET_ID.test(owner.wallet) ? owner.wallet : null;
}

/** The value stored for the account of `walletId`; null when `walletId` is no wallet id. */
export function legacyWalletOwnerText(walletId: string): string | null {
  const wallet = walletId.toLowerCase();
  if (!WALLET_ID.test(wallet)) return null;
  return JSON.stringify({ version: LEGACY_WALLET_OWNER_VERSION, wallet });
}
