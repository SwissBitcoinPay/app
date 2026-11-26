import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import {
  LEGACY_WATCH_KEY,
  NewerLegacyWatchError,
  legacyWatchText,
  parseLegacyWatch,
  type LegacyWatch
} from "./watch-format";

/* The device's watch of the v2 wallet (watch-format.ts), in the secure storage. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** What is stored: the watch, none, or a newer app's (never written over). */
export type StoredLegacyWatch = { watch: LegacyWatch | null; newer: boolean };

export async function loadLegacyWatch(): Promise<StoredLegacyWatch> {
  try {
    return {
      watch: parseLegacyWatch(await SecureStore.getItemAsync(LEGACY_WATCH_KEY, OPTIONS)),
      newer: false
    };
  } catch (error) {
    if (error instanceof NewerLegacyWatchError) return { watch: null, newer: true };
    logFailure("Reading the watch of the v2 wallet failed", error);
    return { watch: null, newer: false };
  }
}

/** Saves `watch`, unless a newer app's is stored. Never rejects: the next look starts over. */
export async function saveLegacyWatch(watch: LegacyWatch): Promise<void> {
  try {
    if ((await loadLegacyWatch()).newer) return;
    await SecureStore.setItemAsync(LEGACY_WATCH_KEY, legacyWatchText(watch), OPTIONS);
  } catch (error) {
    logFailure("Saving the watch of the v2 wallet failed", error);
  }
}

/**
 * Forgets the watch, unless a newer app's is stored: the v2 wallet is no longer this device's to
 * look at (its words erased, src/features/migration/wallet-owner.ts). False when it could not be.
 */
export async function forgetLegacyWatch(): Promise<boolean> {
  try {
    if ((await loadLegacyWatch()).newer) return true;
    await SecureStore.deleteItemAsync(LEGACY_WATCH_KEY, OPTIONS);
    return true;
  } catch (error) {
    logFailure("Forgetting the watch of the v2 wallet failed", error);
    return false;
  }
}
