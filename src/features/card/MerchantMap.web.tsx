import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import { MERCHANT_MAP_URL } from "@/config/merchant-map";
import { makeStyles, sans, space, tracked, type } from "@/theme";

/**
 * What BTC Map's page may do in its frame: run, keep its own storage (`allow-same-origin`: its
 * own origin, still another than the web app's), send its forms and open its links in a new tab,
 * free of the frame's limits. Never navigate the web app's page (no `allow-top-navigation`): the
 * page around it holds the wallet.
 */
const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

/**
 * The merchant map on the web app (MerchantMap.tsx, same API): BTC Map's page in a sandboxed frame.
 * Its position is optional: the frame may ask for it (`allow="geolocation"`: without it Chromium
 * refuses the page's request, sandboxed or not), and the browser asks its user when BTC Map's
 * "locate" button does. No referrer: BTC Map is not told the web app's host. A frame tells nothing
 * of a page that failed to load (the browser shows its own error in it): "Loading the map…" until
 * its first page loads, then the frame.
 */
export function MerchantMap({ testID }: { testID?: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  return (
    <View style={styles.root} testID={testID}>
      <iframe
        src={MERCHANT_MAP_URL}
        title={t("cards.map.frameTitle")}
        allow="geolocation"
        sandbox={SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        style={frameStyle}
        data-testid="merchant-map-view"
      />
      {loaded ? null : (
        <View style={styles.loading} testID="merchant-map-loading">
          <Spinner size={22} />
          <Text style={styles.loadingLabel}>{t("cards.map.loading")}</Text>
        </View>
      )}
    </View>
  );
}

/** A DOM element's style, not React Native's. */
const frameStyle = { border: 0, width: "100%", height: "100%", display: "block" } as const;

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1 },
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
  }
}));
