import { useEffect, useRef, useSyncExternalStore } from "react";

import { CARD_ADDED_READ_MS } from "@/config/card";
import { getAccountWalletId } from "@/features/account/session";
import type { CardState } from "@/lib/card/card-record";
import { logFailure } from "@/lib/log/log";

import {
  knownCardStates,
  refreshCardStates,
  subscribeCardStates,
  withCardAccess,
  type CardStatesRefresh
} from "./states";

/**
 * While `active`, the account's cards read again from its relays every CARD_ADDED_READ_MS, one read
 * at a time (slow relays never pile them up): a card the phone adds shows on the computer, or the
 * device, which reads no card ("Add a card" there, AddCardDialog.tsx; the sign-up's card step;
 * useReadsCards.ts). Each read that ends is told to `onRead` ("Cards" leaves a failed
 * read with it, useCards).
 */
export function useCardsReadAgain(
  active: boolean,
  onRead?: (read: CardStatesRefresh) => void
): void {
  // The latest `onRead`: a new one at each render must not start the reads again.
  const told = useRef(onRead);
  useEffect(() => {
    told.current = onRead;
  });
  useEffect(() => {
    if (!active) return;
    let reading = false;
    const timer = setInterval(() => {
      if (reading) return;
      reading = true;
      withCardAccess(refreshCardStates)
        .then((read) => told.current?.(read))
        .catch((error: unknown) => logFailure("Reading the cards again failed", error))
        .finally(() => {
          reading = false;
        });
    }, CARD_ADDED_READ_MS);
    return () => clearInterval(timer);
  }, [active]);
}

/**
 * The account's card in service last written (null: none read yet), read at once and then every
 * CARD_ADDED_READ_MS: the card the phone adds while the web app's sign-up waits for it
 * (src/app/onboarding/card.tsx). A card being migrated, reset or deleted is no card added. Its
 * record, signed with the account's keys, proves the phone wrote it: a relay cannot make one up.
 */
export function useCardAdded(): CardState | null {
  useCardsReadAgain(true);
  useEffect(() => {
    withCardAccess(refreshCardStates).catch((error: unknown) =>
      logFailure("Reading the cards failed", error)
    );
  }, []);
  const states = useSyncExternalStore(subscribeCardStates, () =>
    knownCardStates(getAccountWalletId())
  );
  let added: CardState | null = null;
  for (const state of states) {
    if (state.status === "active" && (added === null || state.updatedAt > added.updatedAt)) {
      added = state;
    }
  }
  return added;
}
