import * as SystemUI from "expo-system-ui";

import { logFailure } from "@/lib/log/log";
import type { Theme } from "@/theme/theme";

/**
 * The apps: what shows around the screens (the root view, seen as the keyboard opens or a screen
 * slides in) in the theme's canvas, never a white flash under a dark screen. Same API on the web:
 * surroundings.web.ts.
 */
export function applySurroundings(theme: Theme): void {
  SystemUI.setBackgroundColorAsync(theme.colors.background.app).catch((error: unknown) => {
    logFailure("Setting the root view's colour failed", error);
  });
}
