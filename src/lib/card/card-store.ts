import { logFailure } from "@/lib/log/log";

import { getCardItem, setCardItem } from "./card-keychain";

/*
 * The device's copy of its wallet's cards' states (card-record.ts), next to their records on the
 * relays: a payment checks a tap against the last counter seen even when the relays do not answer,
 * and a state not yet published waits here for the next try. In the secure storage, readable once
 * the phone was unlocked after its start (a payment's notification arrives in the background), out
 * of the backups, with the card items the iOS extension reads too (card-keychain.ts). Same API on
 * the web, where cards are neither paired nor paid: card-store.web.ts.
 */

/** IRREVERSIBLE: the secure store's key of the cards' states. Never rename it. */
export const CARD_STATES_KEY = "card-states";

/** A state written here outlives the session: the relays may take it later. */
export const CARD_STATES_KEPT_ON_DEVICE = true;

const FORMAT_VERSION = 1;

/** What the device keeps: the account's wallet id, and each card's state as its record's value. */
export type StoredCardStates = {
  walletId: string;
  /** Values of card-record.ts (`cardStateValue`), checked again when read (parseCardState). */
  states: unknown[];
  /** Ids of the cards whose latest state is not on a majority of the relays yet. */
  unpublished: string[];
};

export async function loadStoredCardStates(): Promise<StoredCardStates | null> {
  try {
    const text = await getCardItem(CARD_STATES_KEY);
    if (text === null) return null;
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      value.version !== FORMAT_VERSION ||
      typeof value.walletId !== "string" ||
      !Array.isArray(value.states) ||
      !Array.isArray(value.unpublished) ||
      !value.unpublished.every((id) => typeof id === "string")
    ) {
      return null;
    }
    return {
      walletId: value.walletId,
      states: value.states,
      unpublished: value.unpublished as string[]
    };
  } catch (error) {
    logFailure("Unreadable card states", error);
    return null;
  }
}

export async function saveStoredCardStates(stored: StoredCardStates): Promise<void> {
  await setCardItem(CARD_STATES_KEY, JSON.stringify({ version: FORMAT_VERSION, ...stored }));
}
