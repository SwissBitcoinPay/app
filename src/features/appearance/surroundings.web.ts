import { installFocusRing } from "@/theme/focus-ring";
import type { Theme } from "@/theme/theme";

/**
 * Same API as surroundings.ts. The web: the page under the app in the theme's canvas, the browser's
 * own parts (scroll bars, form controls) in its scheme (`color-scheme`), and the keyboard's focus
 * ring in its colours (focus-ring.web.ts). The page's first paint, before the app's code, follows
 * the device's scheme already (public/index.html).
 *
 * And the page's `theme-color`, which the browser paints its own bars in: the title bar of the
 * installed app's window (Chrome, Edge), the status bar above it (Android), Safari's tab bar. Its
 * first values, in public/index.html, follow the device's scheme; this device's "Theme" may differ
 * ("Light" on a dark device): every `theme-color` of the page then takes the theme in use, whatever
 * its `media`.
 */
export function applySurroundings(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.colorScheme = theme.scheme;
  root.style.backgroundColor = theme.colors.background.app;
  document.body.style.backgroundColor = theme.colors.background.app;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = theme.colors.background.app;
  }
  installFocusRing(theme);
}
