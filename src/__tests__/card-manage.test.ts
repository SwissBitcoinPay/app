import { hexToBytes } from "@noble/hashes/utils.js";
import { waitFor } from "@testing-library/react-native";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import {
  cardNameOf,
  deleteCard,
  customizeCard,
  reprogramCard,
  RaisedLimitError,
  setCardLimit,
  setCardSuspended
} from "@/features/card/manage";
import { cardLightningAddress, leaseCardWallet } from "@/features/card/card-wallet";
import { pairCard } from "@/features/card/pairing";
import { receiveCardWake, resetCardPayments } from "@/features/card/payments";
import { lockTerminal } from "@/features/navigation/lock";
import {
  channelSyncOf,
  checkCardChannel,
  keepChannelSync,
  lastChannelSyncs,
  resetChannelSyncs,
  syncAccountCards
} from "@/features/card/sync";
import {
  cardStatesOnDevice,
  knownCardState,
  recordCardState,
  refreshCardStates,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import {
  cardStateEvent,
  cardStatesFilter,
  cardStatesOf,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { cardFileTemplate } from "@/lib/card/card-url";
import { deriveHistoryRecordKeys, historyEvent } from "@/lib/card/history-records";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { loadCardPayments, logCardPayment } from "@/lib/card/payment-log";
import { loadPushMarks } from "@/lib/card/push-marks";
import { cardIdOf, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { Ntag424 } from "@/lib/card/ntag424";
import { ZERO_KEY } from "@/lib/card/ntag424-sm";
import { boltCardFileSettings, resetCard } from "@/lib/card/program";
import { walletSecret } from "@/lib/breez/seed";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { addRelay, posTap, posWithdraw, type FakeCardRelay } from "../../jest/card-relay";
import { deletedElsewhere } from "../../jest/card-states";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { FakeNtag424 } from "../../jest/ntag424";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        breezNetwork: "mainnet",
        eas: { projectId: "00000000-0000-4000-8000-000000000000" }
      }
    }
  }
}));
// The tap hashes a programming deposits ahead on the relay (src/config/card.ts): 1 000 in the app,
// each sealed one by one. The tests that stop a card at each command of its programming program it
// again after each stop: there (fewerHashesAhead), 100, deposited again below 50, more than the
// taps they make between two programmings. With 1 000 they took 10 to 25 s each here, three times
// as long on CI runners, near their time limits; with 100, 3 to 7 s. The other tests keep the app's
// numbers. Read through `?.`: the app's modules load the config before this file sets it.
const mockHashes = { fewer: false };
jest.mock("@/config/card", () => {
  const actual = jest.requireActual<typeof import("@/config/card")>("@/config/card");
  // Defined apart: in an object spread, compiled for Jest, a getter is read once, as it loads.
  return Object.defineProperties(
    { ...actual },
    {
      CARD_HASHES_AHEAD: { get: () => (mockHashes?.fewer ? 100 : actual.CARD_HASHES_AHEAD) },
      CARD_HASHES_REFILL_BELOW: {
        get: () => (mockHashes?.fewer ? 50 : actual.CARD_HASHES_REFILL_BELOW)
      }
    }
  );
});

/** For a test that programs its card again after each stop of a programming (mockHashes). */
function fewerHashesAhead(): void {
  mockHashes.fewer = true;
}

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const HOST = DEFAULT_CARD_RELAY_HOST;
const OTHER = "relay.example.org";
const MESSAGES = { alert: "Hold the card to the phone" };
const REPROGRAM = { messages: MESSAGES, channelName: "Card payments" };

let relay: FakeCardRelay;
let other: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;

function cardState(): CardState {
  const state = knownCardState(TEST_WALLET_ID, cardId);
  if (!state) throw new Error("No card state");
  return state;
}

/**
 * The card as a relay change stopped once its reset ended leaves it (manage.ts, reprogramCard):
 * blank, its record "reset" at its keys' version.
 */
async function resetByAMove(): Promise<void> {
  await withCardAccess(async (access) => {
    const { updatedAt: _updatedAt, ...state } = cardState();
    await recordCardState(access, { ...state, status: "reset" });
    await resetCard(new Ntag424(card.transceive), {
      root: access.root,
      cardId,
      version: state.keyVersion
    });
  });
  card.powerCycle();
}

/** The card's channel on `host`, as that relay keeps it. */
async function channelOn(host: FakeCardRelay) {
  const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, host.host));
  return host.channelOf(secret);
}

/** The relay a tap of the card names, from the URL it writes. */
function relayOfTap(url: string): string {
  return new URL(url.replace(/^lnurlw:/, "https:")).host;
}

beforeEach(async () => {
  // A reset reads the card's wallet first (manage.ts).
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  forgetDeviceKey();
  relay = addRelay(HOST);
  other = addRelay(OTHER);
  await openTestAccount({ usage: "card", signUp: "card" });
  card = new FakeNtag424();
  nfc.holdCard(card);
  const paired = await pairCard({
    relayHost: HOST,
    channelName: "Payments",
    messages: MESSAGES
  });
  cardId = paired.state.cardId;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  resetCardPayments();
  await lockTerminal();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  mockHashes.fewer = false;
  jest.restoreAllMocks();
});

describe("a card's name and limits", () => {
  it("are kept in its record, on the relays too", async () => {
    await customizeCard(cardId, { name: "  Erin's   card " });
    await setCardLimit(cardId, "maxPaymentSats", 5_000n);
    await setCardLimit(cardId, "maxDaySats", 30_000n);
    await setCardLimit(cardId, "maxPaymentsPerHour", 3);
    resetCardStates();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states[0]).toMatchObject({
      name: "Erin's card",
      maxPaymentSats: 5_000n,
      maxDaySats: 30_000n,
      maxPaymentsPerHour: 3
    });
  });

  it("keep a name and a look written together, an issuer's visual never replaced", async () => {
    const image = { key: "11".repeat(32), hash: "22".repeat(32) };
    const written = await customizeCard(cardId, {
      name: "Travel",
      look: { kind: "image", image, ink: "dark" }
    });
    expect(written).toMatchObject({ name: "Travel", look: { kind: "image", image, ink: "dark" } });
    // One write: one state on the relays, both in it.
    resetCardStates();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states[0]).toMatchObject({ name: "Travel", look: { kind: "image", ink: "dark" } });
    // The name alone leaves the look.
    await customizeCard(cardId, { name: "Holidays" });
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({
      name: "Holidays",
      look: { kind: "image", image }
    });
    // The look alone leaves the name as this device knows it now (renamed elsewhere meanwhile).
    await customizeCard(cardId, { name: "Renamed elsewhere" });
    await expect(
      customizeCard(cardId, { look: { kind: "color", color: "plum" } })
    ).resolves.toMatchObject({ name: "Renamed elsewhere", look: { kind: "color", color: "plum" } });
    await expect(customizeCard(cardId, {})).rejects.toThrow();
    await customizeCard(cardId, { name: "Holidays", look: { kind: "image", image, ink: "dark" } });

    // A v2 card's visual (its migration's): its name changes, never its look.
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, cardId)!;
      await recordCardState(access, {
        ...state,
        look: null,
        issuer: { image, number: "4821-0937-5530-1186", white: false },
        settingsAt: state.settingsAt + 1
      });
    });
    await expect(
      customizeCard(cardId, { name: "Other", look: { kind: "color", color: "plum" } })
    ).rejects.toThrow();
    expect(knownCardState(TEST_WALLET_ID, cardId)).toMatchObject({ name: "Holidays", look: null });
    await expect(customizeCard(cardId, { name: "Everyday" })).resolves.toMatchObject({
      name: "Everyday",
      look: null,
      issuer: { number: "4821-0937-5530-1186" }
    });
  });

  it("refuse a name out of shape and a limit out of bounds", async () => {
    expect(cardNameOf("Erin\u0007")).toBeNull();
    expect(cardNameOf("ü".repeat(41))).toBeNull();
    expect(cardNameOf("")).toBe("");
    await expect(customizeCard(cardId, { name: "ü".repeat(41) })).rejects.toThrow();
    const confirmed = { passkeyConfirmed: true };
    await expect(setCardLimit(cardId, "maxPaymentSats", 0n, confirmed)).rejects.toThrow();
    // 1 BTC at most.
    await expect(setCardLimit(cardId, "maxPaymentSats", 100_000_001n, confirmed)).rejects.toThrow();
    await expect(
      setCardLimit(cardId, "maxPaymentSats", 100_000_000n, confirmed)
    ).resolves.toMatchObject({ maxPaymentSats: 100_000_000n });
    // Over 24 hours, 1 BTC at most too.
    await expect(setCardLimit(cardId, "maxDaySats", 0n, confirmed)).rejects.toThrow();
    await expect(setCardLimit(cardId, "maxDaySats", 100_000_001n, confirmed)).rejects.toThrow();
    await expect(
      setCardLimit(cardId, "maxDaySats", 100_000_000n, confirmed)
    ).resolves.toMatchObject({ maxDaySats: 100_000_000n });
    // 60 payments an hour at most, a whole number of them.
    for (const refused of [0, 61, 2.5]) {
      await expect(
        setCardLimit(cardId, "maxPaymentsPerHour", refused, confirmed)
      ).rejects.toThrow();
    }
    await expect(setCardLimit(cardId, "maxPaymentsPerHour", 60, confirmed)).resolves.toMatchObject({
      maxPaymentsPerHour: 60
    });
  });

  it("are raised only with the passkey: lowered at once", async () => {
    await expect(setCardLimit(cardId, "maxPaymentSats", 20_001n)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    await expect(setCardLimit(cardId, "maxDaySats", 50_001n)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    await expect(setCardLimit(cardId, "maxPaymentsPerHour", 6)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    // Nothing written, here nor on the relays.
    resetCardStates();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states[0]).toMatchObject({
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5
    });
    await expect(setCardLimit(cardId, "maxPaymentSats", 20_000n)).resolves.toMatchObject({
      maxPaymentSats: 20_000n
    });
    await expect(
      setCardLimit(cardId, "maxPaymentSats", 30_000n, { passkeyConfirmed: true })
    ).resolves.toMatchObject({ maxPaymentSats: 30_000n });
  });

  it("are raised against the limit the relays hold now, lowered elsewhere meanwhile", async () => {
    // The web app lowered the ceiling to 5 000 sats; this phone still knows 20 000.
    const state = cardState();
    const keys = await withCardAccess(async ({ root }) => deriveCardRecordKeys(root));
    await publishToRelays(
      cardStateEvent(keys, {
        ...state,
        maxPaymentSats: 5_000n,
        settingsAt: state.settingsAt + 1000,
        updatedAt: state.updatedAt + 60
      }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentSats).toBe(20_000n);
    // 10 000 sats: below what this phone knows, above what the relays hold.
    await expect(setCardLimit(cardId, "maxPaymentSats", 10_000n)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentSats).toBe(5_000n);
  });

  it("are changed one at a time: a change asked during another never undoes it", async () => {
    // Both asked while the relays are slow to answer: each would read the card before the other
    // kept its change.
    const release = nostr.holdQueries();
    const paused = setCardSuspended(cardId, true);
    const lowered = setCardLimit(cardId, "maxPaymentSats", 5_000n);
    const renamed = customizeCard(cardId, {
      name: "Everyday",
      look: { kind: "color", color: "fir" }
    });
    release();
    await Promise.all([paused, lowered, renamed]);
    resetCardStates();
    const { states } = await withCardAccess(refreshCardStates);
    expect(states[0]).toMatchObject({
      suspended: true,
      maxPaymentSats: 5_000n,
      name: "Everyday",
      look: { kind: "color", color: "fir" }
    });
  });

  it("need the passkey for any change without a read of a majority of the relays", async () => {
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    await expect(setCardLimit(cardId, "maxPaymentSats", 1_000n)).rejects.toBeInstanceOf(
      RaisedLimitError
    );
    expect(knownCardState(TEST_WALLET_ID, cardId)?.maxPaymentSats).toBe(20_000n);
    await expect(
      setCardLimit(cardId, "maxPaymentSats", 1_000n, { passkeyConfirmed: true })
    ).resolves.toMatchObject({ maxPaymentSats: 1_000n });
    nostr.unreachable.clear();
  });
});

describe("a card deleted on the web app (which cannot reach the card relay)", () => {
  it("has its channel deleted at the next sync, its taps waking nothing, never active again", async () => {
    const url = card.tap();
    await deletedElsewhere(TEST_WALLET_ID, cardId);
    // Its channel left to the sync, as the web app left it.
    expect(await channelOn(relay)).toBeTruthy();
    await syncAccountCards("Payments");
    expect(await channelOn(relay)).toBeUndefined();
    expect((await posTap(url)).status).toBe(404);
    // Once deleted, an older copy saying "active" never brings it back.
    resetCardStates();
    await withCardAccess(refreshCardStates);
    expect(cardState().status).toBe("deleted");
  });

  it("its relay unreachable at the sync, a tap still wakes the phone, which drops it", async () => {
    await deletedElsewhere(TEST_WALLET_ID, cardId);
    relay.unreachable = true;
    await syncAccountCards("Payments");
    relay.unreachable = false;
    // The relay still has the channel: a tap wakes the phone, which drops it.
    const request = await posWithdraw(card.tap());
    expect(request.callback).toBeTruthy();
    const packet = relay.pushes[relay.pushes.length - 1].data.cr;
    await expect(receiveCardWake(packet, Date.now(), TEST_WALLET_ID)).resolves.toBeNull();
  });
});

describe("a card deleted (all its data erased)", () => {
  const IN_HAND = { inHand: { messages: MESSAGES } };

  it("held to the phone, is blank again, recorded deleted, its channel and data gone", async () => {
    await customizeCard(cardId, { name: "Everyday" });
    await expect(deleteCard(cardId, IN_HAND)).resolves.toMatchObject({
      state: { status: "deleted", keyVersion: 1 },
      channel: "deleted",
      erased: true
    });
    expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    expect(await channelOn(relay)).toBeUndefined();
    expect((await loadPushMarks()).has(cardId)).toBe(false);
    // Its settings erased, its keys' version and its wallet's generation kept.
    expect(cardState()).toMatchObject({
      status: "deleted",
      name: "",
      keyVersion: 1,
      walletGeneration: 1
    });

    // Added again: a new card, its next keys and a new wallet.
    const again = await pairCard({
      relayHost: HOST,
      channelName: "Payments",
      messages: MESSAGES
    });
    expect(again.state).toMatchObject({
      cardId,
      keyVersion: 2,
      status: "active",
      walletGeneration: 2,
      name: ""
    });
  });

  it('without it, pays nothing at once; found again, "Add a card" makes it blank and new', async () => {
    const url = card.tap();
    await expect(deleteCard(cardId)).resolves.toMatchObject({
      state: { status: "deleted", keyVersion: 1 },
      channel: "deleted",
      erased: true
    });
    // Its keys still in the card: its taps wake nothing, its relay forgot them.
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect((await posTap(url)).status).toBe(404);
    // An older copy saying "active" never brings it back.
    resetCardStates();
    await withCardAccess(refreshCardStates);
    expect(cardState().status).toBe("deleted");

    const { state } = await pairCard({
      relayHost: HOST,
      channelName: "Payments",
      messages: MESSAGES
    });
    expect(state).toMatchObject({ cardId, status: "active", keyVersion: 2, walletGeneration: 2 });
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
    expect((await posTap(card.tap())).status).toBe(200);
    expect(card.failedAuthentications).toBe(0);
  });

  it("is recorded deleted before anything on the card changes: stopped anywhere, never half paying", async () => {
    fewerHashesAhead();
    const pays = async () => (await posTap(card.tap())).status === 200;
    // The commands of a deletion in hand: the card's reset.
    const start = card.received.length;
    await deleteCard(cardId, IN_HAND);
    const count = card.received.length - start;
    expect(count).toBeGreaterThan(0);
    const again = async () => {
      await pairCard({ relayHost: HOST, channelName: "Payments", messages: MESSAGES });
      expect(cardState().status).toBe("active");
      expect(await pays()).toBe(true);
    };
    await again();

    // Taken away before the card handles a command, or once it did, its answer lost.
    for (let step = 0; step < count * 2; step++) {
      const at = Math.floor(step / 2);
      const versions = [...card.keyVersions];
      card.interruptAt(at, step % 2 === 1);
      await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({ reason: "cardLost" });
      if (cardState().status === "active") {
        // Stopped as the card was read: nothing written to it, it pays on.
        expect(card.keyVersions).toEqual(versions);
        expect(await pays()).toBe(true);
        continue;
      }
      // Deleted from then on, whatever the card holds: it pays nothing.
      expect(cardState().status).toBe("deleted");
      if (at % 2 === 0) {
        // "Try again": the card is made blank.
        await expect(deleteCard(cardId, IN_HAND)).resolves.toMatchObject({
          state: { status: "deleted" }
        });
        expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
      }
      // Added again, from wherever the card was left.
      await again();
    }
    expect(card.failedAuthentications).toBe(0);
  }, 120_000);

  const FILLS: [string, (wallet: BreezFake.FakeCardWallet) => void][] = [
    [
      "sats",
      (wallet) => {
        wallet.balanceSats = 1n;
      }
    ],
    [
      "a payment pending",
      (wallet) => {
        wallet.payments = [
          {
            id: "p1",
            paymentType: sdk.PaymentType.Receive,
            status: sdk.PaymentStatus.Pending,
            amount: 2_000n,
            fees: 0n,
            timestamp: BigInt(Math.floor(Date.now() / 1000)),
            method: sdk.PaymentMethod.Spark,
            details: undefined
          }
        ];
      }
    ],
    [
      "a transfer the SDK cannot tell, pending",
      (wallet) => {
        wallet.payments = [
          sdk.unknownMethodPayment({
            id: "u1",
            status: sdk.PaymentStatus.Pending,
            amount: 2_000n,
            timestamp: Math.floor(Date.now() / 1000)
          })
        ];
      }
    ],
    [
      "a deposit to claim",
      (wallet) => {
        wallet.unclaimedDeposits = [
          { txid: "cd".repeat(32), vout: 0, amountSats: 20_000n, isMature: false }
        ];
      }
    ],
    [
      "funds out of its balance, on their way back (funds-recovery.ts)",
      (wallet) => {
        wallet.recovery.leaves = [
          { leafId: "leaf-1", valueSats: 5_000n, method: "cooperative", takenFeeSats: 0n }
        ];
      }
    ]
  ];

  it.each(FILLS)(
    "waits for its wallet to be empty (%s), the card never asked for",
    async (_, fill) => {
      const wallet = sdk.fakeCardWallet(cardId);
      const versions = [...card.keyVersions];
      const asked = nfc.calls.length;
      fill(wallet);
      for (const options of [IN_HAND, {}]) {
        await expect(deleteCard(cardId, options)).rejects.toMatchObject({
          reason: "walletNotEmpty"
        });
      }
      // Untouched, still paying, its channel kept.
      expect(nfc.calls.slice(asked)).toEqual([]);
      expect(card.keyVersions).toEqual(versions);
      expect(cardState().status).toBe("active");
      expect((await channelOn(relay))?.hashes.size).toBe(1000);

      // Emptied: deleted.
      wallet.balanceSats = 0n;
      wallet.payments = [];
      wallet.unclaimedDeposits = [];
      wallet.recovery.leaves = [];
      await expect(deleteCard(cardId, IN_HAND)).resolves.toMatchObject({
        state: { status: "deleted" }
      });
      expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
    }
  );

  it("gives its wallet's Lightning address up first: nobody pays a card deleted", async () => {
    /** The card's wallet of `walletGeneration`'s Lightning address, registered now. */
    const register = (walletGeneration: number) =>
      withCardAccess(async (access) => {
        const lease = await leaseCardWallet(access, { cardId, walletGeneration });
        try {
          return await cardLightningAddress(lease);
        } finally {
          await lease.release();
        }
      });
    const address = await register(1);
    const username = address.replace(/@breez\.tips$/, "");
    expect(sdk.lightningAddresses.has(username)).toBe(true);

    // Refused (not empty): the address stays, the card pays on.
    sdk.fakeCardWallet(cardId).balanceSats = 5n;
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "walletNotEmpty"
    });
    expect(sdk.lightningAddresses.has(username)).toBe(true);

    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    await deleteCard(cardId, IN_HAND);
    expect(sdk.lightningAddresses.has(username)).toBe(false);

    // The same card added again: a new wallet, a new address.
    await pairCard({ relayHost: HOST, channelName: "Payments", messages: MESSAGES });
    const next = await register(2);
    expect(next).not.toBe(address);
    expect(sdk.lightningAddresses.has(username)).toBe(false);
  });

  it("registers its Lightning address again when its deletion did not take place", async () => {
    const username = (
      await withCardAccess(async (access) => {
        const lease = await leaseCardWallet(access, { cardId, walletGeneration: 1 });
        try {
          return await cardLightningAddress(lease);
        } finally {
          await lease.release();
        }
      })
    ).replace(/@breez\.tips$/, "");
    // Another card held: refused before its deletion went anywhere, the card in service.
    nfc.holdCard(new FakeNtag424("04112233445566"));
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({ reason: "notThisCard" });
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    // Left before the card was asked for: the same.
    nfc.holdCard(card);
    await expect(
      deleteCard(cardId, { inHand: { messages: MESSAGES, stopped: () => true } })
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    expect(cardState().status).toBe("active");
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("is refused while its wallet cannot be read, the card never asked for", async () => {
    // No API key: the wallet cannot connect.
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const asked = nfc.calls.length;
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "walletUnavailable"
    });
    expect(nfc.calls.slice(asked)).toEqual([]);
    expect(cardState().status).toBe("active");
  });

  it("is refused while no majority of the account's relays answered: nothing changed", async () => {
    for (const url of currentRelays().slice(0, 3)) nostr.unreachable.add(url);
    const asked = nfc.calls.length;
    for (const options of [IN_HAND, {}]) {
      await expect(deleteCard(cardId, options)).rejects.toMatchObject({
        reason: "recordsUnreachable"
      });
    }
    nostr.unreachable.clear();
    expect(nfc.calls.slice(asked)).toEqual([]);
    expect(cardState().status).toBe("active");
    expect((await channelOn(relay))?.hashes.size).toBe(1000);
  });

  it("is never touched when another card is held", async () => {
    const stranger = new FakeNtag424("04112233445566");
    nfc.holdCard(stranger);
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "notThisCard"
    });
    expect(stranger.failedAuthentications).toBe(0);
    expect(cardState().status).toBe("active");
    expect((await channelOn(relay))?.hashes.size).toBe(1000);
    // Programmed by another wallet, not blank: never authenticated with this card's keys.
    const foreign = new FakeNtag424("04112233445567");
    foreign.keyVersions[0] = 3;
    nfc.holdCard(foreign);
    await expect(deleteCard(cardId, IN_HAND)).rejects.toMatchObject({
      reason: "notThisCard"
    });
    expect(foreign.failedAuthentications).toBe(0);
    expect(cardState().status).toBe("active");
  });

  it("is deleted when its relay does not answer, its channel deleted at the next sync", async () => {
    relay.unreachable = true;
    await expect(deleteCard(cardId)).resolves.toMatchObject({
      state: { status: "deleted" },
      channel: "unreachable"
    });
    expect((await loadPushMarks()).has(cardId)).toBe(true);
    relay.unreachable = false;
    expect((await channelOn(relay))?.hashes.size).toBe(1000);
    await syncAccountCards("Payments");
    expect(await channelOn(relay)).toBeUndefined();
    expect((await loadPushMarks()).has(cardId)).toBe(false);
  });

  it("syncs the cards in service without waiting for the relays to erase a deleted card's data", async () => {
    // Another card of the account, deleted elsewhere: its data still on the relays.
    const root = deriveCardRoot(walletSecret(testSeed()));
    const keys = deriveCardRecordKeys(root);
    const uid = "04aabbccddeeff";
    const deleted = cardIdOf(root, hexToBytes(uid));
    await publishToRelays(
      cardStateEvent(keys, { ...cardState(), cardId: deleted, uid, status: "deleted", name: "" }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    // A payment of its wallet the relays still hold: its erasure has something to delete.
    const history = deriveHistoryRecordKeys(root);
    await publishToRelays(
      historyEvent(history, {
        entry: {
          id: "d1",
          cardId: deleted,
          walletGeneration: 1,
          at: Date.now() - 60_000,
          amountSats: 3_400n,
          paymentHash: "d1".padStart(64, "0"),
          description: "Lakeside Coffee",
          outcome: "sent",
          reason: null,
          pr: "lnbc34u1fake",
          payee: null,
          preimage: null,
          value: null
        },
        revision: 0
      }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: history.nostr.secretKey
      }
    );
    // Its erasure held on the relays (a relay slow to answer): the card in service synced
    // meanwhile (it does not wait for the erasure's timeouts).
    const release = nostr.holdPublishes();
    let synced = false;
    const sync = syncAccountCards("Payments").finally(() => {
      synced = true;
    });
    try {
      await waitFor(() => expect(lastChannelSyncs().get(cardId)).toBeDefined());
      expect(synced).toBe(false);
    } finally {
      release();
    }
    await sync;
    // Its erasure ran all the same: its payment's deletion requested.
    expect(
      nostr.calls.some(({ operation, event }) => operation === "publish" && event?.kind === 5)
    ).toBe(true);
  });

  it("deleted on another device, leaves this phone's sync nothing of it to publish", async () => {
    // A payment this phone made, not published yet.
    await logCardPayment({
      id: "a1",
      cardId,
      walletGeneration: 1,
      at: Date.now() - 60_000,
      amountSats: 3_400n,
      paymentHash: "a1".padStart(64, "0"),
      description: "Lakeside Coffee",
      outcome: "sent",
      reason: null,
      pr: "lnbc34u1fake",
      payee: null,
      preimage: null,
      value: null
    });
    // The web app deletes it: its record on the relays says so, this phone not told yet.
    const root = deriveCardRoot(walletSecret(testSeed()));
    const keys = deriveCardRecordKeys(root);
    const state = cardState();
    await publishToRelays(
      cardStateEvent(keys, {
        ...state,
        status: "deleted",
        name: "",
        settingsAt: state.settingsAt + 1,
        updatedAt: state.updatedAt + 1
      }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    const published = nostr.calls.length;
    await syncAccountCards("Payments");
    expect(cardState().status).toBe("deleted");
    // Forgotten before the payments were published: none of its went.
    expect(
      (await loadCardPayments()).filter((entry) => entry.cardId === cardId).map(({ id }) => id)
    ).toEqual([]);
    expect(
      nostr.calls
        .slice(published)
        .filter(({ operation, event }) => operation === "publish" && event?.kind === 30078)
        .map(({ event }) => event!.pubkey)
    ).not.toContain(
      await withCardAccess(
        async ({ root: cardRoot }) => deriveHistoryRecordKeys(cardRoot).nostr.publicKey
      )
    );
    // Its channel goes too, the phone that made it holding its push mark.
    expect(await channelOn(relay)).toBeUndefined();
  });

  it("takes no setting written after its deletion, by a panel still open", async () => {
    await deleteCard(cardId);
    await expect(customizeCard(cardId, { name: "Holidays" })).rejects.toMatchObject({
      reason: "cardGone"
    });
    await expect(setCardSuspended(cardId, true)).rejects.toMatchObject({ reason: "cardGone" });
    await expect(setCardLimit(cardId, "maxPaymentsPerHour", 2)).rejects.toMatchObject({
      reason: "cardGone"
    });
    expect(cardState()).toMatchObject({ status: "deleted", name: "", suspended: false });
  });

  it("refuses another blank card in place of this one for new keys too, writing nothing", async () => {
    const stranger = new FakeNtag424("04112233445566");
    nfc.holdCard(stranger);
    await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: HOST })).rejects.toMatchObject({
      reason: "notThisCard"
    });
    expect(cardState()).toMatchObject({ status: "active", keyVersion: 1 });
    expect(stranger.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("a relay change", () => {
  it("prepares the new relay, programs the card for it, then leaves the former one", async () => {
    const before = card.tap();
    const moved = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    expect(moved).toMatchObject({
      state: {
        status: "active",
        keyVersion: 2,
        relayHost: OTHER,
        lastCounter: 1,
        depositedThrough: 1001
      },
      activation: { status: "ready", pending: 1000 },
      previousChannel: "deleted"
    });
    expect(await channelOn(relay)).toBeUndefined();
    // The card now names the new relay, which knows its next taps, each with the phone's token
    // sealed for it (none of the PATCH a token unknown would need); the former one, none.
    expect(other.requests).not.toContain("PATCH /v1/channel/hashes");
    const url = card.tap();
    expect(relayOfTap(url)).toBe(OTHER);
    expect((await posTap(url)).status).toBe(200);
    expect(other.pushes.at(-1)?.to).toBe("ExponentPushToken[fake-token-0000000000]");
    expect((await posTap(before)).status).toBe(404);
  });

  it("moves the card of a phone without a push token too, paid in open-app mode", async () => {
    notifications.notifications.token = null;
    const moved = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    expect(moved).toMatchObject({
      state: { status: "active", relayHost: OTHER },
      activation: { status: "noPush", pending: 1000 },
      previousChannel: "deleted"
    });
    const pushes = other.pushes.length;
    expect((await posTap(card.tap())).status).toBe(200);
    expect(other.pushes).toHaveLength(pushes);
  });

  it("never touches the card when the new relay is not one", async () => {
    other.protocol = 1;
    await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).rejects.toMatchObject({
      reason: "relayIncompatible"
    });
    other.protocol = 2;
    other.unreachable = true;
    await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).rejects.toMatchObject({
      reason: "relayUnreachable"
    });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
  });

  it("says when the former relay did not answer, the card on the new one all the same", async () => {
    const moving = reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    // Down once the new relay is prepared (the card's session asks it nothing).
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if ((init.method ?? "GET") === "DELETE" && cardState().relayHost === OTHER) {
        relay.unreachable = true;
      }
      return handle(url, init);
    };
    await expect(moving).resolves.toMatchObject({
      state: { relayHost: OTHER },
      previousChannel: "unreachable"
    });
  });

  it("goes on at the next attempt wherever the card left the field", async () => {
    // How many commands the reset and the programming take, on a card like this one.
    const probe = new FakeNtag424("04aabbccddeeff");
    nfc.holdCard(probe);
    const probed = await pairCard({
      relayHost: HOST,
      channelName: "Payments",
      messages: MESSAGES
    });
    const start = probe.received.length;
    await reprogramCard(probed.state.cardId, { ...REPROGRAM, relayHost: OTHER });
    const count = probe.received.length - start;
    expect(count).toBeGreaterThan(20);

    nfc.holdCard(card);
    for (const at of [1, Math.floor(count / 3), Math.floor(count / 2), count - 3]) {
      card.interruptAt(at, at % 2 === 0);
      const first = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER }).catch(
        (error: unknown) => error
      );
      expect(first).toMatchObject({ reason: "cardLost" });
      const done = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
      expect(done.state).toMatchObject({ status: "active", relayHost: OTHER });
      expect(card.failedAuthentications).toBe(0);
      expect((await posTap(card.tap())).status).toBe(200);
      // Back to the default relay for the next round.
      await reprogramCard(cardId, { ...REPROGRAM, relayHost: HOST });
    }
    expect(cardState()).toMatchObject({ relayHost: HOST, status: "active" });
  });

  it("stops before the card once its holder left, no card sent anything", async () => {
    // Left during the checks, or as the phone was about to wait for the card.
    let left = false;
    for (const stopped of [() => true, () => left]) {
      await expect(
        reprogramCard(cardId, {
          ...REPROGRAM,
          relayHost: OTHER,
          onStep: (step) => {
            if (step === "card") left = true;
          },
          stopped
        })
      ).rejects.toMatchObject({ reason: "cancelled" });
    }
    // The pairing's session only.
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(1);
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(cardState()).toMatchObject({ status: "active", keyVersion: 1, relayHost: HOST });
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("leaves the relay an earlier attempt left, once the card is recorded at the new one", async () => {
    // The former relay down as the move ends: its channel stays there.
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if ((init.method ?? "GET") === "DELETE" && cardState().relayHost === OTHER) {
        throw new TypeError("Network request failed");
      }
      return handle(url, init);
    };
    await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).resolves.toMatchObject({
      previousChannel: "unreachable"
    });
    relay.handle = handle;
    expect(await channelOn(relay)).toBeDefined();

    // Tried again, the relay it leaves named: its channel there goes, the card not asked for.
    const sessions = nfc.calls.filter((call) => call.startsWith("requestTechnology")).length;
    const steps: string[] = [];
    const again = await reprogramCard(cardId, {
      ...REPROGRAM,
      relayHost: OTHER,
      formerRelayHost: HOST,
      onStep: (step) => steps.push(step)
    });
    expect(again).toMatchObject({
      state: { status: "active", relayHost: OTHER, keyVersion: 2 },
      previousChannel: "deleted",
      activation: { status: "ready" }
    });
    expect(steps).toEqual(["notifications", "relay", "activating"]);
    expect(nfc.calls.filter((call) => call.startsWith("requestTechnology"))).toHaveLength(sessions);
    expect(card.keyVersions).toEqual([2, 2, 2, 2, 2]);
    expect(await channelOn(relay)).toBeUndefined();
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("is done once the card is on the new relay, whatever the former one answers", async () => {
    // The former relay refuses to forget the card (a 405 of a server in front of it).
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) =>
      (init.method ?? "GET") === "DELETE" && cardState().relayHost === OTHER
        ? new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 })
        : handle(url, init);
    const moved = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    expect(moved).toMatchObject({
      state: { status: "active", relayHost: OTHER, keyVersion: 2 },
      previousChannel: "refused",
      activation: { status: "ready" }
    });
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("records the card reset before anything on it changes: never active and unable to pay", async () => {
    fewerHashesAhead();
    // How many commands a move takes, on a card like this one.
    const probe = new FakeNtag424("04aabbccddeeff");
    nfc.holdCard(probe);
    const probed = await pairCard({
      relayHost: HOST,
      channelName: "Payments",
      messages: MESSAGES
    });
    const start = probe.received.length;
    await reprogramCard(probed.state.cardId, { ...REPROGRAM, relayHost: OTHER });
    const count = probe.received.length - start;

    /** Whether the card's tap is paid at the relay its record names. */
    const pays = async () => {
      try {
        return (await posTap(card.tap())).status === 200;
      } catch {
        return false;
      }
    };
    nfc.holdCard(card);
    // A command in three of the move's session, the card's reset among them.
    for (let at = 1; at < count; at += 3) {
      card.interruptAt(at, at % 2 === 0);
      await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).rejects.toMatchObject(
        { reason: "cardLost" }
      );
      // Out of "Cards" (reset), or still paying where its record says.
      if (cardState().status !== "reset") {
        expect(cardState()).toMatchObject({ status: "active", relayHost: HOST });
        expect(await pays()).toBe(true);
      }
      // Tried again: it goes on.
      await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
      expect(cardState()).toMatchObject({ status: "active", relayHost: OTHER });
      expect(await pays()).toBe(true);
      await reprogramCard(cardId, { ...REPROGRAM, relayHost: HOST });
    }
    expect(card.failedAuthentications).toBe(0);
  }, 30_000);

  it.each([
    ["to another relay", OTHER, HOST],
    ["back to the default relay", HOST, OTHER]
  ])(
    'comes back with "Add a card" wherever a move %s stopped, with its settings',
    async (_, to, from) => {
      fewerHashesAhead();
      if (from !== HOST) await reprogramCard(cardId, { ...REPROGRAM, relayHost: from });
      await customizeCard(cardId, { name: "Erin's card" });
      await setCardLimit(cardId, "maxPaymentSats", 5_000n);
      // How many commands a move takes, on this card.
      const start = card.received.length;
      await reprogramCard(cardId, { ...REPROGRAM, relayHost: to });
      const count = card.received.length - start;
      await reprogramCard(cardId, { ...REPROGRAM, relayHost: from });

      const pays = async () => (await posTap(card.tap())).status === 200;
      const brought: number[] = [];
      // Every state a move leaves the card in: stopped before each of its commands (once handled,
      // the card is as before the next one; card-program.test.ts tries both on its own).
      for (let at = 0; at < count; at++) {
        const version = cardState().keyVersion;
        card.interruptAt(at);
        await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: to })).rejects.toMatchObject({
          reason: "cardLost"
        });
        if (cardState().status === "active") {
          // Stopped before its record said "reset": the card as it was, still paying.
          expect(cardState()).toMatchObject({ relayHost: from, keyVersion: version });
        } else {
          // Out of "Cards", its holder gone from the steps: added again, it comes back.
          expect(cardState().status).toBe("reset");
          const { state } = await pairCard({
            relayHost: HOST,
            channelName: "Payments",
            messages: MESSAGES
          });
          // On the default relay, as any card added; past the next version once the card held it
          // (its programming for the new relay undone first).
          expect(state).toMatchObject({
            cardId,
            status: "active",
            relayHost: HOST,
            name: "Erin's card",
            maxPaymentSats: 5_000n
          });
          expect(card.keyVersions.every((held) => held === state.keyVersion)).toBe(true);
          brought.push(state.keyVersion - version);
        }
        expect(await pays()).toBe(true);
        if (cardState().relayHost !== from) {
          await reprogramCard(cardId, { ...REPROGRAM, relayHost: from });
        }
      }
      // Its reset gone on, or the programming the move began at the next version undone.
      expect(new Set(brought)).toEqual(new Set([1, 2]));
      expect(card.failedAuthentications).toBe(0);
    },
    120_000
  );

  it("never lets a card's file choose its relay: rewritten while reset, added again on the default one", async () => {
    await resetByAMove();
    expect(cardState().status).toBe("reset");
    // Someone with the blank card a moment: its file for their relay, SDM on, its keys left blank.
    const evil = addRelay("evil.example");
    const tool = new Ntag424(card.transceive);
    const template = cardFileTemplate("evil.example");
    await tool.selectApplication();
    await tool.writeData(2, 0, template.bytes);
    await tool.authenticate(0, ZERO_KEY);
    await tool.changeFileSettings(2, boltCardFileSettings(template));
    card.powerCycle();

    const { state } = await pairCard({
      relayHost: HOST,
      channelName: "Payments",
      messages: MESSAGES
    });
    expect(state).toMatchObject({ cardId, status: "active", relayHost: HOST, keyVersion: 2 });
    expect(relayOfTap(card.tap())).toBe(HOST);
    expect(evil.requests).toEqual([]);
    expect(card.failedAuthentications).toBe(0);
  });

  it("tries a key 0 once only: a card reset whose key 0 someone changed, its version left at 0", async () => {
    await resetByAMove();
    card.keys[0] = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    card.files[2].set(cardFileTemplate(HOST).bytes);

    // Random ID on: nothing names it this wallet's card, "not blank".
    await expect(
      pairCard({ relayHost: HOST, channelName: "Payments", messages: MESSAGES })
    ).rejects.toMatchObject({ reason: "notBlank" });
    expect(card.failedAuthentications).toBe(1);
    expect(cardState().status).toBe("reset");
  });

  it("never tries the blank key 0 of a card whose file holds another issuer's record", async () => {
    await resetByAMove();
    // Random ID on, its key 0 changed at version 0, its file another issuer's NDEF message (NLEN 5:
    // a URI record "https://" + nothing): no tap, no placeholders.
    card.keys[0] = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    card.files[2].set(Uint8Array.of(0x00, 0x05, 0xd1, 0x01, 0x01, 0x55, 0x04));

    await expect(
      pairCard({ relayHost: HOST, channelName: "Payments", messages: MESSAGES })
    ).rejects.toMatchObject({ reason: "notBlank" });
    expect(card.failedAuthentications).toBe(0);
    expect(cardState().status).toBe("reset");
  });

  it("tries a key 0 once only when a move goes on, too", async () => {
    // Reset, its record "reset" (a move stopped once its reset ended), then its key 0 changed.
    await resetByAMove();
    card.keys[0] = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    card.files[2].set(cardFileTemplate(HOST).bytes);

    await expect(
      reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER, formerRelayHost: HOST })
    ).rejects.toMatchObject({ reason: "notThisCard" });
    expect(card.failedAuthentications).toBe(1);
  });

  it("records a card found blank as reset before it is programmed: every stop then comes back", async () => {
    fewerHashesAhead();
    const pays = async () => (await posTap(card.tap())).status === 200;
    /** The card blank, its record still active (a reset whose record was lost, a phone behind). */
    async function blankBehindItsRecord() {
      if (cardState().relayHost !== HOST) {
        await reprogramCard(cardId, { ...REPROGRAM, relayHost: HOST });
      }
      await withCardAccess(async ({ root }) => {
        await resetCard(new Ntag424(card.transceive), {
          root,
          cardId,
          version: cardState().keyVersion
        });
      });
      card.powerCycle();
    }
    await blankBehindItsRecord();
    const start = card.received.length;
    await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    const count = card.received.length - start;

    for (let at = 0; at < count; at++) {
      await blankBehindItsRecord();
      expect(cardState()).toMatchObject({ status: "active", relayHost: HOST });
      card.interruptAt(at);
      await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).rejects.toMatchObject(
        {
          reason: "cardLost"
        }
      );
      if (cardState().status === "active") {
        // Stopped as the card was read: nothing written to it.
        expect(card.keyVersions).toEqual([0, 0, 0, 0, 0]);
        continue;
      }
      expect(cardState().status).toBe("reset");
      if (at % 2 === 0) {
        // "Try again": the move goes on.
        await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER, formerRelayHost: HOST });
        expect(cardState()).toMatchObject({ status: "active", relayHost: OTHER });
      } else {
        // Left: "Add a card".
        const { state } = await pairCard({
          relayHost: HOST,
          channelName: "Payments",
          messages: MESSAGES
        });
        expect(state).toMatchObject({ cardId, status: "active", relayHost: HOST });
      }
      expect(await pays()).toBe(true);
    }
    expect(card.failedAuthentications).toBe(0);
  }, 60_000);

  it("makes nothing on the new relay for a move left during its checks", async () => {
    // Left as the new relay answers its info.
    let left = false;
    const handle = other.handle.bind(other);
    other.handle = async (url, init) => {
      const response = await handle(url, init);
      left = true;
      return response;
    };
    await expect(
      reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER, stopped: () => left })
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(other.requests).toEqual(["GET /v1/info"]);
    expect(await channelOn(other)).toBeUndefined();

    // Left while its channel was made there: it goes again. Nothing of the card changed.
    left = false;
    other.handle = async (url, init) => {
      const response = await handle(url, init);
      if ((init.method ?? "GET") === "POST") left = true;
      return response;
    };
    await expect(
      reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER, stopped: () => left })
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(other.requests.at(-1)).toBe("DELETE /v1/channel");
    expect(await channelOn(other)).toBeUndefined();
    expect(cardState()).toMatchObject({ status: "active", relayHost: HOST, keyVersion: 1 });
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("says a former relay whose answer proves nothing of its channel", async () => {
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) =>
      (init.method ?? "GET") === "DELETE" && cardState().relayHost === OTHER
        ? new Response("<html>OK</html>", { status: 200 })
        : handle(url, init);
    const moved = await reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER });
    expect(moved).toMatchObject({
      state: { status: "active", relayHost: OTHER, keyVersion: 2 },
      previousChannel: "unknown"
    });
    expect((await posTap(card.tap())).status).toBe(200);
  });

  it("syncs the new relay's channel apart from a sync of the former one still running", async () => {
    resetChannelSyncs();
    // A check of the card's channel on its relay ("Relay and programming"), held at its PUT.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = relay.handle.bind(relay);
    relay.handle = async (url, init) => {
      if ((init.method ?? "GET") === "PUT") await held;
      return handle(url, init);
    };
    const checking = checkCardChannel(cardId, "Payments");
    try {
      const outcome = await Promise.race([
        reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER }),
        new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 5000))
      ]);
      // Its own sync, not the former relay's: the new channel as it is.
      expect(outcome).toMatchObject({
        state: { relayHost: OTHER, keyVersion: 2 },
        activation: { status: "ready", pending: 1000 }
      });
      if (outcome === "waiting") return;
      keepChannelSync(outcome.state, outcome.activation);
    } finally {
      release();
    }

    // The former channel's check ends after: never over the new one's, never the card's state.
    await checking;
    expect(lastChannelSyncs().get(cardId)).toMatchObject({
      relayHost: OTHER,
      keyVersion: 2,
      result: { status: "ready" }
    });
    expect(channelSyncOf(lastChannelSyncs(), cardState())).toMatchObject({ status: "ready" });
    expect(cardState()).toMatchObject({ status: "active", relayHost: OTHER, keyVersion: 2 });
  });

  it("refuses another blank card in place of a card reset meanwhile", async () => {
    await resetByAMove();
    const stranger = new FakeNtag424("04112233445566");
    nfc.holdCard(stranger);
    await expect(reprogramCard(cardId, { ...REPROGRAM, relayHost: OTHER })).rejects.toMatchObject({
      reason: "notThisCard"
    });
    expect(stranger.keyVersions).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("new keys on the same relay", () => {
  it("makes its channel anew: the earlier taps' hashes go", async () => {
    const before = card.tap();
    const rekeyed = await reprogramCard(cardId, { ...REPROGRAM, relayHost: HOST });
    expect(rekeyed).toMatchObject({
      state: { keyVersion: 2, relayHost: HOST },
      previousChannel: null,
      activation: { status: "ready", pending: 1000 }
    });
    expect((await posTap(before)).status).toBe(404);
    expect((await posTap(card.tap())).status).toBe(200);
  });
});

describe("a card's settings changed on another device (the web app)", () => {
  const root = deriveCardRoot(walletSecret(testSeed()));
  const keys = deriveCardRecordKeys(root);
  const call = { relays: currentRelays(), channel: "account" as const, timeoutMs: 1000 };

  /** What each relay holds of the card: its one copy (a relay keeps the latest). */
  async function onEachRelay(): Promise<CardState[]> {
    const answers = await queryRelays(cardStatesFilter(keys), { ...call, relays: currentRelays() });
    return [...answers.values()].map((events) => {
      const read = cardStatesOf(keys, root, new Map([["relay", events]]));
      return read.states.get(cardId)!;
    });
  }

  it("are never written over by this phone recording a tap after them", async () => {
    const state = cardState();
    // Suspended on the web app, its ceiling lowered: its record on the relays, dated later.
    const web: CardState = {
      ...state,
      suspended: true,
      maxPaymentSats: 5_000n,
      settingsAt: state.settingsAt + 60_000,
      updatedAt: state.updatedAt + 60
    };
    await publishToRelays(cardStateEvent(keys, web), {
      ...call,
      relays: currentRelays(),
      authKey: keys.nostr.secretKey
    });
    // This phone, not told yet, records a tap's counter with the settings it knows.
    const { updatedAt: _updatedAt, ...known } = state;
    const { state: written, published } = await withCardAccess((access) =>
      recordCardState(access, { ...known, lastCounter: state.lastCounter + 1 })
    );
    expect(published).toBe(true);
    const expected = {
      suspended: true,
      maxPaymentSats: 5_000n,
      settingsAt: web.settingsAt,
      lastCounter: state.lastCounter + 1
    };
    expect(written).toMatchObject(expected);
    // Dated after the relays' copy: every relay holds the merged one.
    expect(written.updatedAt).toBeGreaterThan(web.updatedAt);
    for (const copy of await onEachRelay()) expect(copy).toMatchObject(expected);
    expect(cardState()).toMatchObject(expected);
  });

  it("reach this phone at its next read, the counters it saw kept", async () => {
    const state = cardState();
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...known } = state;
      await recordCardState(access, { ...known, lastCounter: state.lastCounter + 5 });
    });
    const web: CardState = {
      ...state,
      name: "Erin's card",
      maxDaySats: 10_000n,
      settingsAt: Date.now() + 1000,
      updatedAt: Math.floor(Date.now() / 1000) + 30
    };
    await publishToRelays(cardStateEvent(keys, web), {
      ...call,
      relays: currentRelays(),
      authKey: keys.nostr.secretKey
    });
    const { states } = await withCardAccess(refreshCardStates);
    expect(states.find((card) => card.cardId === cardId)).toMatchObject({
      name: "Erin's card",
      maxDaySats: 10_000n,
      lastCounter: state.lastCounter + 5
    });
  });
});

describe("a card's state written while the relays are read", () => {
  it("never loses a tap's counter to the read: kept, on the device too", async () => {
    const state = cardState();
    const { updatedAt: _updatedAt, ...known } = state;
    const release = nostr.holdQueries();
    await withCardAccess(async (access) => {
      // A refresh reads the relays (the app comes back to the foreground)...
      const refreshing = refreshCardStates(access);
      // ...while a tap's counter is recorded: kept on the device before the payment goes on.
      let saved = false;
      const recording = recordCardState(
        access,
        { ...known, lastCounter: state.lastCounter + 3 },
        undefined,
        { onSaved: () => (saved = true) }
      );
      while (!saved) await new Promise((resolve) => setTimeout(resolve, 1));
      release();
      await Promise.all([refreshing, recording]);
    });
    expect(cardState().lastCounter).toBe(state.lastCounter + 3);
    // The device's copy too: what a payment checks the next tap against after a restart.
    resetCardStates();
    const onDevice = await withCardAccess(async (access) =>
      (await cardStatesOnDevice(access)).find((card) => card.cardId === cardId)
    );
    expect(onDevice?.lastCounter).toBe(state.lastCounter + 3);
  });
});
