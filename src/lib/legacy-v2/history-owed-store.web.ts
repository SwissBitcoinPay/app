import { LEGACY_HISTORY_OWED_KEY } from "./history-owed-format";

/** Same API as history-owed-store.ts, in this browser's `localStorage`. */

export async function readHistoryOwedText(): Promise<string | null> {
  return localStorage.getItem(LEGACY_HISTORY_OWED_KEY);
}

export async function writeHistoryOwedText(text: string): Promise<void> {
  localStorage.setItem(LEGACY_HISTORY_OWED_KEY, text);
}
