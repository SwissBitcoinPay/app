/*
 * Same API as card-store.ts. Cards are paired and paid from the app on a phone only: the web app
 * keeps nothing of them on the device. It reads and writes
 * their records on the account's relays (src/features/card/states.ts), in memory between them.
 */

export const CARD_STATES_KEY = "card-states";

/** Nothing outlives the page: a state no majority of the relays took is lost with it. */
export const CARD_STATES_KEPT_ON_DEVICE = false;

export type StoredCardStates = { walletId: string; states: unknown[]; unpublished: string[] };

export async function loadStoredCardStates(): Promise<StoredCardStates | null> {
  return null;
}

export async function saveStoredCardStates(_stored: StoredCardStates): Promise<void> {}
