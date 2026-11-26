import { focusRingCss } from "./focus-ring-css";
import type { Theme } from "./theme";

const STYLE_ID = "focus-ring";

/**
 * The design system's keyboard focus on every element the keyboard reaches (focus-ring-css.ts),
 * in place of the browser's ring: one style element in the document's head, added once, its rule
 * that of the theme drawn (src/features/appearance/surroundings.web.ts).
 */
export function installFocusRing(theme: Theme): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = focusRingCss(theme);
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = focusRingCss(theme);
  document.head.appendChild(style);
}
