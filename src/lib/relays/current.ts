import { DEFAULT_RELAYS } from "@/config/relays";

import { sameRelayList } from "./list";

/*
 * The relays this device works with, in memory: every record of the app
 * goes to them and is read from them, unless a caller names another list (a payment link opened
 * by a payer, an invitation being used: the lists of their URLs). Loaded from the device's
 * storage at launch (src/features/relays/device-relays.ts) and kept in step with the owner's
 * account (its settings' `relays`) or the employee's channel. DEFAULT_RELAYS until the device
 * has its own list.
 */

let list: readonly string[] | null = null;
const listeners = new Set<() => void>();

/** The device's relays: read at each call, so that a list changed since is the one used. */
export function currentRelays(): readonly string[] {
  return list ?? DEFAULT_RELAYS;
}

/** Whether the device has a list of its own (else DEFAULT_RELAYS apply). */
export function hasOwnRelays(): boolean {
  return list !== null;
}

/** Makes `next` the device's list in memory (null: back to DEFAULT_RELAYS). Not saved here. */
export function setCurrentRelays(next: readonly string[] | null): void {
  if (next === list || (next && list && sameRelayList(next, list))) return;
  list = next ? [...next] : null;
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever the device's list changes; returns the unsubscribe function. */
export function subscribeRelays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
