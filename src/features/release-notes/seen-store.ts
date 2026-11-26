import * as SecureStore from "expo-secure-store";

import { parseStoredSeen, RELEASE_NOTES_SEEN_KEY, serializeSeen } from "./seen-format";

/**
 * The release notes last opened on this device (seen.ts). Same API on the web:
 * seen-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored key, null when none (or unreadable). Rejects when the store cannot be read. */
export async function loadSeen(): Promise<string | null> {
  return parseStoredSeen(await SecureStore.getItemAsync(RELEASE_NOTES_SEEN_KEY, OPTIONS));
}

export async function saveSeen(key: string): Promise<void> {
  await SecureStore.setItemAsync(RELEASE_NOTES_SEEN_KEY, serializeSeen(key), OPTIONS);
}
