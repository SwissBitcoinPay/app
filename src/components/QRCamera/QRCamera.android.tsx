import { useEffect } from "react";
import { QRScannerProps } from "./QRCamera";
// @ts-ignore
import BarcodeZxingScan from "react-native-barcode-zxing-scan";

export const QRCamera = ({ onScan, onCancel }: QRScannerProps) => {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    BarcodeZxingScan.showQrReader((value: string | null) => {
      // The native scanner calls back with `null` when it is closed without
      // scanning a code (e.g. with the back button).
      if (value) {
        onScan(value);
      } else {
        onCancel?.();
      }
    });
  }, []);
};
