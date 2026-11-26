import * as SecureStore from "expo-secure-store";

import type { BreezNetwork } from "@/lib/breez/config";
import { logFailure } from "@/lib/log/log";

import {
  ONCHAIN_POOL_KEY,
  REGISTRY_RECORD_KEY,
  TERMINAL_OPTIONS_KEY,
  BRANDING_RECORD_KEY,
  CATALOG_RECORD_KEY,
  PASSKEY_RECORD_KEY,
  TERMINAL_PROFILE_KEY,
  parseOnchainPool,
  parseRegistryRecord,
  parseTerminalOptions,
  parseBrandingRecord,
  parseCatalogRecord,
  parsePasskeyRecord,
  parseTerminalProfile,
  type OnchainPool,
  type RegistryRecord,
  type TerminalOptions,
  type BrandingRecord,
  type CatalogRecord,
  type PasskeyRecord,
  type TerminalProfile
} from "./model";

/**
 * The point of sale's profile in the device's secure storage (Keychain on iOS, Keystore-encrypted
 * on Android), without biometrics: the point of sale opens
 * without any prompt. Left out of the iCloud and Google backups (expo-secure-store's plugin in
 * app.config.ts): a restored device signs in again. Same API on the web: profile.web.ts.
 */

/** Readable once the device was unlocked after a restart, not only while it is unlocked. */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export async function loadTerminalProfile(): Promise<TerminalProfile | null> {
  try {
    const stored = await SecureStore.getItemAsync(TERMINAL_PROFILE_KEY, OPTIONS);
    return stored === null ? null : parseTerminalProfile(JSON.parse(stored));
  } catch (error) {
    // Unreadable (a Keystore key lost after a restore): the point of sale needs a login again.
    logFailure("Unreadable point of sale profile", error);
    return null;
  }
}

export async function saveTerminalProfile(profile: TerminalProfile): Promise<void> {
  await SecureStore.setItemAsync(TERMINAL_PROFILE_KEY, JSON.stringify(profile), OPTIONS);
}

export async function clearTerminalProfile(): Promise<void> {
  await SecureStore.deleteItemAsync(TERMINAL_PROFILE_KEY, OPTIONS);
}

/**
 * This device's on-chain addresses (model.ts), beside the profile and like it out of the device
 * backups: a restored copy on another device would show the same addresses twice.
 */
export async function loadOnchainPool(network: BreezNetwork): Promise<OnchainPool | null> {
  try {
    const stored = await SecureStore.getItemAsync(ONCHAIN_POOL_KEY, OPTIONS);
    return stored === null ? null : parseOnchainPool(JSON.parse(stored), network);
  } catch (error) {
    logFailure("Unreadable on-chain addresses", error);
    return null;
  }
}

export async function saveOnchainPool(pool: OnchainPool): Promise<void> {
  await SecureStore.setItemAsync(ONCHAIN_POOL_KEY, JSON.stringify(pool), OPTIONS);
}

/** The registry key saved on this device (model.ts), null when none or unreadable. */
export async function loadRegistryRecord(): Promise<RegistryRecord | null> {
  try {
    const stored = await SecureStore.getItemAsync(REGISTRY_RECORD_KEY, OPTIONS);
    return stored === null ? null : parseRegistryRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveRegistryRecord(record: RegistryRecord): Promise<void> {
  await SecureStore.setItemAsync(REGISTRY_RECORD_KEY, JSON.stringify(record), OPTIONS);
}

/** The point of sale's options saved on this device (model.ts), null when none or unreadable. */
export async function loadTerminalOptions(): Promise<TerminalOptions | null> {
  try {
    const stored = await SecureStore.getItemAsync(TERMINAL_OPTIONS_KEY, OPTIONS);
    return stored === null ? null : parseTerminalOptions(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveTerminalOptions(options: TerminalOptions): Promise<void> {
  await SecureStore.setItemAsync(TERMINAL_OPTIONS_KEY, JSON.stringify(options), OPTIONS);
}

/** The business's logo and the user's photo saved on this device (model.ts), null when none. */
export async function loadBrandingRecord(): Promise<BrandingRecord | null> {
  try {
    const stored = await SecureStore.getItemAsync(BRANDING_RECORD_KEY, OPTIONS);
    return stored === null ? null : parseBrandingRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveBrandingRecord(record: BrandingRecord): Promise<void> {
  await SecureStore.setItemAsync(BRANDING_RECORD_KEY, JSON.stringify(record), OPTIONS);
}

/** The catalogue's reading keys saved on this device (model.ts), null when none or unreadable. */
export async function loadCatalogRecord(): Promise<CatalogRecord | null> {
  try {
    const stored = await SecureStore.getItemAsync(CATALOG_RECORD_KEY, OPTIONS);
    return stored === null ? null : parseCatalogRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveCatalogRecord(record: CatalogRecord): Promise<void> {
  await SecureStore.setItemAsync(CATALOG_RECORD_KEY, JSON.stringify(record), OPTIONS);
}

/** Which passkey opens this device's account (model.ts), null when none or unreadable. */
export async function loadPasskeyRecord(): Promise<PasskeyRecord | null> {
  try {
    const stored = await SecureStore.getItemAsync(PASSKEY_RECORD_KEY, OPTIONS);
    return stored === null ? null : parsePasskeyRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function savePasskeyRecord(record: PasskeyRecord): Promise<void> {
  await SecureStore.setItemAsync(PASSKEY_RECORD_KEY, JSON.stringify(record), OPTIONS);
}
