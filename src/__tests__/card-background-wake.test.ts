import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { AppState, Platform } from "react-native";

import { CARD_WAKE_MAX_MS, DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import { cardPassesKept } from "@/features/card/card-passes";
import { CARD_PAID_NOTICE } from "@/features/card/paid-notice";
import { customizeCard, deleteCard, reprogramCard, setCardSuspended } from "@/features/card/manage";
import { pairCard } from "@/features/card/pairing";
import { CARD_PAYMENT_PORTS } from "@/features/card/payment";
import { syncCardPayees } from "@/features/card/payees-sync";
import { currentCardPayment, receiveCardWake, resetCardPayments } from "@/features/card/payments";
import { readOwnCopies } from "@/features/card/own-copies";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { knownCardState, resetCardStates } from "@/features/card/states";
import { resetRelayInfo } from "@/features/card/relay-sync";
import { setCardSocket } from "@/features/card/socket";

import { syncAccountCards } from "@/features/card/sync";
import { CARD_SOCKET_TASK } from "@/features/card/wake-task.android";
import { wipeDevice } from "@/features/settings/device-wipe";
import { cardWallet } from "@/lib/breez/wallet";
import {
  cardOwnAuthKeys,
  cardOwnCopiesOf,
  cardOwnFilter,
  cardOwnKeys,
  cardOwnSecret
} from "@/lib/card/card-own";
import { CARD_PASSES_KEY, loadCardPasses } from "@/lib/card/card-pass-store";
import {
  CARD_STATE_VERSION,
  cardRecordAddress,
  cardStateEvent,
  cardStateValue,
  cardStatesFilter,
  cardStatesOf,
  deriveCardRecordKeys
} from "@/lib/card/card-record";
import { CARD_STATES_KEY } from "@/lib/card/card-store";
import { deriveHistoryRecordKeys } from "@/lib/card/history-records";
import { derivePayeeRecordKeys, payeesFilter, payeesOf } from "@/lib/card/payee-records";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { signEvent } from "@/lib/nostr/event";
import { nip44Encrypt } from "@/lib/nostr/nip44";
import { queryRelays } from "@/lib/nostr/pool";
import type { RelayFilter } from "@/lib/nostr/relay";
import { RECORD_KIND } from "@/lib/nostr/record";
import { currentRelays } from "@/lib/relays/current";
import { saveStoredRelays } from "@/lib/relays/store";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { cardKeysOf, cardWalletEntropy, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { approveCardPayee, removeCardPayee, setCardPayeeMode } from "@/lib/card/payees";
import { CARD_WAKES_DIR_NAME, loadCardWakes } from "@/lib/card/wake-journal";
import { loadCardPayments } from "@/lib/card/payment-log";
import * as random from "@/lib/random";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testBackupKey, testSeed } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import {
  breezTips,
  breezTipsFetch,
  breezTipsMetadata,
  breezTipsVerifyUrl,
  resetBreezTips
} from "../../jest/breez-tips";
import {
  addRelay,
  fetchRelays,
  posCallback,
  posWithdraw,
  type FakeCardRelay
} from "../../jest/card-relay";
import { socketRuns } from "../../jest/card-socket";
import { deletedElsewhere } from "../../jest/card-states";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as TaskManagerFake from "../../jest/expo-task-manager";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import { FakeNtag424 } from "../../jest/ntag424";

/*
 * A card payment from the card socket's wake, as Android runs it: the card socket's task
 * (wake-task.android.ts, in place of the iOS and web module) given each tap's packet as the socket
 * receives it (jest/card-socket.ts), the account closed (the app closed or locked: no seed in
 * memory).
 */

jest.mock("../features/card/wake-task", () =>
  jest.requireActual("../features/card/wake-task.android")
);
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
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// The staging app keeps the card wakes' journal (wake-report.ts, wakeJournalKept).
const build = { variant: "staging" };
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: build.variant,
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: null
  })
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const taskManager = jest.requireMock<typeof TaskManagerFake>("expo-task-manager");

const HOST = DEFAULT_CARD_RELAY_HOST;
const LAC = { username: "sattleme01", name: "Lakeside Bakery" };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

let relay: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;

/**
 * An invoice of a merchant's Lightning address on breez.tips, with its proof, as a point of sale of
 * sattle.me sends it (card-payment.test.ts' merchantInvoice).
 */
function merchantInvoice(
  sats: bigint,
  { seed = 1, username = LAC.username, name = LAC.name } = {}
) {
  const metadata = breezTipsMetadata(username, name);
  const { paymentHash, preimage } = preimagePair(seed);
  const timestamp = Math.floor(Date.now() / 1000);
  const descriptionHash = metadataHash(metadata);
  const pr = makeInvoice({ amountMsat: sats * 1000n, paymentHash, descriptionHash, timestamp });
  sdk.fakeSend.inputs.set(pr, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat: sats * 1000n,
        description: undefined,
        descriptionHash,
        expiry: BigInt(600),
        invoice: { bolt11: pr, source: {} },
        minFinalCltvExpiryDelta: BigInt(18),
        network: sdk.BitcoinNetwork.Bitcoin,
        payeePubkey: "02ab",
        paymentHash,
        paymentSecret: "00",
        routingHints: [],
        timestamp: BigInt(timestamp)
      }
    ]
  });
  breezTips.invoices.set(paymentHash, { pr, settled: false });
  sdk.fakeSend.preimages.set(paymentHash, preimage);
  return { pr, proof: { metadata, verify: breezTipsVerifyUrl(paymentHash) } };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

type Packet = FakeCardRelay["socketWakes"][number];

/** The task's payload of `packet` as the card socket gives it (CardSocketTaskConsumer.kt). */
function socketPayload(packet: unknown, receivedAt = Date.now()) {
  return { packet: JSON.stringify(packet), receivedAt, relay: HOST };
}

/** The packet the relay last sent this phone's card socket. */
function lastPacket(): Packet {
  return relay.socketWakes[relay.socketWakes.length - 1];
}

/**
 * A tap at a point of sale: its withdraw request, the packet the relay sent the card socket for
 * it, and the run of the card socket's task the packet started (resolves once it ends).
 */
async function tap(
  at: FakeNtag424 = card
): Promise<{ request: { callback: string; k1: string }; packet: Packet; run: Promise<void> }> {
  const request = await posWithdraw(at.tap());
  return { request, packet: lastPacket(), run: socketRuns() };
}

/** The card socket's task run for `packet` again, as the system runs it (resolves once it ends). */
function runTask(packet: unknown): Promise<unknown> {
  return taskManager.runTask(CARD_SOCKET_TASK, socketPayload(packet));
}

/** Resolves once `check` holds, polling (the fakes answer in memory). */
async function waitUntil(check: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}

/** The local notifications scheduled, by their data's kind. */
function scheduled(kind: string) {
  return notifications.notifications.scheduled.filter(
    (request) => (request.content.data as { kind?: unknown } | undefined)?.kind === kind
  );
}

function cardWalletConnected(): boolean {
  return cardWallet(cardId, 1).isConnected();
}

/** The app shown (its panel takes the payment) while `run` runs. */
async function shown<T>(run: () => Promise<T>): Promise<T> {
  const state = AppState as unknown as { currentState: unknown };
  const before = state.currentState;
  state.currentState = "active";
  try {
    return await run();
  } finally {
    state.currentState = before;
  }
}

beforeEach(async () => {
  // Android, where the card socket wakes the phone (socket.ts).
  jest.replaceProperty(Platform, "OS", "android");
  // The task runs with the app closed or in the background; shown: `shown` below.
  (AppState as unknown as { currentState: unknown }).currentState = "background";
  build.variant = "staging";
  fileSystem.resetFileSystem();
  resetBreezTips();
  jest
    .mocked(globalThis.fetch)
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).host === "breez.tips"
        ? breezTipsFetch(input)
        : fetchRelays(input, init)
    );
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  forgetDeviceKey();
  relay = addRelay(HOST);
  // A relay that serves the card socket (`/v1/listen`).
  relay.listen = { heartbeatSeconds: 240 };
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  await openTestAccount({ usage: "card", signUp: "card" });
  card = new FakeNtag424();
  nfc.holdCard(card);
  const paired = await pairCard({
    relayHost: HOST,
    channelName: "Card payments",
    messages: { alert: "Hold the card to the phone" }
  });
  cardId = paired.state.cardId;
  sdk.fakeCardWallet(cardId).balanceSats = 500_000n;
  // "Approved merchants" (the default), the bakery approved; then the app's start sync, which
  // keeps the card's pass on this phone (card-passes.ts).
  await approveCardPayee(
    TEST_WALLET_ID,
    { cardId, walletGeneration: 1 },
    { id: `${LAC.username}@breez.tips`, name: LAC.name },
    Date.now()
  );
  await syncAccountCards("Card payments");
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  resetCardPayments();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("the card socket's task (Android)", () => {
  it("pays an approved merchant without asking, the account closed, and tells the holder", async () => {
    closeAccount();
    const { request, run } = await tap();
    // No push on Android: the packet came on the socket, which runs the app's task.
    expect(relay.pushes).toEqual([]);
    const { pr, proof } = merchantInvoice(12_500n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    // From the card's own wallet, its counter kept, its notice told.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 12_500n - 3n);
    expect(sdk.fakeWallet.payments).toEqual([]);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(2);
    expect(scheduled(CARD_PAID_NOTICE)).toHaveLength(1);
    expect(scheduled(CARD_PAID_NOTICE)[0].content).toMatchObject({
      title: expect.stringMatching(/^Card payment: 12.500 sats$/),
      body: expect.stringMatching(new RegExp(`^12.500 sats to “${LAC.name}”$`))
    });
    expect(scheduled("cardWake")).toEqual([]);
    // Logged with its proof, and nothing of it left running: the card's wallet disconnected.
    const [entry] = await loadCardPayments();
    expect(entry).toMatchObject({ outcome: "sent", amountSats: 12_500n });
    expect(cardWalletConnected()).toBe(false);
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "sent" });
  });

  it("asks a merchant not approved in the app, and tells the refusal if nobody comes", async () => {
    closeAccount();
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, run } = await tap();
      const { pr, proof } = merchantInvoice(800n, { username: "sattleme09", name: "New Coffee" });
      const answer = posCallback(request, pr, proof);
      for (let i = 0; i < 20 && scheduled("cardWake").length === 0; i++) {
        await jest.advanceTimersByTimeAsync(10);
      }
      // Asked: one notification, while the point of sale waits.
      const [asked] = scheduled("cardWake");
      expect(asked.identifier).toMatch(/^card-wake-[0-9a-f]{32}$/);
      expect(asked.content).toMatchObject({
        title: "Pending: Card payment",
        body: "800 sats to “New Coffee”. Click to confirm, the till is waiting."
      });
      expect(asked.trigger).toEqual({ channelId: "card-payments" });
      await jest.advanceTimersByTimeAsync(25_000);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "New merchant: the cardholder must approve it in their sattle.me app, then present the card again."
      });
      await jest.advanceTimersByTimeAsync(0);
      await run;
      // Refused: told in place of the ask, nothing paid.
      const told = scheduled("cardWake");
      expect(told).toHaveLength(2);
      expect(told[1].identifier).toBe(asked.identifier);
      expect(told[1].content).toMatchObject({
        title: "Refused: Card payment (800 sats to “New Coffee”)",
        body: expect.stringMatching(/25 seconds/)
      });
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
      expect(scheduled(CARD_PAID_NOTICE)).toEqual([]);
      expect(cardWalletConnected()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("never asks to pay what the card's wallet is proven not to hold: tells the refusal", async () => {
    closeAccount();
    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(800n, { username: "sattleme09", name: "New Coffee" });
    await expect(posCallback(request, pr, proof)).resolves.toEqual({
      status: "ERROR",
      reason: "Insufficient card balance."
    });
    await run;
    // No ask: the refusal only, naming the merchant.
    const told = scheduled("cardWake");
    expect(told).toHaveLength(1);
    expect(told[0].content).toMatchObject({
      title: "Refused: Card payment (800 sats to “New Coffee”)",
      body: "Your card's balance does not cover this payment and its fee. Nothing was paid: top up the card in “Cards”."
    });
    expect(currentCardPayment()?.getView()).toMatchObject({
      phase: "failed",
      failure: "insufficientBalance"
    });
    expect(scheduled(CARD_PAID_NOTICE)).toEqual([]);
    expect(cardWalletConnected()).toBe(false);
  });

  it('in "Automatic", pays without asking the approved merchants only, the account closed', async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    closeAccount();
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(700n, { username: "sattleme09", name: "New Coffee" });
    const answer = posCallback(request, pr, proof);
    await waitUntil(() => scheduled("cardWake").length === 1);
    expect(currentCardPayment()?.getView()).toMatchObject({
      phase: "ready",
      cause: "unconfirmed",
      payee: { status: "unchecked" }
    });
    currentCardPayment()?.decline();
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment declined by the cardholder."
    });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("checks the tap with the card's pass: a tap a dishonest relay replays is refused, and told", async () => {
    closeAccount();
    const url = card.tap();
    const first = await posWithdraw(url);
    const run = socketRuns();
    const { pr, proof } = merchantInvoice(1_000n);
    await expect(posCallback(first, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    // The same packet again: its session taken, nothing more.
    await runTask(lastPacket());
    // The same tap, from a relay that kept it: a new session, refused by its counter.
    const query = new URL(url.replace(/^lnurlw:/, "https:")).searchParams;
    const secret = channelSecretOf(deriveCardRoot(walletSecret(testSeed())), cardId, HOST);
    const replay = relay.forgeWake(secret, query.get("p")!, query.get("c")!);
    const replayed = socketRuns();
    const again = merchantInvoice(1_000n, { seed: 2 });
    await expect(posCallback(replay, again.pr, again.proof)).resolves.toEqual({
      status: "ERROR",
      reason: "Card reading not valid: present the card again."
    });
    await replayed;
    const [told] = scheduled("cardWake");
    expect(told.content).toMatchObject({
      body: "This tap of your card was already used. Nothing was paid."
    });
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_000n - 3n);
  });

  it("never pays for the card's true c with a p it did not write: the relay's forged tap", async () => {
    closeAccount();
    // The `c` of the card's next tap, which a relay may find from the hash it keeps (64 bits):
    // the card wrote it, but its `p` never reached the relay.
    const query = new URL(card.tap().replace(/^lnurlw:/, "https:")).searchParams;
    const secret = channelSecretOf(deriveCardRoot(walletSecret(testSeed())), cardId, HOST);
    const before = knownCardState(TEST_WALLET_ID, cardId)!.lastCounter;
    const forged = relay.forgeWake(secret, "0123456789ABCDEF0123456789ABCDEF", query.get("c")!);
    const run = socketRuns();
    const { pr, proof } = merchantInvoice(1_000n);
    const answer = posCallback(forged, pr, proof);
    // Not this card's tap for its pass: never paid without asking, the holder asked.
    await waitUntil(() => scheduled("cardWake").length === 1);
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "ready" });
    currentCardPayment()?.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(before);
    // The card's own next tap pays as before.
    const next = await tap();
    const paid = merchantInvoice(1_000n, { seed: 2 });
    await expect(posCallback(next.request, paid.pr, paid.proof)).resolves.toEqual({
      status: "OK"
    });
    await next.run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_000n - 3n);
  });

  it("tells a refusal of a card in pause, naming it, and pays nothing", async () => {
    closeAccount();
    await openTestAccount({ usage: "card", signUp: "card" });
    await customizeCard(cardId, { name: "Everyday" });
    await setCardSuspended(cardId, true);
    closeAccount();
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(900n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({
      status: "ERROR",
      reason: "Card paused: the cardholder can resume it in their sattle.me app."
    });
    await run;
    const [refused] = scheduled("cardWake");
    expect(refused.content).toMatchObject({
      // Refused before its merchant was checked: not named.
      title: "Refused: Card payment (900 sats)",
      body: "Everyday is paused. Nothing was paid."
    });
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("the app shown: its panel takes the payment, no notification asks", async () => {
    closeAccount();
    await shown(async () => {
      const { request, run } = await tap();
      const { pr, proof } = merchantInvoice(600n, { username: "sattleme09", name: "New Coffee" });
      const answer = posCallback(request, pr, proof);
      await waitUntil(() => currentCardPayment()?.getView().phase === "ready");
      expect(scheduled("cardWake")).toEqual([]);
      currentCardPayment()?.decline();
      await expect(answer).resolves.toMatchObject({ status: "ERROR" });
      await run;
      expect(scheduled("cardWake")).toEqual([]);
    });
  });

  it("the app shown, its own reading of the packet too: one payment, paid once", async () => {
    await shown(async () => {
      const { request, packet, run } = await tap();
      // The app in the foreground reads the relay's pending packets too (useCardWakes.ts), while
      // the socket's task runs: whichever comes first takes it.
      const taken = await receiveCardWake(packet, Date.now(), TEST_WALLET_ID);
      // Read again, and run again: neither takes it twice.
      const [again] = await Promise.all([
        receiveCardWake(packet, Date.now(), TEST_WALLET_ID),
        runTask(packet).then(() => null)
      ]);
      expect(again).toBeNull();
      const { pr, proof } = merchantInvoice(400n);
      await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
      await run;
      await waitUntil(() => currentCardPayment()?.getView().phase === "sent");
      expect(taken === null || taken === currentCardPayment()).toBe(true);
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 400n - 3n);
      expect(await loadCardPayments()).toHaveLength(1);
    });
  });

  it('without its pass ("Always confirm"), asks in the app for every payment', async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await syncCardPayees();
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toEqual([]);
    closeAccount();
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(500n);
    const answer = posCallback(request, pr, proof);
    await waitUntil(() => scheduled("cardWake").length === 1);
    // The tap not checked yet: after the passkey, as before.
    expect(knownCardState(TEST_WALLET_ID, cardId)?.lastCounter).toBe(1);
    currentCardPayment()?.decline();
    await answer;
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("drops a packet of nothing it knows, without a word", async () => {
    closeAccount();
    await runTask({ epk: "x", iv: "y", ct: "z" });
    await taskManager.runTask(CARD_SOCKET_TASK, { packet: "{", receivedAt: Date.now() });
    expect(currentCardPayment()).toBeNull();
    expect(notifications.notifications.scheduled).toEqual([]);
  });

  it("ends with the relay's session when the point of sale sends no invoice", async () => {
    closeAccount();
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { run } = await tap();
      await jest.advanceTimersByTimeAsync(CARD_WAKE_MAX_MS);
      await run;
      expect(currentCardPayment()?.getView()).toMatchObject({ phase: "failed" });
    } finally {
      jest.useRealTimers();
    }
    const [ended] = await loadCardWakes();
    expect(ended!.steps.map((step) => step.name)).toEqual(["taken", "waiting", "failed"]);
    expect(ended!.steps.at(-1)!.atMs).toBeLessThan(CARD_WAKE_MAX_MS);
    expect(ended!.tapCheck).toBeNull();
  });

  it("lets go of a payment still sending past CARD_WAKE_MAX_MS, and leaves it to end", async () => {
    closeAccount();
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    // The send never comes back: a network that hangs.
    const release = sdk.holdSends();
    try {
      const { request, run } = await tap();
      const { pr, proof } = merchantInvoice(2_000n);
      const answer = posCallback(request, pr, proof);
      for (let i = 0; i < 100 && currentCardPayment()?.getView().phase !== "paying"; i++) {
        await jest.advanceTimersByTimeAsync(10);
      }
      expect(currentCardPayment()?.isBusy()).toBe(true);
      await jest.advanceTimersByTimeAsync(CARD_WAKE_MAX_MS);
      await run;
      // The task ended; the payment, being sent, is not closed under it.
      expect(currentCardPayment()?.getView()).toMatchObject({ phase: "paying" });
      const [letGo] = await loadCardWakes();
      expect(letGo!.steps.map((step) => step.name)).toEqual([
        "taken",
        "waiting",
        "checking",
        "paying",
        "letGo"
      ]);
      expect(letGo!.endedAtMs).toBeGreaterThanOrEqual(CARD_WAKE_MAX_MS);
      // The point of sale gave up long ago.
      await expect(answer).resolves.toMatchObject({ status: "ERROR" });
      // The send comes back: the payment ends as its own.
      release();
      for (let i = 0; i < 100 && currentCardPayment()?.getView().phase !== "sent"; i++) {
        await jest.advanceTimersByTimeAsync(10);
      }
      expect(currentCardPayment()?.getView()).toMatchObject({ phase: "sent" });
      expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 2_000n - 3n);
      // Still written down after the task: how a payment let go ended is what is measured.
      await jest.advanceTimersByTimeAsync(0);
      const [ended] = await loadCardWakes();
      expect(ended!.steps.map((step) => step.name)).toEqual([
        "taken",
        "waiting",
        "checking",
        "paying",
        "letGo",
        "sent"
      ]);
      expect(ended!.endedAtMs).toBe(letGo!.endedAtMs);
    } finally {
      release();
      jest.useRealTimers();
    }
  });
});

describe("the card wakes' journal (wake-journal.ts)", () => {
  /** The journal as stored: what "Copy the journal" hands over. */
  function storedJournal(): string {
    const uri = [...fileSystem.files.keys()].find((key) =>
      key.endsWith(`/${CARD_WAKES_DIR_NAME}/journal.json`)
    );
    return uri ? fileSystem.files.get(uri)! : "";
  }

  it("writes a wake down step by step, before its payment ends", async () => {
    closeAccount();
    const before = Date.now();
    const { request, run } = await tap();
    // The point of sale has not sent its invoice yet: the wake is there, waiting.
    await waitUntil(() => storedJournal().includes('"waiting"'));
    const [waiting] = await loadCardWakes();
    expect(waiting).toMatchObject({ accountOpen: false, endedAtMs: null });
    expect(waiting!.receivedAt).toBeGreaterThanOrEqual(before);
    expect(waiting!.startedAt).toBeGreaterThanOrEqual(waiting!.receivedAt);
    // Nothing of a push any more (format 3).
    for (const field of ["via", "sentAt", "originalPriority", "priority"]) {
      expect(waiting).not.toHaveProperty(field);
    }
    expect(waiting!.steps.map((step) => step.name)).toEqual(["taken", "waiting"]);

    const { pr, proof } = merchantInvoice(12_500n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    // Written whole by then: the system lets the app's JavaScript go 2 s after the task ends.
    const [written] = (JSON.parse(storedJournal()) as { wakes: { endedAtMs: unknown }[] }).wakes;
    expect(written!.endedAtMs).toEqual(expect.any(Number));
    const [paid] = await loadCardWakes();
    expect(paid!.steps.map(({ name, detail }) => [name, detail])).toEqual([
      ["taken", null],
      ["waiting", null],
      ["checking", null],
      ["paying", "automatic"],
      ["sent", expect.stringMatching(/^(pending|completed)$/)],
      ...paid!.steps.slice(5).map(() => ["sent", expect.any(String)])
    ]);
    expect(paid!.tapCheck).toBe("cardRoot");
    expect(paid!.endedAtMs).toBeGreaterThanOrEqual(paid!.steps.at(-1)!.atMs);
    expect(paid!.jsAgeMs).toBeGreaterThanOrEqual(0);
    // Times and codes only: no amount, merchant, invoice, card nor key. The amount as this device
    // groups it, never a fixed form: one the device no longer writes would pass whatever is kept.
    const stored = storedJournal();
    const grouped = formatInteger(12_500n, getDeviceLocale().languageTag);
    for (const secret of ["12500", grouped, LAC.name, LAC.username, pr, cardId]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("writes down an ask, and its refusal with its reason", async () => {
    closeAccount();
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, run } = await tap();
      const { pr, proof } = merchantInvoice(800n, { username: "sattleme09", name: "New Coffee" });
      const answer = posCallback(request, pr, proof);
      for (let i = 0; i < 20 && scheduled("cardWake").length === 0; i++) {
        await jest.advanceTimersByTimeAsync(10);
      }
      await jest.advanceTimersByTimeAsync(25_000);
      await answer;
      await jest.advanceTimersByTimeAsync(0);
      await run;
    } finally {
      jest.useRealTimers();
    }
    const [asked] = await loadCardWakes();
    expect(asked!.steps.map(({ name, detail }) => [name, detail])).toEqual([
      ["taken", null],
      ["waiting", null],
      ["checking", null],
      ["ready", "newPayee"],
      ["failed", "newPayee"]
    ]);
    expect(asked!.tapCheck).toBe("cardRoot");
  });

  it("writes down a packet it did not take", async () => {
    closeAccount();
    await runTask({ epk: "x", iv: "y", ct: "z" });
    const [ignored] = await loadCardWakes();
    expect(ignored).toMatchObject({
      receivedAt: expect.any(Number),
      steps: [{ name: "notTaken", detail: null }],
      tapCheck: null,
      endedAtMs: expect.any(Number)
    });
  });

  it("never holds the payment up: a journal that cannot be written changes nothing", async () => {
    closeAccount();
    // A newer app's journal: never written over, the payment goes on.
    const newer = JSON.stringify({ version: 4, wakes: [] });
    fileSystem.files.set(
      `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_WAKES_DIR_NAME}/journal.json`,
      newer
    );
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(1_000n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_000n - 3n);
    expect(storedJournal()).toBe(newer);
  });

  it("is kept by the staging app only: a production phone pays, and keeps no journal", async () => {
    build.variant = "production";
    closeAccount();
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(1_000n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_000n - 3n);
    expect(storedJournal()).toBe("");
  });

  it("never holds the payment up: no randomness for its entry, the payment goes on", async () => {
    closeAccount();
    // The first draw of the task is the journal's: it fails, nothing else does.
    jest.spyOn(random, "secureRandomBytes").mockImplementationOnce(() => {
      throw new Error("No secure random source");
    });
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(1_000n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_000n - 3n);
    expect(await loadCardWakes()).toEqual([]);
  });
});

describe("the cards' passes kept on the phone (card-passes.ts)", () => {
  /** The cards whose pass the phone keeps for the test's wallet. */
  async function passed(): Promise<string[]> {
    return (await loadCardPasses(TEST_WALLET_ID)).passes.map((pass) => pass.cardId);
  }

  const OTHER_WALLET = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  it("keeps the card's own secrets only, for this wallet only, never the card root", async () => {
    expect(CARD_PASSES_KEY).toBe("card-passes");
    expect(await passed()).toEqual([cardId]);
    expect((await loadCardPasses(OTHER_WALLET)).passes).toEqual([]);
    const text = secureStore.items.get(CARD_PASSES_KEY)!;
    const stored = JSON.parse(text) as { version: number; walletId: string; passes: object[] };
    expect(stored).toMatchObject({ version: 2, walletId: TEST_WALLET_ID });
    // Exactly what the card's tap, wallet, channel and own copies need.
    const root = deriveCardRoot(walletSecret(testSeed()));
    const state = knownCardState(TEST_WALLET_ID, cardId)!;
    const keys = cardKeysOf(root, hexToBytes(state.uid), state.keyVersion);
    expect(stored.passes).toEqual([
      {
        cardId,
        walletGeneration: 1,
        uid: state.uid,
        keyVersion: state.keyVersion,
        relayHost: HOST,
        k1: bytesToHex(keys.k1),
        k2: bytesToHex(keys.k2),
        walletEntropy: bytesToHex(cardWalletEntropy(root, cardId, 1)),
        channelSecret: bytesToHex(channelSecretOf(root, cardId, HOST)),
        ownSecret: bytesToHex(cardOwnSecret(root, { cardId, walletGeneration: 1 }))
      }
    ]);
    // Nothing that pays with the other cards nor gives the account's records: no root, no K0.
    for (const secret of [root, keys.k0, deriveCardRecordKeys(root).nostr.secretKey]) {
      expect(text).not.toContain(bytesToHex(secret));
    }
  });

  it('is forgotten in "Always confirm", and kept again out of it', async () => {
    // What "Cards" reads of them (modified-phone.ts), without reading their secrets.
    expect(cardPassesKept(TEST_WALLET_ID)).toBe(true);
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await syncCardPayees();
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    expect(cardPassesKept(TEST_WALLET_ID)).toBe(false);
    expect(cardPassesKept(OTHER_WALLET)).toBeNull();
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "approved", {
      passkeyConfirmed: true
    });
    await syncCardPayees();
    expect(await passed()).toEqual([cardId]);
    expect(cardPassesKept(TEST_WALLET_ID)).toBe(true);
  });

  it("keeps the pass of each card that pays without asking, never another card's", async () => {
    // A second card, on the same relay, in "Always confirm": only the first one's pass.
    nfc.holdCard(new FakeNtag424("04a39493cc8680"));
    const second = await pairCard({
      relayHost: HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    await setCardPayeeMode(TEST_WALLET_ID, second.state, "confirm");
    await syncCardPayees();
    expect(await passed()).toEqual([cardId]);
    // The second one approves the bakery too: both passes.
    await setCardPayeeMode(TEST_WALLET_ID, second.state, "approved", { passkeyConfirmed: true });
    await approveCardPayee(
      TEST_WALLET_ID,
      second.state,
      { id: `${LAC.username}@breez.tips`, name: LAC.name },
      Date.now()
    );
    await syncCardPayees({ fresh: true });
    expect((await passed()).sort()).toEqual([cardId, second.state.cardId].sort());
    // Both in "Always confirm": none.
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await setCardPayeeMode(TEST_WALLET_ID, second.state, "confirm");
    await syncCardPayees();
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("is not kept while the card approves no merchant, whatever its mode, and kept once it does", async () => {
    const wallet = { cardId, walletGeneration: 1 };
    const at = Date.now();
    await removeCardPayee(TEST_WALLET_ID, wallet, `${LAC.username}@breez.tips`, at + 1_000);
    await syncCardPayees({ fresh: true });
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    // "Automatic" pays nobody without asking either, the account closed (automaticLocked).
    await setCardPayeeMode(TEST_WALLET_ID, wallet, "automatic", { passkeyConfirmed: true });
    await syncCardPayees({ fresh: true });
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    await syncAccountCards("Card payments");
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    await approveCardPayee(
      TEST_WALLET_ID,
      wallet,
      { id: "sattleme09@breez.tips", name: "New Coffee" },
      at + 2_000
    );
    await syncCardPayees({ fresh: true });
    expect(await passed()).toEqual([cardId]);
  });

  it("is kept once the first merchant is approved with a payment", async () => {
    const wallet = { cardId, walletGeneration: 1 };
    await removeCardPayee(TEST_WALLET_ID, wallet, `${LAC.username}@breez.tips`, Date.now() + 1_000);
    await syncCardPayees({ fresh: true });
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    jest.mocked(signInWithPasskey).mockResolvedValue({ seed: testSeed(), credentialId: null });
    await shown(async () => {
      const { request, run } = await tap();
      const { pr, proof } = merchantInvoice(600n, { username: "sattleme09", name: "New Coffee" });
      const answer = posCallback(request, pr, proof);
      await waitUntil(() => currentCardPayment()?.getView().phase === "ready");
      // "Approve this merchant" ticked.
      await currentCardPayment()?.pay({ approve: true });
      await expect(answer).resolves.toEqual({ status: "OK" });
      await run;
    });
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "sent", approved: true });
    expect(await passed()).toEqual([cardId]);
  });

  it("is kept only while the card socket wakes the phone: no push token ever keeps it", async () => {
    // Android has no push: the card's taps carry no token, the socket alone wakes the phone.
    expect(notifications.notifications.tokenAsks).toBe(0);
    expect(relay.pushes).toEqual([]);
    await setCardSocket(false);
    await syncAccountCards("Card payments");
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    expect(cardPassesKept(TEST_WALLET_ID)).toBe(false);
    await setCardSocket(true);
    await syncAccountCards("Card payments");
    expect(await passed()).toEqual([cardId]);
  });

  it("is not kept for a card whose relay the card socket cannot listen to", async () => {
    // A relay without `/v1/listen`: nothing wakes the phone for that card, the app closed.
    relay.listen = null;
    // Read again now: the app keeps what a relay announced for an hour.
    resetRelayInfo();
    await syncAccountCards("Card payments");
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("is never written over a newer app's (a staging rollback), nor used", async () => {
    secureStore.items.set(CARD_PASSES_KEY, JSON.stringify({ version: 3, passes: "elsewhere" }));
    await syncAccountCards("Card payments");
    expect(JSON.parse(secureStore.items.get(CARD_PASSES_KEY)!)).toEqual({
      version: 3,
      passes: "elsewhere"
    });
    expect(await loadCardPasses(TEST_WALLET_ID)).toEqual({ passes: [], newer: true });
    expect(cardPassesKept(TEST_WALLET_ID)).toBeNull();
  });

  it("follows the card's keys: programmed again, its pass holds their new version", async () => {
    const before = (await loadCardPasses(TEST_WALLET_ID)).passes[0];
    const state = await reprogramCard(cardId, {
      relayHost: HOST,
      messages: { alert: "Hold the card to the phone" },
      channelName: "Card payments"
    });
    const after = (await loadCardPasses(TEST_WALLET_ID)).passes[0];
    expect(after.keyVersion).toBe(state.state.keyVersion);
    expect(after.keyVersion).toBe(before.keyVersion + 1);
    expect(bytesToHex(after.k2)).not.toBe(bytesToHex(before.k2));
  });

  it("is forgotten at once once the account's last card is deleted", async () => {
    expect(await passed()).toEqual([cardId]);
    // A deletion waits for the card's wallet to be empty.
    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    await deleteCard(cardId, { inHand: { messages: { alert: "Hold the card to the phone" } } });
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
    // And not kept again by a sync.
    await syncAccountCards("Card payments");
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("has its card's own copies on the relays, which go with the card's deletion", async () => {
    const root = deriveCardRoot(walletSecret(testSeed()));
    const keys = cardOwnKeys(cardOwnSecret(root, { cardId, walletGeneration: 1 }));
    const held = () =>
      [...nostr.stored.values()]
        .flat()
        .filter(
          (event) =>
            event.kind === RECORD_KIND &&
            [keys.state.nostr.publicKey, keys.payees.nostr.publicKey].includes(event.pubkey)
        );
    // Its state and its book (its mode, the bakery), filled in by the start's sync.
    expect(new Set(held().map((event) => event.pubkey)).size).toBe(2);
    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    await deleteCard(cardId, { inHand: { messages: { alert: "Hold the card to the phone" } } });
    expect(held()).toEqual([]);
  });

  it("is forgotten at the next sync once the card is deleted on the web app", async () => {
    expect(await passed()).toEqual([cardId]);
    await deletedElsewhere(TEST_WALLET_ID, cardId);
    // Kept until then: nothing but a sync reads what keeps it.
    expect(await passed()).toEqual([cardId]);
    await syncAccountCards("Card payments");
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });

  it("goes with log out", async () => {
    closeAccount();
    await wipeDevice();
    expect(secureStore.items.has(CARD_PASSES_KEY)).toBe(false);
  });
});

describe("a payment with the card's pass, the account closed (card-passes.ts)", () => {
  /** The account's keys of the cards' records, which a payment with the app closed never uses. */
  function accountAuthors(): string[] {
    const root = deriveCardRoot(walletSecret(testSeed()));
    return [
      deriveCardRecordKeys(root).nostr.publicKey,
      derivePayeeRecordKeys(root).nostr.publicKey,
      deriveHistoryRecordKeys(root).nostr.publicKey
    ];
  }

  it("pays an approved merchant with nothing of the account's keys, the counter kept for the next sync", async () => {
    closeAccount();
    const from = nostr.calls.length;
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(12_500n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 12_500n - 3n);
    // Only the card's own copies were read, by their authors; nothing of the account's.
    const used = nostr.calls.slice(from);
    const authors = accountAuthors();
    expect(used.some((call) => call.operation === "query")).toBe(true);
    for (const call of used) {
      expect(authors).not.toContain(call.event?.pubkey);
      for (const author of call.filter?.authors ?? []) expect(authors).not.toContain(author);
    }
    // The tap's counter on this phone, published by the account's next sync.
    const stored = JSON.parse(secureStore.items.get(CARD_STATES_KEY)!) as { unpublished: string[] };
    expect(stored.unpublished).toEqual([cardId]);
    await openTestAccount({ usage: "card", signUp: "card" });
    await syncAccountCards("Card payments");
    const root = deriveCardRoot(walletSecret(testSeed()));
    const keys = deriveCardRecordKeys(root);
    const answers = await queryRelays(cardStatesFilter(keys), {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1_000,
      authKey: keys.nostr.secretKey
    });
    expect(cardStatesOf(keys, root, answers).states.get(cardId)?.lastCounter).toBe(2);
  });

  it("pays an approved merchant with no account's port at all, as the iOS extension's engine does", async () => {
    closeAccount();
    // The core's ports without the app's account and passkey (payment-core.ts, CardAccountPort).
    jest.replaceProperty(CARD_PAYMENT_PORTS, "account", null);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(12_500n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 12_500n - 3n);
    const [entry] = await loadCardPayments();
    expect(entry).toMatchObject({ outcome: "sent", amountSats: 12_500n, cardId });
    const stored = JSON.parse(secureStore.items.get(CARD_STATES_KEY)!) as { unpublished: string[] };
    expect(stored.unpublished).toEqual([cardId]);
  });

  it("never pays what its holder must confirm with no account's port: refused, nothing paid", async () => {
    closeAccount();
    jest.replaceProperty(CARD_PAYMENT_PORTS, "account", null);
    const { request } = await tap();
    const { pr, proof } = merchantInvoice(800n, { username: "sattleme09", name: "New Coffee" });
    const answer = posCallback(request, pr, proof);
    await waitUntil(() => currentCardPayment()?.getView().phase === "ready");
    const payment = currentCardPayment()!;
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "failed" });
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("reads the card's own copies on the device's relays, its JavaScript started without any screen", async () => {
    closeAccount();
    // The device's list as the account saved it; not in memory: the root layout never ran.
    const OWN = "wss://relay.example.org";
    await saveStoredRelays([OWN]);
    resetDeviceRelays();
    expect(currentRelays()).not.toContain(OWN);
    const from = nostr.calls.length;
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(1_000n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    const queried = nostr.calls.slice(from).filter((call) => call.operation === "query");
    expect(queried.length).toBeGreaterThan(0);
    expect(queried.every((call) => call.relay === OWN)).toBe(true);
  });

  it("refuses a card paused on the web app, which its own copy tells this phone", async () => {
    // The phone's copy as it was before the pause: only the relays know of it.
    const before = secureStore.items.get(CARD_STATES_KEY)!;
    await setCardSuspended(cardId, true);
    closeAccount();
    resetCardStates();
    secureStore.items.set(CARD_STATES_KEY, before);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(900n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({
      status: "ERROR",
      reason: "Card paused: the cardholder can resume it in their sattle.me app."
    });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("lets a card resumed on the web app pay at once, which its own copy tells this phone", async () => {
    await setCardSuspended(cardId, true);
    // The phone's copy as it was then, paused: only the relays know it pays again.
    const paused = secureStore.items.get(CARD_STATES_KEY)!;
    await setCardSuspended(cardId, false);
    closeAccount();
    resetCardStates();
    secureStore.items.set(CARD_STATES_KEY, paused);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(900n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(scheduled("cardWake")).toEqual([]);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBeLessThan(500_000n - 900n + 1n);
  });

  it("never pays without asking a card paused on the web app the relays that answer missed", async () => {
    const before = secureStore.items.get(CARD_STATES_KEY)!;
    const [first, second, ...others] = currentRelays();
    // The pause reaches three relays of five, a majority: said made.
    nostr.readOnly.add(first);
    nostr.readOnly.add(second);
    await setCardSuspended(cardId, true);
    nostr.readOnly.clear();
    closeAccount();
    resetCardStates();
    secureStore.items.set(CARD_STATES_KEY, before);
    // Those three silent at the tap: the two that answer never heard of the pause.
    for (const url of others) nostr.unreachable.add(url);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(900n);
    const answer = posCallback(request, pr, proof);
    // The holder asked, as for a card this phone keeps no pass of.
    await waitUntil(() => scheduled("cardWake").length === 1);
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "ready" });
    currentCardPayment()?.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("pays without asking with one relay that never answers: the others tell the card in time", async () => {
    closeAccount();
    nostr.silent.add(currentRelays()[0]);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(900n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await run;
    expect(scheduled("cardWake")).toEqual([]);
  });

  it("gets a pause into the card's own copy even over a copy dated later, merged, never lost", async () => {
    const root = deriveCardRoot(walletSecret(testSeed()));
    const keys = cardOwnKeys(cardOwnSecret(root, { cardId, walletGeneration: 1 }));
    // A copy there dated an hour ahead (a phone's clock ahead), the card not paused.
    const ahead = { ...knownCardState(TEST_WALLET_ID, cardId)!, updatedAt: nowSeconds() + 3_600 };
    for (const url of currentRelays()) {
      await nostr.publishEvent(url, cardStateEvent(keys.state, ahead), {
        channel: "account",
        timeoutMs: 1_000,
        authKeys: [keys.state.nostr.secretKey]
      });
    }
    await setCardSuspended(cardId, true);
    const pass = (await loadCardPasses(TEST_WALLET_ID)).passes[0];
    const read = await readOwnCopies(pass);
    expect(read?.state).toMatchObject({ suspended: true });
    expect(read!.state!.updatedAt).toBeGreaterThan(ahead.updatedAt);
  });

  it("leaves a newer app's own copy as it is, the card's state published once all the same", async () => {
    const root = deriveCardRoot(walletSecret(testSeed()));
    const own = cardOwnKeys(cardOwnSecret(root, { cardId, walletGeneration: 1 }));
    const known = knownCardState(TEST_WALLET_ID, cardId)!;
    // A copy a newer app wrote (a staging rollback): never written over.
    const newer = signEvent(
      {
        kind: RECORD_KIND,
        // After the copy the start's sync wrote.
        created_at: Math.max(nowSeconds(), known.updatedAt) + 60,
        tags: [["d", cardRecordAddress(own.state, cardId)]],
        content: nip44Encrypt(
          JSON.stringify({
            t: "card-state",
            v: { ...cardStateValue(known), version: CARD_STATE_VERSION + 1 }
          }),
          own.state.encryptionKey
        )
      },
      own.state.nostr.secretKey
    );
    for (const url of currentRelays()) {
      await nostr.publishEvent(url, newer, {
        channel: "account",
        timeoutMs: 1_000,
        authKeys: [own.state.nostr.secretKey]
      });
    }
    await setCardSuspended(cardId, true);
    // The account's record taken: nothing waits to be published again.
    const stored = JSON.parse(secureStore.items.get(CARD_STATES_KEY)!) as { unpublished: string[] };
    expect(stored.unpublished).toEqual([]);
    const accountAuthor = deriveCardRecordKeys(root).nostr.publicKey;
    const from = nostr.calls.length;
    await syncAccountCards("Card payments");
    const published = nostr.calls
      .slice(from)
      .filter((call) => call.operation === "publish" && call.event?.pubkey === accountAuthor);
    expect(published).toEqual([]);
    // The newer copy stays as it was.
    for (const url of currentRelays()) {
      expect(
        (nostr.stored.get(url) ?? []).filter((event) => event.pubkey === own.state.nostr.publicKey)
      ).toEqual([newer]);
    }
  });

  it("writes a pause into the card's own copy first: refused there, the account's record waits too", async () => {
    const root = deriveCardRoot(walletSecret(testSeed()));
    const own = cardOwnKeys(cardOwnSecret(root, { cardId, walletGeneration: 1 }));
    const keys = deriveCardRecordKeys(root);
    const accountState = async () =>
      cardStatesOf(
        keys,
        root,
        await queryRelays(cardStatesFilter(keys), {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1_000,
          authKey: keys.nostr.secretKey
        })
      ).states.get(cardId);
    nostr.refusedAuthors.add(own.state.nostr.publicKey);
    await setCardSuspended(cardId, true);
    // Neither copy written: the account's relays never hold the pause ahead of the card's own copy,
    // which a phone paying with the app closed reads. The phone keeps it, to publish again.
    expect(await accountState()).toMatchObject({ suspended: false });
    const stored = JSON.parse(secureStore.items.get(CARD_STATES_KEY)!) as { unpublished: string[] };
    expect(stored.unpublished).toEqual([cardId]);
    nostr.refusedAuthors.clear();
    await syncAccountCards("Card payments");
    expect(await accountState()).toMatchObject({ suspended: true });
    const pass = (await loadCardPasses(TEST_WALLET_ID)).passes[0];
    expect((await readOwnCopies(pass))?.state).toMatchObject({ suspended: true });
  });

  it("writes a merchant's removal into the card's own copy first: refused there, the account's waits too", async () => {
    const wallet = { cardId, walletGeneration: 1 };
    const merchant = `${LAC.username}@breez.tips`;
    const root = deriveCardRoot(walletSecret(testSeed()));
    const own = cardOwnKeys(cardOwnSecret(root, wallet));
    const keys = derivePayeeRecordKeys(root);
    const read = async (filter: RelayFilter, authKey: Uint8Array | Uint8Array[]) =>
      queryRelays(filter, {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1_000,
        authKey
      });
    const accountEntry = async () =>
      payeesOf(keys, await read(payeesFilter(keys), keys.nostr.secretKey))
        .cards.get(cardId)
        ?.get(1)
        ?.payees.get(merchant);
    const ownEntry = async () =>
      cardOwnCopiesOf(own, wallet, await read(cardOwnFilter(own), cardOwnAuthKeys(own)), {
        root
      }).payees.payees.get(merchant);
    expect(await accountEntry()).toMatchObject({ approved: true });
    nostr.refusedAuthors.add(own.payees.nostr.publicKey);
    await removeCardPayee(TEST_WALLET_ID, wallet, merchant, Date.now() + 1_000);
    await syncCardPayees({ fresh: true });
    // Neither copy written: the account's relays never hold the removal ahead of the card's copy.
    expect(await accountEntry()).toMatchObject({ approved: true });
    expect(await ownEntry()).toMatchObject({ approved: true });
    nostr.refusedAuthors.clear();
    await syncCardPayees({ fresh: true });
    expect(await accountEntry()).toMatchObject({ approved: false });
    expect(await ownEntry()).toMatchObject({ approved: false });
  });

  it("asks for a merchant removed on the web app, which the card's own copy tells this phone", async () => {
    const wallet = { cardId, walletGeneration: 1 };
    // Another merchant stays approved: the card keeps its pass.
    await approveCardPayee(
      TEST_WALLET_ID,
      wallet,
      { id: "sattleme09@breez.tips", name: "New Coffee" },
      Date.now()
    );
    await syncCardPayees({ fresh: true });
    const books = [...fileSystem.files].filter(([path]) => path.includes("card-payees"));
    await removeCardPayee(TEST_WALLET_ID, wallet, `${LAC.username}@breez.tips`, Date.now() + 1_000);
    await syncCardPayees({ fresh: true });
    expect(await loadCardPasses(TEST_WALLET_ID)).toMatchObject({ passes: [{ cardId }] });
    closeAccount();
    // The phone's book as it was before the removal: only the relays know of it.
    for (const [path, content] of books) fileSystem.files.set(path, content);
    const { request, run } = await tap();
    const { pr, proof } = merchantInvoice(800n);
    const answer = posCallback(request, pr, proof);
    await waitUntil(() => scheduled("cardWake").length === 1);
    expect(currentCardPayment()?.getView()).toMatchObject({
      phase: "ready",
      payee: { status: "new", name: LAC.name }
    });
    currentCardPayment()?.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    await run;
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n);
  });

  it("asks for a tap of a card it keeps no pass of, on the same relay", async () => {
    const secondCard = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(secondCard);
    const second = await pairCard({
      relayHost: HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    sdk.fakeCardWallet(second.state.cardId).balanceSats = 500_000n;
    await syncAccountCards("Card payments");
    expect((await loadCardPasses(TEST_WALLET_ID)).passes.map((pass) => pass.cardId)).toEqual([
      cardId
    ]);
    closeAccount();
    const { request, run } = await tap(secondCard);
    const { pr, proof } = merchantInvoice(700n);
    const answer = posCallback(request, pr, proof);
    // Not told by the pass: checked after the passkey, the holder asked.
    await waitUntil(() => scheduled("cardWake").length === 1);
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "ready" });
    currentCardPayment()?.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    await run;
    expect(sdk.fakeCardWallet(second.state.cardId).balanceSats).toBe(500_000n);
  });
});
