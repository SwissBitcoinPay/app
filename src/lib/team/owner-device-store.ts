import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { OWNER_DEVICE_KEY, parseOwnerDeviceRecord, type OwnerDeviceRecord } from "./owner-device";

/**
 * The owner's device's record (owner-device.ts) in the secure storage, like an employee's
 * membership: without biometrics, out of the iCloud and Google backups (a restored device is added
 * again). Same API on the web: owner-device-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export async function loadOwnerDeviceRecord(): Promise<OwnerDeviceRecord | null> {
  try {
    const stored = await SecureStore.getItemAsync(OWNER_DEVICE_KEY, OPTIONS);
    return stored === null ? null : parseOwnerDeviceRecord(JSON.parse(stored));
  } catch (error) {
    logFailure("Unreadable owner's device record", error);
    return null;
  }
}

export async function saveOwnerDeviceRecord(record: OwnerDeviceRecord): Promise<void> {
  await SecureStore.setItemAsync(OWNER_DEVICE_KEY, JSON.stringify(record), OPTIONS);
}
