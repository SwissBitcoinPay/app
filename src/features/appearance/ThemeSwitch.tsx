import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { logFailure } from "@/lib/log/log";
import { useTheme } from "@/theme";

import { toggledPreference } from "./theme-format";
import { saveThemePreference, useThemePreferenceChoice } from "./theme-preference";

/**
 * The payer's page of a payment link: a switch in its header to the other theme than the one drawn,
 * the moon in the light theme, the sun in the dark one. The page follows the device until the payer
 * switches it ("Automatic", the default), and again once they switch back to the device's own theme
 * (toggledPreference): saved in their browser as this device's "Theme". In the apps, under a theme
 * chosen, React Native tells that theme as the device's (scheme-override.ts): the switch then goes
 * from one theme to the other.
 */
export function ThemeSwitch() {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const device = useColorScheme() === "dark" ? "dark" : "light";
  const preference = useThemePreferenceChoice();
  const [saving, setSaving] = useState(false);
  const toggle = () => {
    if (saving) return;
    setSaving(true);
    saveThemePreference(toggledPreference(scheme, device))
      .catch((error: unknown) => logFailure("Saving the theme failed", error))
      .finally(() => setSaving(false));
  };
  return (
    <IconButton
      icon={scheme === "dark" ? "sun" : "moon"}
      label={t(scheme === "dark" ? "paymentLink.themeToLight" : "paymentLink.themeToDark")}
      onPress={toggle}
      disabled={preference === null || saving}
      testID="theme-switch"
    />
  );
}
