import { Stack } from "expo-router";

import { useTheme } from "@/theme";

/**
 * "Wallet", then what it opens on top: "New invoice" and an invoice's details. On
 * mobile they take the whole window, without the dock (AppShell, `isMobileFullScreenRoute`); on
 * desktop the side bar stays.
 */
export default function WalletLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.app }
      }}
    />
  );
}
