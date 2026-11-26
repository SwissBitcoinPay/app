import { Asset } from "expo-asset";
import { File } from "expo-file-system";

import { logFailure } from "@/lib/log/log";
import { fontAssets } from "@/theme/fonts";

import { REPORT_WEIGHTS, fontFace } from "./report-font-face";

/*
 * The statement's font, Plus Jakarta Sans (the brand's), and the invoice's
 * (src/features/invoices/invoice-html.ts), in the apps:
 * expo-print draws the HTML in a web view of its own, which neither sees the app's fonts nor
 * reads a local file on iOS (WKWebView, docs of expo-print 58): each weight goes in as a data URL,
 * read from the app's own file (expo-asset). The web: report-fonts.web.ts. Without them (a file
 * that does not read), the statement is drawn in the system's font rather than not made.
 */

/**
 * The rules once read: the app's own files do not change while it runs, and each statement would
 * otherwise read and encode them again. Not when a file did not read: the next statement tries.
 */
let readFaces: string | null = null;

/** The `@font-face` rules of the statement's weights; "" when a file did not read. */
export async function reportFontFaces(): Promise<string> {
  if (readFaces !== null) return readFaces;
  try {
    const rules = await Promise.all(
      REPORT_WEIGHTS.map(async ([weight, name]) => {
        const asset = await Asset.fromModule(fontAssets[name]).downloadAsync();
        if (!asset.localUri) throw new Error("The font has no local file");
        const base64 = await new File(asset.localUri).base64();
        return fontFace(weight, `data:font/ttf;base64,${base64}`);
      })
    );
    readFaces = rules.join("\n");
    return readFaces;
  } catch (error) {
    logFailure("Reading the statement's fonts failed", error);
    return "";
  }
}
