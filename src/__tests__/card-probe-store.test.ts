// What the app shares with its iOS notification service extension for the extension's test
// (src/lib/card/probe-store.ts): the test wallet's seed in their keychain group, the API key and
// the runs in their container, as the extension reads and writes them (CardProbe.swift).
import { Platform } from "react-native";

import { wipeDevice } from "@/features/settings/device-wipe";
import * as native from "@/lib/card/probe-store";
import {
  clearProbeRuns,
  forgetProbe,
  parseProbeRecord,
  prepareProbe,
  PROBE_DIR_NAME,
  PROBE_KEYCHAIN_SERVICE,
  PROBE_SEED_KEY,
  probeAppGroup,
  probeAvailable,
  probePrepared,
  ProbeUnavailableError,
  readProbeRuns,
  recordSentProbe
} from "@/lib/card/probe-store";
import * as web from "@/lib/card/probe-store.web";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
const mockExtra: { cardAppGroup?: unknown; appVariant?: string } = {
  cardAppGroup: GROUP,
  appVariant: "staging"
};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    }
  }
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const { File, Directory, Paths } = fileSystem;

const RUN = "3b241101-e2bb-4255-8caf-4136c566a962";
const OTHER_RUN = "9f0c1d2e-3a4b-4c5d-8e6f-708192a3b4c5";
const SEED_ID = `${PROBE_KEYCHAIN_SERVICE}|${GROUP}|${PROBE_SEED_KEY}`;

function probeDir(): InstanceType<typeof Directory> {
  return new Directory(Paths.appleSharedContainers[GROUP], PROBE_DIR_NAME);
}

/** A record as the extension writes it (Swift's JSONEncoder leaves out what has no value). */
function extensionRecord(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    run: RUN,
    mode: "receive",
    profile: "light",
    device: "iPhone16,1",
    system: "18.4.1",
    startedAt: 1_760_536_800_000,
    processRun: 1,
    steps: [
      { name: "start", atMs: 0, footprintBytes: 6_291_456, availableBytes: 18_874_368 },
      { name: "connect", atMs: 2_100, footprintBytes: 15_728_640, availableBytes: 9_437_184 }
    ],
    outcome: "ok",
    peakFootprintBytes: 17_825_792,
    minAvailableBytes: 7_340_032,
    limitEstimateBytes: 25_165_824,
    totalMs: 6_200,
    balanceSats: 100,
    invoice: "lnbc1u1p5fakeinvoice",
    ...fields
  };
}

function writeRecord(record: Record<string, unknown>, name = `${String(record.run)}.json`) {
  const results = new Directory(probeDir(), "results");
  results.create({ intermediates: true, idempotent: true });
  new File(results, name).writeSync(JSON.stringify(record));
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  fileSystem.setSharedContainers([GROUP]);
  mockExtra.cardAppGroup = GROUP;
  mockExtra.appVariant = "staging";
  jest.replaceProperty(Platform, "OS", "ios");
});

afterEach(() => jest.restoreAllMocks());

describe("where the test runs", () => {
  it("in an iOS build whose app group has a container", () => {
    expect(probeAppGroup()).toBe(GROUP);
    expect(probeAvailable()).toBe(true);
  });

  it("nowhere else: another platform, a build without the app group, no container", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(probeAvailable()).toBe(false);
    expect(readProbeRuns()).toEqual([]);

    jest.replaceProperty(Platform, "OS", "ios");
    mockExtra.cardAppGroup = undefined;
    expect(probeAvailable()).toBe(false);
    mockExtra.cardAppGroup = "not a group";
    expect(probeAppGroup()).toBeNull();

    mockExtra.cardAppGroup = GROUP;
    fileSystem.setSharedContainers([]);
    expect(probeAvailable()).toBe(false);
  });

  it("never in production: its extension pays cards, it runs no test", () => {
    mockExtra.appVariant = "production";
    expect(probeAvailable()).toBe(false);
    expect(readProbeRuns()).toEqual([]);
    mockExtra.appVariant = "staging";
    expect(probeAvailable()).toBe(true);
  });

  it("refuses to prepare a test where there is no extension", async () => {
    fileSystem.setSharedContainers([]);
    await expect(prepareProbe("api-key")).rejects.toBeInstanceOf(ProbeUnavailableError);
    expect(() =>
      recordSentProbe({ run: RUN, mode: "sync", profile: "light", sentAt: 1, ticket: null })
    ).toThrow(ProbeUnavailableError);
  });
});

describe("prepareProbe", () => {
  it("makes the test wallet's seed once, in the shared keychain group, never replaced", async () => {
    expect(await probePrepared()).toBe(false);
    await prepareProbe("api-key");

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(PROBE_SEED_KEY, expect.any(String), {
      keychainService: PROBE_KEYCHAIN_SERVICE,
      accessGroup: GROUP,
      keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
    });
    const seed = secureStore.sharedItems.get(SEED_ID);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    // Never in the app's own keychain items.
    expect(secureStore.items.has(PROBE_SEED_KEY)).toBe(false);
    expect(await probePrepared()).toBe(true);

    // The test wallet may hold sats: a second preparation keeps its seed.
    await prepareProbe("api-key-2");
    expect(secureStore.sharedItems.get(SEED_ID)).toBe(seed);
  });

  it("writes the API key where the extension reads it", async () => {
    await prepareProbe("api-key");
    const config = JSON.parse(new File(probeDir(), "config.json").textSync());
    expect(config).toEqual({ version: 1, apiKey: "api-key" });
  });

  it("refuses a seed it did not make, without replacing it", async () => {
    secureStore.sharedItems.set(SEED_ID, "not hex");
    await expect(prepareProbe("api-key")).rejects.toThrow(/out of shape/);
    expect(secureStore.sharedItems.get(SEED_ID)).toBe("not hex");
  });
});

describe("readProbeRuns", () => {
  it("joins each run sent to what the extension recorded, the latest first", () => {
    recordSentProbe({ run: RUN, mode: "receive", profile: "light", sentAt: 2_000, ticket: "t1" });
    recordSentProbe({
      run: OTHER_RUN,
      mode: "pay",
      profile: "standard",
      sentAt: 3_000,
      ticket: "t2"
    });
    writeRecord(extensionRecord());

    const runs = readProbeRuns();
    expect(runs.map((run) => run.run)).toEqual([OTHER_RUN, RUN]);
    // Sent, nothing recorded yet.
    expect(runs[0]).toMatchObject({ mode: "pay", profile: "standard", ticket: "t2", record: null });
    expect(runs[1].record).toMatchObject({
      outcome: "ok",
      balanceSats: 100n,
      invoice: "lnbc1u1p5fakeinvoice",
      limitEstimateBytes: 25_165_824,
      failedStep: null,
      feeSats: null,
      details: null
    });
  });

  it("keeps a record whose sending was forgotten", () => {
    writeRecord(extensionRecord());
    expect(readProbeRuns()).toEqual([
      expect.objectContaining({ run: RUN, sentAt: null, ticket: null, record: expect.any(Object) })
    ]);
  });

  it("leaves out what is not a run's record: a damaged file, another name, a draft", () => {
    writeRecord(extensionRecord());
    const results = new Directory(probeDir(), "results");
    new File(results, `${OTHER_RUN}.json`).writeSync("{ damaged");
    new File(results, "notes.json").writeSync(JSON.stringify(extensionRecord({ run: "notes" })));
    new File(results, `${RUN}.json.tmp`).writeSync("{}");
    expect(readProbeRuns().map((run) => run.run)).toEqual([RUN]);
  });

  it("clears the runs, never the test wallet", async () => {
    await prepareProbe("api-key");
    recordSentProbe({ run: RUN, mode: "sync", profile: "light", sentAt: 1, ticket: null });
    writeRecord(extensionRecord());
    clearProbeRuns();
    expect(readProbeRuns()).toEqual([]);
    expect(await probePrepared()).toBe(true);
  });
});

describe("parseProbeRecord", () => {
  it("reads sats exactly, as a number or the SDK's decimal text", () => {
    const record = parseProbeRecord(
      extensionRecord({ mode: "pay", balanceSats: 9_007_199_254_740_991, feeSats: "3" })
    );
    expect(record?.balanceSats).toBe(9_007_199_254_740_991n);
    expect(record?.feeSats).toBe(3n);
    // Past Number's exact range: refused, never rounded.
    expect(parseProbeRecord(extensionRecord({ balanceSats: 2 ** 53 }))).toBeNull();
  });

  it("reads what each step of the runtime probe said", () => {
    const details = "timer: 50 ms; keychain: absent";
    expect(parseProbeRecord(extensionRecord({ mode: "runtime", details }))?.details).toBe(details);
  });

  it("refuses a newer format and anything out of shape", () => {
    expect(parseProbeRecord(extensionRecord())).not.toBeNull();
    const refused: Record<string, unknown>[] = [
      { version: 2 },
      { run: "3B241101-E2BB-4255-8CAF-4136C566A962" },
      { mode: "steal" },
      { profile: "heavy" },
      { outcome: "maybe" },
      { peakFootprintBytes: -1 },
      { steps: [{ name: "start", atMs: 0, footprintBytes: 1 }] },
      { steps: Array.from({ length: 33 }, () => extensionRecord().steps) },
      { error: "x".repeat(1001) },
      { invoice: "x".repeat(2049) },
      { feeSats: "1.5" },
      { totalMs: 1.5 },
      { details: 1 },
      { details: "x".repeat(1001) }
    ];
    for (const fields of refused) {
      expect(parseProbeRecord(extensionRecord(fields))).toBeNull();
    }
    expect(parseProbeRecord(null)).toBeNull();
    expect(parseProbeRecord("record")).toBeNull();
  });
});

describe("forgetting the test", () => {
  it("removes the seed, the test wallet's storage and the runs", async () => {
    await prepareProbe("api-key");
    new Directory(probeDir(), "breez-light").create({ intermediates: true });
    recordSentProbe({ run: RUN, mode: "sync", profile: "light", sentAt: 1, ticket: null });
    await forgetProbe();
    expect(secureStore.sharedItems.has(SEED_ID)).toBe(false);
    expect(probeDir().exists).toBe(false);
  });

  it('with everything else of the device at "Log out"', async () => {
    await prepareProbe("api-key");
    await wipeDevice();
    expect(secureStore.sharedItems.has(SEED_ID)).toBe(false);
    expect(probeDir().exists).toBe(false);
  });

  it("does nothing where there is no extension", async () => {
    fileSystem.setSharedContainers([]);
    await expect(forgetProbe()).resolves.toBeUndefined();
    await expect(wipeDevice()).resolves.toBeUndefined();
  });
});

describe("the web", () => {
  it("has the same API, without the test", async () => {
    expect(Object.keys(web).sort()).toEqual(Object.keys(native).sort());
    expect(web.probeAvailable()).toBe(false);
    expect(web.readProbeRuns()).toEqual([]);
    await expect(web.prepareProbe("api-key")).rejects.toBeInstanceOf(web.ProbeUnavailableError);
  });
});
