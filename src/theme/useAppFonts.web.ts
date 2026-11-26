import { useFonts, type FontSource } from "expo-font";

import { fontFileUrl } from "./font-url";
import { fontAssets, webStartupFonts, type FontName } from "./fonts";

/**
 * Web: each font file is a request to the web host, on every page load (EAS Hosting counts
 * requests). Only `webStartupFonts`, the fonts of the welcome screen, are loaded before the first
 * render. The others are only declared (`@font-face`): browsers download such a font the first
 * time some text uses it. expo-font cannot declare a font without downloading it: in Chrome and
 * Firefox, its `loadAsync` makes the browser load the font to know when it is ready
 * (fontfaceobserver).
 *
 * `font-display: block`: text in a font still downloading stays invisible (3 s at most, then a
 * fallback font) rather than showing another font and moving once it arrives.
 */
const STYLE_ID = "lazy-fonts";

const startupFonts: Record<string, FontSource> = {};
const lazyRules: string[] = [];
for (const name of Object.keys(fontAssets) as FontName[]) {
  const url = fontFileUrl(fontAssets[name]);
  // A font without a plain URL is loaded by expo-font, which resolves any source: never missing.
  if (url === null || (webStartupFonts as readonly FontName[]).includes(name)) {
    startupFonts[name] = fontAssets[name];
  } else {
    // The rule expo-font writes for a font it loads.
    lazyRules.push(
      `@font-face{font-family:${JSON.stringify(name)};src:url(${JSON.stringify(url)});font-display:block}`
    );
  }
}

if (typeof document !== "undefined" && lazyRules.length > 0 && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = lazyRules.join("\n");
  document.head.appendChild(style);
}

/** Loads the startup fonts before the first render; declares the others (see above). */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(startupFonts);
}
