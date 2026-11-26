import * as SecureStore from "expo-secure-store";

/**
 * Where the pending links (pending.ts) are kept: the device's secure storage, like the point of
 * sale's profile (src/lib/terminal/profile.ts): out of the device backups, readable once the
 * device was unlocked after a restart, never behind biometrics. Same API on the web:
 * pending-backend.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export function getItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, OPTIONS);
}

export function setItem(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value, OPTIONS);
}

export function removeItem(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key, OPTIONS);
}
