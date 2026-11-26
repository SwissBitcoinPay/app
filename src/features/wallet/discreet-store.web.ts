import { DISCREET_STORE_KEY, parseStoredDiscreet, serializeDiscreet } from "./discreet-format";

/** Same API as discreet-store.ts, in this browser's `localStorage`. */

export async function loadDiscreet(): Promise<boolean | null> {
  try {
    return parseStoredDiscreet(localStorage.getItem(DISCREET_STORE_KEY));
  } catch {
    return null;
  }
}

export async function saveDiscreet(hidden: boolean): Promise<void> {
  localStorage.setItem(DISCREET_STORE_KEY, serializeDiscreet(hidden));
}
