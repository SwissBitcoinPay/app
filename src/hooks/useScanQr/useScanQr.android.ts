// @ts-ignore
import BarcodeZxingScan from "react-native-barcode-zxing-scan";
import { UseScanQrProps } from "./useScanQr";

export const useScanQr = ({ onScan }: UseScanQrProps) => {
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    BarcodeZxingScan.showQrReader(onScan);
  };
};
