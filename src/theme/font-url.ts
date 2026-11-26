/**
 * The URL of a font file of `fontAssets` (fonts.ts) on the web: Metro web exports
 * `require("x.ttf")` as its URL, a string or `{ uri }`; null for any other source (the apps' module
 * ids). Used by `useAppFonts.web.ts` (the app's fonts) and `report-fonts.web.ts` (the statement's).
 */
export function fontFileUrl(source: unknown): string | null {
  if (typeof source === "string") return source;
  if (
    typeof source === "object" &&
    source !== null &&
    "uri" in source &&
    typeof source.uri === "string"
  ) {
    return source.uri;
  }
  return null;
}
