import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { nowUnix } from "@/lib/clock";

import { planRecoveryReminders } from "./reminders";

/**
 * Plans the phone's notifications of the check of the 12 words (reminders.ts) while the owner's
 * account is open (`open`: the app unlocked, AppShell.tsx), again whenever its check changes: due
 * here, the account seen above the threshold, or checked here or on another of the owner's devices (the account's settings, read from the
 * relays as it opens). Nothing during the sign-up, nor while the account is closed (till mode keeps
 * what was planned).
 */
export function useRecoveryReminders(open: boolean): void {
  const { t } = useTranslation();
  const settings = useAccountSettings();
  const ready = open && settings !== null && settings.signUp === "done";
  const verifiedAt = settings?.recoveryCheck.verifiedAt ?? null;
  const dueSince = settings?.recoveryCheck.dueSince ?? null;
  const aboveThresholdAt = settings?.recoveryCheck.aboveThresholdAt;
  useEffect(() => {
    if (!ready) return;
    const check =
      aboveThresholdAt === undefined
        ? { verifiedAt, dueSince }
        : { verifiedAt, dueSince, aboveThresholdAt };
    void planRecoveryReminders(check, nowUnix(), t);
  }, [ready, verifiedAt, dueSince, aboveThresholdAt, t]);
}
