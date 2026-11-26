import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import {
  parseThemePreference,
  serializeThemePreference,
  THEME_KEY,
  type ThemePreference
} from "./theme-format";

/** This device's "Theme" (theme-preference.ts). Same API on the web: theme-store.web.ts. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable: the default then). Never rejects. */
export async function readThemePreference(): Promise<ThemePreference | null> {
  try {
    return parseThemePreference(await SecureStore.getItemAsync(THEME_KEY, OPTIONS));
  } catch (error) {
    logFailure("Reading the theme failed", error);
    return null;
  }
}

export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  await SecureStore.setItemAsync(THEME_KEY, serializeThemePreference(preference), OPTIONS);
}
