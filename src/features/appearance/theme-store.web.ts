import { logFailure } from "@/lib/log/log";

import {
  parseThemePreference,
  serializeThemePreference,
  THEME_KEY,
  type ThemePreference
} from "./theme-format";

/** Same API as theme-store.ts, in this browser's `localStorage`. */

export async function readThemePreference(): Promise<ThemePreference | null> {
  try {
    return parseThemePreference(localStorage.getItem(THEME_KEY));
  } catch (error) {
    logFailure("Reading the theme failed", error);
    return null;
  }
}

export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  localStorage.setItem(THEME_KEY, serializeThemePreference(preference));
}
