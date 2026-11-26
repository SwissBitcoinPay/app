import { devicePasskeyOf, rememberDevicePasskey } from "@/features/account/device-passkey";
import { AccountNotFoundError, closeAccount, openAccount } from "@/features/account/session";
import { wipeDevice } from "@/features/settings/device-wipe";
import { DEFAULT_RELAYS } from "@/config/relays";
import { readLog } from "@/lib/log/log";
import { unixSeconds, type MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import { PASSKEY_RECORD_KEY, parsePasskeyRecord, type PasskeyRecord } from "@/lib/terminal/model";
import { loadPasskeyRecord, savePasskeyRecord } from "@/lib/terminal/profile";

import { testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Which passkey opens this device's account (PasskeyRecord, device-passkey.ts): saved once the
 * account opened with it, read where its passkey is asked while the account is closed (unlocking,
 * a card payment of the app locked: navigation.test.tsx, card-payment.test.ts).
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER_WALLET = "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";

const RECORD: PasskeyRecord = { version: 1, account: WALLET, credentialId: "0a0bff" };

const settings: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: unixSeconds() - 3600,
  signUp: "done",
  businessName: "Merchant 9EE5",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

function bytes(buffer: ArrayBuffer | undefined): number[] | undefined {
  return buffer && Array.from(new Uint8Array(buffer));
}

function open(credentialId?: ArrayBuffer | null) {
  return openAccount({
    seed: testSeed(),
    credentialId,
    walletId: WALLET,
    created: false,
    detect: () => Promise.reject(new Error("No sign-up expected")),
    businessNameWord: "Merchant"
  });
}

beforeEach(() => {
  closeAccount();
  fileSystem.resetFileSystem();
  relays.resetRelays();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => closeAccount());

describe("the record of the account's passkey", () => {
  it("is kept in the secure storage, under a name that never changes", async () => {
    expect(PASSKEY_RECORD_KEY).toBe("terminal-passkey");
    await expect(loadPasskeyRecord()).resolves.toBeNull();
    await savePasskeyRecord(RECORD);
    await expect(loadPasskeyRecord()).resolves.toEqual(RECORD);
    expect(secureStore.setItemAsync).toHaveBeenLastCalledWith(
      "terminal-passkey",
      JSON.stringify(RECORD),
      { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    );
  });

  it("counts anything invalid as none", async () => {
    expect(parsePasskeyRecord(RECORD)).toEqual(RECORD);
    expect(parsePasskeyRecord({ ...RECORD, extra: 1 })).toEqual(RECORD);
    expect(parsePasskeyRecord({ ...RECORD, account: WALLET.toUpperCase() })).toEqual({
      ...RECORD,
      account: WALLET.toUpperCase()
    });
    for (const broken of [
      null,
      "record",
      { ...RECORD, version: 2 },
      { ...RECORD, account: "x" },
      { ...RECORD, account: "a".repeat(64) },
      { ...RECORD, credentialId: "" },
      { ...RECORD, credentialId: "0a0" },
      { ...RECORD, credentialId: "0A0B" },
      { ...RECORD, credentialId: "zz" },
      // A WebAuthn credential id has 1023 bytes at most.
      { ...RECORD, credentialId: "ab".repeat(1024) },
      { ...RECORD, credentialId: 7 }
    ]) {
      expect(parsePasskeyRecord(broken)).toBeNull();
    }
    expect(parsePasskeyRecord({ ...RECORD, credentialId: "ab".repeat(1023) })).not.toBeNull();
    secureStore.items.set(PASSKEY_RECORD_KEY, "{damaged");
    await expect(loadPasskeyRecord()).resolves.toBeNull();
  });

  it("is kept in the browser's localStorage under the same name", async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key)
    };
    try {
      const web = jest.requireActual<typeof import("@/lib/terminal/profile.web")>(
        "@/lib/terminal/profile.web"
      );
      await expect(web.loadPasskeyRecord()).resolves.toBeNull();
      await web.savePasskeyRecord(RECORD);
      expect(JSON.parse(store.get("terminal-passkey")!)).toEqual(RECORD);
      await expect(web.loadPasskeyRecord()).resolves.toEqual(RECORD);
      store.set("terminal-passkey", "{damaged");
      await expect(web.loadPasskeyRecord()).resolves.toBeNull();
    } finally {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("the passkey this device saved for its account", () => {
  it("is the saved one for that account only, its id read back as given", async () => {
    await rememberDevicePasskey(WALLET.toUpperCase(), new Uint8Array([10, 11, 255]).buffer);
    await expect(loadPasskeyRecord()).resolves.toEqual(RECORD);
    expect(bytes(await devicePasskeyOf(WALLET))).toEqual([10, 11, 255]);
    expect(bytes(await devicePasskeyOf(WALLET.toUpperCase()))).toEqual([10, 11, 255]);
    await expect(devicePasskeyOf(OTHER_WALLET)).resolves.toBeUndefined();
  });

  it("is none when nothing was saved, or what was saved is unreadable", async () => {
    await expect(devicePasskeyOf(WALLET)).resolves.toBeUndefined();
    secureStore.items.set(PASSKEY_RECORD_KEY, JSON.stringify({ ...RECORD, version: 2 }));
    await expect(devicePasskeyOf(WALLET)).resolves.toBeUndefined();
  });

  it("saves no id a passkey cannot have", async () => {
    await rememberDevicePasskey(WALLET, new ArrayBuffer(0));
    await rememberDevicePasskey(WALLET, new ArrayBuffer(1024));
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("logs a failed save without throwing", async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(
      rememberDevicePasskey(WALLET, new Uint8Array([1]).buffer)
    ).resolves.toBeUndefined();
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Saving the account's passkey on the device failed"
    );
  });

  it("is saved once the account opened with it, the latest one replacing it", async () => {
    await saveMerchantSettings(WALLET, settings);
    await open(new Uint8Array([1, 2]).buffer);
    expect(bytes(await devicePasskeyOf(WALLET))).toEqual([1, 2]);

    // A platform that did not name the passkey: the saved one stays.
    await open(null);
    expect(bytes(await devicePasskeyOf(WALLET))).toEqual([1, 2]);

    await open(new Uint8Array([3]).buffer);
    expect(bytes(await devicePasskeyOf(WALLET))).toEqual([3]);
  });

  it("is not saved for an account that did not open", async () => {
    // No settings on the device nor on its relays: no account found.
    await expect(open(new Uint8Array([1, 2]).buffer)).rejects.toBeInstanceOf(AccountNotFoundError);
    await expect(loadPasskeyRecord()).resolves.toBeNull();
  });

  it("opens the account all the same when it cannot be saved", async () => {
    await saveMerchantSettings(WALLET, settings);
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("Keychain unavailable"));
    await expect(open(new Uint8Array([1]).buffer)).resolves.toMatchObject({
      businessName: "Merchant 9EE5"
    });
  });

  it('goes with "Log out"', async () => {
    await rememberDevicePasskey(WALLET, new Uint8Array([1]).buffer);
    await wipeDevice();
    expect(secureStore.items.has(PASSKEY_RECORD_KEY)).toBe(false);
    await expect(devicePasskeyOf(WALLET)).resolves.toBeUndefined();
  });
});
