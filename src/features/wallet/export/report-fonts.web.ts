import { fontFileUrl } from "@/theme/font-url";
import { fontAssets } from "@/theme/fonts";

import { REPORT_WEIGHTS, fontFace } from "./report-font-face";

/*
 * The statement's font on the web (report-fonts.ts in the apps): the browser prints the HTML from
 * a frame of this page (src/features/invoices/pdf.web.ts), which reads the font files of the web
 * app by their URL, as the app does (Metro exports `require("x.ttf")` as its URL), and prints once
 * they are loaded.
 */

/** The URL of a font file, absolute: the frame's document is not at the page's address. */
function fileUrl(source: unknown): string | null {
  const url = fontFileUrl(source);
  return url === null ? null : new URL(url, document.baseURI).href;
}

/** The `@font-face` rules of the statement's weights, those whose file has a URL. */
export async function reportFontFaces(): Promise<string> {
  return REPORT_WEIGHTS.flatMap(([weight, name]) => {
    const url = fileUrl(fontAssets[name]);
    return url === null ? [] : [fontFace(weight, url)];
  }).join("\n");
}
