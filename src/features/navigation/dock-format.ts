import { parseDock, type Destination } from "./destinations";

/** Storage key, on the device only. Never rename it: installed apps keep their choice there. */
export const DOCK_STORE_KEY = "navigation-dock";

/** Format of the stored record. A change of format needs a new version. */
const DOCK_FORMAT_VERSION = 1;

export function serializeDock(dock: readonly Destination[]): string {
  return JSON.stringify({ version: DOCK_FORMAT_VERSION, slots: dock });
}

/** A stored record, null when absent, damaged or of another format. */
export function parseStoredDock(stored: string | null): Destination[] | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; slots?: unknown } | null;
    return value?.version === DOCK_FORMAT_VERSION ? parseDock(value.slots) : null;
  } catch {
    return null;
  }
}
