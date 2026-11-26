import * as SecureStore from "expo-secure-store";

import {
  ASSISTANT_ALERTS_KEY,
  parseStoredDismissals,
  serializeDismissals
} from "./alert-dismissals-format";

/**
 * The warnings about assistants answered "This is expected" on this device (assistant-alerts.ts).
 * Same API on the web: alert-dismissals.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The answers kept, none when unreadable: a warning shows again then. */
export async function loadDismissals(): Promise<string[]> {
  try {
    return parseStoredDismissals(await SecureStore.getItemAsync(ASSISTANT_ALERTS_KEY, OPTIONS));
  } catch {
    return [];
  }
}

/** Adds `key` to the answers kept. Rejects when the device could not keep it. */
export async function saveDismissal(key: string): Promise<void> {
  const kept = (await loadDismissals()).filter((other) => other !== key);
  await SecureStore.setItemAsync(
    ASSISTANT_ALERTS_KEY,
    serializeDismissals([...kept, key]),
    OPTIONS
  );
}
