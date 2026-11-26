import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { CARD_PUSH_TOKEN_TIMEOUT_MS } from "@/config/card";
import { isExpoPushToken } from "@/lib/card/relay-client";
import { logFailure } from "@/lib/log/log";
import { withSystemUi } from "@/lib/system-ui";
import { within } from "@/lib/within";

import { cardSocketOffered } from "./socket";

/*
 * The phone's Expo push token, which the card relay sends wake packets to (Expo Push, a third
 * party: it receives the token and each packet, encrypted). Asked
 * when a card is paired, then at each app start (relay-sync.ts): Expo renews tokens. Same API on the
 * web, where cards are not paid: push.web.ts.
 *
 * The relay calls Expo's push API with the token alone, no access token: the EAS project must keep
 * Expo's "Enhanced Security for Push Notifications" off, or every wake packet
 * is refused (UNAUTHORIZED).
 */

/**
 * IRREVERSIBLE: the Android notification channel of card payments, made before the phone's push
 * token is asked (cardPushToken): the app's own notices go to it (paid-notice.ts). The relay's
 * alerts name no channel (Android shows them in expo-notifications' "Miscellaneous"). A renamed
 * channel would leave the old one in the phone's settings.
 */
export const CARD_PAYMENTS_CHANNEL = "card-payments";

export type PushToken =
  | { status: "granted"; token: string }
  /** The user refused notifications (or turned them off in the system's settings). */
  | { status: "denied" }
  /**
   * No token: no network to Expo, a token not given within CARD_PUSH_TOKEN_TIMEOUT_MS, a build
   * without push, an Android build without the card socket (Android has no push). A card is still
   * paired then, paid in open-app mode (pairing.ts).
   */
  | { status: "unavailable" }
  /**
   * Woken by the card socket, not by a push (socket.ts: Android): no token asked.
   */
  | { status: "socket" };

function granted(permissions: Notifications.NotificationPermissionsStatus): boolean {
  // iOS: only a full authorization shows alerts; a provisional one delivers them silently.
  if (Platform.OS === "ios") {
    // expo-notifications 58 compiles its enums with a comment before `export` on the same line,
    // which eslint-plugin-import's check of an ES module misses (ExportMap's "unambiguous" test):
    // TypeScript checks the member.
    // eslint-disable-next-line import/namespace
    return permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  }
  return permissions.granted;
}

/** Whether notifications are allowed (without asking): else the app reads the pending packets. */
export async function notificationsAllowed(): Promise<boolean> {
  try {
    return granted(await Notifications.getPermissionsAsync());
  } catch {
    return false;
  }
}

/**
 * Whether the system may still ask for the permission: else only its settings allow notifications
 * (refused for good, or turned off there).
 */
export async function notificationsAskable(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).canAskAgain;
  } catch {
    return false;
  }
}

/**
 * This phone's Expo push token, asking for the permission when it may still be asked (`ask`). The
 * channel of card payments is created first on Android: the system asks for the permission only
 * once an app has a channel (Android 13).
 */
export async function cardPushToken(
  channelName: string,
  { ask }: { ask: boolean }
): Promise<PushToken> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CARD_PAYMENTS_CHANNEL, {
        name: channelName,
        // As IosAuthorizationStatus above.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
        // A payment asks for an answer within a minute: shown at once, with a sound.
        sound: "default",
        vibrationPattern: [0, 250, 250, 250]
      });
    }
    let permissions = await Notifications.getPermissionsAsync();
    if (!granted(permissions) && ask && permissions.canAskAgain) {
      // The system's prompt over the app: coming back is not leaving it (src/lib/system-ui.ts).
      permissions = await withSystemUi(() =>
        Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false }
        })
      );
    }
    // Allowed all the same: the app's own notices tell the holder how a payment went.
    if (!granted(permissions)) return { status: "denied" };
    // Android has no push: the card socket wakes it, where it is offered.
    if (Platform.OS === "android") {
      return cardSocketOffered() ? { status: "socket" } : { status: "unavailable" };
    }
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
      ?.eas?.projectId;
    if (typeof projectId !== "string") {
      // A build without its EAS project: its cards are paired all the same, never notified.
      logFailure("No EAS project id for the push token");
      return { status: "unavailable" };
    }
    const token = await within(
      Notifications.getExpoPushTokenAsync({ projectId }),
      CARD_PUSH_TOKEN_TIMEOUT_MS
    );
    if (token === null) {
      logFailure("The push token did not come in time");
      return { status: "unavailable" };
    }
    return isExpoPushToken(token.data)
      ? { status: "granted", token: token.data }
      : { status: "unavailable" };
  } catch (error) {
    logFailure("No push token", error);
    return { status: "unavailable" };
  }
}
