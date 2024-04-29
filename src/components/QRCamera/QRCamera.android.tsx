import { useEffect } from "react";
import { QRScannerProps } from "./QRCamera";
// @ts-ignore
import BarcodeZxingScan from "react-native-barcode-zxing-scan";

export const QRCamera = ({ onScan }: QRScannerProps) => {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    BarcodeZxingScan.showQrReader(onScan);
  }, []);
};
