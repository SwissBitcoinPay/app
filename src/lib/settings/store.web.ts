import {
  isMerchantSettings,
  parseMerchantSettings,
  settingsWalletId,
  type MerchantSettings
} from "./merchant";

/**
 * Same API as store.ts, in the browser: one entry per wallet in the `localStorage` of the web
 * app's origin, on this browser only (the account session backs the settings up, encrypted, on
 * Nostr relays: src/lib/backup/). Never rename the key prefix: browsers keep their settings
 * under it.
 */
const KEY_PREFIX = "merchant-settings/";

function storageKey(walletId: string): string {
  return `${KEY_PREFIX}${settingsWalletId(walletId)}`;
}

/** Saves the settings of a wallet (see getWalletId), replacing the previous ones. */
export async function saveMerchantSettings(
  walletId: string,
  settings: MerchantSettings
): Promise<void> {
  if (!isMerchantSettings(settings)) throw new Error("Invalid merchant settings");
  localStorage.setItem(storageKey(walletId), JSON.stringify(settings));
}

/** The settings of a wallet, or null when none were saved in this browser. */
export async function loadMerchantSettings(walletId: string): Promise<MerchantSettings | null> {
  const stored = localStorage.getItem(storageKey(walletId));
  if (stored === null) return null;
  // Settings of a newer format throw, those of an older one are invalid (see
  // parseMerchantSettings).
  const settings = parseMerchantSettings(JSON.parse(stored));
  if (!settings) throw new Error("Unexpected merchant settings entry");
  return settings;
}
