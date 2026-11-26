import type { FontName } from "@/theme/fonts";

/*
 * What the statement's font is in the apps (report-fonts.ts) and on the web (report-fonts.web.ts)
 * alike. Its own module, without a platform version: imported as "./report-fonts", it would be
 * report-fonts.web.ts itself on the web, whose import of itself has none of these ("Simple (PDF)"
 * would fail on the web, platform-files.test.ts).
 */

/** The weights the statement (report-html.ts) and the invoice (invoice-html.ts) use, by file. */
export const REPORT_WEIGHTS: readonly (readonly [number, FontName])[] = [
  [500, "PlusJakartaSans-Medium"],
  [700, "PlusJakartaSans-Bold"],
  [800, "PlusJakartaSans-ExtraBold"]
];

/** A weight's `@font-face` of the family "Plus Jakarta Sans", its file at `src`. */
export function fontFace(weight: number, src: string): string {
  return `@font-face{font-family:"Plus Jakarta Sans";font-weight:${weight};font-style:normal;src:url(${JSON.stringify(src)}) format("truetype")}`;
}
