import { TapAlreadySeenError } from "@/features/card/state-errors";
import { mergeCardStates, parseCardState, type CardState } from "@/lib/card/card-record";
import { loadStoredCardStates } from "@/lib/card/card-store";
import { raiseToExtensionTaps } from "@/lib/card/extension-records";

import { ExtensionTapSeenError, recordExtensionTap, releaseExtensionTap } from "./card-records";

/*
 * The cards' states as the card payment core reads and records them in the iOS extension's engine
 * (payment-core.ts, CardPaymentPorts `states`): the app's copy (card-store.ts, read only: the app is
 * its one writer), each card's counter raised to the extension's own taps
 * (src/lib/card/extension-records.ts); a tap's counter recorded in those taps, never in the app's
 * copy. Each tap taken is noted, so that one handed over to the app can be given back
 * (releaseTaps).
 */

/** A tap the extension took: what releaseExtensionTap needs. */
type Taken = {
  cardId: string;
  keyVersion: number;
  walletGeneration: number;
  counter: number;
  previous: number | null;
};

export type EngineCardStates = {
  onDeviceOf(walletId: string): Promise<CardState[]>;
  recordOnDevice(
    walletId: string,
    state: Omit<CardState, "updatedAt">,
    now?: number,
    options?: { tap?: boolean }
  ): Promise<CardState>;
  /** Gives back each tap taken (a payment handed over, not paid): the app takes it then. */
  releaseTaps(): void;
};

/** The app's copy of `walletId`'s cards, raised to the extension's taps; none of another wallet. */
async function statesOf(walletId: string): Promise<Map<string, CardState>> {
  const states = new Map<string, CardState>();
  const stored = await loadStoredCardStates();
  if (stored?.walletId !== walletId) return states;
  for (const value of stored.states) {
    let state: CardState | null = null;
    try {
      state = parseCardState(value, null);
    } catch {
      // A newer app's copy: none of it is taken.
    }
    if (!state) continue;
    const other = states.get(state.cardId);
    states.set(state.cardId, other ? mergeCardStates(other, state) : state);
  }
  raiseToExtensionTaps(states);
  return states;
}

/** The engine's `states`, one per payment: its taps released by its own releaseTaps. */
export function engineCardStates(): EngineCardStates {
  const taken: Taken[] = [];
  return {
    async onDeviceOf(walletId) {
      return [...(await statesOf(walletId)).values()];
    },

    async recordOnDevice(walletId, state, now = Math.floor(Date.now() / 1000), options = {}) {
      // A tap's counter only: the rest of a card's state is the app's to write.
      if (!options.tap) throw new Error("The extension records a tap's counter only");
      const previous = (await statesOf(walletId)).get(state.cardId);
      if (!previous) throw new Error("A card this device does not keep");
      if (
        previous.keyVersion !== state.keyVersion ||
        previous.walletGeneration !== state.walletGeneration
      ) {
        throw new TapAlreadySeenError();
      }
      let before: number | null;
      try {
        before = recordExtensionTap(
          state.cardId,
          state.keyVersion,
          state.walletGeneration,
          state.lastCounter,
          previous.lastCounter
        );
      } catch (error) {
        if (error instanceof ExtensionTapSeenError) throw new TapAlreadySeenError();
        throw error;
      }
      taken.push({
        cardId: state.cardId,
        keyVersion: state.keyVersion,
        walletGeneration: state.walletGeneration,
        counter: state.lastCounter,
        previous: before
      });
      return {
        ...previous,
        lastCounter: state.lastCounter,
        depositedThrough: Math.max(previous.depositedThrough, state.lastCounter),
        updatedAt: Math.max(now, previous.updatedAt + 1)
      };
    },

    releaseTaps() {
      for (const tap of taken.splice(0).reverse()) {
        releaseExtensionTap(
          tap.cardId,
          tap.keyVersion,
          tap.walletGeneration,
          tap.counter,
          tap.previous
        );
      }
    }
  };
}
