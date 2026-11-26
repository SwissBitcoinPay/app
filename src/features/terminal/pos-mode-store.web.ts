import {
  POS_MODE_STORE_KEY,
  parseStoredPosMode,
  serializePosMode,
  type PosMode
} from "./pos-mode-format";

/** Same API as pos-mode-store.ts, in this browser's `localStorage`. */

export async function loadPosMode(): Promise<PosMode | null> {
  try {
    return parseStoredPosMode(localStorage.getItem(POS_MODE_STORE_KEY));
  } catch {
    return null;
  }
}

export async function savePosMode(mode: PosMode): Promise<void> {
  localStorage.setItem(POS_MODE_STORE_KEY, serializePosMode(mode));
}
