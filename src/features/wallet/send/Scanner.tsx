import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useCameraAsked } from "@/features/media/camera-permission";
import { openSystemSettings } from "@/lib/system-ui";
import { makeStyles, palette, radius, sans, type } from "@/theme";

/** The apps scan with the camera (expo-camera); the web does not (Scanner.web.tsx). */
export const canScan = true;

/** The viewfinder's corner marks: orange, 3 px, rounded. */
const CORNER = 34;

/**
 * The camera in the sheet (a viewfinder within it): QR codes only, the first one read is handed
 * over once. Asks for the camera the first time; refused, it says where to allow it.
 */
export function Scanner({
  onScanned,
  onCancel
}: {
  onScanned: (data: string) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraAsked();
  // The camera reports a code at every frame it sees it: only the first counts.
  const done = useRef(false);

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (done.current || !data) return;
    done.current = true;
    onScanned(data);
  };

  let body;
  if (!permission) {
    body = <Spinner size={22} />;
  } else if (!permission.granted) {
    body = (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>{t("wallet.sendSheet.scanDenied")}</Text>
        {permission.canAskAgain ? (
          <Button variant="secondary" size="md" fullWidth={false} onPress={requestPermission}>
            {t("wallet.sendSheet.scanAllow")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={() => void openSystemSettings()}
          >
            {t("wallet.sendSheet.scanSettings")}
          </Button>
        )}
      </View>
    );
  } else {
    body = (
      <>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned}
        />
        <View style={styles.finder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
      </>
    );
  }

  return (
    <View style={styles.root} testID="send-scanner">
      <Text style={styles.hint}>{t("wallet.sendSheet.scanHint")}</Text>
      <View style={styles.frame}>{body}</View>
      <Button variant="secondary" size="md" icon="keyboard" onPress={onCancel}>
        {t("wallet.sendSheet.scanType")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: 16 },
  hint: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: type.prose * 1.5,
    color: colors.text.secondary
  },
  frame: {
    height: 320,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.background.app,
    alignItems: "center",
    justifyContent: "center"
  },
  finder: { width: 200, height: 200, pointerEvents: "none" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: palette.orange },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 14
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 14
  },
  denied: { alignItems: "center", gap: 16, paddingHorizontal: 22 },
  deniedText: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: type.prose * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
