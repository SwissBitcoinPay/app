import { useCallback, useEffect } from "react";
import { View } from "@components";
import { QRScannerProps } from "./QRCamera";
import { StyleSheet } from "react-native";
import * as S from "./styled";

export const QRCamera = ({
  onScan,
  setConfig,
  videoHeight,
  isActive = true,
  style
}: QRScannerProps) => {
  const onScanBarcode = useCallback(
    (codes: { code: string[] }) => {
      if (typeof codes?.code?.[0] === "string") {
        onScan(codes.code[0]);
      }
    },
    [onScan]
  );

  useEffect(() => {
    setConfig({
      hasTorch: false,
      defaultIndex: 0,
      devicesNumber: 1
    });
  }, []);

  return isActive ? (
    <S.Camera
      onScanBarcode={onScanBarcode}
      shouldScan
      style={StyleSheet.flatten([
        style,
        {
          height: videoHeight as number,
          position: "absolute"
        }
      ])}
      ComponentHeader={<></>}
    />
  ) : (
    <View style={{ height: videoHeight as number }} />
  );
};
