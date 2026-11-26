import { withPage, type PageMargins } from "./pdf-page";

/*
 * A PDF made by the app, on the web (pdf.ts in the apps): an invoice's or the wallet's statement.
 * The browser prints its HTML from a hidden frame of its own, where "Save as PDF" saves the file.
 * expo-print's web version prints the whole page, never a document of its own: it is not used here.
 */

/** How long the frame stays after the print dialog closes (some browsers print after onafterprint). */
const FRAME_LIFETIME_MS = 60_000;

/** The longest wait for the frame's fonts before printing. */
const FONTS_WAIT_MS = 5_000;

/**
 * Resolves once each font `document` declares (`@font-face`) is loaded, or failed to, or after
 * FONTS_WAIT_MS. A face is only loaded when some text uses it, maybe after the frame's `load`.
 */
function fontsLoaded(document: Document): Promise<void> {
  const faces = document.fonts ? [...document.fonts] : [];
  if (faces.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(faces.map((face) => face.load().catch(() => undefined))).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, FONTS_WAIT_MS))
  ]);
}

/** Prints `html` from a hidden frame. */
function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        reject(new Error("The print frame has no window"));
        return;
      }
      // Its fonts loaded first (the statement's, report-fonts.web.ts): printed before, its text
      // would be in another font. Not past FONTS_WAIT_MS: printed in the system's font rather than
      // not at all.
      void fontsLoaded(view.document).then(() => {
        setTimeout(() => frame.remove(), FRAME_LIFETIME_MS);
        // A print that throws rejects: its caller's "Export" or "Download the PDF" would otherwise
        // wait for good.
        try {
          view.focus();
          view.print();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/**
 * The print dialog, A4 with `margins` (pdf-page.ts), where the browser saves it as a PDF (it names
 * the file itself: `_fileName` is the apps').
 */
export async function sharePdf(
  html: string,
  _title: string,
  _fileName: string,
  margins: PageMargins
): Promise<void> {
  await printHtml(withPage(html, margins));
}
