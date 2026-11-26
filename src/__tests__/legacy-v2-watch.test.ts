import * as SecureStore from "expo-secure-store";

import { wipeDevice } from "@/features/settings/device-wipe";
import { legacyAccountKey, legacyWatchKey } from "@/lib/legacy-v2/wallet";
import {
  LEGACY_WATCH_KEY,
  LEGACY_WATCH_VERSION,
  legacyWatchText,
  parseLegacyWatch
} from "@/lib/legacy-v2/watch-format";
import { loadLegacyWatch, saveLegacyWatch } from "@/lib/legacy-v2/watch-store";

/*
 * The device's watch of the v2 wallet (watch-format.ts): its public key and where the next look
 * starts. IRREVERSIBLE: the key's name and the format, locked here.
 */

const WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";

async function watchOf(from = { 0: 3, 1: 1 }) {
  return {
    xpub: legacyWatchKey(await legacyAccountKey(WORDS.split(" "))),
    from,
    checkedAt: 1_800_000_000_000
  };
}

describe("the watch of the v2 wallet", () => {
  it("keeps its name and its format", async () => {
    expect(LEGACY_WATCH_KEY).toBe("legacy-v2-watch");
    expect(LEGACY_WATCH_VERSION).toBe(1);
    const watch = await watchOf();
    expect(JSON.parse(legacyWatchText(watch))).toEqual({
      version: 1,
      xpub: watch.xpub,
      from: { 0: 3, 1: 1 },
      checkedAt: 1_800_000_000_000
    });
    expect(parseLegacyWatch(legacyWatchText(watch))).toEqual(watch);
  });

  it("refuses a value out of shape, and never writes over a newer app's", async () => {
    const watch = await watchOf();
    const value = JSON.parse(legacyWatchText(watch)) as Record<string, unknown>;
    for (const broken of [
      { ...value, xpub: "zpub6r" },
      { ...value, from: { 0: -1, 1: 0 } },
      { ...value, checkedAt: "now" },
      { ...value, version: 0 }
    ]) {
      expect(parseLegacyWatch(JSON.stringify(broken))).toBeNull();
    }
    expect(parseLegacyWatch("{")).toBeNull();

    await SecureStore.setItemAsync(LEGACY_WATCH_KEY, JSON.stringify({ ...value, version: 2 }));
    await expect(loadLegacyWatch()).resolves.toEqual({ watch: null, newer: true });
    await saveLegacyWatch(watch);
    expect(JSON.parse((await SecureStore.getItemAsync(LEGACY_WATCH_KEY))!)).toMatchObject({
      version: 2
    });
  });

  it('is saved, read back, and goes with "Log out"', async () => {
    const watch = await watchOf();
    await saveLegacyWatch(watch);
    await expect(loadLegacyWatch()).resolves.toEqual({ watch, newer: false });

    await wipeDevice();
    await expect(loadLegacyWatch()).resolves.toEqual({ watch: null, newer: false });
  });
});

describe("the watch of the v2 wallet on the web", () => {
  const entries = new Map<string, string>();
  const web = jest.requireActual<typeof import("@/lib/legacy-v2/watch-store.web")>(
    "@/lib/legacy-v2/watch-store.web"
  );

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => void entries.set(key, String(value)),
        removeItem: (key: string) => void entries.delete(key)
      }
    });
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  beforeEach(() => entries.clear());

  it("is kept in the browser's localStorage, under the same name and format", async () => {
    await expect(web.loadLegacyWatch()).resolves.toEqual({ watch: null, newer: false });
    const watch = await watchOf();
    await web.saveLegacyWatch(watch);
    expect(entries.get(LEGACY_WATCH_KEY)).toBe(legacyWatchText(watch));
    await expect(web.loadLegacyWatch()).resolves.toEqual({ watch, newer: false });
  });

  it("never writes over a newer app's", async () => {
    const watch = await watchOf();
    const newer = JSON.stringify({ ...JSON.parse(legacyWatchText(watch)), version: 2 });
    entries.set(LEGACY_WATCH_KEY, newer);
    await expect(web.loadLegacyWatch()).resolves.toEqual({ watch: null, newer: true });
    await web.saveLegacyWatch(watch);
    expect(entries.get(LEGACY_WATCH_KEY)).toBe(newer);
  });
});
