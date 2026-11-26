import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import type { IconName } from "@/components/ui/Icon";
import { SettingBlock } from "@/features/settings/fields";

import { InstallDockSheet } from "./InstallDockSheet";
import { startInstall, useInstallOffer } from "./install-offer";
import type { InstallOffer, InstallTarget } from "./install-target";

/** What the block says, by its offer: where the app is. */
export function settingDescriptionKey(offer: InstallOffer) {
  if (offer.target === "appStore") {
    return offer.device === "ipad"
      ? "install.setting.places.ipad"
      : "install.setting.places.iphone";
  }
  if (offer.target === "googlePlay") return "install.setting.places.android";
  return offer.target === "dock"
    ? "install.setting.places.dock"
    : "install.setting.places.computer";
}

/** The button's words, by where it leads. */
const LABELS = {
  appStore: "install.setting.appStore",
  googlePlay: "install.setting.googlePlay",
  prompt: "install.banner.install",
  dock: "install.banner.dock"
} as const satisfies Record<InstallTarget, string>;

/** Its icon: the store's mark (as AppStoreLink.tsx), or "download" on a computer. */
const ICONS: Record<InstallTarget, IconName> = {
  appStore: "apple",
  googlePlay: "android",
  prompt: "download",
  dock: "download"
};

/**
 * "Install the app" in "Settings › Display", this device's own rubric: what this browser installs
 * (install-target.ts) and its button; "Add to Dock" opens its steps (InstallDockSheet). Nothing in
 * the apps, nor in the web app installed, nor in a browser that installs nothing.
 */
export function InstallSetting() {
  const { t } = useTranslation();
  const offer = useInstallOffer();
  const desktop = useIsDesktop();
  const [dockOpen, setDockOpen] = useState(false);
  if (!offer) return null;
  const { target } = offer;
  return (
    <SettingBlock
      title={t("install.setting.title")}
      description={t(settingDescriptionKey(offer))}
      testID="install-block"
    >
      <View style={styles.row}>
        <Button
          variant="secondary"
          size="sm"
          icon={ICONS[target]}
          fullWidth={!desktop}
          onPress={() => (target === "dock" ? setDockOpen(true) : startInstall(target))}
          testID="install-action"
        >
          {t(LABELS[target])}
        </Button>
      </View>
      <InstallDockSheet visible={dockOpen} onClose={() => setDockOpen(false)} />
    </SettingBlock>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" }
});
