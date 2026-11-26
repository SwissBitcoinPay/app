import { LEGACY_FREEZE_OWED_KEY } from "./freeze-owed-format";

/** Same API as freeze-owed-store.ts, in this browser's `localStorage`. */

export async function readFreezeOwedText(): Promise<string | null> {
  return localStorage.getItem(LEGACY_FREEZE_OWED_KEY);
}

export async function writeFreezeOwedText(text: string): Promise<void> {
  localStorage.setItem(LEGACY_FREEZE_OWED_KEY, text);
}
