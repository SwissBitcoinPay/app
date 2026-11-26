import { deleteCardItem, getCardItem, setCardItem } from "@/lib/card/card-keychain";
import { logFailure } from "@/lib/log/log";

import { RELAYS_KEY, parseStoredRelays, storedRelays } from "./stored";

/**
 * The device's relays in the secure storage, like the point of sale's profile (without
 * biometrics, out of the iCloud and Google backups: a restored device starts from the default
 * list, and gets the account's at the next login). With the card items (card-keychain.ts): the
 * iOS notification service extension reads them, to read a card's own copies on them. Same API on
 * the web: store.web.ts.
 */

export async function loadStoredRelays(): Promise<string[] | null> {
  try {
    const stored = await getCardItem(RELAYS_KEY);
    return stored === null ? null : parseStoredRelays(JSON.parse(stored));
  } catch (error) {
    logFailure("Unreadable relays of the device", error);
    return null;
  }
}

export async function saveStoredRelays(relays: readonly string[]): Promise<void> {
  await setCardItem(RELAYS_KEY, JSON.stringify(storedRelays(relays)));
}

export async function clearStoredRelays(): Promise<void> {
  await deleteCardItem(RELAYS_KEY);
}
