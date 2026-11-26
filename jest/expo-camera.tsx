/**
 * Fake of expo-camera for Jest (a native module): the camera is a plain view whose barcode handler
 * tests call through `scan`, and permissions come from `permission` (granted by default).
 */
import { useEffect, useRef } from "react";
import { View, type ViewProps } from "react-native";

type Scanned = { data: string };

let handler: ((result: Scanned) => void) | null = null;

export const permission = { granted: true, canAskAgain: true, status: "granted" };

/**
 * The device has no camera, or it cannot start: each camera mounted reports a mount error.
 * `listed`: whether a browser lists a camera (CameraView.isAvailableAsync, the web app's).
 */
export const device = { cameraFails: false, listed: true };

export function resetCamera(): void {
  handler = null;
  device.cameraFails = false;
  device.listed = true;
  permission.granted = true;
  permission.canAskAgain = true;
  permission.status = "granted";
}

/** A QR code shown to the camera. */
export function scan(data: string): void {
  if (!handler) throw new Error("No camera is scanning");
  handler({ data });
}

export function CameraView({
  onBarcodeScanned,
  onMountError,
  ...props
}: ViewProps & {
  onBarcodeScanned?: (result: Scanned) => void;
  onMountError?: (error: { message: string }) => void;
}) {
  useEffect(() => {
    if (device.cameraFails) onMountError?.({ message: "Camera unavailable" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The camera stops with its view: an unmounted one reads nothing (unless another took over).
  const own = useRef<((result: Scanned) => void) | null>(null);
  own.current = onBarcodeScanned ?? null;
  handler = own.current;
  useEffect(
    () => () => {
      if (handler === own.current) handler = null;
    },
    []
  );
  return <View {...props} />;
}

/** expo-camera's web-only `isAvailableAsync`: whether the browser lists a video input. */
CameraView.isAvailableAsync = async (): Promise<boolean> => device.listed;

export function useCameraPermissions() {
  return [
    { ...permission },
    async () => {
      permission.granted = true;
      return { ...permission };
    },
    async () => ({ ...permission })
  ] as const;
}
