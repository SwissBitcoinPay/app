import { useTranslation } from "react-i18next";
import { Platform, Text, View, useWindowDimensions } from "react-native";

import { CardProgramArt } from "@/components/illustrations/cards";
import { Button } from "@/components/ui/Button";
import { openExternal } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/Icon";
import { QrPlate } from "@/components/ui/QrPlate";
import { Sheet } from "@/components/ui/Sheet";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { browserDevice } from "@/lib/browser-device";
import { makeStyles, radius, sans, space, tracked, type, useTheme } from "@/theme";

import { storePhoneOf } from "./AppStoreLink";

/**
 * "Manage my BoltCard" on a device that programs no card: the web
 * app, or the app on a device without NFC (an iPad, useReadsCards.ts). Such a device creates no
 * account for the card: the account's passkey would have to reach the phone that programs it, and
 * its sync takes from seconds to more than an hour, never between ecosystems (a Windows PC and an
 * iPhone, a Mac and an Android phone). The holder gets the app on the phone instead, where the
 * account is created, and the card held to it.
 *
 * Two codes side by side under a drawing: the card held to a phone, what to do, then a code per
 * store, scanned with the phone's camera. On a phone's browser, which cannot scan its own screen, a
 * button to its store instead, the panel's one filled button, opening it in a new tab as
 * AppStoreLink does.
 * The device's words follow the browser's device, never what the sheet does (browser-device.web.ts).
 */
export function BoltCardAppSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const browser = browserDevice();
  const phone = storePhoneOf(browser);
  // An iPad, in the app or in its browser, is no computer: "this device" (card.tsx's words).
  const lead = phone
    ? t("welcome.boltCardApp.browser")
    : Platform.OS !== "web" || browser === "ipad"
      ? t("welcome.boltCardApp.device")
      : t("welcome.boltCardApp.computer");
  return (
    <Sheet
      title={t("welcome.manageBoltCard")}
      closeLabel={t("navigation.close")}
      visible={visible}
      onClose={onClose}
      dialogWidth={DIALOG_WIDTH}
      centered
      testID="boltcard-app"
    >
      <View style={styles.body}>
        {/* What the lead says, drawn: decoration only. */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.art}
        >
          <CardProgramArt size={ART_SIZE} />
        </View>
        <Text style={styles.lead}>{lead}</Text>
        {phone ? (
          <Button
            icon={phone === "android" ? "android" : "apple"}
            onPress={() => openExternal(phone === "android" ? ANDROID_APP_URL : IOS_APP_URL)}
            // Leaves the web app for the store, as AppStoreLink says it.
            accessory={(color) => (
              <Icon name="arrow-up-right-from-square" size={EXTERNAL_ICON_SIZE} color={color} />
            )}
            testID="boltcard-app-store"
          >
            {t(phone === "android" ? "appStores.googlePlay" : "appStores.appStore")}
          </Button>
        ) : (
          <StoreCodes />
        )}
      </View>
    </Sheet>
  );
}

/** A code per store, side by side, and how to scan them. */
function StoreCodes() {
  const { t } = useTranslation();
  const styles = useStyles();
  const { colors } = useTheme();
  // Two plates side by side on a narrow phone without NFC too (360 px wide): smaller codes there.
  const size = useWindowDimensions().width >= WIDE_MIN_WIDTH ? CODE_SIZE : NARROW_CODE_SIZE;
  const stores = [
    {
      key: "iphone",
      icon: "apple",
      phone: t("welcome.boltCardApp.iphone"),
      store: t("install.setting.appStore"),
      code: t("welcome.boltCardApp.codeIphone"),
      url: IOS_APP_URL
    },
    {
      key: "android",
      icon: "android",
      phone: t("welcome.boltCardApp.android"),
      store: t("install.setting.googlePlay"),
      code: t("welcome.boltCardApp.codeAndroid"),
      url: ANDROID_APP_URL
    }
  ] as const;
  return (
    <>
      <View style={styles.tiles}>
        {stores.map((store) => (
          <View key={store.key} style={styles.tile} testID={`boltcard-app-${store.key}`}>
            {/* The plate keeps to its own width (QrPlate): centred by its tile through this one. */}
            <View>
              <QrPlate
                value={store.url}
                size={size}
                elevation="flat"
                accessibilityLabel={store.code}
              />
            </View>
            <View style={styles.tileName}>
              <Icon name={store.icon} size={15} color={colors.text.primary} />
              <Text style={styles.tileTitle}>{store.phone}</Text>
            </View>
            <Text style={styles.tileStore}>{store.store}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>{t("welcome.boltCardApp.scan")}</Text>
    </>
  );
}

/** Desktop: the dialog, its two tiles side by side. */
const DIALOG_WIDTH = 560;
/** The store's button's "leaves the app" icon, as large as its leading one (Button, lg: 15). */
const EXTERNAL_ICON_SIZE = 15;
/** The drawing. */
const ART_SIZE = 112;
/** The codes; smaller below WIDE_MIN_WIDTH, where two tiles of 128 do not fit. */
const CODE_SIZE = 128;
const NARROW_CODE_SIZE = 96;
const WIDE_MIN_WIDTH = 420;

const useStyles = makeStyles(({ colors }) => ({
  body: { gap: space[6], paddingBottom: space[5] },
  art: { alignSelf: "center" },
  lead: {
    ...sans(500),
    fontSize: type.sats,
    lineHeight: 22,
    textAlign: "center",
    color: colors.text.secondary
  },
  tiles: { flexDirection: "row", gap: space[6] },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[7],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle
  },
  tileName: { flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[4] },
  tileTitle: {
    ...sans(700),
    fontSize: type.body,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  tileStore: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    textAlign: "center",
    color: colors.text.note
  }
}));
