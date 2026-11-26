import { CameraView, useCameraPermissions } from "expo-camera";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { makeStyles, palette, radius, sans, type } from "@/theme";

/**
 * Same API as InviteScanner.tsx. The browser scans only with its own `BarcodeDetector` (Chrome on
 * Android, among others): expo-camera's fallback downloads a WebAssembly decoder from a third
 * party (jsDelivr), which would receive the device's IP address. Elsewhere, the phone's camera app
 * scans the QR code, which opens this page directly.
 */
export function canScanInApp(): boolean {
  return typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector !== "undefined";
}

export function InviteScanner({ onScan, size }: { onScan: (text: string) => void; size: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const frame = [styles.frame, { width: size, height: size }];

  if (!canScanInApp()) return null;
  if (!permission) return <View style={frame} />;
  if (!permission.granted) {
    return (
      <View style={[frame, styles.denied]}>
        <Text style={styles.deniedText}>{t("team.join.cameraNeeded")}</Text>
        {permission.canAskAgain ? (
          <Button
            variant="secondary"
            size="sm"
            icon="camera"
            onPress={() => void requestPermission()}
            testID="camera-permission"
          >
            {t("team.join.allowCamera")}
          </Button>
        ) : null}
      </View>
    );
  }
  return (
    <View style={frame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onScan(data)}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: palette.ink,
    alignSelf: "center"
  },
  denied: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: colors.background.subtle
  },
  deniedText: {
    ...sans(500),
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
