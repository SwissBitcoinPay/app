import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  updateAccount
} from "@/features/account/session";
import { changeBusinessName } from "@/features/settings/account-settings";
import {
  settledAddressDescription,
  syncAddressDescription,
  syncAddressDescriptionAtUnlock
} from "@/features/terminal/address-description";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { isWalletConnected } from "@/lib/breez/wallet";
import { keepAddressDescription } from "@/lib/breez/lightning-address";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { fetchPayRequest } from "@/lib/lightning/lnurl";
import { fetchAddressMetadata } from "@/lib/lightning/metadata";
import { checkDeclaredInvoice } from "@/lib/registry/registry";
import { currentRelays } from "@/lib/relays/current";
import { openAccountFormerMetadata } from "@/lib/settings/former-metadata";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";
import { breezTips, breezTipsFetch, serveBreezTips } from "../../jest/breez-tips";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const USERNAME = "sattleme02c6047f94";
const ADDRESS = `${USERNAME}@breez.tips`;
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

/** The name breez.tips serves for the account's address, as a payer reads it. */
const servedName = async () => (await fetchAddressMetadata(ADDRESS)).name;

/** The owner's device, its point of sale prepared, its address registered at the sign-up. */
async function ownerDevice({ pointOfSale = true } = {}) {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const generated = getAccountSettings()!.businessName;
  sdk.lightningAddresses.set(USERNAME, generated);
  if (pointOfSale) {
    const profile: SavedTerminalProfile = {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: generated,
      currency: "CHF"
    };
    await saveTerminalProfile(profile);
    resetTerminalProfileCache();
  }
  return generated;
}

/** Another device of the account (or this one, wiped): nothing of the earlier one stays. */
function newDevice() {
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  nostr.resetRelays();
  resetTerminalProfileCache();
  serveBreezTips();
}

/** The SDK objects connected since the test began, each with its calls. */
const connections = () => sdk.connect.mock.calls.length;

beforeEach(() => {
  // A new device and new relays: no settings of an earlier test (its business name) come back.
  closeAccount();
  fileSystem.resetFileSystem();
  nostr.resetRelays();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  sdk.lightningAddresses.clear();
  sdk.connect.mockClear();
  serveBreezTips();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await settledAddressDescription();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the name payers and card holders see (the Lightning address's description)", () => {
  it("follows a rename of the business, signed by the wallet, then the wallet disconnects", async () => {
    const generated = await ownerDevice();
    expect(generated).toMatch(/^Merchant [0-9A-F]{4}$/);
    await expect(servedName()).resolves.toBe(generated);

    const former = (await fetchAddressMetadata(ADDRESS)).metadata;
    await changeBusinessName("  Lakeside Bakery ");
    await settledAddressDescription();

    await expect(servedName()).resolves.toBe("Lakeside Bakery");
    // The metadata served until then is kept in the settings: invoices made under it stay the
    // merchant's (checkDeclaredInvoice).
    expect(getAccountSettings()?.formerAddressMetadata).toEqual([former]);
    expect(sdk.lightningAddresses.get(USERNAME)).toBe("Lakeside Bakery");
    // The same username, registered again with the new description: no new address.
    expect([...sdk.lightningAddresses.keys()]).toEqual([USERNAME]);
    expect(connections()).toBe(1);
    expect(isWalletConnected()).toBe(false);
  });

  it("connects no wallet when the server already shows the name", async () => {
    await ownerDevice();
    await expect(syncAddressDescription()).resolves.toBe("upToDate");
    expect(connections()).toBe(0);
    // Read from the server itself, never from the wallet's local copy.
    expect(breezTips.requests).toEqual([`https://breez.tips/.well-known/lnurlp/${USERNAME}`]);
  });

  it("keeps the rename when breez.tips cannot be reached, and catches up at the next unlock", async () => {
    const generated = await ownerDevice();
    breezTips.unreachable = true;
    await changeBusinessName("Lakeside Bakery");
    await expect(syncAddressDescription()).resolves.toBe("failed");
    // The name is saved all the same; the server still shows the old one.
    expect(getAccountSettings()?.businessName).toBe("Lakeside Bakery");
    expect(sdk.lightningAddresses.get(USERNAME)).toBe(generated);
    expect(isWalletConnected()).toBe(false);

    breezTips.unreachable = false;
    await expect(syncAddressDescriptionAtUnlock()).resolves.toBe("updated");
    await expect(servedName()).resolves.toBe("Lakeside Bakery");
    await expect(syncAddressDescriptionAtUnlock()).resolves.toBe("upToDate");
  });

  it("reads the name once per unlock, whatever asks for it meanwhile", async () => {
    await ownerDevice();
    const first = syncAddressDescriptionAtUnlock();
    expect(syncAddressDescriptionAtUnlock()).toBe(first);
    await expect(first).resolves.toBe("upToDate");
    expect(breezTips.requests).toHaveLength(1);
  });

  it("catches up at unlock a rename made on another device", async () => {
    await ownerDevice();
    // Another device saved it; its update of the address failed.
    await updateAccount({ businessName: "Fine Bakery" });
    await expect(syncAddressDescriptionAtUnlock()).resolves.toBe("updated");
    await expect(servedName()).resolves.toBe("Fine Bakery");
  });

  it("reads the address through the wallet on a device that is not the point of sale", async () => {
    await ownerDevice({ pointOfSale: false });
    await updateAccount({ businessName: "Fine Bakery" });
    await expect(syncAddressDescription()).resolves.toBe("updated");
    await expect(servedName()).resolves.toBe("Fine Bakery");
  });

  it("registers nothing for an account without an address", async () => {
    await ownerDevice({ pointOfSale: false });
    sdk.lightningAddresses.clear();
    await expect(syncAddressDescription()).resolves.toBe("noAddress");
    expect(sdk.lightningAddresses.size).toBe(0);
  });

  it("never registers again an address the server no longer serves", async () => {
    const notFound = async (input: RequestInfo | URL) =>
      String(input).includes("/.well-known/lnurlp/")
        ? ({
            ok: false,
            status: 404,
            json: async () => ({ status: "ERROR", reason: "not found" })
          } as Response)
        : breezTipsFetch(input);
    // The point of sale's address: not served, so not even the wallet connects.
    const generated = await ownerDevice();
    await updateAccount({ businessName: "Fine Bakery" });
    jest.mocked(globalThis.fetch).mockImplementation(notFound);
    await expect(syncAddressDescription()).resolves.toBe("failed");
    expect(connections()).toBe(0);
    expect(sdk.lightningAddresses.get(USERNAME)).toBe(generated);

    // A device without the point of sale: the wallet's own (local) copy names the address, which
    // the server no longer serves: nothing is registered.
    newDevice();
    await ownerDevice({ pointOfSale: false });
    await updateAccount({ businessName: "Fine Bakery" });
    jest.mocked(globalThis.fetch).mockImplementation(notFound);
    await expect(syncAddressDescription()).resolves.toBe("failed");
    const [connection] = sdk.connect.mock.results;
    const wallet = (await connection.value) as { registerLightningAddress: jest.Mock };
    expect(wallet.registerLightningAddress).not.toHaveBeenCalled();
  });

  it("never connects the wallet at unlock when the name cannot be read, nor off the point of sale", async () => {
    await ownerDevice();
    await updateAccount({ businessName: "Fine Bakery" });
    breezTips.unreachable = true;
    await expect(syncAddressDescriptionAtUnlock()).resolves.toBe("failed");
    expect(connections()).toBe(0);

    newDevice();
    await ownerDevice({ pointOfSale: false });
    await updateAccount({ businessName: "Fine Bakery" });
    await expect(syncAddressDescriptionAtUnlock()).resolves.toBe("noAddress");
    expect(connections()).toBe(0);
  });

  it("changes no name before the former one is backed up on a relay", async () => {
    const generated = await ownerDevice();
    await updateAccount({ businessName: "Fine Bakery" });
    for (const relay of currentRelays()) nostr.unreachable.add(relay);
    await expect(syncAddressDescription()).resolves.toBe("failed");
    expect(sdk.lightningAddresses.get(USERNAME)).toBe(generated);
    // Back: kept, backed up, then changed.
    nostr.unreachable.clear();
    await expect(syncAddressDescription()).resolves.toBe("updated");
    await expect(servedName()).resolves.toBe("Fine Bakery");
  });

  it("keeps the invoices made under a former name the merchant's", async () => {
    const generated = await ownerDevice();
    const former = (await fetchAddressMetadata(ADDRESS)).metadata;
    const { paymentHash } = preimagePair(4);
    // 10 minutes past an hour: its 10 minutes end within the period of the point that prices it
    // (fitsItsPeriod). Never dated now: from hh:55 to hh:05, such an invoice ends after it.
    const timestamp = Date.UTC(2026, 9, 15, 13, 10) / 1000;
    const pr = makeInvoice({
      amountMsat: 21_000_000n,
      paymentHash,
      descriptionHash: metadataHash(former),
      timestamp,
      expirySeconds: 600
    });
    const invoice = {
      pr,
      decoded: decodeBolt11(pr)!,
      verifyUrl: `https://breez.tips/lnurlp/verify/${paymentHash}`
    };
    await changeBusinessName("Lakeside Bakery");
    await settledAddressDescription();
    const pay = await fetchPayRequest(ADDRESS);
    expect(pay.metadata).not.toBe(former);
    expect(openAccountFormerMetadata()).toEqual([former]);
    expect(checkDeclaredInvoice(invoice, pay, "bc", openAccountFormerMetadata())).toBe(true);
    // Without the account's settings (a payer's page): only the current name's invoices.
    expect(checkDeclaredInvoice(invoice, pay, "bc")).toBe(false);
    // Former metadata of another address is never the merchant's.
    const elsewhere = former.replace(`${USERNAME}@`, "other@");
    const forged = makeInvoice({
      amountMsat: 21_000_000n,
      paymentHash,
      descriptionHash: metadataHash(elsewhere),
      timestamp,
      expirySeconds: 600
    });
    expect(
      checkDeclaredInvoice({ ...invoice, pr: forged, decoded: decodeBolt11(forged)! }, pay, "bc", [
        elsewhere
      ])
    ).toBe(false);
    expect(generated).not.toBe("Lakeside Bakery");
    closeAccount();
    expect(openAccountFormerMetadata()).toEqual([]);
  });

  it("does nothing without an open account", async () => {
    await expect(syncAddressDescription()).resolves.toBe("noAccount");
    expect(breezTips.requests).toEqual([]);
  });
});

describe("keepAddressDescription", () => {
  function api(existing = true) {
    const registered = new Map([[USERNAME, "Merchant 9EE5"]]);
    return {
      registered,
      getLightningAddress: jest.fn(async () =>
        existing ? { lightningAddress: ADDRESS, username: USERNAME } : undefined
      ),
      checkLightningAddressAvailable: jest.fn(async () => true),
      registerLightningAddress: jest.fn(
        async ({ username, description }: { username: string; description?: string }) => {
          registered.set(username, description ?? "");
          return { lightningAddress: `${username}@breez.tips` };
        }
      )
    };
  }
  const servedBy = (wallet: ReturnType<typeof api>) => async () => {
    const name = wallet.registered.get(USERNAME)!;
    return { name, metadata: `metadata of ${name}` };
  };

  it("keeps the former metadata, then registers the same username with the new description", async () => {
    const wallet = api();
    const kept: string[] = [];
    const keep = async (metadata: string) => {
      // Kept before the server changes.
      expect(wallet.registerLightningAddress).not.toHaveBeenCalled();
      kept.push(metadata);
    };
    await expect(
      keepAddressDescription(wallet, "Merchant 9EE5", servedBy(wallet), keep)
    ).resolves.toBe("upToDate");
    expect(kept).toEqual([]);
    await expect(
      keepAddressDescription(wallet, "Fine Bakery", servedBy(wallet), keep)
    ).resolves.toBe("updated");
    expect(kept).toEqual(["metadata of Merchant 9EE5"]);
    expect(wallet.registerLightningAddress).toHaveBeenCalledWith({
      username: USERNAME,
      description: "Fine Bakery"
    });
    await expect(keepAddressDescription(api(false), "x", servedBy(wallet), keep)).resolves.toBe(
      "noAddress"
    );
  });

  it("changes nothing when the server cannot be read or the former metadata cannot be kept", async () => {
    const wallet = api();
    const keep = async () => undefined;
    await expect(
      keepAddressDescription(
        wallet,
        "Fine Bakery",
        () => Promise.reject(new Error("offline")),
        keep
      )
    ).rejects.toThrow("offline");
    await expect(
      keepAddressDescription(wallet, "Fine Bakery", servedBy(wallet), () =>
        Promise.reject(new Error("not backed up"))
      )
    ).rejects.toThrow("not backed up");
    expect(wallet.registerLightningAddress).not.toHaveBeenCalled();
  });

  it("fails when the server still serves another description afterwards", async () => {
    const wallet = api();
    await expect(
      keepAddressDescription(
        wallet,
        "Fine Bakery",
        async () => ({ name: "Merchant 9EE5", metadata: "m" }),
        async () => undefined
      )
    ).rejects.toThrow("another description");
  });
});
