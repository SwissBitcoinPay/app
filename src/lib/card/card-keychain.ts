import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { cardSharedContainer } from "./app-group";

/*
 * The secure storage of the card items the iOS notification service extension reads too (the
 * device key, the cards' states and passes: docs/ios-card-payments.md, "Shared state"). On an
 * iPhone whose build shares an app group with the extension (app-group.ts), they are in its
 * keychain access group, under a service of their own; elsewhere (Android, a build without the
 * extension), where the app keeps its other items. Readable once the phone was unlocked after its
 * start, as a card's notification arrives with the phone locked, never in a backup nor on another
 * device.
 *
 * Moved, not copied: the first use of an item there takes it from where the app kept it before
 * (its default service, its own access group), writes it in the shared place, then removes it from
 * the former, which is read as long as the move has not happened. A service of their own keeps the
 * two places apart: a keychain query without access group searches all of the app's (Apple,
 * kSecAttrAccessGroup), and the former place is queried without one. Never read by an app that
 * would look in the former place only: these files are in the native fingerprint
 * (fingerprint.config.js), no update of before reaches a build that moved them.
 */

/**
 * IRREVERSIBLE: the keychain service of the shared card items. expo-secure-store 58 stores an item
 * under `<service>:no-auth` (SecureStoreModule.swift, `query`), which the extension reads: never
 * change one side without the other.
 */
export const CARD_SHARED_SERVICE = "card-shared";

/** Where the app keeps its items: its default service and access group. */
const OWN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

function sharedOptions(group: string): SecureStore.SecureStoreOptions {
  return {
    keychainService: CARD_SHARED_SERVICE,
    accessGroup: group,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
  };
}

/** The moves done or running, by `<group>|<key>`: one per item and process. */
const moves = new Map<string, Promise<void>>();

/** Forgets the moves done (tests: another device). */
export function resetCardItemMoves(): void {
  moves.clear();
}

/**
 * `key` moved from where the app kept it to the shared place, once. A copy already there is the
 * item (written by this app since): the former one only goes. Never rejects: a move that failed is
 * logged and tried again at the next use, the item read where it is meanwhile.
 */
function moved(key: string, group: string): Promise<void> {
  const id = `${group}|${key}`;
  let move = moves.get(id);
  if (!move) {
    const shared = sharedOptions(group);
    move = (async () => {
      if ((await SecureStore.getItemAsync(key, shared)) === null) {
        const own = await SecureStore.getItemAsync(key, OWN);
        if (own === null) return;
        await SecureStore.setItemAsync(key, own, shared);
      }
      await SecureStore.deleteItemAsync(key, OWN);
    })().catch((error: unknown) => {
      moves.delete(id);
      logFailure("Moving a card item to the extension's keychain group failed", error);
    });
    moves.set(id, move);
  }
  return move;
}

/** The item of `key`, null when there is none. */
export async function getCardItem(key: string): Promise<string | null> {
  const group = cardSharedContainer()?.group;
  if (!group) return SecureStore.getItemAsync(key, OWN);
  await moved(key, group);
  const shared = await SecureStore.getItemAsync(key, sharedOptions(group));
  // Not moved yet (its move failed): where it is.
  return shared ?? SecureStore.getItemAsync(key, OWN);
}

export async function setCardItem(key: string, value: string): Promise<void> {
  const group = cardSharedContainer()?.group;
  if (!group) return SecureStore.setItemAsync(key, value, OWN);
  await moved(key, group);
  await SecureStore.setItemAsync(key, value, sharedOptions(group));
}

/** Removes the item of `key`, wherever it is. */
export async function deleteCardItem(key: string): Promise<void> {
  const group = cardSharedContainer()?.group;
  if (group) await SecureStore.deleteItemAsync(key, sharedOptions(group));
  await SecureStore.deleteItemAsync(key, OWN);
}
