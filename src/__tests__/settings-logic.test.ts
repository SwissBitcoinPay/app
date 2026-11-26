import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  openAccount,
  updateAccount
} from "@/features/account/session";
import { resetDeviceRelays, saveDeviceRelays } from "@/features/relays/device-relays";
import { followRelaysMove } from "@/features/relays/moved-notice";
import { hasMainWallet } from "@/features/account/main-wallet";
import {
  SettingsError,
  becomeMerchant,
  changeBusinessAddress,
  changeBusinessName,
  changeBusinessNumber,
  changeDisplayCurrency,
  changeLogo,
  changeOnchainPayments,
  changeBitcoinNode,
  changeOnchainTolerance,
  changeProductLookup,
  changeRelays,
  changeSplit
} from "@/features/settings/account-settings";
import { leaveBusiness, signOut } from "@/features/settings/sign-out";
import {
  joinTeam,
  previewInvite,
  resetMembershipCache,
  setOwnAvatar,
  syncMembership
} from "@/features/team/member";
import { inviteEmployee, loadTeam, removeEmployee, syncTeamChannels } from "@/features/team/owner";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { loadBrandingOf } from "@/features/terminal/branding";
import { loadOnchainPayments, loadPosOptions } from "@/features/terminal/options";
import { getTerminalProfile, resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { walletSecret } from "@/lib/breez/seed";
import { RELAY_TIMEOUT_MS, fetchBackup } from "@/lib/backup/settings-backup";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { createImage, fetchImage } from "@/lib/media/image";
import { publishToRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";
import { fetchMoved, movedEvent } from "@/lib/relays/moved";
import { RELAYS_KEY } from "@/lib/relays/stored";
import { channelEvent, fetchChannel } from "@/lib/team/channel";
import { fetchInvite, inviteLinkOf } from "@/lib/team/invite";
import {
  deriveBusinessRegistry,
  deriveMemberKeys,
  deriveTeamKeys,
  inviteAuthor,
  memberSecret,
  ownerDeviceSecret,
  ownerDevicesSecret,
  type TeamKeys
} from "@/lib/team/keys";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { declarationEvent, registryAddress, saleRegistry } from "@/lib/registry/registry";
import { saveBusinessRegistry } from "@/features/terminal/registry-key";
import {
  deviceEvent,
  fetchDevices,
  fetchProfiles,
  fetchSales,
  linkEvent,
  memberStateAddresses,
  publishMemberRecord,
  saleEvent
} from "@/lib/team/member-records";
import { fetchLotStates, lotEvent } from "@/lib/team/onchain-lot";
import { saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";
import { loadMembership } from "@/lib/team/membership-store";
import { loadMerchantSettings } from "@/lib/settings/store";
import { BRANDING_RECORD_KEY, type SavedTerminalProfile } from "@/lib/terminal/model";
import { loadTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice } from "../../jest/lightning";
import { rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../config/team", () => ({
  ...jest.requireActual("../config/team"),
  getInviteOrigin: () => "https://web.example"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const OWN = ["wss://relay.bakery.example"];
const ADDRESS = "sattleme02c6047f94@breez.tips";

/** A Mt Pelerin bank account's id, fictitious: the settings keep nothing else of it (format 18). */
const ACCOUNT_ID = "64a0c0de0000000000000004";

/** The owner's device: its account open (done), its point of sale prepared. */
async function ownerDevice(usage: "merchant" | "card" = "merchant"): Promise<SavedTerminalProfile> {
  await openTestAccount({ usage, signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
  return profile;
}

/** The secret the test account's devices share: the notice of a move of its relays. */
const shared = () => ownerDevicesSecret(deriveTeamKeys(walletSecret(testSeed())));

/**
 * This device as one of the owner's, added to the account before (registerOwnerDevice): the record
 * it keeps. Resolves with the keys it signs its sales with.
 */
async function ownerDeviceRecord(id = "cd".repeat(16)) {
  const team = deriveTeamKeys(walletSecret(testSeed()));
  const secret = ownerDeviceSecret(team, id);
  await saveOwnerDeviceRecord({
    version: 1,
    account: TEST_WALLET_ID.toLowerCase(),
    id,
    secret: bytesToHex(secret),
    shared: bytesToHex(ownerDevicesSecret(team))
  });
  resetOwnerDeviceCache();
  return deriveMemberKeys(secret);
}

/** Another device: the relays stay, nothing of this device's storage does. */
function newDevice() {
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetTerminalProfileCache();
  resetMembershipCache();
  resetDeviceRelays();
}

/** The backups of the test account each relay of `list` holds. */
function backupsOn(list: readonly string[]): number[] {
  const author = deriveBackupKeys(walletSecret(testSeed())).publicKey;
  return list.map(
    (relay) => (relays.stored.get(relay) ?? []).filter((event) => event.pubkey === author).length
  );
}

/**
 * Declares, on the relays of the list left, the invoice of payment hash `hash` for a sale of the
 * business (its key: 32 bytes of `sale`), as a point of sale does.
 */
async function declareOn(team: TeamKeys, hash: string, sale: number) {
  const pr = makeInvoice({
    amountMsat: 46_918_000n,
    paymentHash: hash,
    descriptionHash: "00".repeat(32),
    timestamp: Math.floor(Date.now() / 1000),
    expirySeconds: 600
  });
  const invoice = {
    pr,
    decoded: decodeBolt11(pr)!,
    verifyUrl: `https://breez.tips/verify/${hash}`
  };
  const registry = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(sale));
  await publishToRelays(
    declarationEvent(registry, invoice, {
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: ""
    }),
    {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000,
      authKey: registry.saleKeys.nostr.secretKey
    }
  );
}

/** How many of `list`'s relays hold a declaration of payment hash `hash`. */
function declaredOn(team: TeamKeys, hash: string, list: readonly string[]): number {
  const address = registryAddress(deriveBusinessRegistry(team).key, hash);
  return list.filter((relay) =>
    (relays.stored.get(relay) ?? []).some((event) =>
      event.tags.some(([name, value]) => name === "d" && value === address)
    )
  ).length;
}

/**
 * Controls the publications of the account's backups, by the order their events are first
 * published: "held" until `release`, then taken; "refused" by every relay at once; "refused after
 * release" held, then refused. Later ones go through. `restore` lets every one through again.
 */
function sequenceBackups(plan: ("held" | "refused" | "refused after release")[]) {
  const author = getAccountBackupKey()!;
  let release = () => undefined as void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const seen: string[] = [];
  const publish = relays.publishEvent;
  const spy = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, event, options) => {
    if (event.pubkey === author) {
      if (!seen.includes(event.id)) seen.push(event.id);
      const step = plan[seen.indexOf(event.id)];
      if (step === "refused") throw new Error(`${url}: no answer in time`);
      if (step === "held" || step === "refused after release") await released;
      if (step === "refused after release") throw new Error(`${url}: no answer in time`);
    }
    return publish(url, event, options);
  });
  return {
    seen,
    release,
    restore: () => {
      spy.mockRestore();
      release();
    }
  };
}

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("the owner's settings, saved live", () => {
  it("change the business's details, and this device's point of sale follows", async () => {
    const profile = await ownerDevice();
    await changeBusinessName("  Fine Bakery  ");
    expect(getAccountSettings()?.businessName).toBe("Fine Bakery");
    await expect(loadTerminalProfile()).resolves.toMatchObject({
      businessName: "Fine Bakery"
    });
    await changeDisplayCurrency("EUR");
    expect(getAccountSettings()?.displayCurrency).toBe("EUR");
    await expect(getTerminalProfile()).resolves.toMatchObject({ currency: "EUR" });
    await changeOnchainPayments(false);
    expect(getAccountSettings()?.onchainPayments).toBe(false);
    await expect(loadOnchainPayments(profile)).resolves.toBe(false);
  });

  it("change the business's address one line at a time, in the account's country at first", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done", detectedCountry: "CH" });
    expect(getAccountSettings()?.businessAddress).toBeNull();
    await changeBusinessAddress("street", "  4 Market Street ");
    expect(getAccountSettings()?.businessAddress).toEqual({
      street: "4 Market Street",
      postalCode: "",
      city: "",
      country: "CH"
    });
    // A line changed meanwhile on another device (the settings as the relays left them) stays.
    await updateAccount((current) => ({
      businessAddress: { ...current.businessAddress!, city: "Geneva" }
    }));
    await changeBusinessAddress("postalCode", "1204");
    await changeBusinessAddress("country", "FR");
    expect(getAccountSettings()?.businessAddress).toEqual({
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "FR"
    });
    // Emptied, a line is ""; longer than 120 characters, cut.
    await changeBusinessAddress("street", "   ");
    await changeBusinessAddress("city", "G".repeat(130));
    expect(getAccountSettings()?.businessAddress).toMatchObject({
      street: "",
      city: "G".repeat(120)
    });
    // Not a country code: refused, nothing saved.
    for (const invalid of ["fr", "France", "", "FRA"]) {
      await expect(changeBusinessAddress("country", invalid)).rejects.toMatchObject({
        code: "invalid"
      });
    }
    expect(getAccountSettings()?.businessAddress?.country).toBe("FR");
    // In the backup, with the account's other settings.
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, DEFAULT_RELAYS, 1000)).resolves.toMatchObject({
      newest: { businessAddress: { postalCode: "1204", country: "FR" } }
    });
  });

  it("change the business's company and VAT numbers, trimmed, at most 40 characters", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    expect(getAccountSettings()).toMatchObject({ companyNumber: "", vatNumber: "" });
    await changeBusinessNumber("companyNumber", "  CHE-123.456.789 ");
    await changeBusinessNumber("vatNumber", "CHE-123.456.789 MWST");
    expect(getAccountSettings()).toMatchObject({
      companyNumber: "CHE-123.456.789",
      vatNumber: "CHE-123.456.789 MWST"
    });
    // Cut at 40 characters, never ending in a space; emptied, none.
    await changeBusinessNumber("companyNumber", `${"1".repeat(39)} 2`);
    expect(getAccountSettings()?.companyNumber).toBe("1".repeat(39));
    await changeBusinessNumber("vatNumber", "  ");
    expect(getAccountSettings()?.vatNumber).toBe("");
  });

  it("change the tolerance of on-chain underpayments by tenths up to 10 %, the point of sale following", async () => {
    const profile = await ownerDevice();
    expect(getAccountSettings()?.onchainTolerance).toBe(0);
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
    await changeOnchainTolerance(250);
    expect(getAccountSettings()?.onchainTolerance).toBe(250);
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 250,
      bitcoinNode: null
    });
    // Out of 0 to 10 %, or not by tenths of a percent: refused, nothing saved.
    for (const invalid of [-10, 1010, 255, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(changeOnchainTolerance(invalid)).rejects.toMatchObject({ code: "invalid" });
    }
    expect(getAccountSettings()?.onchainTolerance).toBe(250);
    await changeOnchainTolerance(1000);
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 1000,
      bitcoinNode: null
    });
    await changeOnchainTolerance(0);
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
    // In the backup, with the account's other settings.
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, DEFAULT_RELAYS, 1000)).resolves.toMatchObject({
      newest: { onchainTolerance: 0 }
    });
  });

  it("change the Bitcoin node, the point of sale following, and refuse one not in its one spelling", async () => {
    const profile = await ownerDevice();
    expect(getAccountSettings()?.bitcoinNode).toBeNull();
    const node = { url: "http://192.168.1.20:3006", fallback: "none", payers: false } as const;
    await changeBitcoinNode(node);
    expect(getAccountSettings()?.bitcoinNode).toEqual(node);
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: node
    });
    for (const invalid of [
      { url: "http://mempool.example.ch", fallback: "none", payers: false },
      { url: "http://192.168.1.20:3006/", fallback: "none", payers: false },
      { url: "http://192.168.1.20:3006", fallback: "sometimes" }
    ] as const) {
      await expect(
        changeBitcoinNode(invalid as unknown as Parameters<typeof changeBitcoinNode>[0])
      ).rejects.toMatchObject({ code: "invalid" });
    }
    expect(getAccountSettings()?.bitcoinNode).toEqual(node);
    // In the backup, with the account's other settings.
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, DEFAULT_RELAYS, 1000)).resolves.toMatchObject({
      newest: { bitcoinNode: node }
    });
    // Back to mempool.space.
    await changeBitcoinNode(null);
    expect(getAccountSettings()?.bitcoinNode).toBeNull();
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
  });

  it("turn the product lookup off and on", async () => {
    await ownerDevice();
    expect(getAccountSettings()?.productLookup).toBe(true);
    await changeProductLookup(false);
    expect(getAccountSettings()?.productLookup).toBe(false);
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject({
      productLookup: false
    });
    await changeProductLookup(true);
    expect(getAccountSettings()?.productLookup).toBe(true);
  });

  it("never give the point of sale a tolerance no relay took", async () => {
    const profile = await ownerDevice();
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await expect(changeOnchainTolerance(500)).rejects.toMatchObject({ code: "unpublished" });
    expect(getAccountSettings()?.onchainTolerance).toBe(0);
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject({
      onchainTolerance: 0
    });
    await expect(loadPosOptions(profile)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
  });

  it("refuse an empty name, another currency code and a split without its bank account", async () => {
    await ownerDevice();
    await expect(changeBusinessName("   ")).rejects.toBeInstanceOf(SettingsError);
    await expect(changeDisplayCurrency("euro")).rejects.toBeInstanceOf(SettingsError);
    await expect(
      changeSplit({ bitcoinPercent: 60, payoutCurrency: "CHF", payoutAccountId: null })
    ).rejects.toMatchObject({ code: "invalid" });
    await changeSplit({ bitcoinPercent: 100, payoutCurrency: "EUR", payoutAccountId: null });
    expect(getAccountSettings()).toMatchObject({ bitcoinPercent: 100, payoutCurrency: "EUR" });
  });

  it("let a card holder choose a split, as a merchant", async () => {
    await ownerDevice("card");
    await changeSplit({ bitcoinPercent: 40, payoutCurrency: "EUR", payoutAccountId: ACCOUNT_ID });
    expect(getAccountSettings()).toMatchObject({
      usage: "card",
      bitcoinPercent: 40,
      payoutAccountId: ACCOUNT_ID
    });
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject({
      bitcoinPercent: 40
    });
  });

  it("make a card holder's account a merchant's, with its split and bank account, for good", async () => {
    await ownerDevice("card");
    expect(hasMainWallet()).toBe(false);
    await becomeMerchant({
      bitcoinPercent: 40,
      payoutCurrency: "EUR",
      payoutAccountId: ACCOUNT_ID
    });
    const merchant = {
      usage: "merchant",
      bitcoinPercent: 40,
      payoutCurrency: "EUR",
      payoutAccountId: ACCOUNT_ID
    };
    expect(getAccountSettings()).toMatchObject(merchant);
    // Only now may its wallet exist.
    expect(hasMainWallet()).toBe(true);
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject(merchant);
    // In one backup: the account's other devices read both or neither.
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, DEFAULT_RELAYS, 1000)).resolves.toMatchObject({
      newest: merchant
    });
  });

  it("keep a card holder's account as it is when its split lacks its bank account", async () => {
    await ownerDevice("card");
    await expect(
      becomeMerchant({ bitcoinPercent: 60, payoutCurrency: "CHF", payoutAccountId: null })
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      becomeMerchant({ bitcoinPercent: 100, payoutCurrency: "CHF", payoutAccountId: ACCOUNT_ID })
    ).rejects.toMatchObject({ code: "invalid" });
    expect(getAccountSettings()?.usage).toBe("card");
    expect(hasMainWallet()).toBe(false);
  });

  it("keep a card holder's account as it is when no relay took the change", async () => {
    await ownerDevice("card");
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await expect(
      becomeMerchant({ bitcoinPercent: 100, payoutCurrency: "CHF", payoutAccountId: null })
    ).rejects.toMatchObject({ code: "unpublished" });
    expect(getAccountSettings()?.usage).toBe("card");
    expect(hasMainWallet()).toBe(false);
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject({ usage: "card" });
  });

  it("only change the split of an account already a merchant's", async () => {
    await ownerDevice();
    await becomeMerchant({
      bitcoinPercent: 40,
      payoutCurrency: "EUR",
      payoutAccountId: ACCOUNT_ID
    });
    expect(getAccountSettings()).toMatchObject({
      usage: "merchant",
      bitcoinPercent: 40,
      payoutAccountId: ACCOUNT_ID
    });
  });

  it("need a finished account", async () => {
    await openTestAccount();
    await expect(changeOnchainPayments(false)).rejects.toMatchObject({ code: "noAccount" });
  });

  it("are saved once a majority of the relays took their backup, the others still going on", async () => {
    await ownerDevice();
    // Three of five: a majority.
    const majority = DEFAULT_RELAYS.slice(0, 3);
    for (const relay of DEFAULT_RELAYS.slice(3)) relays.unreachable.add(relay);
    await changeBusinessName("Fine Bakery");
    expect(getAccountSettings()?.businessName).toBe("Fine Bakery");
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, majority, 1000)).resolves.toMatchObject({
      newest: { businessName: "Fine Bakery" }
    });
  });

  it("are cancelled when fewer than a majority of the relays took their backup", async () => {
    await ownerDevice();
    const before = getAccountSettings()!;
    // Two of five take it: as if it were not saved, a read of a majority could miss it.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(changeBusinessName("Fine Bakery")).rejects.toMatchObject({
      code: "unpublished"
    });
    expect(getAccountSettings()?.businessName).toBe(before.businessName);
  });

  it("are cancelled when no relay took their backup: neither kept nor followed", async () => {
    const profile = await ownerDevice();
    const before = getAccountSettings()!;
    // The relays answer, and refuse every event.
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await expect(changeBusinessName("Fine Bakery")).rejects.toMatchObject({
      code: "unpublished"
    });
    await expect(changeDisplayCurrency("EUR")).rejects.toMatchObject({ code: "unpublished" });
    await expect(changeOnchainPayments(false)).rejects.toMatchObject({ code: "unpublished" });
    await expect(
      changeSplit({ bitcoinPercent: 40, payoutCurrency: "EUR", payoutAccountId: ACCOUNT_ID })
    ).rejects.toMatchObject({ code: "unpublished" });
    const kept = {
      businessName: before.businessName,
      displayCurrency: before.displayCurrency,
      onchainPayments: before.onchainPayments,
      bitcoinPercent: before.bitcoinPercent,
      payoutCurrency: before.payoutCurrency,
      payoutAccountId: before.payoutAccountId
    };
    expect(getAccountSettings()).toMatchObject(kept);
    // On the device too, as the next launch reads it.
    await expect(loadMerchantSettings(TEST_WALLET_ID)).resolves.toMatchObject(kept);
    // This device's point of sale never had them.
    await expect(loadTerminalProfile()).resolves.toMatchObject({
      businessName: profile.businessName,
      currency: profile.currency
    });
    await expect(loadOnchainPayments(profile)).resolves.toBe(before.onchainPayments);
  });

  it("cancel only what the change wrote: a change saved before it stays", async () => {
    const profile = await ownerDevice();
    const before = getAccountSettings()!;
    // The currency's backup is held; the name's, saved after it, is refused by every relay.
    const backups = sequenceBackups(["held", "refused"]);
    try {
      const pricing = changeDisplayCurrency("EUR");
      await waitForValue(() => backups.seen.length, 1);
      const naming = changeBusinessName("Fine Bakery");
      await expect(naming).rejects.toMatchObject({ code: "unpublished" });
      // Only the name is put back; the settings put back carry the currency, and are taken.
      expect(getAccountSettings()).toMatchObject({
        businessName: before.businessName,
        displayCurrency: "EUR"
      });
      backups.release();
      await expect(pricing).resolves.toMatchObject({ displayCurrency: "EUR" });
      expect(getAccountSettings()).toMatchObject({
        businessName: before.businessName,
        displayCurrency: "EUR"
      });
      await expect(loadTerminalProfile()).resolves.toMatchObject({
        businessName: profile.businessName,
        currency: "EUR"
      });
      const keys = deriveBackupKeys(walletSecret(testSeed()));
      await expect(fetchBackup(keys, DEFAULT_RELAYS, 1000)).resolves.toMatchObject({
        newest: { businessName: before.businessName, displayCurrency: "EUR" }
      });
    } finally {
      backups.restore();
    }
  });

  it("count a change as saved once the backup of a later one, which carries it, is taken", async () => {
    await ownerDevice();
    // The name's backup is held, then refused; the currency's, saved over the name, is taken.
    const backups = sequenceBackups(["refused after release"]);
    try {
      const naming = changeBusinessName("Fine Bakery");
      await waitForValue(() => backups.seen.length, 1);
      await changeDisplayCurrency("EUR");
      backups.release();
      await expect(naming).resolves.toMatchObject({ businessName: "Fine Bakery" });
      expect(getAccountSettings()).toMatchObject({
        businessName: "Fine Bakery",
        displayCurrency: "EUR"
      });
    } finally {
      backups.restore();
    }
  });

  it("leave the point of sale as the settings are once every change is through", async () => {
    const profile = await ownerDevice();
    // The currency's backup is held; on-chain payments, saved after it, are taken first.
    const backups = sequenceBackups(["held"]);
    try {
      const pricing = changeDisplayCurrency("EUR");
      await waitForValue(() => backups.seen.length, 1);
      await changeOnchainPayments(false);
      await expect(loadOnchainPayments(profile)).resolves.toBe(false);
      backups.release();
      await expect(pricing).resolves.toMatchObject({ displayCurrency: "EUR" });
      // Not the settings the currency's change saved, where on-chain payments were still on.
      await expect(loadOnchainPayments(profile)).resolves.toBe(false);
      await expect(getTerminalProfile()).resolves.toMatchObject({ currency: "EUR" });
    } finally {
      backups.restore();
    }
  });

  it("save a logo once the relays hold it, and keep the initials otherwise", async () => {
    await ownerDevice();
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(changeLogo(new Uint8Array(500).fill(3))).rejects.toMatchObject({
      code: "unreachable"
    });
    expect(getAccountSettings()?.logo).toBeNull();
    relays.unreachable.clear();
    const settings = await changeLogo(new Uint8Array(500).fill(3));
    expect(settings.logo).toEqual({ key: expect.any(String), hash: expect.any(String) });
    await expect(fetchImage(settings.logo!)).resolves.toMatchObject({ status: "found" });
    await expect(loadBrandingOf(TEST_WALLET_ID)).resolves.toEqual({
      logo: settings.logo,
      avatar: null
    });
    await changeLogo(null);
    expect(getAccountSettings()?.logo).toBeNull();

    // The image taken, its reference not: the logo before stays.
    const image = await changeLogo(new Uint8Array(500).fill(4));
    const author = getAccountBackupKey()!;
    const publish = relays.publishEvent;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === author) throw new Error(`${url}: no answer in time`);
        return publish(url, event, options);
      });
    try {
      await expect(changeLogo(new Uint8Array(500).fill(5))).rejects.toMatchObject({
        code: "unpublished"
      });
    } finally {
      spy.mockRestore();
    }
    expect(getAccountSettings()?.logo).toEqual(image.logo);
    await expect(loadBrandingOf(TEST_WALLET_ID)).resolves.toEqual({
      logo: image.logo,
      avatar: null
    });
  });
});

describe("the account's relays", () => {
  it("are the device's for a new account", async () => {
    await saveDeviceRelays(OWN);
    await openTestAccount();
    expect(getAccountSettings()?.relays).toEqual(OWN);
    await waitForValue(() => backupsOn(OWN), [1]);
    expect(backupsOn(DEFAULT_RELAYS)).toEqual(DEFAULT_RELAYS.map(() => 0));
  });

  it("can all be replaced, without transition: the list left gets the backup and the notice once", async () => {
    await ownerDevice();
    const backupKey = getAccountBackupKey()!;
    const saved = await changeRelays(OWN);
    expect(saved.relays).toEqual(OWN);
    // This device follows them, and keeps them.
    expect(currentRelays()).toEqual(OWN);
    expect(JSON.parse(secureStore.items.get(RELAYS_KEY)!).relays).toEqual(OWN);
    // The backup goes to the new relays, and once to the old ones, where other devices still read.
    await waitForValue(() => backupsOn(OWN)[0]! > 0, true);
    await waitForValue(() => backupsOn(DEFAULT_RELAYS).every((count) => count > 0), true);
    // So does the notice of the move, which the owner's devices in till mode read.
    for (const list of [DEFAULT_RELAYS, OWN]) {
      await waitForAsync(async () => (await fetchMoved(backupKey, shared(), list)).status, "found");
    }
    // A later change writes to the new list only.
    const before = backupsOn(DEFAULT_RELAYS);
    await changeBusinessName("Fine Bakery");
    await waitForValue(() => backupsOn(OWN)[0]! > 1, true);
    expect(backupsOn(DEFAULT_RELAYS)).toEqual(before);
    // Back to the same list: nothing changes.
    await expect(changeRelays(OWN)).resolves.toBe(getAccountSettings());
    await expect(changeRelays([])).rejects.toMatchObject({ code: "invalid" });
  });

  it("are not changed for a list whose majority does not answer: nothing could be read there", async () => {
    await ownerDevice();
    const before = getAccountSettings()!;
    relays.unreachable.add(OWN[0]!);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
    // Nothing changed, nothing written to the list left for it.
    expect(getAccountSettings()).toEqual(before);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    relays.unreachable.delete(OWN[0]!);
    await expect(changeRelays(OWN)).resolves.toMatchObject({ relays: OWN });
  });

  it("seal the notice for the owner's devices: neither the wallet id nor its size tells the list", async () => {
    await ownerDevice();
    const backupKey = getAccountBackupKey()!;
    await changeRelays(OWN);
    await waitForAsync(
      async () => (await fetchMoved(backupKey, shared(), DEFAULT_RELAYS)).status,
      "found"
    );
    // At an address only the owner's devices compute (**never change** its salt nor its `info`).
    const address = bytesToHex(
      hkdf(sha256, shared(), utf8ToBytes("sattle.me/relays-moved"), utf8ToBytes("address/v1"), 32)
    );
    expect(
      relays.stored
        .get(DEFAULT_RELAYS[0])
        ?.filter(({ pubkey }) => pubkey === backupKey)
        .map(({ tags }) => tags.find(([name]) => name === "d")?.[1])
    ).toContain(address);
    // Its keys derived from the wallet id, a public key (an older app's): nothing.
    await expect(
      fetchMoved(backupKey, hexToBytes(TEST_WALLET_ID), DEFAULT_RELAYS)
    ).resolves.toEqual({ status: "notFound" });
    // One relay or ten: the same size.
    const key = new Uint8Array(32).fill(9);
    const ten = Array.from({ length: 10 }, (_, n) => `wss://relay-${n}.bakery.example`);
    expect(movedEvent(key, shared(), OWN, 1_000).content.length).toBe(
      movedEvent(key, shared(), ten, 1_000).content.length
    );
  });

  it("move the owner's devices in till mode, from the notice on their list", async () => {
    const profile = await ownerDevice();
    const backupKey = getAccountBackupKey()!;
    await changeRelays(OWN);
    await waitForAsync(
      async () => (await fetchMoved(backupKey, shared(), DEFAULT_RELAYS)).status,
      "found"
    );
    // Another device of the owner, in till mode: its profile, no account open, the old list.
    newDevice();
    await saveTerminalProfile(profile);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    // Not added to the account yet: it cannot open the notice, and moves at its next unlock.
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    // Added before (the account opened on it): the secret it kept opens it.
    await ownerDeviceRecord();
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(OWN);
    // On the new list, the notice names it: nothing moves again.
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(OWN);
  });

  it("keep the employees and invitations: their channels name the new relays, on both lists", async () => {
    await ownerDevice();
    const alice = await inviteEmployee("Alice");
    const bob = await inviteEmployee("Bob");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const aliceKeys = deriveMemberKeys(memberSecret(team, alice.member.id));
    // Alice's device joined: its record is on the account's relays.
    await publishMemberRecord(
      aliceKeys,
      deviceEvent(aliceKeys, {
        version: 1,
        deviceId: "ab".repeat(16),
        platform: "android",
        joinedAt: Math.floor(Date.now() / 1000) - 60
      }),
      DEFAULT_RELAYS
    );
    const saved = await changeRelays(OWN);
    expect(saved.relays).toEqual(OWN);
    // Their records followed: the account reads its team there now.
    // (Invited in the same second: listed by id.)
    expect((await rosterOn(team, OWN)).active.map(({ name }) => name).sort()).toEqual([
      "Alice",
      "Bob"
    ]);
    for (const { member } of [alice, bob]) {
      const keys = deriveMemberKeys(memberSecret(team, member.id));
      // Where their devices read (the list left), and where they will.
      for (const list of [DEFAULT_RELAYS, OWN]) {
        await expect(fetchChannel(team.publicKey, keys, 1000, list)).resolves.toMatchObject({
          status: "found",
          channel: { status: "active", relays: OWN }
        });
      }
    }
    // What the owner reads of Alice's device goes there too: she still shows as joined.
    // (Invited in the same second: listed by name here, the roster orders them by id.)
    await waitForAsync(
      async () =>
        (await loadTeam()).members
          .map(({ member, status }) => [member.name, status])
          .sort(([a], [b]) => (a! < b! ? -1 : 1)),
      [
        ["Alice", "joined"],
        ["Bob", "invited"]
      ]
    );
  });

  it("let an invitation made before them be used: the device that joins follows them", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Bob");
    await changeRelays(OWN);
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    newDevice();
    const link = inviteLinkOf(url)!;
    expect(link.relays).toEqual(DEFAULT_RELAYS);
    await joinTeam(await previewInvite(link));
    expect(currentRelays()).toEqual(OWN);
    // Its invitation is closed where the device reads from now on too.
    await expect(
      fetchInvite(link, Math.floor(Date.now() / 1000), { relays: OWN, member: keys })
    ).resolves.toMatchObject({ status: "closed" });
  });

  it("are cancelled when no relay took the backup: the device stays on the list left", async () => {
    await ownerDevice();
    // The relays answer (the sales can be checked), and refuse every event.
    for (const relay of [...DEFAULT_RELAYS, ...OWN]) relays.readOnly.add(relay);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unpublished" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });

  it("are refused, nothing published, when no majority of the list left answers", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    for (const relay of DEFAULT_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    relays.unreachable.clear();
    expect((await rosterOn(team)).active).toEqual([expect.objectContaining({ name: "Alice" })]);
    expect(await rosterOn(team, OWN)).toEqual({ active: [], removed: [] });
    await expect(fetchChannel(team.publicKey, keys, 1000, OWN)).resolves.toMatchObject({
      status: "notFound"
    });
  });

  it("are refused when the list left does not take the channels, which go back as they were", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // 4 of the 7 relays answer but take nothing: 3 of them, and the new relay, take the move.
    for (const relay of DEFAULT_RELAYS.slice(0, 4)) relays.readOnly.add(relay);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    // Wherever the move went, a newer channel names the relays as they are: no device follows.
    for (const list of [DEFAULT_RELAYS, OWN]) {
      await expect(fetchChannel(team.publicKey, keys, 1000, list)).resolves.toMatchObject({
        status: "found",
        channel: { relays: [...DEFAULT_RELAYS] }
      });
    }
  });

  it("delete a member another of the owner's devices removed, never moving it again", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // Another device of the owner removed Alice (its channel), not its record yet.
    const removedAt = Math.floor(Date.now() / 1000) + 1;
    await publishToRelays(
      channelEvent(team, keys, { version: 1, status: "removed", updatedAt: removedAt }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    await changeRelays(OWN);
    // Its record says so on both lists, dated by its channel's removal; its channel stays behind.
    for (const list of [DEFAULT_RELAYS, OWN]) {
      const { active, removed } = await rosterOn(team, list);
      expect(active).toEqual([]);
      expect(removed).toEqual([
        expect.objectContaining({ id: member.id, name: "Alice", removedAt: removedAt })
      ]);
    }
    await expect(fetchChannel(team.publicKey, keys, 1000, DEFAULT_RELAYS)).resolves.toMatchObject({
      status: "found",
      channel: { status: "removed" }
    });
    await expect(fetchChannel(team.publicKey, keys, 1000, OWN)).resolves.toMatchObject({
      status: "notFound"
    });
  });

  it("are refused while a sale of the business is not final, the team kept", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // An invoice Alice's device shows now, not paid.
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "ef".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ef".repeat(32)}`,
        createdAt: now - 60,
        expiresAt: now + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e1".repeat(32)
      })
    );
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "salesInProgress" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    expect((await rosterOn(team)).active).toEqual([expect.objectContaining({ name: "Alice" })]);
    // Offline, nothing tells: refused too.
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
  });

  it("are refused while a sale of an employee removed meanwhile is not final", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // An invoice Alice's device shows now, not paid; Alice removed all the same (confirmed again):
    // her removal never waits for her sales, and her records stay on the list left.
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "ef".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ef".repeat(32)}`,
        createdAt: now - 60,
        expiresAt: now + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e2".repeat(32)
      })
    );
    await expect(removeEmployee(member, { cancelOpen: true })).resolves.toBe("removed");
    expect((await rosterOn(team)).active).toEqual([]);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "salesInProgress" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
  });

  it("are not held back by an employee's sale that claims to last longer than an invoice can", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // Recorded with Alice's keys by whoever opened her invitation first: an
    // invoice not paid, shown an hour and a half ago, that would end in a year.
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "ef".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ef".repeat(32)}`,
        createdAt: now - 5400,
        expiresAt: now + 365 * 24 * 3600,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e3".repeat(32)
      })
    );
    await changeRelays(OWN);
    expect(getAccountSettings()?.relays).toEqual(OWN);
  });

  it("are not held back by an employee's payment link that no relay can give", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const now = Math.floor(Date.now() / 1000);
    // Recorded with Alice's keys by whoever opened her invitation first: a
    // payment link on a relay that does not exist, which nobody can open.
    relays.unreachable.add("wss://nowhere.example");
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: now - 60,
        onchainTag: null,
        relays: ["wss://nowhere.example"],
        sealedKey: "A".repeat(200)
      })
    );
    await changeRelays(OWN);
    expect(getAccountSettings()?.relays).toEqual(OWN);
  });

  it("follow the account at a login on another device, from the relays left out", async () => {
    await ownerDevice();
    await changeRelays(OWN);
    await waitForValue(() => backupsOn(DEFAULT_RELAYS).every((count) => count > 0), true);
    newDevice();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
      businessNameWord: "Merchant"
    });
    expect(getAccountSettings()?.relays).toEqual(OWN);
    expect(currentRelays()).toEqual(OWN);
  });

  it("lead a login on the list left to the settings changed since, on the new list", async () => {
    await ownerDevice();
    await changeRelays(OWN);
    await waitForValue(() => backupsOn(DEFAULT_RELAYS).every((count) => count > 0), true);
    // A change after the move goes to the new list only.
    await changeBusinessName("Fine Bakery");
    await waitForValue(() => backupsOn(OWN)[0]! > 1, true);
    const left = backupsOn(DEFAULT_RELAYS);
    newDevice();
    await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
      businessNameWord: "Merchant"
    });
    // Not the settings of the move, which the list left holds: the newer ones of the new list.
    expect(getAccountSettings()?.businessName).toBe("Fine Bakery");
    expect(currentRelays()).toEqual(OWN);
    // Nothing is written to the list left afterwards.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backupsOn(DEFAULT_RELAYS)).toEqual(left);
  });

  it("are given to the employees in their channel, with the logo; their devices follow", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    // The owner's team keys, again: closing the account wipes its own.
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const link = inviteLinkOf(url)!;
    expect(link.relays).toEqual(DEFAULT_RELAYS);
    const found = await fetchChannel(team.publicKey, keys);
    expect(found).toMatchObject({ channel: { relays: [...DEFAULT_RELAYS] } });

    // Alice's device joins on the invitation's relays, and keeps them.
    newDevice();
    await joinTeam(await previewInvite(link));
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    expect(secureStore.items.has(RELAYS_KEY)).toBe(true);

    // The owner moves the business to its own relay and picks a logo: the channel says so, on
    // the relays the device still reads.
    const logo = createImage(new Uint8Array(200).fill(5), Math.floor(Date.now() / 1000));
    if (found.status !== "found" || found.channel.status !== "active")
      throw new Error("No channel");
    const moved = {
      ...found.channel,
      relays: OWN,
      profile: { ...found.channel.profile, logo: logo.ref },
      updatedAt: found.channel.updatedAt + 10
    };
    await publishToRelays(channelEvent(team, keys, moved), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: team.secretKey
    });
    await expect(syncMembership()).resolves.toBe("active");
    expect(currentRelays()).toEqual(OWN);
    await expect(loadBrandingOf(team.publicKey)).resolves.toEqual({ logo: logo.ref, avatar: null });
  });

  it("carry what the owner reads to the new relays, when an employee's device follows", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const found = await fetchChannel(team.publicKey, keys);
    if (found.status !== "found" || found.channel.status !== "active") {
      throw new Error("No channel");
    }
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    // Its lot of on-chain addresses, from the owner.
    await publishMemberRecord(
      keys,
      lotEvent(team, keys, {
        version: 1,
        addresses: [taprootAddress(1)],
        tags: ["00".repeat(8)],
        updatedAt: Math.floor(Date.now() / 1000)
      }),
      DEFAULT_RELAYS
    );
    await syncMembership();
    // Two invoices of Alice's device on the relays it reads: one long before the change, one
    // shown after the owner checked that no sale was open. The change is dated 3 hours ahead: its
    // device joined long before it (its record is not among those copied).
    const now = Math.floor(Date.now() / 1000);
    const change = now + 3 * 3600;
    const sale = (hash: string, createdAt: number) =>
      saleEvent(keys, {
        version: 1,
        paymentHash: hash.repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${hash.repeat(32)}`,
        createdAt,
        expiresAt: createdAt + 600,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e4".repeat(32)
      });
    await publishMemberRecord(keys, sale("aa", change - 2 * 3600), DEFAULT_RELAYS);
    await publishMemberRecord(keys, sale("bb", change - 60), DEFAULT_RELAYS);
    // Their declarations in the registry, on the list left too.
    await declareOn(team, "aa".repeat(32), 1);
    await declareOn(team, "bb".repeat(32), 2);
    // The owner moves the business to its own relay.
    await publishToRelays(
      channelEvent(team, keys, { ...found.channel, relays: OWN, updatedAt: change }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );
    await expect(syncMembership()).resolves.toBe("active");
    expect(currentRelays()).toEqual(OWN);
    // Its device record (published again), and the sales since the change, less
    // MOVE_RECORDS_MARGIN_SECONDS (copied).
    await waitForAsync(
      async () =>
        (await fetchDevices([{ id: member.id, keys }], OWN))?.get(member.id)?.deviceId ?? null,
      (await loadMembership())!.deviceId
    );
    await waitForAsync(
      async () => (await fetchSales(keys, 0, OWN))?.map(({ paymentHash }) => paymentHash),
      ["bb".repeat(32)]
    );
    // With its declaration, where "Wallet" reads who took it; not the older one's.
    await waitForValue(() => declaredOn(team, "bb".repeat(32), OWN), 1);
    expect(declaredOn(team, "aa".repeat(32), OWN)).toBe(0);
    // And the addresses of its lot it used (none), for the owner's next lot.
    await waitForAsync(
      async () =>
        (
          await fetchLotStates(team, [{ id: member.id, keys }], "mainnet", team.secretKey, OWN)
        )?.get(member.id)?.used?.used ?? null,
      []
    );
  });

  it("carry an owner's device's sales to the new relays, when it follows the notice", async () => {
    const profile = await ownerDevice();
    const backupKey = getAccountBackupKey()!;
    await changeRelays(OWN);
    await waitForAsync(
      async () => (await fetchMoved(backupKey, shared(), DEFAULT_RELAYS)).status,
      "found"
    );
    // Another device of the owner, in till mode, added to the account before: an invoice it
    // showed on the list left, after the change.
    newDevice();
    await saveTerminalProfile(profile);
    const keys = await ownerDeviceRecord();
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "cc".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"cc".repeat(32)}`,
        createdAt: now,
        expiresAt: now + 600,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e5".repeat(32)
      }),
      DEFAULT_RELAYS
    );
    // Its declaration, with the registry key the device keeps for the account.
    const team = deriveTeamKeys(walletSecret(testSeed()));
    await saveBusinessRegistry(TEST_WALLET_ID, deriveBusinessRegistry(team));
    await declareOn(team, "cc".repeat(32), 3);
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(OWN);
    await waitForAsync(
      async () => (await fetchSales(keys, 0, OWN))?.map(({ paymentHash }) => paymentHash),
      ["cc".repeat(32)]
    );
    await waitForValue(() => declaredOn(team, "cc".repeat(32), OWN), 1);
  });
});

describe("the employee's device record", () => {
  it("is published again once a launch, a relay holding it or a newer one counting as taking it", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    const membership = (await loadMembership())!;
    // Its departure taken back earlier (publishDeparture): an arrival dated later on every relay.
    const device = {
      version: 1 as const,
      deviceId: membership.deviceId,
      platform: "android" as const,
      joinedAt: membership.joinedAt
    };
    await publishMemberRecord(
      keys,
      deviceEvent(keys, device, membership.joinedAt + 5),
      DEFAULT_RELAYS
    );
    const [address] = memberStateAddresses(keys);
    const published = () =>
      relays.calls.filter(
        ({ operation, event }) =>
          operation === "publish" &&
          event?.pubkey === keys.nostr.publicKey &&
          event.tags.some(([name, value]) => name === "d" && value === address)
      ).length;

    // A new launch: its record goes out once, every relay refusing it for the newer one.
    resetMembershipCache();
    relays.calls.length = 0;
    await expect(syncMembership()).resolves.toBe("active");
    await waitForValue(published, DEFAULT_RELAYS.length);
    // Held: the next sync of the launch publishes it no more.
    await expect(syncMembership()).resolves.toBe("active");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(published()).toBe(DEFAULT_RELAYS.length);
    await expect(fetchDevices([{ id: member.id, keys }])).resolves.toEqual(
      new Map([[member.id, expect.objectContaining({ deviceId: membership.deviceId })]])
    );
  });
});

describe("the employee's photo", () => {
  it("goes to the relays, and its profile tells the owner", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    const avatar = await setOwnAvatar(new Uint8Array(300).fill(8));
    expect(avatar).not.toBeNull();
    await expect(fetchImage(avatar!)).resolves.toMatchObject({ status: "found" });
    const profiles = await fetchProfiles([{ id: member.id, keys }]);
    expect(profiles?.get(member.id)).toMatchObject({ avatar });

    await setOwnAvatar(null);
    const removed = await fetchProfiles([{ id: member.id, keys }]);
    expect(removed?.get(member.id)).toMatchObject({ avatar: null });
  });

  it("is cancelled when no relay took the profile naming it: the photo before stays", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    const first = await setOwnAvatar(new Uint8Array(300).fill(8));

    // The image goes through, the profile signed by the member does not.
    const publish = relays.publishEvent;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === keys.nostr.publicKey) throw new Error(`${url}: no answer in time`);
        return publish(url, event, options);
      });
    try {
      await expect(setOwnAvatar(new Uint8Array(300).fill(9))).rejects.toMatchObject({
        code: "unpublished"
      });
      await expect(setOwnAvatar(null)).rejects.toMatchObject({ code: "unpublished" });
    } finally {
      spy.mockRestore();
    }
    await expect(loadBrandingOf(team.publicKey)).resolves.toMatchObject({ avatar: first });
    const profiles = await fetchProfiles([{ id: member.id, keys }]);
    expect(profiles?.get(member.id)).toMatchObject({ avatar: first });
  });

  it("is kept when the channel's sync writes the business's logo while it is saved", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const found = await fetchChannel(team.publicKey, keys);
    if (found.status !== "found" || found.channel.status !== "active") {
      throw new Error("No channel");
    }
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    // The owner picks a logo: the next sync writes it with the photo it reads.
    const logo = createImage(new Uint8Array(200).fill(5), Math.floor(Date.now() / 1000));
    await publishToRelays(
      channelEvent(team, keys, {
        ...found.channel,
        profile: { ...found.channel.profile, logo: logo.ref },
        updatedAt: found.channel.updatedAt + 10
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: team.secretKey }
    );

    // The sync reads the branding (no photo yet), and is held there while the photo is saved.
    let release = () => undefined as void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let holding = true;
    const read = secureStore.getItemAsync.getMockImplementation()!;
    secureStore.getItemAsync.mockImplementation(async (key, options) => {
      if (key !== BRANDING_RECORD_KEY || !holding) return read(key, options);
      holding = false;
      const value = await read(key, options);
      await held;
      return value;
    });
    try {
      const sync = syncMembership();
      await waitForValue(() => holding, false);
      const saving = setOwnAvatar(new Uint8Array(300).fill(8));
      // Long enough for the photo to be written, were it not waiting for the sync's write.
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      await expect(sync).resolves.toBe("active");
      const avatar = await saving;
      expect(avatar).not.toBeNull();
      await expect(loadBrandingOf(team.publicKey)).resolves.toEqual({ logo: logo.ref, avatar });
    } finally {
      secureStore.getItemAsync.mockImplementation(read);
    }
  });
});

describe("leaving", () => {
  it('"Log out" removes everything the app keeps on the device', async () => {
    await ownerDevice();
    await changeRelays(OWN);
    // The employees' channels the change brings in step in the background (applied): settled
    // first, or one failing once the account closed would write to the journal after the wipe.
    await syncTeamChannels();
    expect(secureStore.items.size).toBeGreaterThan(0);
    expect(fileSystem.files.size).toBeGreaterThan(0);
    await signOut();
    expect(getAccountSettings()).toBeNull();
    expect([...secureStore.items.keys()]).toEqual([]);
    expect([...fileSystem.files.keys()]).toEqual([]);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await expect(getTerminalProfile()).resolves.toBeNull();
    // The account is still on the relays: the next login finds it.
    const keys = deriveBackupKeys(walletSecret(testSeed()));
    await expect(fetchBackup(keys, OWN, RELAY_TIMEOUT_MS.waiting)).resolves.toMatchObject({
      newest: { relays: OWN }
    });
  });

  it("reads and uses an invitation over connections of their own, until the device joined", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    const link = inviteLinkOf(url)!;
    const author = inviteAuthor(link.key).publicKey;
    relays.calls.length = 0;

    const preview = await previewInvite(link);
    // A failed join, then another business's invitation: no connection carries both's keys.
    expect(new Set(relays.calls.map(({ channel }) => channel))).toEqual(new Set(["single"]));
    relays.calls.length = 0;
    await joinTeam(preview);
    const invitation = relays.calls.filter(
      ({ event, filter }) => event?.pubkey === author || filter?.authors?.includes(author)
    );
    expect(invitation.length).toBeGreaterThanOrEqual(2 * DEFAULT_RELAYS.length);
    expect(new Set(invitation.map(({ channel }) => channel))).toEqual(new Set(["single"]));
    // Joined: the device's records go over its account's connections.
    expect(relays.calls.some(({ channel }) => channel === "account")).toBe(true);
  });

  it('"Leave the business" makes the employee\'s device forget the business', async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await expect(loadMembership()).resolves.not.toBeNull();
    const closed = relays.connectionsClosed;
    await leaveBusiness();
    // Authenticated as the member's keys: closed with the membership.
    expect(relays.connectionsClosed).toBeGreaterThan(closed);
    await expect(loadMembership()).resolves.toBeNull();
    await expect(getTerminalProfile()).resolves.toBeNull();
    expect(secureStore.items.has(RELAYS_KEY)).toBe(false);
  });
});

/** Until `read` gives `expected`: background publications take a few turns of the event loop. */
async function waitForValue<T>(read: () => T, expected: T): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (JSON.stringify(read()) === JSON.stringify(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(read()).toEqual(expected);
}

/** As waitForValue, for a value read asynchronously (the relays). */
async function waitForAsync<T>(read: () => Promise<T>, expected: T): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (JSON.stringify(await read()) === JSON.stringify(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(await read()).toEqual(expected);
}
