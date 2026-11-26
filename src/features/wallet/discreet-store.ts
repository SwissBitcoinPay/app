import * as SecureStore from "expo-secure-store";

import { DISCREET_STORE_KEY, parseStoredDiscreet, serializeDiscreet } from "./discreet-format";

/**
 * Whether "Discreet" masks the wallet screen's amounts on this device, next to the dock's choice
 * (dock-store.ts). Same API on the web: discreet-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable): the amounts show then. */
export async function loadDiscreet(): Promise<boolean | null> {
  try {
    return parseStoredDiscreet(await SecureStore.getItemAsync(DISCREET_STORE_KEY, OPTIONS));
  } catch {
    return null;
  }
}

export async function saveDiscreet(hidden: boolean): Promise<void> {
  await SecureStore.setItemAsync(DISCREET_STORE_KEY, serializeDiscreet(hidden), OPTIONS);
}
