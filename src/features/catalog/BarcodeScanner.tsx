import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { OverlayModal } from "@/components/ui/overlay";
import { Spinner } from "@/components/ui/Spinner";
import { useCameraAsked } from "@/features/media/camera-permission";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { productBarcode } from "@/lib/catalog/open-food-facts";
import { logFailure } from "@/lib/log/log";
import { openSystemSettings } from "@/lib/system-ui";
import {
  gutter,
  makeStyles,
  palette,
  proseLineHeight,
  radius,
  sans,
  space,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { isBarcodeEngineReady, prepareBarcodeEngine } from "./barcode-engine";
import { useScanBeep } from "./scan-beep";

export { useCanScanBarcodes } from "./camera-available";

/** The window over the camera: 290 × 190, a white frame. */
const WINDOW = { width: 290, height: 190 } as const;

/**
 * "Scan a barcode": the camera over the whole screen, a window in its middle, then a cream panel:
 * what to do and "Enter without a barcode". The barcodes of packaged products only (EAN-8, EAN-13,
 * UPC-A); the first one read is handed over once, with a till's beep, and the form shows again at
 * once: Open Food Facts is asked from there, when the owner allows it (product-lookup.ts). Asks for
 * the camera the first time; refused, it says where to allow it.
 */
export function BarcodeScanner({
  visible,
  onScanned,
  onManual,
  onClose
}: {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // "Look up scanned products": what follows the scan, said as it is. The account is open here
  // ("Items"); not read, as off: never promised.
  const lookup = useAccountSettings()?.productLookup ?? false;
  // Here, not in the camera: the camera unmounts as the scanner closes, the beep still sounding.
  const beep = useScanBeep();
  const read = (barcode: string) => {
    beep();
    onScanned(barcode);
  };
  return (
    <OverlayModal mounted={visible} visible={visible} onRequestClose={onClose}>
      <View style={styles.root} testID="barcode-scanner">
        <View style={styles.camera}>
          {visible ? <BarcodeCamera onScanned={read} once /> : null}
          <View style={[styles.header, { top: insets.top + space[3] }]}>
            <IconButton
              icon="xmark"
              tone="filled"
              label={t("navigation.close")}
              onPress={onClose}
              testID="barcode-scanner-close"
            />
            <Text style={styles.pill}>{t("articles.scanner.title")}</Text>
            <View style={styles.headerSpacer} />
          </View>
        </View>
        <View style={[styles.panel, { paddingBottom: insets.bottom + space[7] }]}>
          <View style={styles.texts}>
            <Text accessibilityRole="header" style={styles.title}>
              {t("articles.scanner.aim")}
            </Text>
            <Text style={styles.lead}>
              {t(lookup ? "articles.scanner.lead" : "articles.scanner.leadNoLookup")}
            </Text>
          </View>
          <Button variant="text" size="md" onPress={onManual} testID="barcode-scanner-manual">
            {t("articles.scanner.manual")}
          </Button>
        </View>
      </View>
    </OverlayModal>
  );
}

/**
 * The camera over its whole box, reading the barcodes of packaged products (EAN-8, EAN-13, UPC-A)
 * behind the window, with what to do when the camera is not allowed. `once`: the first code read
 * only, until it unmounts ("New item"); else every code the camera reports, at every frame it sees
 * it (the point of sale's scan, src/features/terminal/ScanPad.tsx, tells a code still in view). A
 * camera that cannot start (a device without one: the apps have no way to tell before) says so. On
 * the web, the camera shows once the barcode reader is loaded (barcode-engine.web.ts), which a
 * failure (offline) says, with "Try again".
 */
export function BarcodeCamera({
  onScanned,
  once = false
}: {
  onScanned: (barcode: string) => void;
  once?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraAsked();
  const [unavailable, setUnavailable] = useState(false);
  const [engine, setEngine] = useState<"loading" | "ready" | "failed">(() =>
    isBarcodeEngineReady() ? "ready" : "loading"
  );
  useEffect(() => {
    if (engine !== "loading") return;
    let alive = true;
    prepareBarcodeEngine().then(
      () => alive && setEngine("ready"),
      // Told by the engine's own journal entry (barcode-engine.web.ts).
      () => alive && setEngine("failed")
    );
    return () => {
      alive = false;
    };
  }, [engine]);
  // The camera reports a code at every frame it sees it: with `once`, the first one only, until
  // the scanner closes (this camera unmounts with it).
  const busy = useRef(false);

  const scanned = ({ data }: BarcodeScanningResult) => {
    const barcode = data ? productBarcode(data) : null;
    if (busy.current || !barcode) return;
    if (once) busy.current = true;
    onScanned(barcode);
  };

  if (!permission || engine === "loading") {
    return (
      <View style={styles.center}>
        <Spinner size={22} rail={colors.onDark.ring} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.deniedText}>
          {/* A browser asks again only once allowed in its own settings (the site's permissions). */}
          {Platform.OS === "web" ? t("articles.scanner.deniedWeb") : t("articles.scanner.denied")}
        </Text>
        {Platform.OS === "web" || permission.canAskAgain ? (
          <Button variant="secondary" size="md" fullWidth={false} onPress={requestPermission}>
            {t("articles.scanner.allow")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={() => void openSystemSettings()}
          >
            {t("articles.scanner.settings")}
          </Button>
        )}
      </View>
    );
  }
  if (unavailable) {
    return (
      <View style={styles.center} testID="barcode-camera-unavailable">
        <Text style={styles.deniedText}>{t("articles.scanner.unavailable")}</Text>
      </View>
    );
  }
  if (engine === "failed") {
    return (
      <View style={styles.center} testID="barcode-engine-failed">
        <Text style={styles.deniedText}>{t("articles.scanner.engineFailed")}</Text>
        <Button
          variant="secondary"
          size="md"
          fullWidth={false}
          onPress={() => setEngine("loading")}
          testID="barcode-engine-retry"
        >
          {t("articles.scanner.retry")}
        </Button>
      </View>
    );
  }
  return (
    <>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a"] }}
        onBarcodeScanned={scanned}
        onMountError={() => {
          logFailure("Starting the camera failed");
          setUnavailable(true);
        }}
      />
      <View style={styles.center}>
        <View style={styles.window}>
          <View style={styles.line} />
        </View>
      </View>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: palette.ink },
  camera: { flex: 1, overflow: "hidden" },
  header: {
    position: "absolute",
    left: gutter,
    right: gutter,
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerSpacer: { width: 44 },
  pill: {
    ...sans(600),
    height: 32,
    lineHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.ink,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: palette.white
  },
  center: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space[6],
    paddingHorizontal: gutter,
    pointerEvents: "box-none"
  },
  window: {
    width: WINDOW.width,
    height: WINDOW.height,
    borderWidth: 2,
    borderColor: palette.white,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none"
  },
  // The reading line: orange is a fill (2 px across the window, 18 px from its sides).
  line: { position: "absolute", left: 18, right: 18, height: 2, backgroundColor: palette.orange },
  deniedText: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: palette.white,
    textAlign: "center"
  },
  // The cream panel over the camera's bottom edge (26 px corners, 26 px over it).
  panel: {
    marginTop: -radius.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.background.app,
    paddingTop: 18,
    paddingHorizontal: gutter,
    gap: 14
  },
  texts: { gap: 6, paddingTop: 4 },
  title: {
    ...sans(700),
    fontSize: 20,
    letterSpacing: tracking(TITLE_EM, 20),
    color: colors.text.primary
  },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  }
}));
