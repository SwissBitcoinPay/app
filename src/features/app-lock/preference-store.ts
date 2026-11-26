import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { APP_LOCK_KEY, parseAppLock, serializeAppLock } from "./preference-format";

/** This device's choice (preference.ts). The web has none (preference-store.web.ts). */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable: the default then). Never rejects. */
export async function readAppLock(): Promise<boolean | null> {
  try {
    return parseAppLock(await SecureStore.getItemAsync(APP_LOCK_KEY, OPTIONS));
  } catch (error) {
    logFailure("Reading the app lock choice failed", error);
    return null;
  }
}

export async function writeAppLock(biometrics: boolean): Promise<void> {
  await SecureStore.setItemAsync(APP_LOCK_KEY, serializeAppLock(biometrics), OPTIONS);
}
