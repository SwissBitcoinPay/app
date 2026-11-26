import { Appearance } from "react-native";

import type { ThemePreference } from "./theme-format";

/**
 * The apps: the system's own parts of the app (the keyboard, its dialogs, the date picker) drawn in
 * the theme chosen, or in the device's for "Automatic". Applied before the screens hear of a new
 * choice (theme-preference.ts): React Native's colour scheme then already tells the device's own
 * when they read it (ThemeProvider.tsx). Same API on the web: scheme-override.web.ts.
 */
export function overrideScheme(preference: ThemePreference | null): void {
  Appearance.setColorScheme(
    preference === null || preference === "system" ? "unspecified" : preference
  );
}
