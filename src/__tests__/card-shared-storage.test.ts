// The card items and files the app shares with its iOS notification service extension
// (src/lib/card/card-keychain.ts, card-files.ts): in the app group's keychain group and container
// on an iPhone whose build has the extension, moved there from where the app kept them.
import { Platform } from "react-native";

import { noteTracesBeforeRescue, removeRescueTraces } from "@/features/rescue/traces";
import { wipeDevice } from "@/features/settings/device-wipe";
import { cardAppGroup, cardSharedContainer } from "@/lib/card/app-group";
import { APP_FRONT_DIR_NAME, markAppInFront } from "@/lib/card/app-front";
import { EXTENSION_DIR_NAME } from "@/lib/card/card-files";
import { clearStoredRelays, loadStoredRelays, saveStoredRelays } from "@/lib/relays/store";
import { RELAYS_KEY } from "@/lib/relays/stored";
import {
  CARD_SHARED_SERVICE,
  deleteCardItem,
  getCardItem,
  resetCardItemMoves,
  setCardItem
} from "@/lib/card/card-keychain";
import { CARD_PASSES_KEY } from "@/lib/card/card-pass-store";
import { CARD_STATES_KEY, loadStoredCardStates, saveStoredCardStates } from "@/lib/card/card-store";
import { CARD_DEVICE_KEY, forgetDeviceKey, loadDeviceKey } from "@/lib/card/device-key";
import { CARD_PAYEES_DIR_NAME, approveCardPayee, loadCardPayees } from "@/lib/card/payees";
import {
  CARD_PAYMENTS_DIR_NAME,
  loadCardPayments,
  logCardPayment,
  type CardPaymentEntry
} from "@/lib/card/payment-log";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
const mockExtra: { cardAppGroup?: unknown } = { cardAppGroup: GROUP };
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
const { Directory, File, Paths } = fileSystem;

const WALLET = "02".padEnd(66, "a");
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const CARD_WALLET = { cardId: CARD, walletGeneration: 1 };
const LAC = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };
const NOW = Date.UTC(2026, 10, 23, 9, 0);

/** An item's id in the fake keychain, in the shared place. */
function sharedId(key: string): string {
  return `${CARD_SHARED_SERVICE}|${GROUP}|${key}`;
}

function entry(id: number): CardPaymentEntry {
  return {
    id: id.toString(16),
    cardId: CARD,
    walletGeneration: 1,
    at: NOW,
    amountSats: 1_000n,
    paymentHash: id.toString(16).padStart(64, "0"),
    description: "Coffee",
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null
  };
}

function ownDirectory(name: string) {
  return new Directory(Paths.document, name);
}

function sharedDirectory(name: string) {
  return new Directory(Paths.appleSharedContainers[GROUP], name);
}

/** A build without the extension, or before it: what the app kept where it kept it then. */
async function keptBefore(): Promise<{ publicKey: string }> {
  fileSystem.setSharedContainers([]);
  const key = await loadDeviceKey();
  await saveStoredCardStates({ walletId: WALLET, states: [], unpublished: [] });
  secureStore.items.set(CARD_PASSES_KEY, "the passes");
  await logCardPayment(entry(1));
  await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
  // The build with the extension starts.
  fileSystem.setSharedContainers([GROUP]);
  forgetDeviceKey();
  resetCardItemMoves();
  return { publicKey: key.publicKey };
}

beforeEach(() => {
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetCardItemMoves();
  forgetDeviceKey();
  mockExtra.cardAppGroup = GROUP;
  fileSystem.setSharedContainers([GROUP]);
  jest.replaceProperty(Platform, "OS", "ios");
});

describe("the app group", () => {
  it("is the build's, on an iPhone whose app holds it only", () => {
    expect(cardAppGroup()).toBe(GROUP);
    expect(cardSharedContainer()?.group).toBe(GROUP);
    jest.replaceProperty(Platform, "OS", "android");
    expect(cardSharedContainer()).toBeNull();
    jest.replaceProperty(Platform, "OS", "ios");
    fileSystem.setSharedContainers([]);
    expect(cardSharedContainer()).toBeNull();
    mockExtra.cardAppGroup = "not a group";
    expect(cardAppGroup()).toBeNull();
  });
});

describe("the card items (card-keychain.ts)", () => {
  it("are in the app group's keychain group, under their own service, never where the app keeps its others", async () => {
    const key = await loadDeviceKey();
    await saveStoredCardStates({ walletId: WALLET, states: [], unpublished: [] });
    expect([...secureStore.items.keys()]).toEqual([]);
    expect(JSON.parse(secureStore.sharedItems.get(sharedId(CARD_DEVICE_KEY))!)).toMatchObject({
      version: 1
    });
    expect(secureStore.sharedItems.has(sharedId(CARD_STATES_KEY))).toBe(true);
    forgetDeviceKey();
    expect((await loadDeviceKey()).publicKey).toBe(key.publicKey);
    expect(await loadStoredCardStates()).toEqual({ walletId: WALLET, states: [], unpublished: [] });
  });

  it("are where the app keeps its others on Android, and on a build without the extension", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await setCardItem(CARD_STATES_KEY, "android");
    jest.replaceProperty(Platform, "OS", "ios");
    fileSystem.setSharedContainers([]);
    await setCardItem(CARD_DEVICE_KEY, "no extension");
    expect(Object.fromEntries(secureStore.items)).toEqual({
      [CARD_STATES_KEY]: "android",
      [CARD_DEVICE_KEY]: "no extension"
    });
    expect(secureStore.sharedItems.size).toBe(0);
  });

  it("are moved there from where the app kept them, the same device key and states, once", async () => {
    const before = await keptBefore();
    expect((await loadDeviceKey()).publicKey).toBe(before.publicKey);
    expect(await loadStoredCardStates()).toEqual({ walletId: WALLET, states: [], unpublished: [] });
    expect(await getCardItem(CARD_PASSES_KEY)).toBe("the passes");
    expect([...secureStore.items.keys()]).toEqual([]);
    expect(secureStore.sharedItems.get(sharedId(CARD_PASSES_KEY))).toBe("the passes");
    // Once: a move done is not tried again.
    const reads = secureStore.getItemAsync.mock.calls.length;
    await getCardItem(CARD_PASSES_KEY);
    expect(secureStore.getItemAsync.mock.calls.length - reads).toBe(1);
  });

  it("hold the device's relays too, which the extension reads: moved once, the same list", async () => {
    const relays = ["wss://relay.one", "wss://relay.two"];
    fileSystem.setSharedContainers([]);
    await saveStoredRelays(relays);
    expect(secureStore.items.has(RELAYS_KEY)).toBe(true);
    fileSystem.setSharedContainers([GROUP]);
    resetCardItemMoves();
    expect(await loadStoredRelays()).toEqual(relays);
    expect(secureStore.items.has(RELAYS_KEY)).toBe(false);
    expect(JSON.parse(secureStore.sharedItems.get(sharedId(RELAYS_KEY))!)).toEqual({
      version: 1,
      relays
    });
    await clearStoredRelays();
    expect(await loadStoredRelays()).toBeNull();
  });

  it("are read where they were while their move fails, and moved at a next use", async () => {
    await keptBefore();
    secureStore.setItemAsync.mockRejectedValueOnce(new Error("errSecInteractionNotAllowed"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getCardItem(CARD_STATES_KEY)).not.toBeNull();
    expect(secureStore.items.has(CARD_STATES_KEY)).toBe(true);
    expect(secureStore.sharedItems.has(sharedId(CARD_STATES_KEY))).toBe(false);
    expect(await loadStoredCardStates()).toEqual({ walletId: WALLET, states: [], unpublished: [] });
    expect(secureStore.items.has(CARD_STATES_KEY)).toBe(false);
    expect(secureStore.sharedItems.has(sharedId(CARD_STATES_KEY))).toBe(true);
  });

  it("keep the copy written in the shared place when the former one is still there (stopped before its removal)", async () => {
    secureStore.items.set(CARD_STATES_KEY, "older");
    secureStore.sharedItems.set(sharedId(CARD_STATES_KEY), "moved");
    expect(await getCardItem(CARD_STATES_KEY)).toBe("moved");
    expect(secureStore.items.has(CARD_STATES_KEY)).toBe(false);
  });

  it("never write over a change with what they move: a write waits for the move", async () => {
    secureStore.items.set(CARD_STATES_KEY, "older");
    // The move starts first (a read), the write comes while it runs.
    await Promise.all([getCardItem(CARD_STATES_KEY), setCardItem(CARD_STATES_KEY, "newer")]);
    expect(await getCardItem(CARD_STATES_KEY)).toBe("newer");
    expect(secureStore.items.has(CARD_STATES_KEY)).toBe(false);
  });

  it("are removed from both places", async () => {
    secureStore.items.set(CARD_PASSES_KEY, "older");
    secureStore.sharedItems.set(sharedId(CARD_PASSES_KEY), "moved");
    await deleteCardItem(CARD_PASSES_KEY);
    expect(secureStore.items.size + secureStore.sharedItems.size).toBe(0);
  });
});

describe("the card files (card-files.ts)", () => {
  it("are in the app group's container, under the same names", async () => {
    await logCardPayment(entry(1));
    await approveCardPayee(WALLET, CARD_WALLET, LAC, NOW);
    expect(new File(sharedDirectory(CARD_PAYMENTS_DIR_NAME), "log.json").exists).toBe(true);
    expect(new File(sharedDirectory(CARD_PAYEES_DIR_NAME), "payees.json").exists).toBe(true);
    expect(ownDirectory(CARD_PAYMENTS_DIR_NAME).exists).toBe(false);
    expect(ownDirectory(CARD_PAYEES_DIR_NAME).exists).toBe(false);
  });

  it("are moved there from the documents directory, the same log and merchants", async () => {
    await keptBefore();
    const own = ownDirectory(CARD_PAYMENTS_DIR_NAME);
    // A draft left by an interrupted write goes with the former directory.
    new File(own, "log.json.tmp").writeSync("draft");
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["1"]);
    expect((await loadCardPayees(WALLET, CARD_WALLET)).approved.map((p) => p.id)).toEqual([LAC.id]);
    expect(own.exists).toBe(false);
    expect(ownDirectory(CARD_PAYEES_DIR_NAME).exists).toBe(false);
    expect(new File(sharedDirectory(CARD_PAYMENTS_DIR_NAME), "log.json").exists).toBe(true);
    expect(new File(sharedDirectory(CARD_PAYMENTS_DIR_NAME), "log.json.tmp").exists).toBe(false);
  });

  it("are used where they were while their move fails, and moved at a next use", async () => {
    await keptBefore();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const move = jest.spyOn(File.prototype, "moveSync").mockImplementationOnce(() => {
      throw new Error("No space left on device");
    });
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["1"]);
    expect(new File(ownDirectory(CARD_PAYMENTS_DIR_NAME), "log.json").exists).toBe(true);
    move.mockRestore();
    expect((await loadCardPayments()).map((e) => e.id)).toEqual(["1"]);
    expect(ownDirectory(CARD_PAYMENTS_DIR_NAME).exists).toBe(false);
  });
});

describe("Log out", () => {
  it("removes the shared card items and files, the former places' too", async () => {
    await keptBefore();
    await loadDeviceKey();
    await logCardPayment(entry(2));
    secureStore.items.set(CARD_STATES_KEY, "left behind");
    await saveStoredRelays(["wss://relay.one"]);
    // What the extension wrote: its journal, its card wallets' SDK storage.
    const extension = sharedDirectory(EXTENSION_DIR_NAME);
    new Directory(extension, "breez", "wallet").create({ intermediates: true });
    new File(extension, "journal.json").writeSync("[]");
    markAppInFront(NOW);
    await wipeDevice();
    expect(extension.exists).toBe(false);
    expect(sharedDirectory(APP_FRONT_DIR_NAME).exists).toBe(false);
    expect(secureStore.items.size + secureStore.sharedItems.size).toBe(0);
    expect(sharedDirectory(CARD_PAYMENTS_DIR_NAME).exists).toBe(false);
    expect(sharedDirectory(CARD_PAYEES_DIR_NAME).exists).toBe(false);
    expect(ownDirectory(CARD_PAYMENTS_DIR_NAME).exists).toBe(false);
  });
});

describe("a rescue (traces.ts)", () => {
  it("leaves the cards' states as they were, in the shared place", async () => {
    await setCardItem(CARD_STATES_KEY, "the device's own");
    await noteTracesBeforeRescue();
    await setCardItem(CARD_STATES_KEY, "the rescue's");
    await removeRescueTraces();
    expect(await getCardItem(CARD_STATES_KEY)).toBe("the device's own");
    expect(secureStore.items.has(CARD_STATES_KEY)).toBe(false);
  });
});

describe("the native fingerprint", () => {
  it("holds where the card items and files are: no update crosses their move", () => {
    const { extraSources } = jest.requireActual<{
      extraSources: { type: string; filePath: string }[];
    }>("../../fingerprint.config.js");
    const files = extraSources.map(({ filePath }) => filePath);
    for (const file of [
      "src/lib/card/app-group.ts",
      "src/lib/card/card-keychain.ts",
      "src/lib/card/card-files.ts"
    ]) {
      expect(files).toContain(file);
    }
  });
});
