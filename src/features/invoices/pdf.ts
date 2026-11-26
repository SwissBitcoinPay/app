import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { logFailure } from "@/lib/log/log";
import { withSystemUi } from "@/lib/system-ui";

import { A4_POINTS, marginsInPoints, withPage, type PageMargins } from "./pdf-page";

/*
 * A PDF made by the app, in the apps (expo-print and expo-sharing): an invoice's ("Download the
 * PDF", invoice-html.ts) or the wallet's statement ("Export", src/features/wallet/export/).
 * expo-print turns its HTML into a PDF file of the app's cache, which the system's share sheet
 * sends, saves to Files or prints. The web prints the page in a frame of its own (pdf.web.ts). The
 * file is named after what it holds (invoiceFileName: "Invoice-2026-0042.pdf"), the name the share
 * sheet and Files show. Its page is A4 with the document's margins (pdf-page.ts): iOS takes them as
 * an option, Android from the HTML.
 */

/**
 * Makes the PDF of `html` on A4 pages with `margins`, a file of the app's cache named `fileName`:
 * its URI. Also attached to an invoice's mail (invoice-mail.ts).
 */
export async function writePdf(
  html: string,
  fileName: string,
  margins: PageMargins
): Promise<string> {
  const { uri } = await Print.printToFileAsync(
    Platform.OS === "ios"
      ? { html: withPage(html), ...A4_POINTS, margins: marginsInPoints(margins) }
      : { html: withPage(html, margins), ...A4_POINTS }
  );
  const file = new File(uri);
  try {
    // The same name for the same document: the copy made last replaces the one before.
    file.moveSync(new File(Paths.cache, fileName), { overwrite: true });
  } catch (error) {
    // With expo-print's name rather than not at all.
    logFailure("Naming the PDF failed", error);
  }
  return file.uri;
}

/** Makes the PDF of `html` and opens the share sheet with it, named `fileName`. */
export async function sharePdf(
  html: string,
  title: string,
  fileName: string,
  margins: PageMargins
): Promise<void> {
  const uri = await writePdf(html, fileName, margins);
  // The system's share sheet over the app: coming back is not leaving it (src/lib/system-ui.ts).
  await withSystemUi(() =>
    Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: title
    })
  );
}
