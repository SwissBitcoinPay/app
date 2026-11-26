import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { CARD_WALLETS_NAME } from "@/lib/breez/card-wallet-names";
import { STORAGE_DIR_NAME } from "@/lib/breez/storage";
import { deleteCardItem, getCardItem, setCardItem } from "@/lib/card/card-keychain";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import { APP_LOG_DIR_NAME } from "@/lib/log/journal";
import { logFailure } from "@/lib/log/log";
import { setCurrentRelays } from "@/lib/relays/current";
import { RELAYS_KEY, parseStoredRelays } from "@/lib/relays/stored";
import { SETTINGS_DIR_NAME } from "@/lib/settings/store";

/*
 * What "Open with my 12 words" leaves on the device, taken back once it closes (a borrowed phone
 * keeps nothing of the business). An opening with the
 * words writes as any opening does: the account's settings, the device's relays (session.ts), its
 * cards' states (card-store.ts), its wallets' storage (the SDK's, which the words restore), and an
 * export leaves its file in the cache (share.ts). Before the rescue opens, the names of the files
 * there already are noted, and the values of the keys it writes (the device's relays, its cards'
 * states: the device's own may hold changes not published yet); once it closes, the files that
 * appeared since are removed and those keys are as they were. Nothing else is touched: what the
 * device held before stays
 * (its own account's, the v2 migration's), and so do the app's journal, a card's wakes, its
 * payments. The note is kept on the device until then: a rescue the app could not close (stopped
 * meanwhile) is taken back at the next launch (_layout.tsx), before anything reads the relays.
 * Same API on the web: traces.web.ts.
 *
 * Within a directory the device held before, only its first entries are looked at (the SDK's
 * databases are one directory per network: an account's wallet opened on a device where another
 * account's is stays there, as a login would leave it; a card's wallet is one directory per card
 * and generation).
 */

/**
 * IRREVERSIBLE: storage key of the note, on the device only (device-wipe.ts removes it). Never
 * rename it: a rescue left open would never be taken back.
 */
export const RESCUE_TRACES_KEY = "rescue-traces";

/** Format of the note. A change of format needs a new version. */
const TRACES_VERSION = 1;

type Traces = {
  version: typeof TRACES_VERSION;
  /** Each of WATCHED_KEYS as stored before, null when absent. */
  values: Record<string, string | null>;
  /** Entries of the WATCHED directories there before (watchedEntries). */
  entries: string[];
};

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The secure storage's entries a rescue writes. */
const WATCHED_KEYS = [RELAYS_KEY, CARD_STATES_KEY] as const;

type Watched = (typeof WATCHED_KEYS)[number];

/** Each watched entry where its module keeps it: both with the card items (card-keychain.ts). */
const watched: Record<
  Watched,
  {
    get(): Promise<string | null>;
    set(value: string): Promise<void>;
    delete(): Promise<void>;
  }
> = {
  [RELAYS_KEY]: {
    get: () => getCardItem(RELAYS_KEY),
    set: (value) => setCardItem(RELAYS_KEY, value),
    delete: () => deleteCardItem(RELAYS_KEY)
  },
  [CARD_STATES_KEY]: {
    get: () => getCardItem(CARD_STATES_KEY),
    set: (value) => setCardItem(CARD_STATES_KEY, value),
    delete: () => deleteCardItem(CARD_STATES_KEY)
  }
};

/** The documents' directories a rescue writes in, and how deep its own entries lie in each. */
const WATCHED_DIRECTORIES = [
  { name: SETTINGS_DIR_NAME, depth: 1 },
  { name: STORAGE_DIR_NAME, depth: 1 },
  { name: CARD_WALLETS_NAME, depth: 2 }
] as const;

/** The note of the rescue open, as written (in memory: the secure storage may refuse it). */
let pending: Traces | null = null;

type Entry = File | Directory;

/**
 * The watched entries on the device now, by name: `document:<dir>[/<entry>…]` to their depth, and
 * the cache's own (`cache:<file>`) but the app's journal.
 */
function watchedEntries(): Map<string, Entry> {
  const found = new Map<string, Entry>();
  const walk = (directory: Directory, name: string, depth: number) => {
    found.set(name, directory);
    if (depth === 0) return;
    for (const entry of directory.list()) {
      const path = `${name}/${entry.name}`;
      if (entry instanceof Directory) walk(entry, path, depth - 1);
      else found.set(path, entry);
    }
  };
  for (const { name, depth } of WATCHED_DIRECTORIES) {
    const directory = new Directory(Paths.document, name);
    if (directory.exists) walk(directory, `document:${name}`, depth);
  }
  const cache = new Directory(Paths.cache);
  if (cache.exists) {
    for (const entry of cache.list()) {
      if (entry.name !== APP_LOG_DIR_NAME) found.set(`cache:${entry.name}`, entry);
    }
  }
  return found;
}

function isTraces(value: unknown): value is Traces {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const values = v.values as Record<string, unknown> | null | undefined;
  return (
    v.version === TRACES_VERSION &&
    typeof values === "object" &&
    values !== null &&
    WATCHED_KEYS.every((key) => values[key] === null || typeof values[key] === "string") &&
    Array.isArray(v.entries) &&
    v.entries.every((item) => typeof item === "string")
  );
}

/** The note on the device: null without; "unreadable" when it cannot tell what was there. */
async function storedTraces(): Promise<Traces | null | "unreadable"> {
  const stored = await SecureStore.getItemAsync(RESCUE_TRACES_KEY, OPTIONS);
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return isTraces(value) ? value : "unreadable";
  } catch {
    return "unreadable";
  }
}

/**
 * Notes what the device holds before a rescue opens (openRescue): taken back by
 * removeRescueTraces. A rescue's traces not taken back yet are first. Rejects when the device
 * could not be read: the rescue does not open then.
 */
export async function noteTracesBeforeRescue(): Promise<void> {
  await removeRescueTraces();
  const values: Record<string, string | null> = {};
  for (const key of WATCHED_KEYS) values[key] = await watched[key].get();
  const traces: Traces = {
    version: TRACES_VERSION,
    values,
    entries: [...watchedEntries().keys()]
  };
  pending = traces;
  try {
    await SecureStore.setItemAsync(RESCUE_TRACES_KEY, JSON.stringify(traces), OPTIONS);
  } catch (error) {
    // Taken back at its close all the same; only a rescue the app could not close stays.
    logFailure("Noting the device before the rescue failed", error);
  }
}

/**
 * Takes back what a rescue left (see above): at its close (closeRescue), and at launch for one the
 * app could not close. Nothing to take back: nothing done. The note stays when something could not
 * be removed (tried again at the next launch). Never rejects.
 */
export async function removeRescueTraces(): Promise<void> {
  let traces: Traces | null;
  try {
    const stored = pending ?? (await storedTraces());
    if (stored === "unreadable") {
      // What was there cannot be told: nothing is removed, never the device's own.
      logFailure("Unreadable note of the device before a rescue");
      await SecureStore.deleteItemAsync(RESCUE_TRACES_KEY, OPTIONS);
      return;
    }
    traces = stored;
  } catch (error) {
    logFailure("Reading the note of the device before a rescue failed", error);
    return;
  }
  if (!traces) return;
  const before = traces;
  let failed = false;
  const attempt = async (step: string, run: () => unknown) => {
    try {
      await run();
    } catch (error) {
      failed = true;
      logFailure(`Taking back the rescue's traces failed: ${step}`, error);
    }
  };
  for (const key of WATCHED_KEYS) {
    await attempt("a key", async () => {
      const value = before.values[key] ?? null;
      if (value === null) await watched[key].delete();
      else await watched[key].set(value);
    });
  }
  // The relays in memory too: what reads them now (the welcome screen) reads the device's again.
  const relays = before.values[RELAYS_KEY] ?? null;
  setCurrentRelays(relays === null ? null : readRelays(relays));
  await attempt("the files", () => {
    const kept = new Set(before.entries);
    const removed: string[] = [];
    // Shortest first: a directory that appeared goes with what is in it.
    const found = [...watchedEntries()].sort(([a], [b]) => a.length - b.length);
    for (const [name, entry] of found) {
      if (kept.has(name) || removed.some((gone) => name.startsWith(`${gone}/`))) continue;
      entry.delete();
      removed.push(name);
    }
  });
  if (failed) return;
  pending = null;
  await attempt("the note", () => SecureStore.deleteItemAsync(RESCUE_TRACES_KEY, OPTIONS));
}

/** A stored list of relays (RELAYS_KEY's value), as the device reads it. */
function readRelays(stored: string): string[] | null {
  try {
    return parseStoredRelays(JSON.parse(stored));
  } catch {
    return null;
  }
}
