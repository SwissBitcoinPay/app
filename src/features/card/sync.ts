import type { TFunction } from "i18next";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";

import { getAccountWalletId, subscribeAccount } from "@/features/account/session";
import { erasedGenerations, isCardShown, type CardState } from "@/lib/card/card-record";
import { loadDeviceKey } from "@/lib/card/device-key";
import { forgetPushMark, loadPushMarks } from "@/lib/card/push-marks";
import { logFailure } from "@/lib/log/log";

import { eraseCardLeftoversOnRelays, forgetErasedCards } from "./card-erasure";
import { syncCardPasses } from "./card-passes";
import { copyCardHistoryDaily } from "./history-copies";
import { publishCardHistory } from "./history-sync";
import { removeChannel } from "./manage";
import { refreshCardPayees } from "./payees-sync";
import { cardPushToken } from "./push";
import { listenForCards, settleCardSyncs, syncCardChannel, type ChannelSync } from "./relay-sync";
import { resumeCardSocket, setCardSocket } from "./socket";
import { knownCardState, refreshCardStates, withCardAccess, type CardAccess } from "./states";

/*
 * At each app start, once the account is open (relay contract v2, docs/card-relay.md), and when
 * the app comes back to the foreground: the account's cards read again, then each active card's
 * channel given this phone's key and push token, and hashes deposited when few are left; beside
 * them, whom the cards pay without asking, as the web app or another phone left it
 * (payees-sync.ts), and the card payments the account's relays do not hold yet (history-sync.ts),
 * once the data of the cards deleted (and of the earlier wallets of the cards added again) is gone
 * from the phone (card-erasure.ts): never published again.
 * Never asks for the notifications' permission: the pairing does. What each channel's last sync
 * gave is kept for "Cards" (lastChannelSyncs): never more than it proved. A card taken
 * out of service elsewhere (deleted on the web app, which cannot reach the card relay) has its
 * channel deleted from here, which made it.
 */

/** At most once per this long when the app comes back to the foreground. */
export const CARD_SYNC_MIN_INTERVAL_MS = 60_000;

/** A channel's last sync, with the programming it checked: the card's relay and keys' version. */
export type KeptChannelSync = { relayHost: string; keyVersion: number; result: ChannelSync };

/** Replaced at each change (never changed in place): a snapshot for useSyncExternalStore. */
let syncs: ReadonlyMap<string, KeptChannelSync> = new Map();
const listeners = new Set<() => void>();

/** What the last sync of each card's channel gave (by card id), this session. */
export function lastChannelSyncs(): ReadonlyMap<string, KeptChannelSync> {
  return syncs;
}

/**
 * What a sync of `state`'s channel gave, kept: never over the sync of a later programming (a card
 * moved to another relay meanwhile, whose former channel's sync ended after).
 */
function keep(state: CardState, result: ChannelSync): void {
  const kept = syncs.get(state.cardId);
  if (kept && kept.keyVersion > state.keyVersion) return;
  syncs = new Map(syncs).set(state.cardId, {
    relayHost: state.relayHost,
    keyVersion: state.keyVersion,
    result
  });
}

/** As keep, for a sync made elsewhere (the end of a relay change, useRelayMove.ts). */
export function keepChannelSync(state: CardState, result: ChannelSync): void {
  keep(state, result);
  for (const listener of listeners) listener();
}

/** The last sync of `card`'s channel as the card is programmed now: none of an earlier programming. */
export function channelSyncOf(
  kept: ReadonlyMap<string, KeptChannelSync>,
  card: CardState
): ChannelSync | undefined {
  const sync = kept.get(card.cardId);
  return sync && sync.relayHost === card.relayHost && sync.keyVersion === card.keyVersion
    ? sync.result
    : undefined;
}

export function subscribeChannelSyncs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forgets the syncs (tests; another account). */
export function resetChannelSyncs(): void {
  syncs = new Map();
  for (const listener of listeners) listener();
}

/**
 * Deletes the channels this phone made (it holds a push mark of each) of the cards no longer in
 * service: reset or deleted elsewhere (a card deleted on the web keeps its channel until then). A
 * relay that does not answer is tried again at the next sync (the mark kept); a card not in service
 * pays nothing meanwhile (payment.ts).
 */
async function retireChannels(access: CardAccess, states: readonly CardState[]): Promise<void> {
  const marks = await loadPushMarks();
  for (const state of states) {
    if (state.status === "active" || !marks.has(state.cardId)) continue;
    try {
      if ((await removeChannel(access, state.cardId, state.relayHost)) === "deleted") {
        await forgetPushMark(state.cardId);
      }
    } catch (error) {
      logFailure("Deleting a card's channel failed", error);
    }
  }
}

/**
 * Syncs the open account's active cards with their relays. Resolves with each card's outcome;
 * rejects when the account closed or its cards could not be read.
 */
export function syncAccountCards(channelName: string): Promise<Map<string, ChannelSync>> {
  return withCardAccess(async (access) => {
    const { states, conclusive } = await refreshCardStates(access);
    // Before anything of theirs could be published again: what this device keeps of them. What
    // the relays hold of them goes beside the rest, never before the cards in service.
    await forgetErasedCards(access, states);
    const leftovers = eraseCardLeftoversOnRelays(access, states, conclusive);
    const erased = erasedGenerations(states);
    const records = Promise.all([
      // An account with cards only ("Cards" shows the payees then): the others read nothing.
      states.some(isCardShown)
        ? refreshCardPayees(access).catch((error: unknown) => {
            // Read again at the next sync; a payment decides from the phone's book meanwhile.
            logFailure("Syncing the approved merchants failed", error);
          })
        : undefined,
      // Nothing asked of the relays when the log has nothing to publish. Then the copies of the
      // months that are over (history-copies.ts), once a day.
      publishCardHistory(access)
        .catch((error: unknown) => {
          logFailure("Publishing the card payments failed", error);
        })
        .then(() =>
          states.length > 0 ? copyCardHistoryDaily(access, Date.now(), erased) : undefined
        )
    ]);
    const active = states.filter((state) => state.status === "active");
    const results = new Map<string, ChannelSync>();
    try {
      await retireChannels(access, states);
      if (active.length === 0) return results;
      const key = await loadDeviceKey();
      const push = await cardPushToken(channelName, { ask: false });
      const pushToken = push.status === "granted" ? push.token : null;
      for (const state of active) {
        const result = await syncCardChannel(access, state, { key, pushToken });
        results.set(state.cardId, result);
        keep(state, result);
      }
      for (const listener of listeners) listener();
      return results;
    } finally {
      // Within the access: its keys are wiped once this resolves.
      await records;
      await leftovers;
      // After the channels (their `listen`), before the passes (card-passes.ts reads the relays).
      await listenForCards(access, states);
      // As the cards and the holder's mode now are, their own copies filled in (card-passes.ts).
      await syncCardPasses(access, states, { ownCopies: true });
    }
  });
}

/** Thrown by checkCardChannel for a card this session does not know active. */
export class CardNotActiveError extends Error {
  constructor() {
    super("The card is not active");
    this.name = "CardNotActiveError";
  }
}

/**
 * Syncs the channel of the open account's active card `cardId` with its relay, as
 * syncAccountCards does for each card ("Relay and programming": its state checked as the panel
 * opens, and again after the notifications are allowed), its outcome kept with the others'. Never
 * asks for the notifications' permission. Rejects when the account closed, and with
 * CardNotActiveError for a card this session does not know active.
 */
export function checkCardChannel(cardId: string, channelName: string): Promise<ChannelSync> {
  return withCardAccess(async (access) => {
    const state = knownCardState(access.walletId, cardId);
    if (state?.status !== "active") throw new CardNotActiveError();
    const push = await cardPushToken(channelName, { ask: false });
    const result = await syncCardChannel(access, state, {
      key: await loadDeviceKey(),
      pushToken: push.status === "granted" ? push.token : null
    });
    keepChannelSync(state, result);
    return result;
  });
}

/**
 * Turns the card socket on or off (socket.ts, "Wake journal"), then syncs the cards for
 * their channels and the service to follow: after the channel syncs already running, which may
 * have told their relay the former state (a sync asked now would share theirs, and the channel
 * keep that state until the next sync).
 */
export async function switchCardSocket(
  on: boolean,
  t: TFunction
): Promise<Map<string, ChannelSync>> {
  await setCardSocket(on);
  await settleCardSyncs();
  return syncAccountCards(t("card.notificationChannel"));
}

/**
 * Runs syncAccountCards when an account opens, and when the app comes back to the foreground
 * with one open (at most once a minute). Native only: the web app holds no channel nor log of its
 * own (its "Cards" runs the copy round of the cards' months, useCards.ts). Mounted once, at
 * the root (src/app/_layout.tsx). At the app's start and at each return to the foreground, first,
 * the card socket's service started again if it should run and does not (resumeCardSocket).
 */
export function useCardSync(): void {
  const { t } = useTranslation();
  useEffect(() => {
    if (Platform.OS === "web") return;
    let account: string | null = null;
    let lastRun = 0;
    let running = false;
    const run = () => {
      if (running || !getAccountWalletId()) return;
      running = true;
      lastRun = Date.now();
      void syncAccountCards(t("card.notificationChannel"))
        .catch((error: unknown) => {
          logFailure("Card sync failed", error);
        })
        .finally(() => {
          running = false;
        });
    };
    const onAccount = () => {
      const opened = getAccountWalletId();
      if (opened !== account) {
        account = opened;
        resetChannelSyncs();
        if (opened) run();
      }
    };
    void resumeCardSocket();
    onAccount();
    const unsubscribe = subscribeAccount(onAccount);
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void resumeCardSocket();
      if (Date.now() - lastRun >= CARD_SYNC_MIN_INTERVAL_MS) run();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [t]);
}
