import * as SecureStore from "expo-secure-store";

import type { BreezNetwork } from "@/lib/breez/config";

import { MEMBER_LOT_KEY, parseStoredMemberLot, type StoredMemberLot } from "./member-lot";

/**
 * The employee's lot of on-chain addresses in the secure storage, like its membership: without
 * biometrics, out of the iCloud and Google backups (a restored device must not show them again).
 * Same API on the web: member-lot-store.web.ts. Rejects when the storage cannot be read: a lot
 * written over an unreadable one could show an address twice.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export async function loadMemberLot(network: BreezNetwork): Promise<StoredMemberLot | null> {
  const stored = await SecureStore.getItemAsync(MEMBER_LOT_KEY, OPTIONS);
  return stored === null ? null : parseStoredMemberLot(JSON.parse(stored), network);
}

export async function saveMemberLot(lot: StoredMemberLot): Promise<void> {
  await SecureStore.setItemAsync(MEMBER_LOT_KEY, JSON.stringify(lot), OPTIONS);
}

export async function clearMemberLot(): Promise<void> {
  await SecureStore.deleteItemAsync(MEMBER_LOT_KEY, OPTIONS);
}
