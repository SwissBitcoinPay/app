import { logFailure } from "@/lib/log/log";

import { loadBarcodeReaderFiles } from "./barcode-reader-files.web";

/**
 * The web app's barcode reader. expo-camera reads barcodes in the browser with its own
 * BarcodeDetector (Chrome on Android and macOS) or, where it has none (Safari, Firefox, Chrome on
 * Windows and Linux), with the `barcode-detector` package: ZXing compiled to WebAssembly
 * (`zxing-wasm`). That package downloads its .wasm from jsDelivr by default: here the .wasm is the
 * app's own asset (metro.config.js), served with the web app, so that no third party sees who
 * scans.
 *
 * The ZXing module is one per page and keeps the overrides it was first made with: it is made
 * here, with the app's .wasm, before any camera reads (BarcodeCamera waits for it), so that
 * expo-camera's detector, from the same package (barcode-reader-files.web.ts), uses it. A failed load (offline) is forgotten, and made again on the next try.
 */
let preparing: Promise<void> | null = null;
let ready = false;

/** The browser reads barcodes itself: expo-camera uses its BarcodeDetector, nothing to load. */
function browserReads(): boolean {
  return typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector !== "undefined";
}

export function prepareBarcodeEngine(): Promise<void> {
  if (ready || browserReads()) {
    ready = true;
    return Promise.resolve();
  }
  if (!preparing) {
    const attempt = (async () => {
      const { detector, wasmUrl } = await loadBarcodeReaderFiles();
      try {
        await detector.prepareZXingModule({
          overrides: {
            // The app's asset, never jsDelivr (the package's default).
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? wasmUrl : prefix + path
          },
          fireImmediately: true
        });
      } catch (error) {
        // Not kept: the next try makes the module again.
        detector.purgeZXingModule();
        throw error;
      }
      ready = true;
    })();
    preparing = attempt;
    attempt.catch((error: unknown) => {
      logFailure("Loading the barcode reader failed", error);
      if (preparing === attempt) preparing = null;
    });
  }
  return preparing;
}

/** Whether the reader is ready, without waiting. */
export function isBarcodeEngineReady(): boolean {
  return ready || browserReads();
}
