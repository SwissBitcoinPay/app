import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { OBSERVE_CHOICE_KEY, parseObserveChoice, serializeObserveChoice } from "./choice-format";

/** This device's choice (observe.ts). The web sends nothing to Observe (choice-store.web.ts). */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable: the default then). Never rejects. */
export async function readObserveChoice(): Promise<boolean | null> {
  try {
    return parseObserveChoice(await SecureStore.getItemAsync(OBSERVE_CHOICE_KEY, OPTIONS));
  } catch (error) {
    logFailure("Reading the crash reports choice failed", error);
    return null;
  }
}

export async function writeObserveChoice(send: boolean): Promise<void> {
  await SecureStore.setItemAsync(OBSERVE_CHOICE_KEY, serializeObserveChoice(send), OPTIONS);
}
