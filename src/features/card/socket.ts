import type { TFunction } from "i18next";
import { Platform } from "react-native";

import i18n from "@/i18n";
import type { CardState } from "@/lib/card/card-record";
import { logFailure } from "@/lib/log/log";
import {
  cardSocketLinked,
  cardSocketStatus,
  configureCardSocket,
  enableCardSocket,
  type CardSocketRelay,
  type CardSocketStatus,
  type CardSocketTexts
} from "@/lib/card/card-socket";

/*
 * The card socket (docs/card-relay.md): this phone keeps its own connection to its cards' relays
 * (`GET /v1/listen`), from a foreground service (modules/card-socket), and each tap's wake packet
 * comes on it at once, the app closed too: its task runs the payment (wake-task.android.ts).
 *
 * On Android, it is how the phone is woken for its cards (the app has no push there): no push
 * token is asked (push.ts), none is sealed in the taps. On by default; its holder may turn it off
 * ("Wake journal", or "Stop" of its notification): its cards are then paid with the app shown only.
 * Both variants: Google Play asks for the declaration of its foreground service type before it
 * publishes the app.
 */

/** Whether this build offers the card socket: Android, with its module. */
export function cardSocketOffered(): boolean {
  return Platform.OS === "android" && cardSocketLinked();
}

/**
 * What it does, where it is offered and on (the default, unless its holder turned it off); null
 * otherwise. One read of the native status (a file, the system's services) for the caller's uses.
 */
export function cardSocketStatusIfOn(): CardSocketStatus | null {
  if (!cardSocketOffered()) return null;
  const status = cardSocketStatus();
  return status?.enabled ? status : null;
}

/** Whether it is on (where it is offered): the default, unless its holder turned it off. */
export function cardSocketOn(): boolean {
  return cardSocketStatusIfOn() !== null;
}

/**
 * Whether it is on and set to listen to `host` (the relays the app last gave its service). Its state
 * unreadable (noted): false, never more than it proved, and never a rejection of the work done.
 */
export function cardSocketListensTo(host: string): boolean {
  try {
    return cardSocketStatusIfOn()?.relays.some((relay) => relay.host === host) ?? false;
  } catch (error) {
    logFailure("Reading the card socket's relays failed", error);
    return false;
  }
}

/** The notification Android shows while it runs, in the app's language. */
export function cardSocketTexts(t: TFunction): CardSocketTexts {
  return {
    channelName: t("cards.socket.notification.channel"),
    title: t("cards.socket.notification.title"),
    text: t("cards.socket.notification.text"),
    stop: t("cards.socket.notification.stop")
  };
}

/**
 * Turns it on or off, as its holder chooses. The relays learn it at the next card sync (sync.ts:
 * the channels' `listen`, then the relays given to the service), which the caller starts.
 */
export async function setCardSocket(on: boolean): Promise<void> {
  if (!cardSocketOffered()) throw new Error("The card socket is not offered here");
  await enableCardSocket(on);
}

/**
 * Gives the service the relays to listen to (none while it is off): the relays of the active cards
 * that announced `/v1/listen` (each once, with its heartbeat), as their channels were just told;
 * and its notification's texts, in the app's language.
 */
export async function listenToRelays(relays: readonly CardSocketRelay[]): Promise<void> {
  if (!cardSocketOffered()) return;
  await configureCardSocket(cardSocketOn() ? relays : [], cardSocketTexts(i18n.t));
}

/**
 * Starts the service again with the relays it was last given, where it is on and does not run:
 * Android refused to start it (the app had left the foreground before its card sync ended), or
 * ended it without starting it again. Called while the app is in the foreground, where
 * Android lets it start, before any network work (sync.ts). Never rejects.
 */
export async function resumeCardSocket(): Promise<void> {
  try {
    const status = cardSocketStatusIfOn();
    if (!status || status.running || status.relays.length === 0) return;
    await configureCardSocket(status.relays, cardSocketTexts(i18n.t));
  } catch (error) {
    logFailure("Starting the card socket again failed", error);
  }
}

/**
 * Whether the card socket wakes this phone for one of the account's active cards: on, and listening
 * to that card's relay (card-passes.ts keeps the card's pass for it).
 */
export function cardSocketCovers(states: readonly CardState[]): boolean {
  const status = cardSocketStatusIfOn();
  if (!status) return false;
  const relays = new Set(status.relays.map((relay) => relay.host));
  return states.some((state) => state.status === "active" && relays.has(state.relayHost));
}
