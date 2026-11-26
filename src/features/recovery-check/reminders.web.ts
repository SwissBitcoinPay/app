import type { TFunction } from "i18next";

import type { RecoveryCheck } from "@/lib/settings/merchant";

/** Same API as reminders.ts: no local notification on the web (expo-notifications: apps only). */
export function planRecoveryReminders(
  _check: RecoveryCheck,
  _now: number,
  _t: TFunction
): Promise<void> {
  return Promise.resolve();
}

/** Same API as reminders.ts. */
export function cancelRecoveryReminders(): Promise<void> {
  return Promise.resolve();
}

/** Same API as reminders.ts: nothing planned, nothing tapped. */
export function subscribeReminderTaps(_onTap: () => void): () => void {
  return () => undefined;
}

/** Same API as reminders.ts: no channel on the web. */
export function createRecoveryRemindersChannel(_t: TFunction): Promise<void> {
  return Promise.resolve();
}
