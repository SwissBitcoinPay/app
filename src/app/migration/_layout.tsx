import { Stack } from "expo-router";

import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { useTheme } from "@/theme";

/**
 * The migration of a v2 device (Swiss Bitcoin Pay) to sattle.me (src/features/migration/): its
 * screens, under the notifications the passkey's flow gives (a dismissed prompt), as the welcome
 * screen's.
 */
export default function MigrationLayout() {
  const { colors } = useTheme();
  return (
    <NotificationsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background.app }
        }}
      />
    </NotificationsProvider>
  );
}
