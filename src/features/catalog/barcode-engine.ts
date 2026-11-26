/**
 * The barcode reader the camera needs before it shows (barcode-engine.web.ts on the web). The apps
 * read with the system's own reader (expo-camera): nothing to prepare.
 */
export function prepareBarcodeEngine(): Promise<void> {
  return Promise.resolve();
}

/** Whether the reader is ready, without waiting: always in the apps. */
export function isBarcodeEngineReady(): boolean {
  return true;
}
