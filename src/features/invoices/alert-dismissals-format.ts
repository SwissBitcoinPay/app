/**
 * Storage key of the warnings about assistants the owner answered "This is expected" on this
 * device (src/features/invoices/assistant-alerts.ts): on the device only.
 * Never rename it: installed apps keep the answers there.
 */
export const ASSISTANT_ALERTS_KEY = "assistant-alerts-dismissed";

/** Format of the stored record. A change of format needs a new version. */
const FORMAT_VERSION = 1;

/** At most this many answers kept: the oldest go first (an alert's key is a short text). */
export const MAX_DISMISSALS = 200;

/** Longest key of an alert kept (assistantAlertKey: an id, a kind, two numbers). */
const MAX_KEY_LENGTH = 120;

export function serializeDismissals(keys: readonly string[]): string {
  return JSON.stringify({ version: FORMAT_VERSION, keys: keys.slice(-MAX_DISMISSALS) });
}

/** The stored answers, oldest first; none when absent, damaged or of another format. */
export function parseStoredDismissals(stored: string | null): string[] {
  if (stored === null) return [];
  try {
    const value = JSON.parse(stored) as { version?: unknown; keys?: unknown } | null;
    if (value?.version !== FORMAT_VERSION || !Array.isArray(value.keys)) return [];
    return value.keys
      .filter(
        (key): key is string =>
          typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH
      )
      .slice(-MAX_DISMISSALS);
  } catch {
    return [];
  }
}
