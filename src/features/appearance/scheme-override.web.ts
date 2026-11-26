import type { ThemePreference } from "./theme-format";

/**
 * Same API as scheme-override.ts. The web: nothing to override, the browser's own scheme (its
 * `prefers-color-scheme`) is the device's; the page follows the theme drawn (surroundings.web.ts).
 */
export function overrideScheme(_preference: ThemePreference | null): void {}
