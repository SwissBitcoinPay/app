import * as SecureStore from "expo-secure-store";

import {
  POS_MODE_STORE_KEY,
  parseStoredPosMode,
  serializePosMode,
  type PosMode
} from "./pos-mode-format";

/**
 * The point of sale's mode on this device (pos-mode-format.ts), next to the dock's choice
 * (dock-store.ts). Same API on the web: pos-mode-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored mode, null when none (or unreadable): the keypad's then. */
export async function loadPosMode(): Promise<PosMode | null> {
  try {
    return parseStoredPosMode(await SecureStore.getItemAsync(POS_MODE_STORE_KEY, OPTIONS));
  } catch {
    return null;
  }
}

export async function savePosMode(mode: PosMode): Promise<void> {
  await SecureStore.setItemAsync(POS_MODE_STORE_KEY, serializePosMode(mode), OPTIONS);
}
