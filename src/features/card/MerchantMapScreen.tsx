import { useIsFocused, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { openExternal } from "@/components/ui/external-link";
import { MERCHANT_MAP_URL } from "@/config/merchant-map";
import { PosFrame } from "@/features/terminal/PosFrame";
import { makeStyles, radius, sans, tracked, type } from "@/theme";

import { MerchantMap } from "./MerchantMap";

/**
 * "Where to pay with your card", from the map's icon in the header of "Cards": BTC Map's map of the
 * merchants that take a BoltCard (MerchantMap.tsx). On a phone, over the whole window (no dock):
 * its header says whose map it is, "Back" on its left and BTC Map in the browser on its right; the
 * map from edge to edge under it, to the window's bottom edge (isMobileEdgeToEdgeRoute: BTC Map's
 * page keeps its own controls above the home indicator or the navigation bar). On a computer,
 * beside the side bar: the page's header, the map in a card filling the page.
 *
 * The map only while this screen shows: another destination of the side bar keeps it mounted,
 * hidden (AppShell's tabs), where BTC Map's page would go on running (its calls, the position it
 * may watch). Shown again, its page loads anew.
 */
export function MerchantMapScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  const focused = useIsFocused();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  return (
    <PosFrame
      title={
        <View style={styles.titles}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {t("cards.map.title")}
          </Text>
          <Text numberOfLines={1} style={styles.source}>
            {t("cards.map.source")}
          </Text>
        </View>
      }
      leading={{
        icon: "arrow-left",
        label: t("common.back"),
        onPress: back,
        testID: "merchant-map-back"
      }}
      trailing={{
        icon: "arrow-up-right-from-square",
        label: t("cards.map.openInBrowser"),
        onPress: () => openExternal(MERCHANT_MAP_URL),
        testID: "merchant-map-open"
      }}
      desktopTitle={t("cards.map.title")}
      subtitle={t("cards.map.desktopSubtitle")}
      desktopAside={
        <View style={styles.desktopActions}>
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-left"
            fullWidth={false}
            onPress={back}
            testID="merchant-map-back-desktop"
          >
            {t("common.back")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-up-right-from-square"
            fullWidth={false}
            onPress={() => openExternal(MERCHANT_MAP_URL)}
            testID="merchant-map-open-desktop"
          >
            {t("cards.map.openSite")}
          </Button>
        </View>
      }
      flush="mobile"
      toWindowEdge
      contentStyle={desktop ? styles.desktopBody : undefined}
    >
      <View style={desktop ? styles.desktopMap : styles.map} testID="merchant-map-screen">
        {focused ? <MerchantMap /> : null}
      </View>
    </PosFrame>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  titles: { alignItems: "center", gap: 1 },
  title: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  source: { ...sans(500), fontSize: type.meta, color: colors.text.secondary },
  desktopActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  // The page's body: the map from its top, as wide as the page (not the frame's centred body).
  desktopBody: { alignItems: "stretch", justifyContent: "flex-start" },
  map: { flex: 1 },
  desktopMap: {
    flex: 1,
    minHeight: 520,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card,
    backgroundColor: colors.background.surface
  }
}));
