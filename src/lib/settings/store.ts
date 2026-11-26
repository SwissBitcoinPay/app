import { Directory, File, Paths } from "expo-file-system";

import {
  isMerchantSettings,
  parseMerchantSettings,
  settingsWalletId,
  type MerchantSettings
} from "./merchant";

/**
 * Directory of the merchant settings, one JSON file per wallet, in the documents directory of the
 * app sandbox. Unlike expo-secure-store data, it is part of iCloud's device backups; never of
 * Android's, which the app turns off (`allowBackup`, app.config.ts). The account session backs
 * them up, encrypted, on Nostr
 * relays (src/lib/backup/): what brings them back on a new phone.
 * Never rename it: installed apps keep their settings there.
 */
export const SETTINGS_DIR_NAME = "merchant-settings";

function settingsDirectory(): Directory {
  return new Directory(Paths.document, SETTINGS_DIR_NAME);
}

function fileName(walletId: string): string {
  return `${settingsWalletId(walletId)}.json`;
}

/** Saves the settings of a wallet (see getWalletId), replacing the previous ones. */
export async function saveMerchantSettings(
  walletId: string,
  settings: MerchantSettings
): Promise<void> {
  if (!isMerchantSettings(settings)) throw new Error("Invalid merchant settings");
  const name = fileName(walletId);
  const directory = settingsDirectory();
  directory.create({ intermediates: true, idempotent: true });
  // Written next to the target, then moved over it: an interrupted write never leaves a truncated
  // settings file behind.
  const draft = new File(directory, `${name}.tmp`);
  draft.writeSync(JSON.stringify(settings));
  draft.moveSync(new File(directory, name), { overwrite: true });
}

/** The settings of a wallet, or null when none were saved on this device. */
export async function loadMerchantSettings(walletId: string): Promise<MerchantSettings | null> {
  const file = new File(settingsDirectory(), fileName(walletId));
  if (!file.exists) return null;
  // Settings of a newer format throw, those of an older one are invalid (see
  // parseMerchantSettings).
  const settings = parseMerchantSettings(JSON.parse(await file.text()));
  if (!settings) throw new Error("Unexpected merchant settings file");
  return settings;
}
