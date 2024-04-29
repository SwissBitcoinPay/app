import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  useCameraDevices,
  useCodeScanner,
  CodeScanner
} from "react-native-vision-camera";
import { Loader, View } from "@components";
import { QRScannerProps } from "./QRCamera";
import { StyleSheet } from "react-native";
import * as S from "./styled";

export const QRCamera = ({
  onScan,
  setConfig,
  isTorchOn,
  deviceIndex,
  videoHeight,
  isActive = true,
  resizeMode = "cover",
  style
}: QRScannerProps) => {
  const devices = useCameraDevices();

  const [isLoading, setIsLoading] = useState(true);

  const device = useMemo(() => {
    if (deviceIndex === undefined) {
      return null;
    }
    return devices[deviceIndex];
  }, [devices, deviceIndex]);

  useEffect(() => {
    setConfig({
      hasTorch: device?.hasTorch || false,
      defaultIndex: devices.findIndex((d) => d.position === "back"),
      devicesNumber: devices.length
    });
  }, [device]);

  useEffect(() => {
    (async () => {
      await Camera.requestCameraPermission();
      setIsLoading(false);
    })();
  }, []);

  const onCodeScanned = useCallback<CodeScanner["onCodeScanned"]>(
    (codes) => {
      if (codes[0].value) {
        onScan(codes[0].value);
      }
    },
    [onScan]
  );

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned
  });

  return !!device && !isLoading ? (
    isActive ? (
      <S.Camera
        isActive
        key={device.id}
        device={device}
        torch={isTorchOn ? "on" : "off"}
        codeScanner={codeScanner}
        style={StyleSheet.flatten([
          style,
          {
            height: videoHeight as number
          }
        ])}
        resizeMode={resizeMode}
      />
    ) : (
      <View style={{ height: videoHeight as number }} />
    )
  ) : (
    <Loader />
  );
};
