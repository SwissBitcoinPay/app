import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { gutter, makeStyles, radius, sans, space, tracked, type } from "@/theme";

import { InstallDockSheet } from "./InstallDockSheet";
import {
  dismissInstallBanner,
  readInstallBannerDismissed,
  startInstall,
  useInstallOffer
} from "./install-offer";
import { WEB_APP_ICON_PATH, type InstallOffer } from "./install-target";

/** Where the banner says the app is, by its offer. */
export function bannerPlaceKey(offer: InstallOffer) {
  if (offer.target === "appStore") {
    return offer.device === "ipad" ? "install.banner.ipad" : "install.banner.iphone";
  }
  if (offer.target === "googlePlay") return "install.banner.android";
  return "install.banner.computer";
}

/** The banner's action, by its offer: the stores' "Get", the computer's own words. */
export function installActionLabel(t: TFunction, offer: InstallOffer): string {
  switch (offer.target) {
    case "appStore":
    case "googlePlay":
      return t("install.banner.get");
    case "prompt":
      return t("install.banner.install");
    case "dock":
      return t("install.banner.dock");
  }
}

/**
 * The welcome screen's banner, when this browser has something to install (install-target.ts) and
 * this device's person did not close it: a strip across the top of the screen, the variant's icon,
 * "sattle.me" and where the app is, "Get" (or "Install", "Add to Dock") and a cross that closes it
 * for good on this device. Its top takes the status bar's inset (`topInset`): the screen under it
 * then starts at its bottom. Null when there is nothing to show.
 */
export function useInstallBanner({ desktop, topInset }: { desktop: boolean; topInset: number }) {
  const offer = useInstallOffer();
  const [dismissed, setDismissed] = useState(readInstallBannerDismissed);
  const [dockOpen, setDockOpen] = useState(false);
  if (!offer || dismissed) return null;
  return (
    <>
      <InstallBanner
        offer={offer}
        desktop={desktop}
        topInset={topInset}
        onInstall={() => (offer.target === "dock" ? setDockOpen(true) : startInstall(offer.target))}
        onDismiss={() => {
          dismissInstallBanner();
          setDismissed(true);
        }}
      />
      <InstallDockSheet visible={dockOpen} onClose={() => setDockOpen(false)} />
    </>
  );
}

/** The strip itself: see useInstallBanner. */
export function InstallBanner({
  offer,
  desktop,
  topInset,
  onInstall,
  onDismiss
}: {
  offer: InstallOffer;
  desktop: boolean;
  topInset: number;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={[styles.banner, { paddingTop: topInset }]} testID="install-banner">
      <View style={[styles.row, desktop && styles.rowDesktop]}>
        <IconButton
          icon="xmark"
          size={15}
          label={t("install.banner.dismiss")}
          onPress={onDismiss}
          testID="install-banner-dismiss"
        />
        <Image
          source={{ uri: WEB_APP_ICON_PATH }}
          style={styles.icon}
          accessibilityIgnoresInvertColors
        />
        <View style={[styles.texts, desktop && styles.textsDesktop]}>
          <Text style={styles.name} numberOfLines={1}>
            {t("install.banner.name")}
          </Text>
          <Text style={styles.place} numberOfLines={desktop ? 1 : 2} testID="install-banner-place">
            {t(bannerPlaceKey(offer))}
          </Text>
        </View>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={onInstall}
          style={styles.action}
          testID="install-banner-action"
        >
          {installActionLabel(t, offer)}
        </Button>
      </View>
    </View>
  );
}

/** The icon's side: a store's banner shows the app's icon about this size. */
const ICON_SIZE = 40;

const useStyles = makeStyles(({ colors }) => ({
  banner: {
    backgroundColor: colors.background.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    // The cross's 44 px target reaches the screen's edge, its glyph near the gutter.
    paddingLeft: space[2],
    paddingRight: gutter,
    paddingVertical: space[3]
  },
  // A computer: the cross, the icon, the words and the button together in the middle.
  rowDesktop: { justifyContent: "center" },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.sm - 3,
    borderWidth: 1,
    borderColor: colors.border.subtle
  },
  texts: { flex: 1, minWidth: 0, gap: 1 },
  textsDesktop: {
    flex: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space[4]
  },
  name: {
    ...sans(700),
    fontSize: type.body,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  place: { ...sans(500), flexShrink: 1, fontSize: type.caption, color: colors.text.secondary },
  // A button as wide as its label sits at the top of its row by default (Button.tsx, flex-start):
  // in the middle of the banner's height instead, whether the words take one line or two.
  action: { alignSelf: "center" }
}));
