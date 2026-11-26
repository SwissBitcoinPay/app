/**
 * What the point of sale shows (one selector "Amount" / "Items" /
 * "Scan"): an amount typed at the keypad, the catalogue's
 * articles, or the scan. Remembered on this device, the scan too (the app left on the scan opens
 * on it again).
 */
export type PosMode = "amount" | "articles" | "scan";

/** Storage key, on the device only. Never rename it: installed apps keep the choice there. */
export const POS_MODE_STORE_KEY = "terminal-pos-mode";

/**
 * Format of the stored record. A change of format needs a new version. Version 1 holds
 * "Amount" or "Items"; version 2 adds the scan. Each choice is written in the oldest
 * version that holds it: an app older than the scan (an OTA rollback of staging) still reads
 * "Amount" and "Items", and reads the scan as none (its keypad).
 */
const FIRST_VERSION = 1;
const SCAN_VERSION = 2;

export function serializePosMode(mode: PosMode): string {
  return JSON.stringify({ version: mode === "scan" ? SCAN_VERSION : FIRST_VERSION, mode });
}

/** A stored record, null when absent, damaged or of another format. */
export function parseStoredPosMode(stored: string | null): PosMode | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; mode?: unknown } | null;
    if (value?.version === FIRST_VERSION) {
      return value.mode === "amount" || value.mode === "articles" ? value.mode : null;
    }
    if (value?.version === SCAN_VERSION) {
      return value.mode === "amount" || value.mode === "articles" || value.mode === "scan"
        ? value.mode
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
