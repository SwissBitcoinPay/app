import { CSSProperties, useCallback, useEffect, useState } from "react";
import {
  QrScanner,
  QrScannerProps as RootScannerProps
} from "@yudiel/react-qr-scanner";
import { PlaceholderPresetsTypes } from "./data";
import { CamerasConfig } from "./types";
import { useIsScreenSizeMin } from "@hooks";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";

export type QRScannerProps = {
  setConfig: (newConfig: Partial<CamerasConfig>) => void;
  onScan: (value: string) => void;
  placeholderPreset?: PlaceholderPresetsTypes;
  isActive?: boolean;

  isTorchOn: boolean;
  deviceIndex?: number;

  resizeMode?: "contain" | "cover";

  videoHeight?: number | string;
  style?: StyleProp<ViewStyle>;
};

export const QRCamera = ({
  onScan,
  setConfig,
  deviceIndex,
  videoHeight,
  style
}: QRScannerProps) => {
  const [devices, setDevices] = useState<InputDeviceInfo[]>([]);
  const isLarge = useIsScreenSizeMin("large");

  const onError = useCallback<RootScannerProps["onError"]>((error) => {
    console.error(error);
  }, []);

  useEffect(() => {
    (async () => {
      const _devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput"
      ) as InputDeviceInfo[];

      let defaultIndex = 0;
      _devices.forEach((d, index) => {
        if ((d.getCapabilities?.().facingMode || []).includes("environment")) {
          defaultIndex = index;
        }
      });

      setDevices(_devices);
      setConfig({
        devicesNumber: _devices.length,
        defaultIndex,
        hasTorch: false
      });
    })();
  }, []);

  return (
    deviceIndex !== undefined && (
      <QrScanner
        constraints={{ deviceId: devices?.[deviceIndex]?.deviceId }}
        containerStyle={StyleSheet.flatten([
          style as CSSProperties,
          {
            height: videoHeight,
            alignItems: "center",
            justifyContent: "center",
            display: "flex"
          }
        ])}
        videoStyle={{
          borderRadius: isLarge ? 40 : 0,
          overflow: "hidden",
          width: "fit-content"
        }}
        onDecode={onScan}
        onError={onError}
      />
    )
  );
};
