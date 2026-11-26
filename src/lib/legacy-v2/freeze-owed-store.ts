import * as SecureStore from "expo-secure-store";

import { LEGACY_FREEZE_OWED_KEY } from "./freeze-owed-format";

/** The stored list of freeze-owed-format.ts. Same API on the web: freeze-owed-store.web.ts. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export function readFreezeOwedText(): Promise<string | null> {
  return SecureStore.getItemAsync(LEGACY_FREEZE_OWED_KEY, OPTIONS);
}

export function writeFreezeOwedText(text: string): Promise<void> {
  return SecureStore.setItemAsync(LEGACY_FREEZE_OWED_KEY, text, OPTIONS);
}
