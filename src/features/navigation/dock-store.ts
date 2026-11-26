import * as SecureStore from "expo-secure-store";

import { DOCK_STORE_KEY, parseStoredDock, serializeDock } from "./dock-format";
import type { Destination } from "./destinations";

/**
 * The dock chosen on this device (a choice saved per device), next
 * to the point of sale's profile. Same API on the web: dock-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored dock, null when none (or unreadable): the default then. */
export async function loadDock(): Promise<Destination[] | null> {
  try {
    return parseStoredDock(await SecureStore.getItemAsync(DOCK_STORE_KEY, OPTIONS));
  } catch {
    return null;
  }
}

export async function saveDock(dock: readonly Destination[]): Promise<void> {
  await SecureStore.setItemAsync(DOCK_STORE_KEY, serializeDock(dock), OPTIONS);
}
