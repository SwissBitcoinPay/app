import type { ColorScheme } from "@/theme/tokens";

/**
 * Storage key of "Theme" ("Light", "Dark", "Automatic"), on the device only (theme-preference.ts).
 * Never rename it: installed apps keep the choice there.
 */
export const THEME_KEY = "theme";

/** Format of the stored record. A change of format needs a new version. */
const THEME_VERSION = 1;

/** The theme this device asks for: one of the two, or the device's own ("Automatic"). */
export type ThemePreference = ColorScheme | "system";

/** Without a choice (none yet, or not read yet): the device's own theme. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function serializeThemePreference(preference: ThemePreference): string {
  return JSON.stringify({ version: THEME_VERSION, theme: preference });
}

/**
 * A stored record, null when absent, damaged or of another format (a newer app's: the default then,
 * never written over unasked).
 */
export function parseThemePreference(stored: string | null): ThemePreference | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; theme?: unknown } | null;
    return value?.version === THEME_VERSION &&
      (value.theme === "system" || value.theme === "light" || value.theme === "dark")
      ? value.theme
      : null;
  } catch {
    return null;
  }
}

/** The theme drawn: the one asked for, or the device's when "Automatic". */
export function resolveScheme(preference: ThemePreference, device: ColorScheme): ColorScheme {
  return preference === "system" ? device : preference;
}

/**
 * The page of a payment link's switch: the other theme than the one drawn. Saved as "Automatic"
 * when that is the device's own, so that the page follows the device again once the payer switched
 * back.
 */
export function toggledPreference(drawn: ColorScheme, device: ColorScheme): ThemePreference {
  const next: ColorScheme = drawn === "dark" ? "light" : "dark";
  return next === device ? "system" : next;
}
