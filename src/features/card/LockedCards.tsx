import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Lead } from "@/components/ui/Heading";
import { useHeaderNavigation } from "@/features/navigation/header-navigation";
import { useShellUnlock } from "@/features/navigation/unlock-context";
import { PosFrame } from "@/features/terminal/PosFrame";
import { makeStyles, radius, sans, space, tracked, type, useTheme } from "@/theme";

/**
 * "Cards" in till mode on a card holder's device: where the app opens, before the passkey. Nothing
 * of the cards shows (their states, balances and keys need the open account); "Unlock" asks the
 * passkey, then the cards
 * show, the screen a link named in place (AppShell). As the phone's app opens, the passkey is
 * asked without a press (navigation/launch-unlock.ts): this shows behind its prompt, and stays
 * when it was refused. On a phone, "Settings" (reduced) from the header, as unlocked
 * (header-navigation.ts).
 */
export function LockedCards() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const shell = useShellUnlock();
  const headerNavigation = useHeaderNavigation();
  return (
    <PosFrame
      title={t("cards.title")}
      desktopTitle={t("cards.title")}
      trailing={headerNavigation?.settings}
    >
      <View style={styles.body} testID="cards-locked">
        <View style={styles.mark}>
          <Icon name="lock" size={22} color={colors.text.secondary} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {t("cards.locked.title")}
        </Text>
        <Lead style={styles.lead}>{t("cards.locked.body")}</Lead>
        <Button
          icon="lock-open"
          fullWidth={!desktop}
          loading={shell?.unlocking ?? false}
          disabled={shell === null || shell.preparing}
          onPress={() => shell?.unlock("cards")}
          style={desktop ? styles.desktopButton : undefined}
          testID="cards-unlock"
        >
          {t("settings.locked.unlock")}
        </Button>
      </View>
    </PosFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingVertical: space[6],
    maxWidth: 420,
    width: "100%",
    alignSelf: "center"
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.subtle
  },
  title: {
    ...sans(700),
    marginTop: space[2],
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary,
    textAlign: "center"
  },
  lead: { textAlign: "center", marginBottom: space[3] },
  // Centred as the lines over it: a button as wide as its label aligns itself to the start.
  desktopButton: { minWidth: 240, alignSelf: "center" }
}));
