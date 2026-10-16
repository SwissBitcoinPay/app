// @ts-ignore: the package ships no type declarations
import BarcodeZxingScan from "react-native-barcode-zxing-scan";

/** Callback the native ZXing scanner (Android only) invokes once it closes
 * (see patches/react-native-barcode-zxing-scan+1.0.2.patch). `value` is
 * `null` when the scanner is closed without scanning a code (e.g. with the
 * back button). */
export type NativeScanCallback = (
  value: string | null,
  barcodeImagePath: string | null
) => void;

const scanner = BarcodeZxingScan as {
  showQrReader: (callback: NativeScanCallback) => void;
};

/** Opens the native ZXing scanner screen (Android only). `onScan` only ever
 * receives a scanned value; a closed scanner is reported to `onCancel`. */
export const showQrReader = (
  onScan: (value: string) => void,
  onCancel?: () => void
) => {
  scanner.showQrReader((value) => {
    if (value) {
      onScan(value);
    } else {
      onCancel?.();
    }
  });
};
