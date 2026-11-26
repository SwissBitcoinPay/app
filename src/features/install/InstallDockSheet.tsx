import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { RichText } from "@/components/ui/RichText";
import { Sheet } from "@/components/ui/Sheet";
import { makeStyles, radius, sans, space, type } from "@/theme";

/**
 * "Add sattle.me to the Dock", Safari on a Mac (install-target.ts): Safari has no install prompt a
 * page can open, so the steps instead, as Apple words them ("Use Safari web apps on Mac": File >
 * Add to Dock, then Add; macOS Sonoma or later), and what the web app of the Dock does not take
 * from Safari: its data, only its cookies copied (WebKit, "WebKit Features in Safari 17.0"), so its
 * owner logs in again there with the passkey.
 */
export function InstallDockSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const steps = [t("install.dock.menu"), t("install.dock.add")];
  return (
    <Sheet
      title={t("install.dock.title")}
      closeLabel={t("navigation.close")}
      visible={visible}
      onClose={onClose}
      testID="install-dock"
    >
      <View style={styles.body}>
        {steps.map((step, index) => (
          <View key={index} style={styles.step}>
            <View style={styles.number}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <RichText style={styles.stepText}>{step}</RichText>
          </View>
        ))}
        <Text style={styles.note}>{t("install.dock.requirement")}</Text>
        <Callout tone="warning" icon="key" testID="install-dock-passkey">
          {t("install.dock.passkey")}
        </Callout>
        <Button variant="secondary" size="sm" onPress={onClose} testID="install-dock-done">
          {t("install.dock.done")}
        </Button>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { gap: space[6], paddingBottom: space[5] },
  step: { flexDirection: "row", alignItems: "center", gap: space[5] },
  number: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center"
  },
  numberText: { ...sans(700), fontSize: type.label, color: colors.text.primary },
  stepText: { ...sans(500), flex: 1, fontSize: type.sats, color: colors.text.primary },
  note: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
