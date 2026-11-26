import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { Switch } from "@/components/ui/Switch";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { logFailure } from "@/lib/log/log";
import {
  followObserveChoice,
  observeChoice,
  observeStarted,
  saveObserveChoice
} from "@/lib/observe/observe";

/**
 * "Send crash reports" in "Settings":
 * this device's choice of what Expo Observe sends (src/lib/observe/). The apps only (`visible`): the
 * web app sends nothing. `editable` with the account open, or on an employee's device: greyed in
 * till mode (LockedSettings.tsx), as the app's lock. The value being saved shows meanwhile; not read
 * yet, the switch waits. Without Observe (it could not start), its choice is never read: greyed,
 * never waiting for it.
 */
export function useCrashReportsSwitch(editable: boolean): { visible: boolean; control: ReactNode } {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const saved = useSyncExternalStore(followObserveChoice, observeChoice);
  const [saving, setSaving] = useState<boolean | null>(null);
  const on = saving ?? saved ?? false;
  // Started (or not) as the app starts, before any screen: it never changes while one shows.
  const started = observeStarted();

  const toggle = (value: boolean) => {
    setSaving(value);
    saveObserveChoice(value)
      .catch((error: unknown) => {
        logFailure("Saving the crash reports choice failed", error);
        notify({
          tone: "error",
          title: t("settings.saveFailedTitle"),
          body: t("settings.support.reportsSaveFailed"),
          key: "settings-reports"
        });
      })
      .finally(() => setSaving(null));
  };

  return {
    visible: Platform.OS !== "web",
    control: (
      <Switch
        value={on}
        onValueChange={toggle}
        label={t("settings.support.reports")}
        disabled={!editable || !started}
        loading={started && (saving !== null || saved === null)}
        testID="support-reports"
      />
    )
  };
}
