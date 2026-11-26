import {
  ASSISTANT_ALERTS_KEY,
  parseStoredDismissals,
  serializeDismissals
} from "./alert-dismissals-format";

/** Same API as alert-dismissals.ts, in this browser's `localStorage`. */

export async function loadDismissals(): Promise<string[]> {
  try {
    return parseStoredDismissals(localStorage.getItem(ASSISTANT_ALERTS_KEY));
  } catch {
    return [];
  }
}

export async function saveDismissal(key: string): Promise<void> {
  const kept = (await loadDismissals()).filter((other) => other !== key);
  localStorage.setItem(ASSISTANT_ALERTS_KEY, serializeDismissals([...kept, key]));
}
