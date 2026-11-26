import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { Switch } from "@/components/ui/Switch";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { logFailure } from "@/lib/log/log";
import { ownerProfile, type TerminalProfile } from "@/lib/terminal/model";

import { useAppLock } from "./AppLock";
import { saveAppLock, useAppLockChoice } from "./preference";

/**
 * "Ask for biometrics to unlock the app" in "Settings" (preference.ts): its switch and caption. The
 * apps only (`visible`): the web has no lock of its own; a business's device only, the only one
 * with that lock (AppLock.tsx). `editable` only with the account open: greyed in till mode
 * (LockedSettings.tsx), and on a device without any lock, which cannot ask. The value being saved
 * shows meanwhile; not read yet, the switch waits.
 */
export function useAppLockSwitch(
  profile: TerminalProfile | null,
  editable: boolean
): { visible: boolean; caption: string; control: ReactNode } {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const walletId = ownerProfile(profile)?.walletId ?? null;
  const saved = useAppLockChoice(walletId);
  const { available } = useAppLock();
  const [saving, setSaving] = useState<boolean | null>(null);
  const on = saving ?? saved ?? false;

  const toggle = (value: boolean) => {
    if (walletId === null) return;
    setSaving(value);
    saveAppLock(walletId, value)
      .catch((error: unknown) => {
        logFailure("Saving the app lock choice failed", error);
        notify({
          tone: "error",
          title: t("settings.saveFailedTitle"),
          body: t("settings.unlock.saveFailed"),
          key: "settings-unlock"
        });
      })
      .finally(() => setSaving(null));
  };

  return {
    visible: Platform.OS !== "web" && walletId !== null,
    caption:
      available === false
        ? t("settings.unlock.captionUnavailable")
        : on
          ? t("settings.unlock.captionOn")
          : t("settings.unlock.captionOff"),
    control: (
      <Switch
        value={on && available !== false}
        onValueChange={toggle}
        label={t("settings.unlock.title")}
        disabled={!editable || available === false}
        loading={saving !== null || saved === null}
        testID="unlock-asks-switch"
      />
    )
  };
}
