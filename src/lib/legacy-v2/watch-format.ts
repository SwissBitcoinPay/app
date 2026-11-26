/*
 * What this device keeps to look later for what the v2 service still pays the v2 wallet (its last
 * payouts, a till still on the v2 app: src/features/migration/transfer.ts), without its words: the
 * wallet's public key (it spends nothing), where the next look starts on each chain, and when the
 * last one ran. Public data, in the secure storage as the app's other values (watch-store.ts; the
 * browser's localStorage on the web, watch-store.web.ts).
 *
 * IRREVERSIBLE: the key's name (wiped by "Log out", device-wipe.ts) and the format: a change
 * needs a new `version`, and a value of a newer one is never written over.
 */

/** The secure storage's key. */
export const LEGACY_WATCH_KEY = "legacy-v2-watch";

/** 1: the public key, the next index of each chain, the last look. */
export const LEGACY_WATCH_VERSION = 1;

export type LegacyWatch = {
  /** The v2 wallet's account public key (BIP-32, `xpub…`, legacyWatchKey). */
  xpub: string;
  /** By chain (receive 0, change 1): the first index the next look reads. */
  from: { 0: number; 1: number };
  /** Unix milliseconds of the last look (a transfer's included). */
  checkedAt: number;
};

const XPUB = /^xpub[1-9A-HJ-NP-Za-km-z]{100,112}$/;
/** An index above this is no index the v2 wallet reached (LEGACY_WALLET_MAX_ADDRESSES). */
const MAX_INDEX = 1_000_000;

function isIndex(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_INDEX
  );
}

/** A value of a newer version than this app writes. */
export class NewerLegacyWatchError extends Error {
  constructor() {
    super("A newer app's watch of the v2 wallet");
    this.name = "NewerLegacyWatchError";
  }
}

/** The stored value; null when out of shape; NewerLegacyWatchError when of a newer version. */
export function parseLegacyWatch(text: string | null): LegacyWatch | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const watch = value as Record<string, unknown>;
  if (typeof watch.version === "number" && watch.version > LEGACY_WATCH_VERSION) {
    throw new NewerLegacyWatchError();
  }
  if (watch.version !== LEGACY_WATCH_VERSION) return null;
  const { xpub, from, checkedAt } = watch;
  if (typeof xpub !== "string" || !XPUB.test(xpub)) return null;
  if (from === null || typeof from !== "object") return null;
  const chains = from as Record<string, unknown>;
  if (!isIndex(chains["0"]) || !isIndex(chains["1"])) return null;
  if (typeof checkedAt !== "number" || !Number.isSafeInteger(checkedAt) || checkedAt < 0) {
    return null;
  }
  return { xpub, from: { 0: chains["0"], 1: chains["1"] }, checkedAt };
}

/** The value stored for `watch`. */
export function legacyWatchText(watch: LegacyWatch): string {
  return JSON.stringify({
    version: LEGACY_WATCH_VERSION,
    xpub: watch.xpub,
    from: { 0: watch.from[0], 1: watch.from[1] },
    checkedAt: watch.checkedAt
  });
}
