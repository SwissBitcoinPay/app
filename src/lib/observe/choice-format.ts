/**
 * Storage key of "Send crash reports", on the device only (observe.ts). Never
 * rename it: installed apps keep their choice there.
 */
export const OBSERVE_CHOICE_KEY = "observe-reports";

/** Format of the stored record. A change of format needs a new version. */
const OBSERVE_CHOICE_VERSION = 1;

export function serializeObserveChoice(send: boolean): string {
  return JSON.stringify({ version: OBSERVE_CHOICE_VERSION, send });
}

/**
 * A stored record: whether reports leave this device; null when absent, damaged or of another
 * format (a newer app's: the default then, never written over unasked).
 */
export function parseObserveChoice(stored: string | null): boolean | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; send?: unknown } | null;
    return value?.version === OBSERVE_CHOICE_VERSION && typeof value.send === "boolean"
      ? value.send
      : null;
  } catch {
    return null;
  }
}
