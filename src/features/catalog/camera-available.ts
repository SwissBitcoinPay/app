/**
 * Whether this device can scan barcodes with a camera (the scan only where there is a camera). The
 * apps: always offered, a camera that cannot start says so (BarcodeCamera); they have no way to
 * tell beforehand. The web: camera-available.web.ts.
 */
export function useCanScanBarcodes(): boolean {
  return true;
}
