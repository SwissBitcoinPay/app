import { useEffect, useRef } from "react";
import { showQrReader } from "@utils/showQrReader";
import { QRScannerProps } from "./QRCamera";

export const QRCamera = ({ onScan, onCancel }: QRScannerProps) => {
  // The native scanner reports back long after it was opened on mount: call
  // the handlers of the latest render, not the ones captured on mount.
  const handlers = useRef({ onScan, onCancel });
  useEffect(() => {
    handlers.current = { onScan, onCancel };
  });

  useEffect(() => {
    showQrReader(
      (value) => handlers.current.onScan(value),
      () => handlers.current.onCancel?.()
    );
  }, []);
};
