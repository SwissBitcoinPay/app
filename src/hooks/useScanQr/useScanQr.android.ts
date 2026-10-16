import { showQrReader } from "@utils/showQrReader";
import { UseScanQrProps } from "./useScanQr";

export const useScanQr = ({ onScan }: UseScanQrProps) => {
  return () => {
    // A cancelled scan needs no handling: the user is back on this screen.
    showQrReader((value) => onScan?.(value));
  };
};
