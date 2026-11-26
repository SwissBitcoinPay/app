import { parseRelayList } from "./list";

/** Storage key, on the device only. Never rename it: installed apps keep their data there. */
export const RELAYS_KEY = "nostr-relays";

/** Format of the stored record. A change of format needs a new version and a migration. */
const STORED_RELAYS_VERSION = 1;

type StoredRelays = { version: typeof STORED_RELAYS_VERSION; relays: string[] };

export function storedRelays(relays: readonly string[]): StoredRelays {
  return { version: STORED_RELAYS_VERSION, relays: [...relays] };
}

/** The list of a stored record; anything else counts as none (the default list applies). */
export function parseStoredRelays(value: unknown): string[] | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return v.version === STORED_RELAYS_VERSION ? parseRelayList(v.relays) : null;
}
