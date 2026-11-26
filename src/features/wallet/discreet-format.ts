/**
 * Storage key of "Discreet" (remembered on the device), on the device only.
 * Never rename it: installed apps keep the choice there.
 */
export const DISCREET_STORE_KEY = "wallet-discreet";

/** Format of the stored record. A change of format needs a new version. */
const DISCREET_FORMAT_VERSION = 1;

export function serializeDiscreet(hidden: boolean): string {
  return JSON.stringify({ version: DISCREET_FORMAT_VERSION, hidden });
}

/** A stored record, null when absent, damaged or of another format. */
export function parseStoredDiscreet(stored: string | null): boolean | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; hidden?: unknown } | null;
    if (value?.version !== DISCREET_FORMAT_VERSION || typeof value.hidden !== "boolean") {
      return null;
    }
    return value.hidden;
  } catch {
    return null;
  }
}
