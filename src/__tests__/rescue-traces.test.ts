import { waitFor } from "@testing-library/react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, updateAccount } from "@/features/account/session";
import { resetDeviceRelays, saveDeviceRelays } from "@/features/relays/device-relays";
import {
  closeRescue,
  openRescue,
  readRescueCards,
  readRescueWalletFunds
} from "@/features/rescue/rescue";
import { RESCUE_TRACES_KEY, removeRescueTraces } from "@/features/rescue/traces";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { fetchBackup } from "@/lib/backup/settings-backup";
import { walletSecret } from "@/lib/breez/seed";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import { currentRelays, hasOwnRelays } from "@/lib/relays/current";
import { RELAYS_KEY } from "@/lib/relays/stored";

import { TEST_MNEMONIC, openMerchantAccount, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * What "Open with my 12 words" leaves on the device, taken back once it closes (traces.ts): a
 * borrowed phone keeps nothing of the business, and a phone
 * that held something before keeps it as it was.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const WORDS = TEST_MNEMONIC.split(" ");
/** The account's own relays, chosen on another device: not the device's list. */
const ACCOUNT_RELAYS = ["wss://relay-a.example", "wss://relay-b.example", "wss://relay-c.example"];

/**
 * Everything the app keeps on the device: the documents' and the cache's files, the keys. Not the
 * app's journal, which the rescue never touches (support reads it).
 */
function device() {
  return {
    files: [...fileSystem.files.keys()].filter((file) => !file.includes("/cache/app-log/")).sort(),
    keys: [...secureStore.items.keys()].sort()
  };
}

/** A merchant's account backed up on its own relays only, unknown to this device (a new phone). */
async function accountOnRelaysOnly(): Promise<void> {
  const keys = deriveBackupKeys(walletSecret(testSeed()));
  await openMerchantAccount({ businessName: "Fine Bakery" });
  await updateAccount({ relays: ACCOUNT_RELAYS });
  await waitFor(async () => {
    const backup = await fetchBackup(keys, ACCOUNT_RELAYS);
    expect(backup.newest?.relays).toEqual(ACCOUNT_RELAYS);
  });
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetDeviceRelays();
}

/** The rescue as its owner uses it: the funds read, the cards read, a history exported. */
async function useRescue(): Promise<void> {
  const opening = await openRescue(WORDS, "Merchant");
  expect(opening.kind).toBe("account");
  await readRescueWalletFunds(opening.walletId);
  await readRescueCards();
  // An export's file, as share.ts writes it.
  new File(Paths.cache, "Fine Bakery 2026.csv").writeSync("date,amount\n");
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  sdk.resetFakeWallet();
  sdk.resetFakeSend();
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await closeRescue();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("a rescue on a borrowed phone", () => {
  it("leaves nothing of the business once it closes", async () => {
    await accountOnRelaysOnly();
    const before = device();
    expect(before).toEqual({ files: [], keys: [] });

    await useRescue();
    // What it wrote meanwhile, as any opening does: the settings, the relays, the cards, the export.
    const during = device();
    expect(during.files.some((file) => file.includes("/merchant-settings/"))).toBe(true);
    expect(during.files.some((file) => file.endsWith(".csv"))).toBe(true);
    expect(during.keys).toEqual(
      expect.arrayContaining([CARD_STATES_KEY, RELAYS_KEY, RESCUE_TRACES_KEY])
    );
    expect(currentRelays()).toEqual(ACCOUNT_RELAYS);

    await closeRescue();

    expect(device()).toEqual(before);
    // The default list again, in memory too: the welcome screen reads it.
    expect(hasOwnRelays()).toBe(false);
  });

  it("is taken back at the next launch when the app stopped before it closed", async () => {
    await accountOnRelaysOnly();
    await useRescue();
    const note = secureStore.items.get(RESCUE_TRACES_KEY)!;
    const left = device();
    await closeRescue();
    // What a rescue left, and its note, as an app stopped during it leaves them.
    new Directory(Paths.document, "merchant-settings").create();
    for (const file of left.files) fileSystem.files.set(file, "{}");
    for (const key of left.keys) secureStore.items.set(key, "{}");
    secureStore.items.set(RESCUE_TRACES_KEY, note);
    expect(device()).toEqual(left);

    // The next launch (_layout.tsx).
    await removeRescueTraces();

    expect(device()).toEqual({ files: [], keys: [] });
  });

  it("notes the names of the files there, and the values of the keys it writes only", async () => {
    await accountOnRelaysOnly();
    // The device's own list saved ("Advanced settings"): the default one, where the backup is.
    await saveDeviceRelays(DEFAULT_RELAYS);
    await useRescue();

    const note = secureStore.items.get(RESCUE_TRACES_KEY)!;
    expect(JSON.parse(note)).toEqual({
      version: 1,
      values: {
        [RELAYS_KEY]: expect.stringContaining(DEFAULT_RELAYS[0]!),
        [CARD_STATES_KEY]: null
      },
      entries: []
    });
  });
});

describe("a rescue on a phone that held something before", () => {
  /** The device's own list ("Advanced settings"): the default one, where the backup is found. */
  const OWN_RELAYS = DEFAULT_RELAYS;
  const SETTINGS = new Directory(Paths.document, "merchant-settings");
  const WALLETS = new Directory(Paths.document, "breez-sdk-spark");

  /** What the phone held: another account's settings and wallet, its cards, its relays, a file. */
  async function holdSomething(): Promise<void> {
    SETTINGS.create();
    new File(SETTINGS, "another-account.json").writeSync("{}");
    WALLETS.create();
    new Directory(WALLETS, "bitcoin").create();
    new File(new Directory(WALLETS, "bitcoin"), "storage.sql").writeSync("");
    new File(Paths.cache, "invoice-12.pdf").writeSync("");
    secureStore.items.set(CARD_STATES_KEY, '{"own":true}');
    await saveDeviceRelays(OWN_RELAYS);
  }

  it("keeps it as it was, the device's relays back to its own", async () => {
    await accountOnRelaysOnly();
    await holdSomething();
    const before = device();

    await useRescue();
    await closeRescue();

    expect(device()).toEqual(before);
    expect(secureStore.items.get(CARD_STATES_KEY)).toBe('{"own":true}');
    expect(currentRelays()).toEqual(OWN_RELAYS);
  });
});

describe("the note of the device before a rescue", () => {
  it("removes nothing when it cannot be read: what was there cannot be told", async () => {
    new File(Paths.cache, "invoice-12.pdf").writeSync("");
    secureStore.items.set(CARD_STATES_KEY, "{}");
    secureStore.items.set(RESCUE_TRACES_KEY, '{"version":2}');

    await removeRescueTraces();

    expect(device()).toEqual({
      files: [expect.stringContaining("invoice-12.pdf")],
      keys: [CARD_STATES_KEY]
    });
  });

  it("stays until what the rescue left could be removed, for the next launch", async () => {
    await accountOnRelaysOnly();
    await useRescue();
    jest
      .mocked(SecureStore.deleteItemAsync)
      .mockRejectedValueOnce(new Error("Keychain unavailable"));

    await closeRescue();

    expect(secureStore.items.has(RESCUE_TRACES_KEY)).toBe(true);
    // The next launch: everything goes.
    await removeRescueTraces();
    expect(device()).toEqual({ files: [], keys: [] });
  });
});

describe("a rescue in the browser (traces.web.ts)", () => {
  const entries = new Map<string, string>();
  const databases = new Set<string>();
  const web = jest.requireActual<typeof import("@/features/rescue/traces.web")>(
    "@/features/rescue/traces.web"
  );

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        get length() {
          return entries.size;
        },
        key: (index: number) => [...entries.keys()][index] ?? null,
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => void entries.set(key, String(value)),
        removeItem: (key: string) => void entries.delete(key)
      }
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        databases: async () => [...databases].map((name) => ({ name })),
        deleteDatabase: (name: string) => {
          const request: { onsuccess?: () => void } = {};
          setTimeout(() => {
            databases.delete(name);
            request.onsuccess?.();
          }, 0);
          return request;
        }
      }
    });
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });

  beforeEach(() => {
    entries.clear();
    databases.clear();
  });

  it("takes back the account's settings, its wallets' databases and the relays, nothing else", async () => {
    // What the browser held: another account's settings and wallet, its own relays, an entry.
    entries.set("merchant-settings/another", "{}");
    entries.set(RELAYS_KEY, '{"version":1,"relays":["wss://own.example"]}');
    entries.set("theme", "dark");
    databases.add("breez-sdk-spark/bitcoin/another");
    await web.noteTracesBeforeRescue();
    const before = new Map(entries);
    before.delete(web.RESCUE_TRACES_KEY);

    // What the rescue wrote, as any opening does.
    entries.set("merchant-settings/rescued", "{}");
    entries.set(RELAYS_KEY, '{"version":1,"relays":["wss://rescued.example"]}');
    databases.add("breez-sdk-spark/bitcoin/rescued");
    databases.add("breez-sdk-spark-cards/30c19d9bfae333c1cb42a5ce6e20debb/1");

    await web.removeRescueTraces();

    expect(entries).toEqual(before);
    expect([...databases]).toEqual(["breez-sdk-spark/bitcoin/another"]);
  });

  it("is taken back at the next load when the tab closed before it", async () => {
    await web.noteTracesBeforeRescue();
    entries.set("merchant-settings/rescued", "{}");
    const note = entries.get(web.RESCUE_TRACES_KEY)!;
    // The page loaded again: only the note in localStorage tells what was there.
    await web.removeRescueTraces();
    entries.set("merchant-settings/rescued", "{}");
    entries.set(web.RESCUE_TRACES_KEY, note);

    await web.removeRescueTraces();

    expect([...entries.keys()]).toEqual([]);
  });
});
