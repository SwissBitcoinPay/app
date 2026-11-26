import { CameraView, useCameraPermissions } from "expo-camera";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { openSystemSettings, withSystemUi } from "@/lib/system-ui";
import { makeStyles, palette, radius, sans, type } from "@/theme";

/** Same API on the web (InviteScanner.web.tsx): whether this platform scans in the app. */
export function canScanInApp(): boolean {
  return true;
}

/**
 * The camera, reading QR codes: `onScan` gets the text of each code seen (a few times a second
 * while one stays in view). Asks for the camera first; refused, it says so and offers the
 * system settings when the prompt can no longer show.
 */
export function InviteScanner({ onScan, size }: { onScan: (text: string) => void; size: number }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const frame = [styles.frame, { width: size, height: size }];

  if (!permission) return <View style={frame} />;
  if (!permission.granted) {
    return (
      <View style={[frame, styles.denied]}>
        <Text style={styles.deniedText}>{t("team.join.cameraNeeded")}</Text>
        <Button
          variant="secondary"
          size="sm"
          icon="camera"
          onPress={() =>
            void (permission.canAskAgain ? withSystemUi(requestPermission) : openSystemSettings())
          }
          testID="camera-permission"
        >
          {t(permission.canAskAgain ? "team.join.allowCamera" : "team.join.openSettings")}
        </Button>
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
        testID="invite-camera"
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
