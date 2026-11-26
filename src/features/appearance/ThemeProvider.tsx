import { useLayoutEffect, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { THEMES, ThemeContext } from "@/theme/theme";

import { applySurroundings } from "./surroundings";
import { DEFAULT_THEME_PREFERENCE, resolveScheme } from "./theme-format";
import { useThemePreferenceChoice } from "./theme-preference";
import { useThemeCrossfade } from "./theme-crossfade";

/**
 * The theme every screen draws in (src/theme/theme.tsx): this device's "Theme"
 * (theme-preference.ts), or the device's own for "Automatic", followed as it changes (at sunset,
 * say). Wraps the whole app, panels included (the root layout). A change crossfades
 * (theme-crossfade.ts): the screens, the panels and what surrounds them (the root view, the web
 * page) take the new theme together, under the still of the screen as it showed.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemePreferenceChoice() ?? DEFAULT_THEME_PREFERENCE;
  // React Native's scheme: the device's own, since the apps' override follows "Automatic"
  // (scheme-override.ts); light when it cannot tell.
  const device = useColorScheme() === "dark" ? "dark" : "light";
  const drawn = useThemeCrossfade(THEMES[resolveScheme(preference, device)]);
  // In the commit of the new theme: the web's crossfade captures the page with it.
  useLayoutEffect(() => {
    applySurroundings(drawn);
  }, [drawn]);
  return <ThemeContext value={drawn}>{children}</ThemeContext>;
}
