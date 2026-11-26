import { logFailure } from "@/lib/log/log";

import {
  LEGACY_WATCH_KEY,
  NewerLegacyWatchError,
  legacyWatchText,
  parseLegacyWatch,
  type LegacyWatch
} from "./watch-format";

/*
 * Same API as watch-store.ts, in this browser's `localStorage`, as the app's other values here
 * (src/lib/settings/store.web.ts): the web app has no v2 app's keychain, but its owner may type
 * the v2 wallet's words ("Type my 12 words"), after which "Wallet" looks at it as the
 * phone does. Removed with the rest by "Log out" (device-wipe.web.ts).
 */

export type StoredLegacyWatch = { watch: LegacyWatch | null; newer: boolean };

export async function loadLegacyWatch(): Promise<StoredLegacyWatch> {
  try {
    return { watch: parseLegacyWatch(localStorage.getItem(LEGACY_WATCH_KEY)), newer: false };
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
    localStorage.setItem(LEGACY_WATCH_KEY, legacyWatchText(watch));
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
    localStorage.removeItem(LEGACY_WATCH_KEY);
    return true;
  } catch (error) {
    logFailure("Forgetting the watch of the v2 wallet failed", error);
    return false;
  }
}
