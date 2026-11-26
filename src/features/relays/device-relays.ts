import { useSyncExternalStore } from "react";

import { sameRelayList } from "@/lib/relays/list";
import {
  currentRelays,
  hasOwnRelays,
  setCurrentRelays,
  subscribeRelays
} from "@/lib/relays/current";
import { clearStoredRelays, loadStoredRelays, saveStoredRelays } from "@/lib/relays/store";

/*
 * The device's list of relays, saved on it: chosen in "Advanced settings"
 * before a sign-in, then the owner's account's (src/features/account/session.ts) or, on an
 * employee's device, its invitation's then its channel's (src/features/team/member.ts).
 */

let loading: Promise<void> | null = null;

/**
 * Reads the device's list into memory (src/lib/relays/current.ts), once: the root layout waits
 * for it before any screen (_layout.tsx, once a rescue's traces are taken back), so that nothing reads or publishes on the default list meanwhile.
 * Never rejects.
 */
export function loadDeviceRelays(): Promise<void> {
  loading ??= loadStoredRelays().then((stored) => {
    // A list saved while the storage was read wins over it.
    if (!hasOwnRelays() && stored) setCurrentRelays(stored);
  });
  return loading;
}

/** Saves `relays` as the device's list, unless it is the one in force. */
export async function saveDeviceRelays(relays: readonly string[]): Promise<void> {
  if (hasOwnRelays() && sameRelayList(currentRelays(), relays)) return;
  await saveStoredRelays(relays);
  setCurrentRelays(relays);
}

/** Forgets the device's list ("Log out"): the default list applies again. */
export async function clearDeviceRelays(): Promise<void> {
  await clearStoredRelays();
  setCurrentRelays(null);
}

/** The device's list, followed. */
export function useDeviceRelays(): readonly string[] {
  return useSyncExternalStore(subscribeRelays, currentRelays, currentRelays);
}

/** Tests only: forgets what was read. */
export function resetDeviceRelays(): void {
  loading = null;
  setCurrentRelays(null);
}
