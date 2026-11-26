import { Stack } from "expo-router";

import { useTheme } from "@/theme";

/**
 * The point of sale: the keypad, then the invoice. Its
 * profile and state come from the app's layout (`(app)/_layout.tsx`), which also draws the
 * navigation around it.
 */
export default function PosLayout() {
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
