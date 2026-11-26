import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { getAccountWalletId } from "@/features/account/session";
import { orderCards, type CardOrder } from "@/lib/card/card-order";
import { erasedGenerations, isCardShown, type CardState } from "@/lib/card/card-record";
import { CARD_STATES_KEPT_ON_DEVICE } from "@/lib/card/card-store";
import { logFailure } from "@/lib/log/log";

import { eraseCardLeftoversOnRelays, forgetErasedCards } from "./card-erasure";
import { copyCardHistoryDaily } from "./history-copies";
import type { ChannelSync } from "./relay-sync";
import {
  NoAccountError,
  knownCardOrder,
  knownCardStates,
  refreshCardStates,
  subscribeCardStates,
  withCardAccess,
  type CardStatesRefresh
} from "./states";
import { channelSyncOf, lastChannelSyncs, subscribeChannelSyncs } from "./sync";

export type CardsView =
  | { phase: "loading" }
  /** No relay answered and the device keeps none: not "no card", which is not proven. */
  | { phase: "failed"; reason: "noAccount" | "unreachable" }
  | {
      phase: "ready";
      /** In service or being migrated, in the account's order (card-order.ts). */
      cards: CardState[];
      /** Every state read, reset cards included: the panel of a card being reset keeps it. */
      states: readonly CardState[];
      /**
       * The read gave a majority of the relays' answers (CardStatesRefresh): a card absent from
       * `states` has no record there. Not so: read from the device alone, the list may lack one
       * added elsewhere, which only a later read shows.
       */
      conclusive: boolean;
    };

/**
 * The cards "Cards" shows: in service or being migrated; a card reset is a blank card again, a card
 * deleted is gone (isCardShown). In the order the owner chose ("Organise", card-order.ts);
 * the cards it does not name after, by id, as before it existed.
 */
function shown(states: readonly CardState[], order: CardOrder | null): CardState[] {
  return orderCards(
    states.filter(isCardShown).sort((a, b) => a.cardId.localeCompare(b.cardId)),
    order
  );
}

/**
 * Whether a read of the cards proves their list: something read somewhere, and where the device
 * keeps nothing (the web app), only what a majority of the relays gave: a card could be missing
 * otherwise. Not so: unknown, never an empty list.
 */
function proves({ states, conclusive }: CardStatesRefresh): boolean {
  return conclusive || (states.length > 0 && CARD_STATES_KEPT_ON_DEVICE);
}

/**
 * The open account's cards for "Cards", read from the relays and the device when the screen
 * opens (and again with `reload`), then as they are written; and what this session's last sync of
 * each card's channel gave (sync.ts), by card id, for the card as it is programmed now only. A read
 * made meanwhile elsewhere (`accept`: "Add a card" on a computer reads the cards again)
 * ends a failure the page shows, once it proves the list.
 */
export function useCards(): {
  view: CardsView;
  syncs: ReadonlyMap<string, ChannelSync>;
  reload: () => void;
  accept: (read: CardStatesRefresh) => void;
} {
  const [view, setView] = useState<CardsView>({ phase: "loading" });
  const [round, setRound] = useState(0);
  const known = useSyncExternalStore(subscribeCardStates, () =>
    knownCardStates(getAccountWalletId())
  );
  // The order saved ("Organise") or read since: the same listeners as the states'.
  const order = useSyncExternalStore(subscribeCardStates, () =>
    knownCardOrder(getAccountWalletId())
  );
  const kept = useSyncExternalStore(subscribeChannelSyncs, lastChannelSyncs);

  useEffect(() => {
    let current = true;
    withCardAccess(refreshCardStates).then(
      (read) => {
        const { states, conclusive } = read;
        if (!current) return;
        if (!proves(read)) {
          setView({ phase: "failed", reason: "unreachable" });
        } else {
          setView({ phase: "ready", cards: shown(states, read.order), states, conclusive });
        }
        // The web app syncs no card (useCardSync): "Cards" does there what a phone's sync does
        // of the cards' records, else an owner on the web alone would never do it: what the relays
        // still hold of the cards' erased wallets erased (card-erasure.ts; only after a majority's
        // read: a card added again elsewhere is known by then), beside its day's copy round of the
        // cards' months (history-copies.ts), which leaves those wallets out.
        if (Platform.OS === "web" && states.length > 0) {
          withCardAccess(async (access) => {
            await forgetErasedCards(access, states);
            await Promise.all([
              eraseCardLeftoversOnRelays(access, states, conclusive),
              copyCardHistoryDaily(access, Date.now(), erasedGenerations(states))
            ]);
          }).catch((error: unknown) => {
            logFailure("Copying the cards' months failed", error);
          });
        }
      },
      (error: unknown) => {
        if (!current) return;
        logFailure("Reading the cards failed", error);
        setView({
          phase: "failed",
          reason: error instanceof NoAccountError ? "noAccount" : "unreachable"
        });
      }
    );
    return () => {
      current = false;
    };
  }, [round]);

  const reload = useCallback(() => {
    setView({ phase: "loading" });
    setRound((value) => value + 1);
  }, []);
  const accept = useCallback((read: CardStatesRefresh) => {
    if (!proves(read)) return;
    setView((shownNow) =>
      shownNow.phase === "failed" && shownNow.reason === "unreachable"
        ? {
            phase: "ready",
            cards: shown(read.states, read.order),
            states: read.states,
            conclusive: read.conclusive
          }
        : shownNow
    );
  }, []);
  // Written since (a name, a ceiling, a card suspended): the known states are newer. What the read
  // proved stays: they hold all it read.
  const live: CardsView =
    view.phase === "ready" && known.length > 0
      ? { phase: "ready", cards: shown(known, order), states: known, conclusive: view.conclusive }
      : view;
  // A card moved to another relay shows nothing of its former channel's sync.
  const syncs = new Map<string, ChannelSync>();
  if (live.phase === "ready") {
    for (const card of live.states) {
      const sync = channelSyncOf(kept, card);
      if (sync) syncs.set(card.cardId, sync);
    }
  }
  return { view: live, syncs, reload, accept };
}
