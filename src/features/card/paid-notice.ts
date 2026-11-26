import * as Notifications from "expo-notifications";
import { useEffect } from "react";

import i18n from "@/i18n";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";

import { CARD_PAID_NOTICE, cardPaidNotice } from "./card-notices";
import { subscribeCardPaid } from "./payments";
import { CARD_PAYMENTS_CHANNEL } from "./push";

/*
 * The holder is told of each card payment that leaves: a notification of the phone, with the amount
 * and the merchant's name ("12,500 sats to "Lakeside Coffee"", its status not told), whether the
 * payment was confirmed or paid without asking. While the app shows, the payment's panel shows it
 * too: the notice then goes to the notification centre only, without a banner over the panel. Told
 * by this module for the whole of the app's run, its screens shown or not (a wake task's payment,
 * background-wake.ts, which also tells a payment to confirm in the app, or refused).
 *
 * Its words: card-notices.ts.
 */

export { CARD_PAID_NOTICE } from "./card-notices";

/**
 * The data of the iOS extension's test of a card push's text (extension-probe.ts,
 * launchCardTextTest; CardPushText.swift, `testKey`).
 */
export const CARD_TEXT_TEST_KEY = "sattlemeCardTextTest";

/**
 * While the app shows: the notices to the notification centre, without a banner (the payment's
 * panel shows it), nor sound; the extension's test of a card push's text as a banner, the text it
 * wrote being what that test looks at; anything else not shown, as with the app's screens gone
 * (showNoNotificationInFront; a card's wake packet is taken by useCardWakes.ts).
 */
export function cardNotificationBehavior(
  notification: Notifications.Notification
): Notifications.NotificationBehavior {
  const data = notification.request.content.data;
  const notice = data?.kind === CARD_PAID_NOTICE;
  const textTest = data?.[CARD_TEXT_TEST_KEY] === true;
  return {
    shouldShowBanner: textTest,
    shouldShowList: notice || textTest,
    shouldPlaySound: false,
    shouldSetBadge: false
  };
}

/** Shown at once (Android: in the card payments' channel; iOS has none). */
async function notify(content: { title: string; body: string }): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { ...content, data: { kind: CARD_PAID_NOTICE } },
      trigger: { channelId: CARD_PAYMENTS_CHANNEL }
    });
  } catch (error) {
    // Notifications refused: the payment's panel and the card's history still tell it.
    logFailure("The card payment's notice failed", error);
  }
}

let telling = false;

/**
 * From now on, tells the holder of each card payment that leaves, for the whole of the app's run:
 * started by its screens (CardPayments.tsx) and by a wake task (background-wake.ts), once.
 */
export function startCardPaidNotices(): void {
  if (telling) return;
  telling = true;
  subscribeCardPaid((paid) => {
    void notify(cardPaidNotice(paid, i18n.t, getDeviceLocale().languageTag));
  });
}

/**
 * No notification shown while the app shows, until its account's screens set their handler
 * (useCardPaidNotices), as when it is gone: since expo-notifications 58, one that comes while the
 * app shows is shown, with its sound and its badge, unless a handler says otherwise. Called once,
 * as the app starts (src/app/_layout.tsx).
 */
export function showNoNotificationInFront(): void {
  Notifications.setNotificationHandler(null);
}

/**
 * While the app's screens show (CardPayments.tsx): the card notices without a banner over the
 * payment's panel; and the payments told from then on (startCardPaidNotices).
 */
export function useCardPaidNotices(): void {
  useEffect(() => {
    startCardPaidNotices();
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => cardNotificationBehavior(notification)
    });
    return () => {
      Notifications.setNotificationHandler(null);
    };
  }, []);
}
