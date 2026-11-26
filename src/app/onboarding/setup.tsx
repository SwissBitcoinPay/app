import { Redirect, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StepScreen } from "@/components/layout/StepScreen";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Spinner } from "@/components/ui/Spinner";
import { getAccountSettings } from "@/features/account/session";
import { accountRoutes } from "@/features/onboarding/steps";
import { useAccountSetup } from "@/features/onboarding/useAccountSetup";
import { gutter, makeStyles, sans, space, tracked, type } from "@/theme";

/**
 * After "Start accepting payments" (useFinishSignUp) or the card step: this device is prepared
 * (useAccountSetup: a merchant's point of sale, a card holder's device), `Spinner` in the middle of
 * the screen and what is being done in words, then the point of sale opens ("Cards" for a card
 * holder). A failure says so, with "Try again"; the header's back button then leads to the last
 * step. On a computer, the title at the height every step has it, 24 px
 * under the header (it never moves from one step to the next), what is
 * being done under it, then the spinner, all centred in the column, as a failure's title and
 * message, on a phone too.
 *
 * Only for an account whose sign-up is done: opened otherwise (a link), it leads to the step the
 * sign-up stopped at, as a login would.
 */
export default function SetupScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { failed, retry } = useAccountSetup();
  const settings = getAccountSettings();

  if (settings && settings.signUp !== "done") {
    return <Redirect href={accountRoutes(settings).at(-1) ?? "/"} />;
  }
  // A card holder's device has no point of sale, nor Lightning address of its own to prepare.
  const card = settings?.usage === "card";
  const description = t(card ? "setup.cardDescription" : "setup.description");
  const failure = t(card ? "account.errors.deviceFailed" : "account.errors.terminalFailed");

  if (desktop) {
    return (
      <StepScreen
        footer={
          failed ? (
            <Button icon="arrows-rotate" onPress={retry} testID="account-setup-retry">
              {t("setup.retry")}
            </Button>
          ) : undefined
        }
        testID="account-setup"
      >
        {/* iPad's swipe back would leave while the point of sale is prepared. */}
        <Stack.Screen options={{ gestureEnabled: failed }} />
        {failed ? (
          <>
            <ScreenTitle style={styles.centred}>{t("setup.failedTitle")}</ScreenTitle>
            <ErrorMessage centred style={styles.errorDesktop} testID="account-setup-failure">
              {failure}
            </ErrorMessage>
          </>
        ) : (
          <View
            style={styles.waiting}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${t("setup.title")} ${description}`}
          >
            <ScreenTitle style={styles.centred}>{t("setup.title")}</ScreenTitle>
            <Lead style={styles.centred}>{description}</Lead>
            <View style={styles.spinnerDesktop}>
              <Spinner size={44} testID="account-setup-spinner" />
            </View>
          </View>
        )}
      </StepScreen>
    );
  }

  return (
    <View
      style={[styles.screen, { paddingBottom: Math.max(insets.bottom, 20) }]}
      testID="account-setup"
    >
      {/* iOS's swipe back would leave while the point of sale is prepared. */}
      <Stack.Screen options={{ gestureEnabled: failed }} />
      <View style={styles.column}>
        {failed ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t("setup.failedTitle")}
            </Text>
            <ErrorMessage centred style={styles.error} testID="account-setup-failure">
              {failure}
            </ErrorMessage>
            <Button icon="arrows-rotate" onPress={retry} testID="account-setup-retry">
              {t("setup.retry")}
            </Button>
          </>
        ) : (
          <View
            style={styles.waiting}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${t("setup.title")} ${description}`}
          >
            <Spinner size={40} testID="account-setup-spinner" />
            <Text style={styles.title}>{t("setup.title")}</Text>
            <Lead style={styles.description}>{description}</Lead>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: gutter,
    backgroundColor: colors.background.app
  },
  column: { width: "100%", maxWidth: 440 },
  waiting: { alignItems: "center" },
  title: {
    ...sans(700),
    marginTop: space[7],
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary,
    textAlign: "center"
  },
  description: { marginTop: space[4], textAlign: "center" },
  centred: { textAlign: "center" },
  error: { marginTop: space[6], marginBottom: space[7] },
  errorDesktop: { marginTop: space[6] },
  spinnerDesktop: { marginTop: 28 }
}));
