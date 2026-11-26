import { Redirect, Stack } from "expo-router";
import { View } from "react-native";

import { getAccountSettings } from "@/features/account/session";
import { OnboardingHeader } from "@/features/onboarding/OnboardingHeader";
import { OnboardingProvider } from "@/features/onboarding/state";
import { makeStyles, useTheme } from "@/theme";

/**
 * Sign-up steps after the passkey: the split (+ the Mt Pelerin login and the bank details with a
 * fiat share) from "Create my account", or the card's pairing from "A BoltCard", then the
 * setup screen (src/features/onboarding/steps.ts). Their header is drawn here, above the
 * stack: it stays in place while the steps change under it.
 *
 * The steps save into the open account: without one (a reload of the web app, a link), the
 * welcome screen signs in first, then resumes the sign-up where it stopped.
 */
export default function OnboardingLayout() {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!getAccountSettings()) return <Redirect href="/" />;
  return (
    <OnboardingProvider>
      <View style={styles.frame}>
        <OnboardingHeader />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.app }
          }}
        />
      </View>
    </OnboardingProvider>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: { flex: 1, backgroundColor: colors.background.app }
}));
