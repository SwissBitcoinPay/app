// What the iOS extension records of the card payments it runs (src/lib/card/extension-records.ts,
// written by src/lib/engine/card-records.ts), merged with the app's own: a tap either took is
// never taken again by the other, the limits count both logs, the app takes the extension's
// payments into its own log, each payment once.
import { Platform } from "react-native";

import {
  DEFAULT_CARD_DAY_SATS,
  DEFAULT_CARD_PAYMENT_SATS,
  DEFAULT_CARD_RELAY_HOST
} from "@/config/card";
import { TapAlreadySeenError } from "@/features/card/state-errors";
import {
  cardStatesOnDeviceOf,
  recordCardStateOnDevice,
  resetCardStates
} from "@/features/card/states";
import { cardStateValue, type CardState } from "@/lib/card/card-record";
import { saveStoredCardStates } from "@/lib/card/card-store";
import {
  EXTENSION_CARDS_DIR_NAME,
  NewerExtensionTapsError,
  laterEntry,
  mergedPayments,
  readExtensionPayments,
  readExtensionTaps
} from "@/lib/card/extension-records";
import {
  NewerCardPaymentsError,
  loadCardPayments,
  logCardPayment,
  takeExtensionPayments,
  type CardPaymentEntry
} from "@/lib/card/payment-log";
import {
  ExtensionTapSeenError,
  recordExtensionTap,
  writeExtensionPayment
} from "@/lib/engine/card-records";

import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { cardAppGroup: "group.ch.swissbitcoinpay.checkout.staging.cards" } }
  }
}));

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const WALLET = "02".padEnd(66, "a");
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const NOW = Date.UTC(2026, 10, 24, 9, 0);

const STATE: CardState = {
  cardId: CARD,
  uid: "04996c6a926980",
  keyVersion: 1,
  status: "active",
  relayHost: DEFAULT_CARD_RELAY_HOST,
  lastCounter: 10,
  depositedThrough: 1_010,
  maxPaymentSats: DEFAULT_CARD_PAYMENT_SATS,
  maxDaySats: DEFAULT_CARD_DAY_SATS,
  maxPaymentsPerHour: 5,
  suspended: false,
  name: "",
  look: null,
  issuer: null,
  settingsAt: 1_760_000_000_000,
  walletGeneration: 1,
  updatedAt: 1_760_000_000
};

function entry(id: string, overrides: Partial<CardPaymentEntry> = {}): CardPaymentEntry {
  return {
    id,
    cardId: CARD,
    walletGeneration: 1,
    at: NOW,
    amountSats: 1_000n,
    paymentHash: id.padStart(64, "0"),
    description: "Coffee",
    outcome: "sent",
    reason: null,
    pr: "lnbc1",
    payee: null,
    preimage: null,
    value: null,
    ...overrides
  };
}

function recordsFile(name: string) {
  return new fileSystem.File(
    fileSystem.Paths.appleSharedContainers[GROUP],
    "extension",
    EXTENSION_CARDS_DIR_NAME,
    name
  );
}

/** The app's copy of its cards' states, as the app keeps them. */
async function keptStates(state: CardState = STATE): Promise<void> {
  await saveStoredCardStates({
    walletId: WALLET,
    states: [cardStateValue(state)],
    unpublished: []
  });
  resetCardStates();
}

/** The app records a tap of `counter` (recordCardStateOnDevice, `tap`: the account closed). */
function appTap(counter: number): Promise<CardState> {
  const { updatedAt: _updatedAt, ...state } = STATE;
  return recordCardStateOnDevice(WALLET, { ...state, lastCounter: counter }, undefined, {
    tap: true
  });
}

beforeEach(() => {
  jest.replaceProperty(Platform, "OS", "ios");
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  fileSystem.setSharedContainers([GROUP]);
  resetCardStates();
});

describe("the extension's payments", () => {
  it("are written whole, at names never changed, of format 1, and read back exactly", () => {
    writeExtensionPayment(entry("a1", { outcome: "sending" }));
    writeExtensionPayment(entry("a1", { outcome: "sent", preimage: "11".repeat(32) }));
    writeExtensionPayment(entry("b2", { at: NOW - 1000 }));
    expect(EXTENSION_CARDS_DIR_NAME).toBe("cards");
    const file = recordsFile("payments.json");
    expect(JSON.parse(file.textSync())).toMatchObject({ version: 1 });
    expect(readExtensionPayments()).toEqual([
      entry("b2", { at: NOW - 1000 }),
      entry("a1", { outcome: "sent", preimage: "11".repeat(32) })
    ]);
  });

  it("drop what is past the 90 days kept, never refuse a newer extension's for none", () => {
    writeExtensionPayment(entry("0d", { at: NOW - 91 * 24 * 3600 * 1000 }));
    writeExtensionPayment(entry("0e"));
    expect(readExtensionPayments().map((payment) => payment.id)).toEqual(["0e"]);
    recordsFile("payments.json").writeSync('{"version":2,"entries":[]}');
    expect(() => readExtensionPayments()).toThrow(NewerCardPaymentsError);
    expect(() => writeExtensionPayment(entry("c3"))).toThrow(NewerCardPaymentsError);
  });

  it("count with the app's log for the limits, each payment once, the one that ended it", async () => {
    await logCardPayment(entry("a1", { outcome: "sending" }));
    await logCardPayment(entry("aa", { at: NOW - 5 }));
    writeExtensionPayment(entry("a1", { outcome: "sent" }));
    writeExtensionPayment(entry("ee", { at: NOW + 5 }));
    // The app's in its order, then the extension's it does not hold.
    expect((await loadCardPayments()).map((payment) => [payment.id, payment.outcome])).toEqual([
      ["a1", "sent"],
      ["aa", "sent"],
      ["ee", "sent"]
    ]);
  });

  it("are taken into the app's log at its sync, once, never over a payment the app ended", async () => {
    writeExtensionPayment(entry("a1", { outcome: "sending" }));
    writeExtensionPayment(entry("b2"));
    expect(await takeExtensionPayments()).toBe(2);
    expect(await takeExtensionPayments()).toBe(0);
    // The app settled the one the extension could not finish: the extension's "sending" stays out.
    await logCardPayment(entry("a1", { outcome: "failed", reason: "payment failed" }));
    expect(await takeExtensionPayments()).toBe(0);
    expect((await loadCardPayments()).find((payment) => payment.id === "a1")?.outcome).toBe(
      "failed"
    );
    // One the extension ended after the app took it still "sending": taken again.
    writeExtensionPayment(entry("c3", { outcome: "sending" }));
    await takeExtensionPayments();
    writeExtensionPayment(entry("c3", { outcome: "sent" }));
    expect(await takeExtensionPayments()).toBe(1);
  });

  it("merge by the rule: an ended payment over one still sending, else the app's", () => {
    const sending = entry("x", { outcome: "sending" });
    const sent = entry("x", { outcome: "sent" });
    const failed = entry("x", { outcome: "failed", reason: "payment failed" });
    expect(laterEntry(sending, sent)).toBe(sent);
    expect(laterEntry(sent, sending)).toBe(sent);
    expect(laterEntry(failed, sent)).toBe(failed);
    expect(mergedPayments([sent], [entry("y", { at: NOW - 1 }), sending]).map((p) => p.id)).toEqual(
      ["x", "y"]
    );
  });

  it("are nothing where the build has no app group", async () => {
    writeExtensionPayment(entry("a1"));
    fileSystem.setSharedContainers([]);
    expect(readExtensionPayments()).toEqual([]);
    expect(() => writeExtensionPayment(entry("b2"))).toThrow("No app group");
    expect(await loadCardPayments()).toEqual([]);
  });
});

describe("the extension's taps", () => {
  it("are taken above the app's counter and the extension's last, for the same keys and wallet", () => {
    recordExtensionTap(CARD, 1, 1, 11, 10);
    expect(() => recordExtensionTap(CARD, 1, 1, 11, 10)).toThrow(ExtensionTapSeenError);
    expect(() => recordExtensionTap(CARD, 1, 1, 9, 5)).toThrow(ExtensionTapSeenError);
    expect(() => recordExtensionTap(CARD, 1, 1, 10, 10)).toThrow(ExtensionTapSeenError);
    recordExtensionTap(CARD, 1, 1, 12, 10);
    expect(readExtensionTaps().get(CARD)).toEqual({
      keyVersion: 1,
      walletGeneration: 1,
      lastCounter: 12
    });
    // The card programmed again (other keys): its counters start anew.
    recordExtensionTap(CARD, 2, 1, 1, 0);
    expect(JSON.parse(recordsFile("taps.json").textSync())).toEqual({
      version: 1,
      cards: { [CARD]: { keyVersion: 2, walletGeneration: 1, lastCounter: 1 } }
    });
  });

  it("are never taken again by the app, though it knew nothing of them (its copy in memory)", async () => {
    await keptStates();
    // The app takes a tap: its copy in memory holds counter 11 from now on.
    await expect(appTap(11)).resolves.toMatchObject({ lastCounter: 11 });
    // The extension takes the next ones while the app is in the background.
    recordExtensionTap(CARD, 1, 1, 15, 11);
    await expect(appTap(15)).rejects.toBeInstanceOf(TapAlreadySeenError);
    await expect(appTap(12)).rejects.toBeInstanceOf(TapAlreadySeenError);
    await expect(appTap(16)).resolves.toMatchObject({ lastCounter: 16 });
    // Nor the reverse: the app's counter bounds the extension's.
    expect(() => recordExtensionTap(CARD, 1, 1, 16, 16)).toThrow(ExtensionTapSeenError);
  });

  it("raise the counter the app reads, its hashes deposited at least that far", async () => {
    await keptStates({ ...STATE, depositedThrough: 10 });
    recordExtensionTap(CARD, 1, 1, 40, 10);
    resetCardStates();
    expect(await cardStatesOnDeviceOf(WALLET)).toEqual([
      expect.objectContaining({ lastCounter: 40, depositedThrough: 40 })
    ]);
  });

  it("of a newer extension: no tap of any card is taken, by the app nor the extension", async () => {
    await keptStates();
    recordExtensionTap(CARD, 1, 1, 11, 10);
    recordsFile("taps.json").writeSync('{"version":2,"cards":{}}');
    expect(() => readExtensionTaps()).toThrow(NewerExtensionTapsError);
    expect(() => recordExtensionTap(CARD, 1, 1, 50, 10)).toThrow(NewerExtensionTapsError);
    await expect(appTap(50)).rejects.toBeInstanceOf(NewerExtensionTapsError);
    // The cards' states are read as kept.
    resetCardStates();
    expect(await cardStatesOnDeviceOf(WALLET)).toEqual([
      expect.objectContaining({ lastCounter: 10 })
    ]);
  });
});
