import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import {
  COUNTRY_DETECTION_KEY,
  parseCountryDetection,
  serializeCountryDetection
} from "./country-detection-format";

/** This device's "Detect my country with country.is". Same API on the web: the .web.ts file. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable: the default then). Never rejects. */
export async function readCountryDetection(): Promise<boolean | null> {
  try {
    return parseCountryDetection(await SecureStore.getItemAsync(COUNTRY_DETECTION_KEY, OPTIONS));
  } catch (error) {
    logFailure("Reading the country detection's choice failed", error);
    return null;
  }
}

export async function writeCountryDetection(detect: boolean): Promise<void> {
  await SecureStore.setItemAsync(COUNTRY_DETECTION_KEY, serializeCountryDetection(detect), OPTIONS);
}
