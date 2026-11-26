import * as Notifications from "expo-notifications";
import type { TFunction } from "i18next";
import { Platform } from "react-native";

import { logFailure } from "@/lib/log/log";
import type { RecoveryCheck } from "@/lib/settings/merchant";

import { plannedReminders, type RecoveryReminder } from "./policy";

/*
 * The check of the 12 words told by the phone itself, the app closed too: local notifications at
 * the dates the check gives (policy.ts plannedReminders), an
 * invitation when the next check may start (neutral: under the threshold by then, nothing is due),
 * then 7 days before its end, the day before and its end; tapped, each leads to "Check your 12
 * words" (subscribeReminderTaps). Whenever the
 * check changes on this device (a check due, the words checked here or on another of the owner's
 * devices once this one reads the account), they are all taken back and planned again: checked,
 * none of the others comes. Planned only where notifications are allowed: the permission is asked
 * once, after the app's setup ("Stay informed", src/features/notification-offer/), and as a card
 * is paired; refused, the banner in the app says it alone. The words never in them, nor an amount:
 * a phone's lock screen shows them.
 */

/** Of every notification of the check, to take them back (never another of the app's). */
export const RECOVERY_REMINDER_PREFIX = "recovery-check-";

/** Android's channel of the check's notifications. Never renamed: the system keeps its settings. */
export const RECOVERY_REMINDERS_CHANNEL = "recovery-check";

/** Plans the notifications of `check` as of `now` (Unix seconds), in place of those planned. */
export async function planRecoveryReminders(
  check: RecoveryCheck,
  now: number,
  t: TFunction
): Promise<void> {
  try {
    await cancelRecoveryReminders();
    const planned = plannedReminders(check, now);
    if (planned.length === 0) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await createRecoveryRemindersChannel(t);
    for (const reminder of planned) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${RECOVERY_REMINDER_PREFIX}${reminder.kind}`,
        content: { ...reminderText(reminder, t), data: { kind: "recoveryCheck" } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.at * 1000,
          channelId: RECOVERY_REMINDERS_CHANNEL
        }
      });
    }
  } catch (error) {
    // The banner in the app still says it.
    logFailure("Planning the check's notifications failed", error);
  }
}

/**
 * Android's channel of the check's notifications (none elsewhere): before they are planned, and
 * before the permission is asked ("Stay informed": Android 13 asks only once an app has one).
 */
export async function createRecoveryRemindersChannel(t: TFunction): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(RECOVERY_REMINDERS_CHANNEL, {
    name: t("recoveryCheck.reminders.channel"),
    // As IosAuthorizationStatus in push.ts.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.DEFAULT
  });
}

/** Whether `notification` is one of the check's (planRecoveryReminders' `data`). */
function isReminder(notification: Notifications.Notification): boolean {
  return notification.request.content.data?.kind === "recoveryCheck";
}

/**
 * Calls `onTap` for each of the check's notifications tapped (it
 * leads to "Check your 12 words", AppShell.tsx): the one the app was opened with, then those
 * tapped while it runs. Never another of the app's (the card payments', useCardWakes.ts). Returns
 * what stops it.
 */
export function subscribeReminderTaps(onTap: () => void): () => void {
  const take = (response: Notifications.NotificationResponse | null) => {
    if (!response || !isReminder(response.notification)) return;
    Notifications.clearLastNotificationResponse();
    onTap();
  };
  take(Notifications.getLastNotificationResponse());
  const responses = Notifications.addNotificationResponseReceivedListener(take);
  return () => responses.remove();
}

/** Takes back every notification of the check planned on this phone ("Log out"). */
export async function cancelRecoveryReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.identifier.startsWith(RECOVERY_REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
}

function reminderText(reminder: RecoveryReminder, t: TFunction): { title: string; body: string } {
  switch (reminder.kind) {
    case "start":
      return {
        title: t("recoveryCheck.reminders.startTitle"),
        body: t("recoveryCheck.reminders.startBody")
      };
    case "week":
      return {
        title: t("recoveryCheck.reminders.weekTitle"),
        body: t("recoveryCheck.reminders.soonBody")
      };
    case "eve":
      return {
        title: t("recoveryCheck.reminders.eveTitle"),
        body: t("recoveryCheck.reminders.soonBody")
      };
    case "day":
      return {
        title: t("recoveryCheck.reminders.dayTitle"),
        body: t("recoveryCheck.reminders.dayBody")
      };
  }
}
