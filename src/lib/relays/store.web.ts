import { RELAYS_KEY, parseStoredRelays, storedRelays } from "./stored";

/**
 * Same API as store.ts, in the browser's `localStorage`, like the point of sale's profile. In
 * this browser only, gone with the site data: the default list applies again until the next login.
 */

export async function loadStoredRelays(): Promise<string[] | null> {
  try {
    const stored = localStorage.getItem(RELAYS_KEY);
    return stored === null ? null : parseStoredRelays(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveStoredRelays(relays: readonly string[]): Promise<void> {
  localStorage.setItem(RELAYS_KEY, JSON.stringify(storedRelays(relays)));
}

export async function clearStoredRelays(): Promise<void> {
  localStorage.removeItem(RELAYS_KEY);
}
