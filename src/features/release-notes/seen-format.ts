/**
 * Storage key of the release notes last opened on this device ("What's new"), on the device only.
 * Never rename it: installed apps keep it there. The one key "Log out" leaves (device-wipe.ts):
 * "What's new" opens by itself once per device.
 */
export const RELEASE_NOTES_SEEN_KEY = "release-notes-seen";

/** Format of the stored record. A change of format needs a new version. */
const SEEN_FORMAT_VERSION = 1;

/** The longest key of notes stored: a version ("2.10.0") or "next". */
const MAX_KEY_LENGTH = 32;

export function serializeSeen(key: string): string {
  return JSON.stringify({ version: SEEN_FORMAT_VERSION, seen: key });
}

/** The key of the notes last opened, null when absent, damaged or of another format. */
export function parseStoredSeen(stored: string | null): string | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; seen?: unknown } | null;
    if (
      value?.version !== SEEN_FORMAT_VERSION ||
      typeof value.seen !== "string" ||
      value.seen.length === 0 ||
      value.seen.length > MAX_KEY_LENGTH
    ) {
      return null;
    }
    return value.seen;
  } catch {
    return null;
  }
}
