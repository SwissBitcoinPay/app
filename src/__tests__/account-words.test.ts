import { waitFor } from "@testing-library/react-native";

import {
  AccountNotFoundError,
  closeAccount,
  getAccountSettings,
  getAccountWalletId,
  isAccountOpenedByWords,
  openAccount
} from "@/features/account/session";
import { accountUnlocked } from "@/features/navigation/lock";
import * as deletion from "@/lib/backup/deletion";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { fetchBackup } from "@/lib/backup/settings-backup";
import { walletSecret } from "@/lib/breez/seed";
import { loadMerchantSettings } from "@/lib/settings/store";

import { TEST_WALLET_ID, openMerchantAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory expo-file-system and Nostr relays of jest.setup.ts.
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const keys = deriveBackupKeys(walletSecret(testSeed()));

/** The account of the test words, as its owner opens it with them on another device. */
function openWithWords() {
  return openAccount({
    seed: testSeed(),
    openedBy: "words",
    walletId: TEST_WALLET_ID,
    created: false,
    detect: () => Promise.reject(new Error("No sign-up expected")),
    businessNameWord: "Merchant"
  });
}

/** Every event the fake relays hold. */
function storedEvents() {
  return [...relays.stored.values()].flat();
}

/**
 * A merchant's account backed up on the relays, then this device forgets it: a device that never
 * opened it, as the one where its owner types the words.
 */
async function accountOnRelaysOnly(): Promise<string> {
  await openMerchantAccount({ businessName: "Fine Bakery" });
  await waitFor(async () => expect((await fetchBackup(keys)).newest).not.toBeNull());
  closeAccount();
  fileSystem.resetFileSystem();
  return "Fine Bakery";
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  relays.resetRelays();
  closeAccount();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("an account opened with its recovery phrase", () => {
  it("opens from its backup on the relays, and never unlocks the app", async () => {
    const name = await accountOnRelaysOnly();

    const settings = await openWithWords();

    expect(settings.businessName).toBe(name);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    expect(isAccountOpenedByWords()).toBe(true);
    // The point of sale of this account stays in till mode: the words never unlock it.
    expect(accountUnlocked(TEST_WALLET_ID)).toBe(false);

    closeAccount();
    expect(isAccountOpenedByWords()).toBe(false);
  });

  it("is not a passkey's opening, which unlocks the point of sale", async () => {
    await openMerchantAccount();

    expect(isAccountOpenedByWords()).toBe(false);
    expect(accountUnlocked(TEST_WALLET_ID)).toBe(true);
  });

  it("finds no account where no relay holds one, and starts no sign-up", async () => {
    const error = await openWithWords().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AccountNotFoundError);
    expect(getAccountSettings()).toBeNull();
    // Nothing of a new account, on the device nor on the relays.
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toBeNull();
    expect(storedEvents()).toEqual([]);
  });

  it("finds no account deleted, and publishes nothing over its deletion", async () => {
    await accountOnRelaysOnly();
    const before = storedEvents().length;
    jest.spyOn(deletion, "fetchAccountDeletion").mockResolvedValue("deleted");

    await expect(openWithWords()).rejects.toBeInstanceOf(AccountNotFoundError);

    expect(getAccountSettings()).toBeNull();
    expect(isAccountOpenedByWords()).toBe(false);
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toBeNull();
    expect(storedEvents()).toHaveLength(before);
  });

  it("never creates an account, nor names a passkey", async () => {
    const options = {
      seed: testSeed(),
      openedBy: "words" as const,
      walletId: TEST_WALLET_ID,
      detect: () => Promise.reject(new Error("No sign-up expected")),
      businessNameWord: "Merchant"
    };

    await expect(openAccount({ ...options, created: true })).rejects.toThrow(
      "neither created nor a passkey's"
    );
    await expect(
      openAccount({ ...options, created: false, credentialId: new ArrayBuffer(16) })
    ).rejects.toThrow("neither created nor a passkey's");
    expect(getAccountSettings()).toBeNull();
    expect(storedEvents()).toEqual([]);
  });
});
