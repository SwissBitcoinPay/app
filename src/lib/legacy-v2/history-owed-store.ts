import * as SecureStore from "expo-secure-store";

import { LEGACY_HISTORY_OWED_KEY } from "./history-owed-format";

/** The stored list of history-owed-format.ts. Same API on the web: history-owed-store.web.ts. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export function readHistoryOwedText(): Promise<string | null> {
  return SecureStore.getItemAsync(LEGACY_HISTORY_OWED_KEY, OPTIONS);
}

export function writeHistoryOwedText(text: string): Promise<void> {
  return SecureStore.setItemAsync(LEGACY_HISTORY_OWED_KEY, text, OPTIONS);
}
