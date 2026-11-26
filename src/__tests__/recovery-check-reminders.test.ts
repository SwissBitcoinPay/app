import "@/i18n";

import { t } from "i18next";
import { Platform } from "react-native";

import {
  RECOVERY_CHECK_WINDOW,
  nextCheckStart,
  verifiedCheck
} from "@/features/recovery-check/policy";
import {
  RECOVERY_REMINDERS_CHANNEL,
  cancelRecoveryReminders,
  planRecoveryReminders,
  subscribeReminderTaps
} from "@/features/recovery-check/reminders";
import { wipeDevice } from "@/features/settings/device-wipe";

import type * as NotificationsFake from "../../jest/expo-notifications";

/*
 * The phone's notifications of the check of the 12 words (reminders.ts): planned at the check's dates, all taken back and planned again as it changes.
 */

const notifications =
  jest.requireMock<typeof NotificationsFake>("expo-notifications").notifications;

const T = 1_795_000_000;
const DAY = 86_400;

/** The check's notifications planned: their kind and date (ms), in order. */
function planned() {
  return notifications.scheduled
    .filter((request) => request.identifier?.startsWith("recovery-check-"))
    .map((request) => ({
      id: request.identifier,
      at: (request.trigger as { date: number }).date,
      title: request.content.title
    }));
}

beforeEach(() => {
  notifications.permission = "granted";
});

describe("the check's notifications", () => {
  it("are 7 days before its end, the day before and its end, once a check is due", async () => {
    const end = T + RECOVERY_CHECK_WINDOW;

    await planRecoveryReminders({ verifiedAt: null, dueSince: T }, T, t);

    expect(planned()).toEqual([
      {
        id: "recovery-check-week",
        at: (end - 7 * DAY) * 1000,
        title: "Your payments will be blocked in 7 days"
      },
      {
        id: "recovery-check-eve",
        at: (end - DAY) * 1000,
        title: "Your payments will be blocked tomorrow"
      },
      { id: "recovery-check-day", at: end * 1000, title: "Your payments are blocked" }
    ]);
    expect(notifications.scheduled[0]!.trigger).toMatchObject({ type: "date" });
  });

  it("are taken back once the words are checked, the next check's start planned alone", async () => {
    const due = { verifiedAt: null, dueSince: T, aboveThresholdAt: T };
    await planRecoveryReminders(due, T, t);

    // Checked at once, the next day.
    await planRecoveryReminders(verifiedCheck(due, T + DAY), T + DAY, t);

    expect(planned()).toEqual([
      {
        id: "recovery-check-start",
        at: nextCheckStart(T + DAY) * 1000,
        title: "Time to check your 12 words"
      }
    ]);
    // Neutral: under the threshold by then, nothing is due nor blocked.
    expect(notifications.scheduled[0]!.content.body).toBe(
      "A year has passed: type them back in sattle.me to make sure your sheet is still right."
    );
  });

  it("plan nothing where notifications are not allowed, and take back what was planned", async () => {
    await planRecoveryReminders({ verifiedAt: null, dueSince: T }, T, t);
    notifications.permission = "denied";

    await planRecoveryReminders({ verifiedAt: null, dueSince: T }, T + DAY, t);

    expect(planned()).toEqual([]);
    expect(notifications.requests).toBe(0);
  });

  it("never take back another of the app's notifications", async () => {
    notifications.scheduled.push({
      identifier: "card-wake-1",
      content: { title: "Card payment" },
      trigger: null
    });
    await planRecoveryReminders({ verifiedAt: null, dueSince: T }, T, t);

    await cancelRecoveryReminders();

    expect(planned()).toEqual([]);
    expect(notifications.scheduled.map((request) => request.identifier)).toEqual(["card-wake-1"]);
  });

  it("go in a channel of their own on Android", async () => {
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await planRecoveryReminders({ verifiedAt: null, dueSince: T }, T, t);
    } finally {
      android.restore();
    }

    expect(notifications.channels.get(RECOVERY_REMINDERS_CHANNEL)).toMatchObject({
      name: "Recovery phrase"
    });
    expect(notifications.scheduled[0]!.trigger).toMatchObject({
      channelId: RECOVERY_REMINDERS_CHANNEL
    });
  });

  it('are taken back at "Log out", with everything else of the device', async () => {
    await planRecoveryReminders({ verifiedAt: T, dueSince: null, aboveThresholdAt: T }, T, t);
    expect(planned()).toHaveLength(1);

    await wipeDevice();

    expect(planned()).toEqual([]);
  });

  it("plan no invitation for an account never seen above the threshold", async () => {
    // The words checked of its owner's own accord ("Settings › Security").
    await planRecoveryReminders({ verifiedAt: T, dueSince: null }, T, t);

    expect(planned()).toEqual([]);
  });
});

describe("a notification of the check tapped", () => {
  const fake = jest.requireMock<typeof NotificationsFake>("expo-notifications");

  it("is told, the one the app was opened with first, never another of the app's", async () => {
    // The app opened by tapping it.
    fake.tap(fake.notification({ kind: "recoveryCheck" }, Date.now(), "Check your 12 words"));
    const onTap = jest.fn();

    const stop = subscribeReminderTaps(onTap);

    expect(onTap).toHaveBeenCalledTimes(1);
    // Taken: the app opened again does not take it twice.
    expect(fake.getLastNotificationResponse()).toBeNull();

    fake.tap(fake.notification({ kind: "cardWake" }));
    expect(onTap).toHaveBeenCalledTimes(1);
    // A card payment's is left to its own listener (useCardWakes.ts).
    expect(fake.getLastNotificationResponse()).not.toBeNull();

    fake.tap(fake.notification({ kind: "recoveryCheck" }));
    expect(onTap).toHaveBeenCalledTimes(2);

    stop();
    fake.tap(fake.notification({ kind: "recoveryCheck" }));
    expect(onTap).toHaveBeenCalledTimes(2);
  });
});
