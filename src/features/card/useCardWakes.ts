import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";

import { CARD_PENDING_POLL_MS } from "@/config/card";
import { getAccountWalletId, subscribeAccount } from "@/features/account/session";
import { loadPushMarks, subscribePushMarks } from "@/lib/card/push-marks";
import { logFailure } from "@/lib/log/log";

import { readPendingCardWakes, receiveCardWake } from "./payments";
import { notificationsAllowed } from "./push";
import { cardSocketStatusIfOn } from "./socket";
import { activeCardsOnDevice } from "./states";

/*
 * Where a tap's wake packet reaches the phone (relay contract v2), for this device's account
 * (`walletId`, its point of sale's): a notification received while the app runs, tapped (the app
 * opened or brought back by it), or left in the system's tray (the app opened another way); and,
 * with the account open, the relays' pending packets (open-app mode), read each time the app comes
 * to the foreground and, while a tap would notify nothing, every CARD_PENDING_POLL_MS while it
 * shows, unless the card socket's connection to each card's relay is open then (its packets come on
 * it, the app shown too). Same API on the web, where cards are not paid: useCardWakes.web.ts.
 */

/**
 * Whether the relays notify this phone of its cards' taps: notifications allowed, and no card's
 * hashes sealed without a token (push-marks.ts: an iPhone that got none, an Android phone, which
 * has no push). A card whose mark is not known yet counts as notified, as before the marks: its
 * next sync seals the phone's token.
 */
async function tapsNotified(): Promise<boolean> {
  if (!(await notificationsAllowed())) return false;
  return ![...(await loadPushMarks()).values()].includes(null);
}

/**
 * Whether the card socket's connection to the relay of each of the account's active cards is open
 * now (socket.ts): their taps come on it at once, as the app shows too. Asked at each period: a
 * connection that drops (a network change, the relay restarting) lets the reading go on.
 */
async function socketListens(walletId: string): Promise<boolean> {
  const status = cardSocketStatusIfOn();
  if (!status) return false;
  const open = new Set(
    status.connections
      .filter((connection) => connection.state === "open")
      .map((connection) => connection.host)
  );
  const cards = await activeCardsOnDevice(walletId);
  return cards.length > 0 && cards.every((card) => open.has(card.relayHost));
}

/** A notification's time in ms: iOS gives seconds (`timeIntervalSince1970`), Android ms. */
export function notificationTimeMs(date: unknown): number {
  if (typeof date !== "number" || !Number.isFinite(date)) return Number.NaN;
  // Any time in seconds of the next three thousand years is below 1e11; in ms, after 1973.
  return date < 1e11 ? date * 1000 : date;
}

/** The packet a notification carries (`data.cr`, the relay's), undefined for any other. */
function packetOf(notification: Notifications.Notification): unknown {
  const raw = notification.request.content.data?.cr;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function warn(error: unknown): void {
  logFailure("Reading a card payment's wake packet failed", error);
}

export function useCardWakes(walletId: string): void {
  useEffect(() => {
    // "unknown" until iOS first reports it: the app is being shown when this mounts.
    let foreground = AppState.currentState !== "background";
    let timer: ReturnType<typeof setInterval> | null = null;
    let reading = false;
    let stopped = false;
    const accountOpen = () => getAccountWalletId()?.toLowerCase() === walletId.toLowerCase();

    /** Whether the notification is a card payment's (taken, then). */
    const take = (notification: Notifications.Notification): boolean => {
      const raw = packetOf(notification);
      if (raw === undefined) return false;
      void receiveCardWake(raw, notificationTimeMs(notification.date), walletId).catch(warn);
      return true;
    };

    const fromTray = async () => {
      const shown = await Notifications.getPresentedNotificationsAsync();
      for (const notification of shown) {
        if (take(notification)) {
          await Notifications.dismissNotificationAsync(notification.request.identifier);
        }
      }
    };

    const pending = () => {
      if (stopped || reading || !accountOpen()) return;
      reading = true;
      void readPendingCardWakes()
        .catch(warn)
        .finally(() => {
          reading = false;
        });
    };

    // Each period, unless the card socket brings the packets. Not known (its state or the cards
    // unreadable): read as without it, never left unread.
    const poll = () => {
      void socketListens(walletId)
        .catch((error: unknown) => {
          logFailure("Reading whether the card socket listens failed", error);
          return false;
        })
        .then((listens) => {
          if (!listens) pending();
        });
    };

    const schedule = async () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (!foreground || !accountOpen() || (await tapsNotified())) return;
      if (stopped || !foreground || timer) return;
      timer = setInterval(poll, CARD_PENDING_POLL_MS);
    };

    const resume = () => {
      void fromTray().catch(warn);
      pending();
      void schedule();
    };

    const last = Notifications.getLastNotificationResponse();
    if (last && take(last.notification)) Notifications.clearLastNotificationResponse();
    resume();

    const received = Notifications.addNotificationReceivedListener((notification) => {
      take(notification);
    });
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      if (take(response.notification)) Notifications.clearLastNotificationResponse();
    });
    const appState = AppState.addEventListener("change", (state) => {
      foreground = state !== "background";
      if (state === "active") resume();
      else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    const account = subscribeAccount(() => {
      pending();
      void schedule();
    });
    // A card paired, programmed again or synced without a token while the app shows (or given one).
    const marks = subscribePushMarks(() => {
      void schedule();
    });
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      received.remove();
      responses.remove();
      appState.remove();
      account();
      marks();
    };
  }, [walletId]);
}
