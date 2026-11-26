import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { TFunction } from "i18next";

import { notificationsAllowed, notificationsAskable } from "@/features/card/push";
import { createRecoveryRemindersChannel } from "@/features/recovery-check/reminders";
import { logFailure } from "@/lib/log/log";
import { withSystemUi } from "@/lib/system-ui";

import {
  NOTIFICATIONS_OFFER_KEY,
  notificationsOffered,
  serializeNotificationsOffer
} from "./offer-format";

/*
 * "Stay informed" (NotificationsOffer.tsx): the phone's permission asked once, after the app's
 * setup, with what it is for. Same API on the web (offer.web.ts), which plans no notification.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/**
 * Whether to offer it now: never answered on this device, notifications not allowed and the
 * system may still ask (else only its settings allow them: nothing to ask). Never rejects: on a
 * doubt, not offered.
 */
export async function shouldOfferNotifications(): Promise<boolean> {
  try {
    if (notificationsOffered(await SecureStore.getItemAsync(NOTIFICATIONS_OFFER_KEY, OPTIONS))) {
      return false;
    }
  } catch (error) {
    logFailure("Reading the notifications offer failed", error);
    return false;
  }
  return !(await notificationsAllowed()) && (await notificationsAskable());
}

/** Keeps the offer answered at `at` (Unix seconds): never offered again here. Never rejects. */
export async function markNotificationsOffered(at: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      NOTIFICATIONS_OFFER_KEY,
      serializeNotificationsOffer(at),
      OPTIONS
    );
  } catch (error) {
    // Offered again at the next opening: the system's permission, answered meanwhile, says no.
    logFailure("Saving the notifications offer failed", error);
  }
}

/**
 * The system's permission asked; whether notifications are allowed now. Never rejects. On Android,
 * a channel first: the system asks only once an app has one (Android 13); the check's, which
 * these notifications are for (reminders.ts).
 */
export async function askNotifications(t: TFunction): Promise<boolean> {
  try {
    await createRecoveryRemindersChannel(t);
    // The system's prompt over the app: coming back is not leaving it (src/lib/system-ui.ts).
    await withSystemUi(() =>
      Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false }
      })
    );
  } catch (error) {
    logFailure("Asking for notifications failed", error);
  }
  return notificationsAllowed();
}
