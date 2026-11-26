import { CARD_WALLETS_NAME } from "@/lib/breez/card-wallet-names";
import { logFailure } from "@/lib/log/log";
import { setCurrentRelays } from "@/lib/relays/current";
import { RELAYS_KEY, parseStoredRelays } from "@/lib/relays/stored";

/*
 * Same API as traces.ts, in the browser: what a rescue leaves in this browser, taken back once it
 * closes, and at the next load for one the page could not close (a tab closed meanwhile). The
 * account's settings (`merchant-settings/<id>` in `localStorage`, store.web.ts), the device's
 * relays, and the Breez SDK's databases of its wallets (IndexedDB, `breez-sdk-spark…`, which the
 * words restore). An export is the browser's download: out of the app's reach. Nothing the browser
 * held before is touched.
 */

/** IRREVERSIBLE: the note's entry in `localStorage`. Never rename it. */
export const RESCUE_TRACES_KEY = "rescue-traces";

const TRACES_VERSION = 1;

/** The `localStorage` entries of the accounts' settings (store.web.ts). */
const SETTINGS_PREFIX = "merchant-settings/";

/** The Breez SDK's databases (wallet.web.ts, device-wipe.web.ts). */
const BREEZ_DATABASES = ["breez-sdk-spark", CARD_WALLETS_NAME];

type Traces = {
  version: typeof TRACES_VERSION;
  /** The settings' entries there before. */
  keys: string[];
  /** The device's relays as stored before, null without. */
  relays: string | null;
  /** The SDK's databases there before. */
  databases: string[];
};

let pending: Traces | null = null;

function settingsKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(SETTINGS_PREFIX)) keys.push(key);
  }
  return keys;
}

async function breezDatabases(): Promise<string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];
  return (await indexedDB.databases())
    .map(({ name }) => name)
    .filter(
      (name): name is string => !!name && BREEZ_DATABASES.some((prefix) => name.startsWith(prefix))
    );
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("A database was not deleted"));
    // Another tab holds it open: deleted once it closes it.
    request.onblocked = () => resolve();
  });
}

function isTraces(value: unknown): value is Traces {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const strings = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  return (
    v.version === TRACES_VERSION &&
    strings(v.keys) &&
    (v.relays === null || typeof v.relays === "string") &&
    strings(v.databases)
  );
}

function storedTraces(): Traces | null | "unreadable" {
  const stored = localStorage.getItem(RESCUE_TRACES_KEY);
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return isTraces(value) ? value : "unreadable";
  } catch {
    return "unreadable";
  }
}

/** As traces.ts: what the browser holds, noted before a rescue opens. */
export async function noteTracesBeforeRescue(): Promise<void> {
  await removeRescueTraces();
  const traces: Traces = {
    version: TRACES_VERSION,
    keys: settingsKeys(),
    relays: localStorage.getItem(RELAYS_KEY),
    databases: await breezDatabases()
  };
  pending = traces;
  try {
    localStorage.setItem(RESCUE_TRACES_KEY, JSON.stringify(traces));
  } catch (error) {
    logFailure("Noting the browser before the rescue failed", error);
  }
}

/** As traces.ts: what appeared since the note is removed, the relays as they were. */
export async function removeRescueTraces(): Promise<void> {
  let traces: Traces | null;
  try {
    const stored = pending ?? storedTraces();
    if (stored === "unreadable") {
      logFailure("Unreadable note of the browser before a rescue");
      localStorage.removeItem(RESCUE_TRACES_KEY);
      return;
    }
    traces = stored;
  } catch (error) {
    logFailure("Reading the note of the browser before a rescue failed", error);
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
  await attempt("the settings", () => {
    for (const key of settingsKeys()) {
      if (!before.keys.includes(key)) localStorage.removeItem(key);
    }
  });
  await attempt("the relays", () => {
    if (before.relays === null) localStorage.removeItem(RELAYS_KEY);
    else localStorage.setItem(RELAYS_KEY, before.relays);
    setCurrentRelays(before.relays === null ? null : readRelays(before.relays));
  });
  await attempt("the databases", async () => {
    const added = (await breezDatabases()).filter((name) => !before.databases.includes(name));
    await Promise.all(added.map(deleteDatabase));
  });
  if (failed) return;
  pending = null;
  await attempt("the note", () => localStorage.removeItem(RESCUE_TRACES_KEY));
}

function readRelays(stored: string): string[] | null {
  try {
    return parseStoredRelays(JSON.parse(stored));
  } catch {
    return null;
  }
}
