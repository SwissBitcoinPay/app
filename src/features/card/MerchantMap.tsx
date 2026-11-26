import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Spinner } from "@/components/ui/Spinner";
import { openExternal } from "@/components/ui/external-link";
import { MERCHANT_MAP_URL } from "@/config/merchant-map";
import { logFailure } from "@/lib/log/log";
import { gutter, makeStyles, sans, space, tracked, type } from "@/theme";

import { mapNavigation, mapWindowOpens } from "./merchant-map";

/**
 * Every URL reaches `onShouldStartLoadWithRequest` (mapNavigation decides): with its default list,
 * react-native-webview would open any page out of it outside the app by itself, whatever its scheme.
 */
const ALL_ORIGINS = ["*"];

/**
 * How long "Loading the map…" waits alone. The view's load ends with BTC Map's document
 * and scripts (its tiles come after); a slow network, abroad, may take long, and its error may
 * come later still.
 */
const SLOW_MS = 15_000;

/**
 * The merchant map (src/config/merchant-map.ts): BTC Map's page of the merchants that take a
 * BoltCard, in a WebView, as wide and tall as its frame. Its page is a third party's: it gets no
 * bridge to the app (no `onMessage`), no file, no window of its own, no third-party cookie, and
 * navigates to BTC Map's pages only; its other links leave the app (mapNavigation).
 *
 * The device's position is optional: BTC Map's page asks for it only when its holder taps one of
 * its buttons for it ("locate", precise distances, as its code reads). The system
 * then asks the holder (app.config.ts: Android's location permissions, iOS' usage description);
 * refused, the map works without it. On Android, react-native-webview asks for the precise
 * position only (14.0.1): Android 12+ offers precise or approximate, and the page gets a refusal
 * when the approximate one is chosen.
 *
 * Shown while its page loads: "Loading the map…", and past SLOW_MS, BTC Map in the
 * browser too (its load goes on: nothing says it failed). A page that could not load, or whose web
 * process ended (Android's renderer, iOS' content process: the app would otherwise crash on
 * Android, or show a blank page on iOS), says so, with "Try again", which loads it in a new view:
 * the failed one is unmounted.
 */
export function MerchantMap({ testID }: { testID?: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"loading" | "shown" | "failed">("loading");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  const fail = (event: string, error: unknown) => {
    logFailure(event, error);
    setPhase("failed");
  };
  if (phase === "failed") {
    return (
      <View style={styles.failed} testID={testID}>
        <Callout tone="error" title={t("cards.map.failedTitle")} testID="merchant-map-failed">
          {t("cards.map.failedBody")}
        </Callout>
        <Button
          variant="secondary"
          icon="arrows-rotate"
          onPress={() => {
            setSlow(false);
            setPhase("loading");
          }}
          testID="merchant-map-retry"
        >
          {t("cards.retry")}
        </Button>
        <Button
          variant="text"
          onPress={() => openExternal(MERCHANT_MAP_URL)}
          testID="merchant-map-browser"
        >
          {t("cards.map.openInBrowser")}
        </Button>
      </View>
    );
  }
  return (
    <View style={styles.root} testID={testID}>
      <WebView
        source={{ uri: MERCHANT_MAP_URL }}
        originWhitelist={ALL_ORIGINS}
        onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
          const next = mapNavigation(url, isTopFrame);
          if (next === "external") openExternal(url);
          return next === "load";
        }}
        // A link opening a window (`target="_blank"`): outside the app, never in this view.
        onOpenWindow={({ nativeEvent }) => {
          if (mapWindowOpens(nativeEvent.targetUrl)) openExternal(nativeEvent.targetUrl);
        }}
        onLoad={() => setPhase((current) => (current === "loading" ? "shown" : current))}
        // iOS names its error's domain (NSURLErrorDomain…), Android none. The journal keeps a code
        // of three digits at most: Android's (-2: host not found), not iOS' (-1009: offline).
        onError={({ nativeEvent }) =>
          fail("Loading the merchants' map failed", {
            name: nativeEvent.domain ?? "WebViewError",
            code: nativeEvent.code
          })
        }
        // The page's own document only (react-native-webview: its main frame).
        onHttpError={({ nativeEvent }) =>
          fail("Loading the merchants' map failed", {
            name: "HttpError",
            code: nativeEvent.statusCode
          })
        }
        onRenderProcessGone={() =>
          fail("The merchants' map's web process ended", { name: "RenderProcessGone" })
        }
        onContentProcessDidTerminate={() =>
          fail("The merchants' map's web process ended", { name: "ContentProcessTerminated" })
        }
        // Android: the page's `navigator.geolocation` (iOS' WKWebView has it on its own).
        geolocationEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        thirdPartyCookiesEnabled={false}
        allowFileAccess={false}
        allowsLinkPreview={false}
        style={styles.view}
        testID="merchant-map-view"
      />
      {phase === "loading" ? (
        <View style={styles.loading} testID="merchant-map-loading">
          <Spinner size={22} />
          <Text style={styles.loadingLabel}>{t("cards.map.loading")}</Text>
          {slow ? (
            <Button
              variant="text"
              onPress={() => openExternal(MERCHANT_MAP_URL)}
              testID="merchant-map-slow-browser"
            >
              {t("cards.map.openInBrowser")}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1 },
  view: { flex: 1, backgroundColor: colors.background.app },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: space[5],
    backgroundColor: colors.background.app
  },
  loadingLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  failed: { flex: 1, paddingHorizontal: gutter, paddingTop: space[4], gap: space[5] }
}));
