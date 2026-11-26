import { parseStoredSeen, RELEASE_NOTES_SEEN_KEY, serializeSeen } from "./seen-format";

/** Same API as seen-store.ts, in this browser's `localStorage`. */

export async function loadSeen(): Promise<string | null> {
  return parseStoredSeen(localStorage.getItem(RELEASE_NOTES_SEEN_KEY));
}

export async function saveSeen(key: string): Promise<void> {
  localStorage.setItem(RELEASE_NOTES_SEEN_KEY, serializeSeen(key));
}
