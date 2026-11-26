import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import { MEMBERSHIP_KEY, parseMembership, type Membership } from "./membership";

/**
 * The device's membership in the secure storage (Keychain on iOS, Keystore-encrypted on Android),
 * like the point of sale's profile: without biometrics, out of the iCloud and Google backups (a
 * restored device is invited again). Same API on the web: membership-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export async function loadMembership(): Promise<Membership | null> {
  try {
    const stored = await SecureStore.getItemAsync(MEMBERSHIP_KEY, OPTIONS);
    return stored === null ? null : parseMembership(JSON.parse(stored));
  } catch (error) {
    logFailure("Unreadable team membership", error);
    return null;
  }
}

export async function saveMembership(membership: Membership): Promise<void> {
  await SecureStore.setItemAsync(MEMBERSHIP_KEY, JSON.stringify(membership), OPTIONS);
}

export async function clearMembership(): Promise<void> {
  await SecureStore.deleteItemAsync(MEMBERSHIP_KEY, OPTIONS);
}
