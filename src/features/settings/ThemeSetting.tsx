import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import type { IconName } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ThemePreference } from "@/features/appearance/theme-format";
import {
  saveThemePreference,
  useThemePreferenceChoice
} from "@/features/appearance/theme-preference";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { logFailure } from "@/lib/log/log";

import { SettingBlock } from "./fields";
import { useSettingsSaved } from "./parts";

/** The choices, in the order the control shows them: the device's own last, the default. */
const CHOICES: readonly { value: ThemePreference; icon: IconName }[] = [
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
  { value: "system", icon: "circle-half-stroke" }
];

/** Each choice's name in the control. */
const LABELS = {
  light: "settings.theme.light",
  dark: "settings.theme.dark",
  system: "settings.theme.system"
} as const satisfies Record<ThemePreference, string>;

/** Each choice as "Display"'s card on a phone says it. */
const SUMMARIES = {
  light: "settings.theme.summaryLight",
  dark: "settings.theme.summaryDark",
  system: "settings.theme.summarySystem"
} as const satisfies Record<ThemePreference, string>;

/** What "Display"'s card says on a phone: the theme chosen; nothing until read. */
export function themeSummary(t: TFunction, preference: ThemePreference | null): string | undefined {
  return preference === null ? undefined : t(SUMMARIES[preference]);
}

/**
 * "Theme": "Light", "Dark" or
 * "Automatic", the device's own theme, by default (src/features/appearance/). This device's
 * choice, as "Currency shown first": saved at once, the whole app taking its theme as soon
 * as it is saved, through a crossfade (theme-crossfade.ts); not read yet, or being saved, the control waits.
 */
export function ThemeSetting() {
  const { t } = useTranslation();
  const saved = useSettingsSaved();
  const { notify } = useNotifications();
  const stored = useThemePreferenceChoice();
  const [saving, setSaving] = useState<ThemePreference | null>(null);
  const shown = saving ?? stored;
  const pick = (preference: ThemePreference) => {
    if (preference === stored || saving !== null) return;
    setSaving(preference);
    saveThemePreference(preference)
      .then(
        () => saved("settings-theme", t("settings.theme.savedTitle"), t(LABELS[preference])),
        (error: unknown) => {
          logFailure("Saving the theme failed", error);
          notify({
            tone: "error",
            title: t("settings.saveFailedTitle"),
            body: t("settings.theme.saveFailed"),
            key: "settings-theme"
          });
        }
      )
      .finally(() => setSaving(null));
  };
  return (
    <SettingBlock
      title={t("settings.theme.title")}
      description={t("settings.theme.description")}
      testID="theme-block"
    >
      <SegmentedControl<ThemePreference>
        label={t("settings.theme.title")}
        options={CHOICES.map(({ value, icon }) => ({ value, icon, label: t(LABELS[value]) }))}
        value={shown}
        onChange={pick}
        disabled={shown === null || saving !== null}
        style={styles.control}
        testID="theme"
      />
    </SettingBlock>
  );
}

const styles = StyleSheet.create({
  control: { alignSelf: "flex-start" }
});
