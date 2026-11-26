import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  openAccount,
  updateAccount
} from "@/features/account/session";
import { addArticle, loadCatalog, refreshCatalogEpoch } from "@/features/catalog/catalog";
import {
  TRANSITION_SECONDS,
  copyPendingDeclarations,
  copyPendingRecords
} from "@/features/settings/declarations-copy";
import { createImage, fetchImage, publishImageToMajority } from "@/lib/media/image";
import { loadRegistryMoves, saveRegistryMoves } from "@/lib/registry/moves-store";
import {
  loadDeviceRelays,
  resetDeviceRelays,
  saveDeviceRelays
} from "@/features/relays/device-relays";
import { followRelaysMove } from "@/features/relays/moved-notice";
import {
  RETIRED_RETRY_MS,
  replaceRetiredRelaysInBackground
} from "@/features/relays/retired-relays";
import { changeRelays, replaceAccountRetiredRelays } from "@/features/settings/account-settings";
import { inviteEmployee } from "@/features/team/owner";
import {
  joinTeam,
  previewInvite,
  resetMembershipCache,
  syncMembership
} from "@/features/team/member";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { walletSecret } from "@/lib/breez/seed";
import { currentRelays } from "@/lib/relays/current";
import { fetchChannel } from "@/lib/team/channel";
import { inviteLinkOf } from "@/lib/team/invite";
import { linkEvent, publishMemberRecord, saleEvent } from "@/lib/team/member-records";
import {
  deriveMemberKeys,
  deriveTeamKeys,
  memberSecret,
  ownerDeviceSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import { saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { bytesToHex } from "@noble/hashes/utils.js";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
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
// Three of the five default relays retired: a majority of the list an account starts with.
jest.mock("../config/relays", () => {
  const actual = jest.requireActual<typeof import("../config/relays")>("../config/relays");
  const [first, second, third] = actual.DEFAULT_RELAYS;
  return {
    ...actual,
    RETIRED_RELAYS: new Map([
      [first, "wss://fresh-1.example.com"],
      [second, "wss://fresh-2.example.com"],
      [third, "wss://fresh-3.example.com"]
    ])
  };
});

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const RETIRED = DEFAULT_RELAYS.slice(0, 3);
const KEPT = DEFAULT_RELAYS.slice(3);
const REPLACED = [
  "wss://fresh-1.example.com",
  "wss://fresh-2.example.com",
  "wss://fresh-3.example.com",
  ...KEPT
];
const OWN = "wss://relay.bakery.example";
const ADDRESS = "sattleme02c6047f94@breez.tips";

const team = () => deriveTeamKeys(walletSecret(testSeed()));

/** The owner's device: its account open (done) on the device's relays, its point of sale prepared. */
async function ownerDevice(): Promise<SavedTerminalProfile> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
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

/** The relays sattle.me retired stop answering: dead. */
function retiredDead() {
  for (const relay of RETIRED) relays.unreachable.add(relay);
}

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetDeviceRelays();
  resetTerminalProfileCache();
  resetMembershipCache();
  resetOwnerDeviceCache();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the relays sattle.me retired", () => {
  it("are replaced in the account's list at its opening, though dead, its team following", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    retiredDead();
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(REPLACED);
    // This device follows, and keeps them.
    expect(currentRelays()).toEqual(REPLACED);
    // The team's records went to the new list, where the account reads them from now on.
    expect((await rosterOn(team(), REPLACED)).active).toEqual([
      expect.objectContaining({ name: "Alice" })
    ]);
    // Alice's device reads its channel on its list's relays not retired: it names the new list.
    const keys = deriveMemberKeys(memberSecret(team(), member.id));
    for (const list of [KEPT, REPLACED]) {
      await expect(fetchChannel(team().publicKey, keys, 1000, list)).resolves.toMatchObject({
        status: "found",
        channel: { status: "active", relays: REPLACED }
      });
    }
    // Nothing left to do at the next opening.
    await expect(replaceAccountRetiredRelays()).resolves.toBeNull();
  });

  it("let an employee's device follow, reading its channel on the relays not retired", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    const owner = keepDevice();
    // Alice's device joins, on the list the business has then.
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetDeviceRelays();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    const alice = keepDevice();
    // Back on the owner's device: the account opens and moves, the retired relays dead.
    useDevice(owner);
    await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
      businessNameWord: "Business"
    });
    retiredDead();
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(REPLACED);
    // Alice's device, still on the list left, follows at its next look at its channel.
    closeAccount();
    useDevice(alice);
    await loadDeviceRelays();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await expect(syncMembership()).resolves.toBe("active");
    expect(currentRelays()).toEqual(REPLACED);
  });

  it("are left out of the check that no sale is open: a link of the year is read on the others", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const keys = deriveMemberKeys(memberSecret(team(), member.id));
    // A payment link Alice's device made a month ago on the list left, never opened: final.
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      })
    );
    retiredDead();
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(REPLACED);
  });

  it("move nothing, and write nothing to the journal, for a list without any", async () => {
    await saveDeviceRelays([OWN, ...KEPT]);
    await ownerDevice();
    const settings = getAccountSettings();
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()).toBe(settings);
    // An account whose sign-up is not done, its list holding some: not before it is.
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetDeviceRelays();
    await openTestAccount({ usage: "merchant", signUp: "split" });
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    expect([...fileSystem.files.keys()].filter((uri) => uri.includes("app-log"))).toEqual([]);
  });

  it("leave the relays the merchant chose as they are, in their place", async () => {
    await saveDeviceRelays([OWN, RETIRED[1]!, KEPT[0]!]);
    await ownerDevice();
    expect(getAccountSettings()?.relays).toEqual([OWN, RETIRED[1], KEPT[0]]);
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual([OWN, "wss://fresh-2.example.com", KEPT[0]]);
  });

  it("move nothing while a relay kept is out of reach, and are tried again later", async () => {
    await ownerDevice();
    retiredDead();
    // The merchant's network, or a relay not retired, down a moment: no majority of the others.
    relays.unreachable.add(KEPT[0]!);
    const timeout = jest.spyOn(globalThis, "setTimeout");
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    const retry = timeout.mock.calls.find(([, delay]) => delay === RETIRED_RETRY_MS);
    expect(retry).toBeDefined();
    timeout.mockRestore();
    // Back: the next try moves the account.
    relays.unreachable.delete(KEPT[0]!);
    await (retry![0] as () => Promise<void>)();
    await waitForValue(() => getAccountSettings()?.relays, REPLACED);
  });

  it("wait for a sale not final yet, without a word to the journal", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const keys = deriveMemberKeys(memberSecret(team(), member.id));
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
    retiredDead();
    const timeout = jest.spyOn(globalThis, "setTimeout");
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    expect(timeout.mock.calls.some(([, delay]) => delay === RETIRED_RETRY_MS)).toBe(true);
    expect([...fileSystem.files.keys()].filter((uri) => uri.includes("app-log"))).toEqual([]);
  });

  it("are never tried again once the account closed: its next opening does", async () => {
    await ownerDevice();
    retiredDead();
    relays.unreachable.add(KEPT[0]!);
    const timeout = jest.spyOn(globalThis, "setTimeout");
    const clear = jest.spyOn(globalThis, "clearTimeout");
    await replaceRetiredRelaysInBackground();
    const index = timeout.mock.calls.findIndex(([, delay]) => delay === RETIRED_RETRY_MS);
    expect(index).toBeGreaterThanOrEqual(0);
    const handle = timeout.mock.results[index]!.value as unknown;
    closeAccount();
    expect(clear).toHaveBeenCalledWith(handle);
  });

  it("are never saved by a change of the owner: their replacements are", async () => {
    await ownerDevice();
    await expect(changeRelays([RETIRED[0]!, OWN])).resolves.toMatchObject({
      relays: ["wss://fresh-1.example.com", OWN]
    });
  });

  it("let the owner's devices in till mode follow, reading the relays not retired", async () => {
    const profile = await ownerDevice();
    const backupKey = getAccountBackupKey()!;
    retiredDead();
    await replaceRetiredRelaysInBackground();
    expect(getAccountSettings()?.relays).toEqual(REPLACED);
    // Another of the owner's devices, in till mode, on the list left, added to the account before.
    closeAccount();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetDeviceRelays();
    await saveTerminalProfile(profile);
    const id = "cd".repeat(16);
    await saveOwnerDeviceRecord({
      version: 1,
      account: TEST_WALLET_ID.toLowerCase(),
      id,
      secret: bytesToHex(ownerDeviceSecret(team(), id)),
      shared: bytesToHex(ownerDevicesSecret(team()))
    });
    resetOwnerDeviceCache();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(REPLACED);
  });
});

describe("the records a change of relays copies once saved", () => {
  it("are copied again at the next opening when their copy was cut short, until whole", async () => {
    await ownerDevice();
    const draft = { description: "", priceMinor: 350, photo: null, barcode: null };
    await addArticle({ ...draft, name: "Mineral water" }, 0, await refreshCatalogEpoch());
    const logo = createImage(new Uint8Array(300).fill(7), Math.floor(Date.now() / 1000));
    await publishImageToMajority(logo.event, logo.ref, DEFAULT_RELAYS);
    await updateAccount({ logo: logo.ref });
    // The account moved to its own relay, the copies made once the change was saved cut short
    // (the account locked): nothing of the catalogue nor of the logo there. Its declarations are
    // copied (`copied`): the change is kept for its other records only.
    await updateAccount({ relays: [OWN] });
    const at = getAccountSettings()!.updatedAt;
    await saveRegistryMoves(TEST_WALLET_ID, {
      version: 2,
      moves: [{ left: [...DEFAULT_RELAYS], at, copied: at + TRANSITION_SECONDS, records: false }]
    });
    expect((await loadCatalog()).articles).toEqual([]);
    // An opening while the new relay is out of reach: nothing whole, the change kept.
    relays.unreachable.add(OWN);
    await copyPendingRecords();
    await copyPendingDeclarations();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([
      expect.objectContaining({ records: false })
    ]);
    // The next one: copied from the relays of the list left not retired, then forgotten.
    relays.unreachable.delete(OWN);
    await copyPendingRecords();
    await copyPendingDeclarations();
    expect((await loadRegistryMoves(TEST_WALLET_ID)).moves).toEqual([]);
    expect((await loadCatalog()).articles).toEqual([
      expect.objectContaining({ name: "Mineral water" })
    ]);
    await expect(fetchImage(logo.ref, [OWN])).resolves.toMatchObject({ status: "found" });
  });
});

/** What a device keeps (its secure storage and files), to come back to it (useDevice). */
type KeptDevice = {
  items: Map<string, string>;
  files: Map<string, string>;
  binaries: Map<string, Uint8Array>;
};

function keepDevice(): KeptDevice {
  return {
    items: new Map(secureStore.items),
    files: new Map(fileSystem.files),
    binaries: new Map(fileSystem.binaries)
  };
}

/** Back on a device kept: its storage only, what this one kept in memory forgotten. */
function useDevice(device: KeptDevice) {
  secureStore.resetSecureStore();
  fileSystem.resetFileSystem();
  for (const [key, value] of device.items) secureStore.items.set(key, value);
  for (const [key, value] of device.files) fileSystem.files.set(key, value);
  for (const [key, value] of device.binaries) fileSystem.binaries.set(key, value);
  resetTerminalProfileCache();
  resetMembershipCache();
  resetOwnerDeviceCache();
  resetDeviceRelays();
}

/** Until `read` gives `expected`: background publications take a few turns of the event loop. */
async function waitForValue<T>(read: () => T, expected: T): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (JSON.stringify(read()) === JSON.stringify(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(read()).toEqual(expected);
}
