import * as SecureStore from "expo-secure-store";

import { keychain, putLegacyValue } from "../../jest/react-native-keychain";
import {
  forgetLegacyWallet,
  noteLegacyWalletOwner,
  ownsLegacyWallet
} from "@/features/migration/wallet-owner";
import { wipeDevice } from "@/features/settings/device-wipe";
import { LEGACY_KEYS } from "@/lib/legacy-v2/data";
import { forgetLegacyWords, hasLegacyWallet } from "@/lib/legacy-v2/store";
import {
  LEGACY_WALLET_OWNER_KEY,
  LEGACY_WALLET_OWNER_VERSION,
  legacyWalletOwnerText,
  parseLegacyWalletOwner
} from "@/lib/legacy-v2/wallet-owner-format";
import { loadLegacyWatch, saveLegacyWatch } from "@/lib/legacy-v2/watch-store";

/*
 * The account the v2 wallet's words left on this device go to (wallet-owner.ts), and their erasure
 * once the migration no longer needs them. IRREVERSIBLE: the record's key name and format, locked
 * here.
 */

const WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const OWNER = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const OTHER = "03" + "ab".repeat(32);
const XPUB = `xpub${"1".repeat(107)}`;

beforeEach(() => {
  putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
});

describe("the record of the account the v2 wallet's words go to", () => {
  it("keeps its name and format", () => {
    expect(LEGACY_WALLET_OWNER_KEY).toBe("legacy-v2-wallet-owner");
    expect(LEGACY_WALLET_OWNER_VERSION).toBe(1);
    expect(JSON.parse(legacyWalletOwnerText(OWNER.toUpperCase())!)).toEqual({
      version: 1,
      wallet: OWNER
    });
    expect(parseLegacyWalletOwner(legacyWalletOwnerText(OWNER))).toBe(OWNER);
  });

  it("refuses what is out of shape, and says a newer app's", () => {
    expect(legacyWalletOwnerText("not a wallet id")).toBeNull();
    for (const text of [
      null,
      "",
      "not json",
      "[]",
      "null",
      JSON.stringify({ version: 1 }),
      JSON.stringify({ version: 1, wallet: "XYZ" }),
      JSON.stringify({ version: 0, wallet: OWNER }),
      JSON.stringify({ wallet: OWNER })
    ]) {
      expect(parseLegacyWalletOwner(text)).toBeNull();
    }
    expect(() => parseLegacyWalletOwner(JSON.stringify({ version: 2, wallet: OWNER }))).toThrow(
      "A newer app's owner of the v2 wallet"
    );
  });
});

describe("ownsLegacyWallet", () => {
  it("gives the words to the account noted only", async () => {
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(false);
    await noteLegacyWalletOwner(OWNER);
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(true);
    await expect(ownsLegacyWallet(OWNER.toUpperCase())).resolves.toBe(true);
    await expect(ownsLegacyWallet(OTHER)).resolves.toBe(false);
    await expect(ownsLegacyWallet(null)).resolves.toBe(false);
    // Nothing read of the words: no prompt.
    expect(keychain.prompts).toEqual([]);
  });

  it("is false without words on the device, whoever is noted", async () => {
    await noteLegacyWalletOwner(OWNER);
    keychain.entries.clear();
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(false);
  });

  it("waits for the record being written", async () => {
    const noted = noteLegacyWalletOwner(OWNER);
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(true);
    await noted;
  });

  it("never writes over a newer app's record, nor gives the words then", async () => {
    const newer = JSON.stringify({ version: 2, wallet: OTHER });
    await SecureStore.setItemAsync(LEGACY_WALLET_OWNER_KEY, newer);
    await noteLegacyWalletOwner(OWNER);
    await expect(SecureStore.getItemAsync(LEGACY_WALLET_OWNER_KEY)).resolves.toBe(newer);
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(false);
    await expect(ownsLegacyWallet(OTHER)).resolves.toBe(false);
  });

  it('is forgotten by "Log out": the words stay, no account\'s', async () => {
    await noteLegacyWalletOwner(OWNER);
    await wipeDevice();
    await expect(SecureStore.getItemAsync(LEGACY_WALLET_OWNER_KEY)).resolves.toBeNull();
    await expect(hasLegacyWallet()).resolves.toBe(true);
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(false);
    // The next account opened here, noted by nothing: never given the words either.
    await expect(ownsLegacyWallet(OTHER)).resolves.toBe(false);
  });
});

describe("forgetLegacyWallet", () => {
  it("erases the words, then the watch and the owner", async () => {
    await noteLegacyWalletOwner(OWNER);
    await saveLegacyWatch({ xpub: XPUB, from: { 0: 0, 1: 0 }, checkedAt: 0 });
    await expect(forgetLegacyWallet()).resolves.toBe(true);
    expect(keychain.resets).toContain(LEGACY_KEYS.mnemonic);
    await expect(hasLegacyWallet()).resolves.toBe(false);
    await expect(loadLegacyWatch()).resolves.toEqual({ watch: null, newer: false });
    await expect(SecureStore.getItemAsync(LEGACY_WALLET_OWNER_KEY)).resolves.toBeNull();
    // Erasing what is gone already is no failure.
    await expect(forgetLegacyWallet()).resolves.toBe(true);
  });

  it("keeps everything when the keychain kept the words, for a later attempt", async () => {
    await noteLegacyWalletOwner(OWNER);
    await saveLegacyWatch({ xpub: XPUB, from: { 0: 0, 1: 0 }, checkedAt: 0 });
    const Keychain =
      jest.requireMock<typeof import("react-native-keychain")>("react-native-keychain");
    const reset = jest
      .spyOn(Keychain, "resetGenericPassword")
      .mockRejectedValueOnce(new Error("Keystore unavailable"));
    await expect(forgetLegacyWallet()).resolves.toBe(false);
    reset.mockRestore();
    await expect(ownsLegacyWallet(OWNER)).resolves.toBe(true);
    expect((await loadLegacyWatch()).watch?.xpub).toBe(XPUB);
  });

  it("says words still there after the keychain's answer as not erased", async () => {
    const Keychain =
      jest.requireMock<typeof import("react-native-keychain")>("react-native-keychain");
    const reset = jest.spyOn(Keychain, "resetGenericPassword").mockResolvedValueOnce(false);
    await expect(forgetLegacyWords()).resolves.toBe(false);
    reset.mockRestore();
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });
});
