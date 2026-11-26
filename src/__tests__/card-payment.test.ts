import { CARD_BALANCE_READ_MS, CARD_FRESH_READ_MS, DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { rememberDevicePasskey } from "@/features/account/device-passkey";
import { closeAccount, getAccountWalletId } from "@/features/account/session";
import { leaseCardWallet } from "@/features/card/card-wallet";
import { readCardHistory } from "@/features/card/history-sync";
import { setCardSuspended } from "@/features/card/manage";
import { pairCard } from "@/features/card/pairing";
import type { CardPaid, CardPayment, CardPaymentView } from "@/features/card/payment";
import {
  closeCardPayment,
  currentCardPayment,
  readPendingCardWakes,
  receiveCardWake,
  resetCardPayments,
  subscribeCardPaid
} from "@/features/card/payments";
import {
  knownCardState,
  recordCardState,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { cardWallet } from "@/lib/breez/wallet";
import { cardStateEvent, deriveCardRecordKeys, type CardState } from "@/lib/card/card-record";
import { derivePayeeRecordKeys, payeeEvent } from "@/lib/card/payee-records";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";
import { forgetDeviceKey, loadDeviceKey } from "@/lib/card/device-key";
import { cardWalletPhrase, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { Ntag424 } from "@/lib/card/ntag424";
import { bookOf } from "@/lib/card/payee-book";
import {
  approveCardPayee,
  loadCardPayees,
  loadPayeeBooks,
  setCardPayeeMode
} from "@/lib/card/payees";
import { loadStoredCardStates, saveStoredCardStates } from "@/lib/card/card-store";
import { CARD_PAYMENTS_DIR_NAME, loadCardPayments, logCardPayment } from "@/lib/card/payment-log";
import { identifiedPayeeOf } from "@/lib/card/payment-entry";
import { programCard } from "@/lib/card/program";
import { walletSecret } from "@/lib/breez/seed";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import {
  OTHER_TEST_MNEMONIC,
  TEST_WALLET_ID,
  openTestAccount,
  testBackupKey,
  testSeed
} from "../../jest/account";
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
  sealPacket,
  type FakeCardRelay
} from "../../jest/card-relay";
import { makeInvoice, metadataHash, preimagePair, testNode } from "../../jest/lightning";
import type * as FileSystemFake from "../../jest/expo-file-system";
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
// The passkey prompt is the test's; the wallet layer is the real one, over the fake SDK.
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const LOG_URI = `file:///data/user/0/ch.swissbitcoinpay.checkout.staging/files/${CARD_PAYMENTS_DIR_NAME}/log.json`;
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const signIn = jest.mocked(signInWithPasskey);

const HOST = DEFAULT_CARD_RELAY_HOST;
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

let relay: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;

/** The invoice a point of sale makes for `sats`, as the fake wallet reads it too. */
function posInvoice(
  sats: bigint,
  {
    seed = 1,
    description = "Lakeside Bakery",
    network = "bc",
    timestamp = Math.floor(Date.now() / 1000),
    expirySeconds = 600,
    amountMsat = sats * 1000n,
    descriptionHash,
    signWith
  }: {
    seed?: number;
    /** A node's key (testNode): the invoice signed by it, as a node signs its own. */
    signWith?: Uint8Array;
    description?: string;
    /** A description hash (`h`) instead of the description (an invoice of a Lightning address). */
    descriptionHash?: string;
    network?: string;
    timestamp?: number;
    expirySeconds?: number;
    /** null: an invoice without amount. */
    amountMsat?: bigint | null;
  } = {}
): string {
  const { paymentHash } = preimagePair(seed);
  const pr = makeInvoice({
    amountMsat: amountMsat ?? undefined,
    paymentHash,
    ...(descriptionHash ? { descriptionHash } : { description }),
    network,
    timestamp,
    expirySeconds,
    signWith
  });
  sdk.fakeSend.inputs.set(pr, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat,
        description: descriptionHash ? undefined : description,
        descriptionHash,
        expiry: BigInt(expirySeconds),
        invoice: { bolt11: pr, source: {} },
        minFinalCltvExpiryDelta: BigInt(18),
        network: network === "bc" ? sdk.BitcoinNetwork.Bitcoin : sdk.BitcoinNetwork.Testnet3,
        payeePubkey: "02ab",
        paymentHash,
        paymentSecret: "00",
        routingHints: [],
        timestamp: BigInt(timestamp)
      }
    ]
  });
  return pr;
}

/**
 * An invoice of a merchant's Lightning address on breez.tips, as a point of sale of sattle.me
 * sends it with its proof (src/lib/lightning/lnurl.ts): its `h` the SHA-256 of the address's
 * metadata, its verify URL the one breez.tips gives. `issued: false`: an invoice breez.tips never
 * made (a relay's own, the merchant's metadata and `h` copied).
 */
function merchantInvoice(
  sats: bigint,
  {
    seed = 1,
    username = "sattleme01",
    name = "Lakeside Bakery",
    issued = true,
    settled = false
  }: { seed?: number; username?: string; name?: string; issued?: boolean; settled?: boolean } = {}
) {
  const metadata = breezTipsMetadata(username, name);
  const descriptionHash = metadataHash(metadata);
  const pr = posInvoice(sats, { seed, descriptionHash });
  const { paymentHash, preimage } = preimagePair(seed);
  if (issued) breezTips.invoices.set(paymentHash, { pr, settled });
  // What the wallet's payment releases.
  sdk.fakeSend.preimages.set(paymentHash, preimage);
  return {
    pr,
    proof: { metadata, verify: breezTipsVerifyUrl(paymentHash) },
    paymentHash,
    preimage
  };
}

/**
 * A tap of the card at a point of sale: its withdraw request, the packet pushed to the phone, and
 * the tap's `p` and `c` (what the card wrote in its URL).
 */
async function tap() {
  const url = card.tap();
  const request = await posWithdraw(url);
  const push = relay.pushes[relay.pushes.length - 1];
  const query = new URL(url.replace(/^lnurlw:/, "https:")).searchParams;
  return { request, packet: push.data.cr, p: query.get("p")!, c: query.get("c")! };
}

/** Resolves once `check` holds, polling (the fakes answer in memory). */
async function waitUntil(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
}

/** Resolves once the payment's view is in `phase`. */
function until<P extends CardPaymentView["phase"]>(
  payment: CardPayment,
  phase: P
): Promise<Extract<CardPaymentView, { phase: P }>> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const view = payment.getView();
      if (view.phase === phase) {
        unsubscribe();
        resolve(view as Extract<CardPaymentView, { phase: P }>);
      } else if (view.phase === "failed" && phase !== "failed") {
        unsubscribe();
        reject(new Error(`Failed: ${view.failure}`));
      }
    };
    const unsubscribe = payment.subscribe(check);
    check();
  });
}

/** The phone takes the tap's packet (a notification received now). */
async function wake(packet: unknown): Promise<CardPayment> {
  const payment = await receiveCardWake(packet, Date.now(), TEST_WALLET_ID);
  if (!payment) throw new Error("The packet was dropped");
  return payment;
}

/** The paired card's own wallet in the fake SDK: card payments leave it, never the account's. */
function fakeCard() {
  return sdk.fakeCardWallet(cardId);
}

/** Whether the paired card's wallet is connected (card-wallet.ts leases it). */
function cardWalletConnected(): boolean {
  return cardWallet(cardId, 1).isConnected();
}

function cardState(): CardState {
  const state = knownCardState(TEST_WALLET_ID, cardId);
  if (!state) throw new Error("No card state");
  return state;
}

beforeEach(async () => {
  // The phone's log of card payments (payment-log.ts) and its approved merchants start empty.
  fileSystem.resetFileSystem();
  // breez.tips answers the payees' verify URLs; the card relay the rest.
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
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  sdk.fakeWallet.balanceSats = 500_000n;
  relay = addRelay(HOST);
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
  // The card pays from its own wallet (card-wallet.ts): the account's keeps its 500 000 sats.
  fakeCard().balanceSats = 500_000n;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  resetCardPayments();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("a card payment, the account open", () => {
  it('checks the tap as the invoice comes, pays at "Pay" and tells the point of sale', async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    expect(payment.getView()).toEqual({ phase: "waiting" });

    const pr = posInvoice(12_500n);
    const answer = posCallback(request, pr);
    const ready = await until(payment, "ready");
    expect(ready.invoice).toMatchObject({
      pr,
      amountSats: 12_500n,
      description: "Lakeside Bakery"
    });
    // The tap's counter is kept before anything is paid: it is never good again.
    expect(cardState().lastCounter).toBe(2);

    await payment.pay();
    expect(signIn).toHaveBeenCalledTimes(1);
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", status: "completed" });
    expect(fakeCard().balanceSats).toBe(500_000n - 12_500n - 3n);
    // Never from the account's wallet: it was not even connected.
    expect(sdk.fakeWallet.balanceSats).toBe(500_000n);
    expect(sdk.fakeWallet.payments).toEqual([]);
    // The relay was told once, and closed the phone's socket.
    const [session] = relay.sessions.values();
    expect(session).toMatchObject({ done: true, outcome: { status: "OK" }, socket: null });
  });

  it("tells the point of sale when the user declines, and pays nothing", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    payment.decline();
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment declined by the cardholder."
    });
    expect(payment.getView()).toMatchObject({ phase: "declined" });
    expect(signIn).not.toHaveBeenCalled();
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("shows the invoice again when the passkey is dismissed, then pays", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    signIn.mockRejectedValueOnce(new PasskeyError("cancelled", "Dismissed"));
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "ready" });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
  });

  it("refuses an invoice above the card's ceiling, lowered or not, before any passkey", async () => {
    const first = await tap();
    const above = await wake(first.packet);
    // Above what a relay lets a point of sale ask (1 BTC): out of the protocol's bounds.
    const refused = posCallback(first.request, posInvoice(100_000_001n));
    await expect(refused).resolves.toEqual({
      status: "ERROR",
      reason: "Amount outside the card's limits (1 sat to 1 BTC)."
    });
    expect(above.getView()).toMatchObject({ phase: "failed", failure: "outOfBounds" });

    // Lowered to 1 000 sats ("Limits").
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = cardState();
      await recordCardState(access, { ...state, maxPaymentSats: 1000n });
    });
    closeCardPayment(above);
    const second = await tap();
    const lowered = await wake(second.packet);
    await expect(posCallback(second.request, posInvoice(1001n, { seed: 2 }))).resolves.toEqual({
      status: "ERROR",
      reason: "Amount above the card's limit per payment."
    });
    expect(lowered.getView()).toMatchObject({ phase: "failed", failure: "aboveLimit" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("refuses an expired invoice, another network's, and one without a whole amount", async () => {
    const cases: [string, string, string][] = [
      [
        posInvoice(500n, { timestamp: Math.floor(Date.now() / 1000) - 700 }),
        "expired",
        "Invoice expired: create a new one."
      ],
      [
        posInvoice(500n, { seed: 2, network: "tb" }),
        "otherNetwork",
        "Invoice not valid for this card."
      ],
      [
        posInvoice(500n, { seed: 3, amountMsat: 500_500n }),
        "noAmount",
        "Invoice without an amount: the card only pays a set amount."
      ],
      [
        posInvoice(500n, { seed: 4, amountMsat: null }),
        "noAmount",
        "Invoice without an amount: the card only pays a set amount."
      ],
      ["lnbc1notaninvoice", "invalidInvoice", "Invoice not valid for this card."]
    ];
    for (const [pr, failure, reason] of cases) {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      await expect(posCallback(request, pr)).resolves.toEqual({
        status: "ERROR",
        reason
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure });
      closeCardPayment(payment);
    }
  });

  it("refuses a tap a dishonest relay replays, and another card's", async () => {
    const first = await tap();
    const payment = await wake(first.packet);
    const answer = posCallback(first.request, posInvoice(500n));
    await until(payment, "ready");
    await payment.pay();
    await answer;
    closeCardPayment(payment);

    // The same tap again, from a relay that kept it.
    const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, HOST));
    const replay = relay.forgeWake(secret, first.p, first.c);
    const replayed = await wake(relay.pushes[relay.pushes.length - 1].data.cr);
    await expect(posCallback(replay, posInvoice(500n, { seed: 2 }))).resolves.toEqual({
      status: "ERROR",
      reason: "Card reading not valid: present the card again."
    });
    expect(replayed.getView()).toMatchObject({ phase: "failed", failure: "replayed" });
    closeCardPayment(replayed);

    // A tap of a card of another wallet.
    const other = new FakeNtag424("04112233445566");
    const otherSecret = walletSecret(testSeed(OTHER_TEST_MNEMONIC));
    await programCard(new Ntag424(other.transceive), {
      root: deriveCardRoot(otherSecret),
      relayHost: HOST,
      version: 1
    });
    const foreign = new URL(other.tap().replace(/^lnurlw:/, "https:")).searchParams;
    const forged = relay.forgeWake(secret, foreign.get("p")!, foreign.get("c")!);
    const notOurs = await wake(relay.pushes[relay.pushes.length - 1].data.cr);
    await expect(posCallback(forged, posInvoice(500n, { seed: 3 }))).resolves.toEqual({
      status: "ERROR",
      reason: "Card reading not valid: present the card again."
    });
    expect(notOurs.getView()).toMatchObject({ phase: "failed", failure: "notYourCard" });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("follows a payment that left pending until the wallet says it completed", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      await until(payment, "ready");
      await payment.pay();
      // The point of sale is told as soon as it left.
      await expect(answer).resolves.toEqual({ status: "OK" });
      expect(payment.getView()).toMatchObject({
        phase: "sent",
        status: "pending",
        following: true
      });
      await jest.advanceTimersByTimeAsync(3000);
      expect(payment.getView()).toMatchObject({ status: "pending", following: true });
      fakeCard().payments[0].status = sdk.PaymentStatus.Completed;
      await jest.advanceTimersByTimeAsync(3000);
      expect(payment.getView()).toMatchObject({
        phase: "sent",
        status: "completed",
        following: false
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops following a payment still pending after two minutes, and says so", async () => {
    sdk.fakeSend.sentStatus = sdk.PaymentStatus.Pending;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      await until(payment, "ready");
      await payment.pay();
      await expect(answer).resolves.toEqual({ status: "OK" });
      await jest.advanceTimersByTimeAsync(117_000);
      expect(payment.getView()).toMatchObject({ status: "pending", following: true });
      await jest.advanceTimersByTimeAsync(6000);
      expect(payment.getView()).toMatchObject({
        phase: "sent",
        status: "pending",
        following: false
      });
      // Its wallet released: nothing more follows it.
      await jest.advanceTimersByTimeAsync(0);
      expect(cardWalletConnected()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a payment not confirmed within 25 s of the invoice, before the relay's 30", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      await until(payment, "ready");
      await jest.advanceTimersByTimeAsync(24_999);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      await jest.advanceTimersByTimeAsync(1);
      // No proof from this point of sale: its payee is not identified.
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "Merchant not identified: the cardholder must confirm the payment in their sattle.me app."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "unidentifiedPayee" });
      await payment.pay();
      expect(signIn).not.toHaveBeenCalled();
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives the holder a minute with a relay that says the point of sale waits 65 s (relay 2.1.0)", async () => {
    relay.answerWaitMs = 65_000;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      // A minute, 5 s kept off the relay's wait.
      expect(await until(payment, "ready")).toMatchObject({ answerMs: 60_000 });
      await jest.advanceTimersByTimeAsync(59_999);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      await jest.advanceTimersByTimeAsync(1);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "Merchant not identified: the cardholder must confirm the payment in their sattle.me app."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "unidentifiedPayee" });
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives the holder only until the invoice expires, when it does within the minute", async () => {
    relay.answerWaitMs = 65_000;
    // On a whole second: an invoice's expiry is in seconds.
    jest.useFakeTimers({
      now: Math.floor(Date.now() / 1000) * 1000,
      doNotFake: ["queueMicrotask", "nextTick"]
    });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      // A till's invoice made near the end of its period: 20 s left.
      const answer = posCallback(request, posInvoice(800n, { expirySeconds: 20 }));
      await jest.advanceTimersByTimeAsync(0);
      expect(await until(payment, "ready")).toMatchObject({ answerMs: 20_000 });
      await jest.advanceTimersByTimeAsync(19_999);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      await jest.advanceTimersByTimeAsync(1);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason: "Invoice expired: create a new one."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "expired" });
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("answers a point of sale within what is left of its wait for a phone that connects late", async () => {
    relay.answerWaitMs = 65_000;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      // The invoice came 20 s before the phone connects: 45 s of the wait are left.
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(20_000);
      const payment = await wake(packet);
      await jest.advanceTimersByTimeAsync(0);
      expect(await until(payment, "ready")).toMatchObject({ answerMs: 40_000 });
      await jest.advanceTimersByTimeAsync(39_999);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      await jest.advanceTimersByTimeAsync(1);
      // Answered before the point of sale stops waiting: never a payment it no longer waits for.
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "Merchant not identified: the cardholder must confirm the payment in their sattle.me app."
      });
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("pays nothing once the point of sale stopped waiting", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    void posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    // The point of sale gave up: the relay ends the session.
    const [session] = relay.sessions.values();
    session.socket!.closeFromRelay(1000, "done");
    await until(payment, "failed");
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "ended" });
    await payment.pay();
    expect(signIn).not.toHaveBeenCalled();
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("pays nothing when the holder confirms after the 25 s", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      await until(payment, "ready");
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      const paying = payment.pay();
      await jest.advanceTimersByTimeAsync(0);
      expect(payment.getView()).toMatchObject({ phase: "confirming" });
      await jest.advanceTimersByTimeAsync(25_000);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "Merchant not identified: the cardholder must confirm the payment in their sattle.me app."
      });
      confirm();
      await paying;
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "unidentifiedPayee" });
      expect(fakeCard().balanceSats).toBe(500_000n);
      // The seed the late passkey gave connected nothing.
      expect(cardWalletConnected()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("pays nothing once its minute ran out, even when the phone slept through its timer", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    relay.answerWaitMs = 65_000;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      // The card's wallet slow to answer: the phone falls asleep meanwhile (Android's doze).
      const wake_ = sdk.holdFirstSync();
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      // 70 s go by that its timers never counted: the point of sale stopped waiting at 65.
      jest.setSystemTime(Date.now() + 70_000);
      wake_();
      await jest.advanceTimersByTimeAsync(0);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason: "The payment could not be processed."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "late" });
      expect(fakeCard().payments).toEqual([]);
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("says when the wallet's answer to the send was lost", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    sdk.fakeSend.sendError = new Error("Network error");
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "uncertain" });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment interrupted: it may still arrive, wait a few seconds before trying again."
    });
  });

  it("replaces a payment waiting for the user by a newer tap", async () => {
    const first = await tap();
    const older = await wake(first.packet);
    const firstAnswer = posCallback(first.request, posInvoice(800n));
    await until(older, "ready");
    const second = await tap();
    const newer = await wake(second.packet);
    await expect(firstAnswer).resolves.toEqual({
      status: "ERROR",
      reason: "Another reading of the card replaced this one."
    });
    expect(currentCardPayment()).toBe(newer);
  });
});

/** A tap paid at "Pay" for an invoice of `sats`: the point of sale's answer. */
async function paidTap(sats: bigint, seed: number) {
  const { request, packet } = await tap();
  const payment = await wake(packet);
  const answer = posCallback(request, posInvoice(sats, { seed }));
  await until(payment, "ready");
  await payment.pay();
  closeCardPayment(payment);
  return answer;
}

/** A tap refused before it shows: the point of sale's answer and the payment's failure. */
async function refusedTap(pr: string) {
  const { request, packet } = await tap();
  const payment = await wake(packet);
  const answer = await posCallback(request, pr);
  const view = payment.getView();
  closeCardPayment(payment);
  return { answer, failure: view.phase === "failed" ? view.failure : null };
}

/** The card's limits as "Cards" writes them: a change of its settings, dated now. */
async function setLimits(limits: Partial<Pick<CardState, "maxDaySats" | "maxPaymentsPerHour">>) {
  await withCardAccess(async (access) => {
    const { updatedAt: _updatedAt, ...state } = cardState();
    await recordCardState(access, {
      ...state,
      ...limits,
      settingsAt: Math.max(Date.now(), state.settingsAt + 1)
    });
  });
}

describe("a card's limits", () => {
  it("keeps each tap's outcome in the phone's log", async () => {
    await expect(paidTap(1_200n, 1)).resolves.toEqual({ status: "OK" });
    const { request, packet } = await tap();
    const declined = await wake(packet);
    const answer = posCallback(request, posInvoice(300n, { seed: 2, description: "Croissant" }));
    await until(declined, "ready");
    declined.decline();
    await answer;
    await expect(refusedTap(posInvoice(100_000_001n, { seed: 3 }))).resolves.toMatchObject({
      failure: "outOfBounds"
    });

    const log = await loadCardPayments();
    expect(log).toEqual([
      expect.objectContaining({
        cardId,
        amountSats: 1_200n,
        paymentHash: preimagePair(1).paymentHash,
        description: "Lakeside Bakery",
        outcome: "sent",
        reason: null
      }),
      expect.objectContaining({ amountSats: 300n, outcome: "declined", reason: "declined" })
    ]);
    // An invoice refused as it comes is not logged: the tap is not checked, no card is known.
  });

  it("refuses a payment past the limit over 24 hours, then past the most per hour", async () => {
    await setLimits({ maxDaySats: 2_000n, maxPaymentsPerHour: 2 });
    await expect(paidTap(1_500n, 1)).resolves.toEqual({ status: "OK" });
    await expect(refusedTap(posInvoice(501n, { seed: 2 }))).resolves.toEqual({
      answer: { status: "ERROR", reason: "The card's 24-hour limit has been reached." },
      failure: "dayLimit"
    });
    await expect(paidTap(500n, 3)).resolves.toEqual({ status: "OK" });
    await setLimits({ maxDaySats: 1_000_000n });
    await expect(refusedTap(posInvoice(1n, { seed: 4 }))).resolves.toEqual({
      answer: { status: "ERROR", reason: "Too many payments with this card within the hour." },
      failure: "hourLimit"
    });
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(fakeCard().balanceSats).toBe(500_000n - 2_000n - 2n * 3n);
  });

  it("checks them again just before sending", async () => {
    await setLimits({ maxDaySats: 2_000n });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(1_500n));
    await until(payment, "ready");
    // Another payment of the card left meanwhile.
    await logCardPayment({
      id: "abc",
      cardId,
      walletGeneration: 1,
      at: Date.now(),
      amountSats: 1_000n,
      paymentHash: preimagePair(9).paymentHash,
      description: null,
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "dayLimit" });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "The card's 24-hour limit has been reached."
    });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  /** A payment of the card that left, logged under `id`. */
  function sentBefore(id: string, sats: bigint) {
    return logCardPayment({
      id,
      cardId,
      walletGeneration: 1,
      at: Date.now(),
      amountSats: sats,
      paymentHash: preimagePair(9).paymentHash,
      description: null,
      outcome: "sent",
      reason: null,
      pr: "lnbc1",
      payee: null,
      preimage: null,
      value: null
    });
  }

  it("counts a payment logged under the tap's session, and keeps its entry", async () => {
    await setLimits({ maxDaySats: 2_000n });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(1_500n));
    await until(payment, "ready");
    // A dishonest relay gave this tap the session of an earlier payment of the card.
    await sentBefore(payment.session, 1_000n);
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "dayLimit" });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "The card's 24-hour limit has been reached."
    });
    expect(fakeCard().balanceSats).toBe(500_000n);
    // The earlier payment's entry stays; the tap's own is apart, under an id the phone drew.
    const log = await loadCardPayments();
    expect(log).toEqual([
      expect.objectContaining({ id: payment.session, amountSats: 1_000n, outcome: "sent" }),
      expect.objectContaining({
        amountSats: 1_500n,
        outcome: "declined",
        reason: "daily limit reached"
      })
    ]);
    expect(log[1].id).toMatch(/^[0-9a-f]{32}$/);
    expect(log[1].id).not.toBe(payment.session);
  });

  it("counts it as the tap is checked too", async () => {
    await setLimits({ maxPaymentsPerHour: 1 });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    await sentBefore(payment.session, 100n);
    await expect(posCallback(request, posInvoice(500n))).resolves.toEqual({
      status: "ERROR",
      reason: "Too many payments with this card within the hour."
    });
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "hourLimit" });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("refuses everything while the card is suspended, and pays again once not", async () => {
    await setCardSuspended(cardId, true);
    await expect(refusedTap(posInvoice(100n, { seed: 1 }))).resolves.toEqual({
      answer: {
        status: "ERROR",
        reason: "Card paused: the cardholder can resume it in their sattle.me app."
      },
      failure: "suspended"
    });
    expect(signIn).not.toHaveBeenCalled();
    await setCardSuspended(cardId, false);
    await expect(paidTap(100n, 2)).resolves.toEqual({ status: "OK" });
  });

  it("never pays the same invoice twice", async () => {
    await expect(paidTap(700n, 1)).resolves.toEqual({ status: "OK" });
    await expect(refusedTap(posInvoice(700n, { seed: 1 }))).resolves.toEqual({
      answer: {
        status: "ERROR",
        reason: "The card does not pay this invoice: it is already settled."
      },
      failure: "alreadyPaid"
    });
    expect(fakeCard().balanceSats).toBe(500_000n - 700n - 3n);
  });

  it("sends nothing when the payment cannot be logged first", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    jest.spyOn(fileSystem.File.prototype, "writeSync").mockImplementation(() => {
      throw new Error("No space left on device");
    });
    await payment.pay();
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "failed" });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "The payment could not be processed."
    });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("pays nothing, and keeps the log, when a newer app wrote it", async () => {
    const newer = JSON.stringify({ version: 5, entries: [] });
    fileSystem.files.set(LOG_URI, newer);
    await expect(refusedTap(posInvoice(800n))).resolves.toEqual({
      answer: { status: "ERROR", reason: "The cardholder must update their sattle.me app." },
      failure: "newerApp"
    });
    expect(fileSystem.files.get(LOG_URI)).toBe(newer);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("after a card payment", () => {
  /** Resolves once `check` holds, polling the fakes (they answer in memory). */
  async function eventually(check: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(check()).toBe(true);
  }

  it.each(["open", "locked"])(
    "deposits hashes again when fewer than 500 are left (account %s)",
    async (account) => {
      const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, HOST));
      // 600 taps read by points of sale that never reached the relay: their hashes go with the next.
      for (let i = 0; i < 600; i++) card.tap();
      if (account === "locked") closeAccount();
      const { request, packet } = await tap();
      expect(relay.channelOf(secret)?.hashes.size).toBe(399);
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(500n));
      await until(payment, "ready");
      await payment.pay();
      await expect(answer).resolves.toEqual({ status: "OK" });
      await eventually(() => relay.channelOf(secret)?.hashes.size === 1000);
      // From the last counter deposited on: 1 002 to 1 602.
      expect(cardState()).toMatchObject({ lastCounter: 602, depositedThrough: 1602 });
      // Not touched: the channel keeps its key and token (no PUT).
      expect(relay.requests.filter((r) => r === "PUT /v1/channel")).toHaveLength(1);
    }
  );

  it("deposits nothing while 500 or more are left", async () => {
    const count = (request: string) => relay.requests.filter((r) => r === request).length;
    const before = { reads: count("GET /v1/channel"), posts: count("POST /v1/channel/hashes") };
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(500n));
    await until(payment, "ready");
    await payment.pay();
    await answer;
    // `pay` resolves once the refill was looked at: read, nothing deposited.
    expect(count("GET /v1/channel")).toBe(before.reads + 1);
    expect(count("POST /v1/channel/hashes")).toBe(before.posts);
  });
});

describe("a card payment, the app locked", () => {
  beforeEach(() => closeAccount());

  it("checks the tap after the passkey, pays, and leaves the app locked", async () => {
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(2_000n));
    await until(payment, "ready");
    // Not checked yet: the card's keys come with the passkey.
    expect(cardState().lastCounter).toBe(1);

    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", status: "completed" });
    expect(cardState().lastCounter).toBe(2);
    expect(getAccountWalletId()).toBeNull();
    // The wallet connected for this payment only.
    expect(cardWalletConnected()).toBe(false);
  });

  it("asks for the passkey this device saved for the card's account only", async () => {
    await rememberDevicePasskey(TEST_WALLET_ID, new Uint8Array([4, 2]).buffer);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(2_000n));
    await until(payment, "ready");

    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(signIn).toHaveBeenCalledTimes(1);
    const [pinned] = signIn.mock.lastCall ?? [];
    expect(pinned && Array.from(new Uint8Array(pinned))).toEqual([4, 2]);
  });

  it("asks for any passkey when this device saved none for the card's account", async () => {
    await rememberDevicePasskey("02ab".repeat(16) + "cd", new Uint8Array([4, 2]).buffer);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(2_000n));
    await until(payment, "ready");

    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(signIn).toHaveBeenLastCalledWith(undefined);
  });

  it("refuses another account's passkey", async () => {
    signIn.mockResolvedValue({ seed: testSeed(OTHER_TEST_MNEMONIC), credentialId: null });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(2_000n));
    await until(payment, "ready");
    await payment.pay();
    expect(payment.getView()).toMatchObject({
      phase: "failed",
      failure: "unlock",
      unlock: "otherAccount"
    });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Payment not confirmed on the cardholder's phone."
    });
    expect(fakeCard().balanceSats).toBe(500_000n);
    expect(cardState().lastCounter).toBe(1);
  });
});

describe("the wake packets", () => {
  it("drops a packet seen already, an old one, one for another key or relay", async () => {
    const { packet } = await tap();
    await expect(receiveCardWake(packet, Date.now() - 3 * 60_000, TEST_WALLET_ID)).resolves.toBe(
      null
    );
    await expect(receiveCardWake(packet, Date.now(), TEST_WALLET_ID)).resolves.not.toBeNull();
    await expect(receiveCardWake(packet, Date.now(), TEST_WALLET_ID)).resolves.toBeNull();
    await expect(receiveCardWake({ epk: "x" }, Date.now(), TEST_WALLET_ID)).resolves.toBeNull();
    await expect(receiveCardWake(packet, Date.now(), "02ab".repeat(16))).resolves.toBeNull();

    // A relay of no card of this account (anyone who knows the device's public key can seal one).
    const { publicKey } = await loadDeviceKey();
    const foreign = sealPacket(
      publicKey,
      JSON.stringify({
        p: "00".repeat(16),
        c: "00".repeat(8),
        session: "ab".repeat(16),
        wsToken: "cd".repeat(16),
        relay: "relay.example.org"
      })
    );
    await expect(receiveCardWake(foreign, Date.now(), TEST_WALLET_ID)).resolves.toBeNull();
    expect(relay.requests.filter((r) => r.startsWith("WS"))).toHaveLength(1);
  });

  it("reads the relay's pending packets with the account open (open-app mode)", async () => {
    const { request } = await tap();
    await readPendingCardWakes();
    const payment = currentCardPayment();
    expect(payment).not.toBeNull();
    const answer = posCallback(request, posInvoice(700n));
    await until(payment!, "ready");
    // Given once: the same packet from the notification is dropped.
    await expect(
      receiveCardWake(relay.pushes[relay.pushes.length - 1].data.cr, Date.now(), TEST_WALLET_ID)
    ).resolves.toBeNull();
    await payment!.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
  });

  it("says when the relay's session cannot be opened", async () => {
    const { packet } = await tap();
    relay.unreachable = true;
    const payment = await wake(packet);
    await until(payment, "failed");
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "unreachable" });
  });
});

describe("who a card payment pays", () => {
  const LAC = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };

  /** Every payment that leaves, as the holder is told of it (paid-notice.ts). */
  function paidNotices(): CardPaid[] {
    const paid: CardPaid[] = [];
    const unsubscribe = subscribeCardPaid((payment) => paid.push(payment));
    afterEachCleanups.push(unsubscribe);
    return paid;
  }
  const afterEachCleanups: (() => void)[] = [];
  afterEach(() => {
    for (const cleanup of afterEachCleanups.splice(0)) cleanup();
  });

  it("shows whom it pays from the only card on the tap's relay, the app locked", async () => {
    const approvedAt = Date.now() - 60_000;
    await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, approvedAt);
    closeAccount();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    // Its tap not checked yet (no card root kept): asked, the merchant shown as that card's.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "approved", name: LAC.name },
      cause: "unconfirmed"
    });
    expect(cardState().lastCounter).toBe(1);
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    // Seen again by that card once the passkey told it was the one.
    const seenAt = async () =>
      bookOf(await loadPayeeBooks(TEST_WALLET_ID), { cardId, walletGeneration: 1 }).payees.get(
        LAC.id
      )?.lastSeenAt;
    let seen = await seenAt();
    for (let i = 0; i < 200 && seen === approvedAt; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen = await seenAt();
    }
    expect(seen).toBeGreaterThan(approvedAt);
  });

  /** A second card of the account on the same relay, as the phone keeps it; `card` stays the first. */
  async function secondCard(): Promise<{ id: string; ntag: FakeNtag424 }> {
    const ntag = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(ntag);
    const { state } = await pairCard({
      relayHost: HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    nfc.holdCard(card);
    sdk.fakeCardWallet(state.cardId).balanceSats = 500_000n;
    return { id: state.cardId, ntag };
  }

  it("shows a merchant approved for one card only as new, the app locked, while two cards could have been tapped", async () => {
    // Which one was tapped, only its keys tell.
    await secondCard();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    closeAccount();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    // Never shown as approved before its card is known; asked, approved by no confirmation, the
    // point of sale not told it is a new merchant (it may be the tapped card's).
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name, homonym: false },
      cause: "unconfirmed",
      approvable: false
    });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    // Kept as the tapped card's merchants tell: approved for it.
    expect(payment.getView()).toMatchObject({
      phase: "sent",
      approved: false,
      payee: { status: "approved", name: LAC.name }
    });
  });

  it("points out an impostor bearing an approved merchant's name, the app locked, two cards on the relay", async () => {
    await secondCard();
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    closeAccount();
    // Another merchant of breez.tips, declaring the bakery's name.
    const invoice = merchantInvoice(800n, { username: "sattleme99", name: "Lakeside Bakery" });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    posCallback(request, invoice.pr, invoice.proof);
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name, homonym: true },
      cause: "newPayee",
      approvable: false
    });
    closeCardPayment(payment);
  });

  it("never pays a merchant approved for another card without asking, the account open", async () => {
    const second = await secondCard();
    // Approved for the first card, in "Approved merchants" for both.
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    card = second.ntag;
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    posCallback(request, invoice.pr, invoice.proof);
    // The second card's own merchants decide: a new one, asked.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name, homonym: false },
      cause: "newPayee",
      approvable: true
    });
    expect(signIn).not.toHaveBeenCalled();
    expect(sdk.fakeCardWallet(second.id).balanceSats).toBe(500_000n);
    closeCardPayment(payment);
  });

  /**
   * A second card of the account on the tap's relay, active on the relays but not yet on this
   * phone (paired, or set active again, on another device): the phone's only card on that relay is
   * the first. Its own wallet holds 500 000 sats. Resolves with its id; `card` is it from then on.
   */
  async function cardTheRelaysTell(): Promise<string> {
    const other = new FakeNtag424("04a39493cc8680");
    nfc.holdCard(other);
    const { state } = await pairCard({
      relayHost: HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    const stored = await loadStoredCardStates();
    if (!stored) throw new Error("No stored card states");
    await saveStoredCardStates({
      ...stored,
      states: stored.states.filter(
        (value) => (value as { cardId?: unknown }).cardId !== state.cardId
      ),
      unpublished: stored.unpublished.filter((id) => id !== state.cardId)
    });
    resetCardStates();
    sdk.fakeCardWallet(state.cardId).balanceSats = 500_000n;
    card = other;
    return state.cardId;
  }

  it("takes the tapped card's merchants, the account open, for a card only the relays told", async () => {
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    const otherId = await cardTheRelaysTell();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    posCallback(request, invoice.pr, invoice.proof);
    // Checked with the account's keys as it comes: the second card's own merchants decide, never
    // those of the only card this phone kept on that relay.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name },
      cause: "newPayee",
      approvable: true
    });
    expect(sdk.fakeCardWallet(otherId).balanceSats).toBe(500_000n);
    closeCardPayment(payment);
  });

  it("takes the decision again for the card the passkey tells, approving nobody, the app locked", async () => {
    const otherId = await cardTheRelaysTell();
    closeAccount();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    // Shown as the first card's would pay it, the only one this phone keeps on the relay.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name },
      cause: "newPayee",
      approvable: true
    });
    // Even ticked: the tap was not the card shown.
    await payment.pay({ approve: true });
    await expect(answer).resolves.toEqual({ status: "OK" });
    // The tap was the other card's: paid from its wallet, the merchant approved for neither card.
    expect(payment.getView()).toMatchObject({ phase: "sent", approved: false });
    expect(sdk.fakeCardWallet(otherId).balanceSats).toBe(500_000n - 800n - 3n);
    expect(fakeCard().balanceSats).toBe(500_000n);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId: otherId, walletGeneration: 1 })).approved
    ).toEqual([]);
    expect(
      bookOf(await loadPayeeBooks(TEST_WALLET_ID), { cardId: otherId, walletGeneration: 1 }).payees
        .size
    ).toBe(0);
  });

  it("keeps whom it paid as the tapped card's merchants tell, not the card first shown", async () => {
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    const otherId = await cardTheRelaysTell();
    closeAccount();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "approved", name: LAC.name }
    });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    // Approved for the first card only: for the card tapped, a new merchant.
    expect(payment.getView()).toMatchObject({
      phase: "sent",
      approved: false,
      payee: { status: "new", name: LAC.name, approvedAt: null }
    });
    await waitUntil(() => fileSystem.files.has(LOG_URI));
    expect(await loadCardPayments()).toMatchObject([
      { cardId: otherId, outcome: "sent", payee: { status: "new", name: LAC.name } }
    ]);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId: otherId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it("Approved merchants: asks for a new merchant, approves it once paid with the holder's tick, then pays it without asking", async () => {
    const paid = paidNotices();
    const first = merchantInvoice(12_500n);
    const one = await tap();
    const payment = await wake(one.packet);
    const answer = posCallback(one.request, first.pr, first.proof);
    const ready = await until(payment, "ready");
    expect(ready).toMatchObject({
      payee: { status: "new", name: "Lakeside Bakery", homonym: false },
      cause: "newPayee",
      approvable: true
    });
    // The merchant's own service was asked, directly, at the URL it gave.
    expect(breezTips.requests).toEqual([first.proof.verify]);
    // "Approve this merchant" ticked.
    await payment.pay({ approve: true });
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", approved: true, automatic: false });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: LAC.id, approvedName: LAC.name, localName: null }]);
    // On the account's relays at once, for the web app and the account's other phones: the
    // merchant approved, and the payment.
    expect(
      bookOf(await loadPayeeBooks(TEST_WALLET_ID), { cardId, walletGeneration: 1 }).unpublished
    ).toEqual(new Set());
    expect((await withCardAccess((access) => readCardHistory(access))).entries).toMatchObject([
      { amountSats: 12_500n, outcome: "sent", payee: { status: "new", name: LAC.name } }
    ]);
    closeCardPayment(payment);

    // Its next payment leaves without asking, the passkey never shown again.
    const second = merchantInvoice(800n, { seed: 2 });
    const two = await tap();
    const next = await wake(two.packet);
    const nextAnswer = posCallback(two.request, second.pr, second.proof);
    await expect(nextAnswer).resolves.toEqual({ status: "OK" });
    expect(await until(next, "sent")).toMatchObject({
      automatic: true,
      approved: false,
      payee: { status: "approved", name: LAC.name, formerName: null }
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(fakeCard().balanceSats).toBe(500_000n - 12_500n - 3n - 800n - 3n);
    // The holder is told of each one, with the merchant's name and status.
    expect(paid.map((notice) => [notice.amountSats, notice.payee.status])).toEqual([
      [12_500n, "new"],
      [800n, "approved"]
    ]);
    // The phone keeps the proof: the invoice, the metadata, the verify answer, then the preimage
    // (read from the wallet once the payment completed).
    let log = await loadCardPayments();
    for (let i = 0; i < 100 && log[1]?.preimage === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      log = await loadCardPayments();
    }
    expect(log[1]).toMatchObject({
      outcome: "sent",
      pr: second.pr,
      paymentHash: second.paymentHash,
      preimage: second.preimage,
      payee: {
        status: "approved",
        name: LAC.name,
        metadata: second.proof.metadata,
        verify: second.proof.verify,
        verifyAnswer: JSON.stringify({
          status: "OK",
          settled: false,
          preimage: null,
          pr: second.pr
        })
      }
    });
  });

  it("never approves a new merchant the holder did not tick: it is asked again the next time", async () => {
    const first = merchantInvoice(12_500n);
    const one = await tap();
    const payment = await wake(one.packet);
    const answer = posCallback(one.request, first.pr, first.proof);
    expect(await until(payment, "ready")).toMatchObject({ cause: "newPayee", approvable: true });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", approved: false });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
    closeCardPayment(payment);

    const second = merchantInvoice(800n, { seed: 2 });
    const two = await tap();
    const next = await wake(two.packet);
    const nextAnswer = posCallback(two.request, second.pr, second.proof);
    expect(await until(next, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name },
      cause: "newPayee"
    });
    next.decline();
    await nextAnswer;
  });

  it("approves a ticked merchant only once its payment left: the card's wallet short, nobody is", async () => {
    // The amount, not its 3 sats of fee: asked (provenShort), refused once confirmed.
    fakeCard().balanceSats = 802n;
    const first = merchantInvoice(800n);
    const one = await tap();
    const payment = await wake(one.packet);
    const answer = posCallback(one.request, first.pr, first.proof);
    expect(await until(payment, "ready")).toMatchObject({ cause: "newPayee", approvable: true });
    // "Approve this merchant" ticked and the passkey given, but nothing can leave.
    await payment.pay({ approve: true });
    await expect(answer).resolves.toEqual({
      status: "ERROR",
      reason: "Insufficient card balance."
    });
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
    expect(fakeCard().payments).toEqual([]);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
    closeCardPayment(payment);

    // Recharged, its next payment asks again.
    fakeCard().balanceSats = 500_000n;
    const second = merchantInvoice(800n, { seed: 2 });
    const two = await tap();
    const next = await wake(two.packet);
    const nextAnswer = posCallback(two.request, second.pr, second.proof);
    expect(await until(next, "ready")).toMatchObject({
      payee: { status: "new", name: LAC.name },
      cause: "newPayee"
    });
    next.decline();
    await nextAnswer;
  });

  it("refuses in time a relay's own invoice carrying the merchant's metadata (Not found)", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, Date.now());
      // The merchant's public metadata and `h`, on an invoice breez.tips never made.
      const forged = merchantInvoice(800n, { issued: false });
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, forged.pr, forged.proof);
      await jest.advanceTimersByTimeAsync(0);
      expect(await until(payment, "ready")).toMatchObject({
        payee: { status: "unidentified", name: null },
        cause: "unidentifiedPayee",
        approvable: false
      });
      await jest.advanceTimersByTimeAsync(25_000);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "Merchant not identified: the cardholder must confirm the payment in their sattle.me app."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "unidentifiedPayee" });
      expect(fakeCard().balanceSats).toBe(500_000n);
      expect(signIn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a new merchant nobody confirms in time, with the reason for its point of sale", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const invoice = merchantInvoice(800n);
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, invoice.pr, invoice.proof);
      await jest.advanceTimersByTimeAsync(0);
      await until(payment, "ready");
      await jest.advanceTimersByTimeAsync(25_000);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason:
          "New merchant: the cardholder must approve it in their sattle.me app, then present the card again."
      });
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "newPayee" });
      expect(
        (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
      ).toEqual([]);
      expect(fakeCard().balanceSats).toBe(500_000n);
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses an invoice its merchant's service says is another one, or paid already", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    // The verify URL of the merchant's invoice, joined to another invoice with its metadata.
    const genuine = merchantInvoice(800n);
    const other = merchantInvoice(800n, { seed: 2, issued: false });
    const first = await tap();
    const swapped = await wake(first.packet);
    await expect(posCallback(first.request, other.pr, genuine.proof)).resolves.toEqual({
      status: "ERROR",
      reason: "Invoice not valid for this card."
    });
    expect(swapped.getView()).toMatchObject({ phase: "failed", failure: "otherInvoice" });
    closeCardPayment(swapped);

    const settled = merchantInvoice(800n, { seed: 3, settled: true });
    const second = await tap();
    const paidAlready = await wake(second.packet);
    await expect(posCallback(second.request, settled.pr, settled.proof)).resolves.toEqual({
      status: "ERROR",
      reason: "The card does not pay this invoice: it is already settled."
    });
    expect(paidAlready.getView()).toMatchObject({ phase: "failed", failure: "settled" });
    expect(fakeCard().balanceSats).toBe(500_000n);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('"Approved merchants": a merchant its node names, approved with the tick, then paid without asking', async () => {
    // A point of sale of another service: no proof, its invoices signed by the merchant's node.
    const node = testNode(11);
    const invoice = (seed: number, sats: bigint) => {
      const pr = posInvoice(sats, { seed, signWith: node.secretKey });
      const { paymentHash, preimage } = preimagePair(seed);
      sdk.fakeSend.preimages.set(paymentHash, preimage);
      return pr;
    };
    const one = await tap();
    const payment = await wake(one.packet);
    const answer = posCallback(one.request, invoice(1, 12_500n));
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: null, by: "node", node: node.nodeId },
      cause: "newPayee",
      approvable: true
    });
    await payment.pay({ approve: true });
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", approved: true });
    closeCardPayment(payment);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: node.nodeId, by: "node" }]);

    // Its next invoice, whatever its point of sale writes, leaves without asking.
    const two = await tap();
    const next = await wake(two.packet);
    const nextAnswer = posCallback(two.request, invoice(2, 800n));
    await expect(nextAnswer).resolves.toEqual({ status: "OK" });
    expect(await until(next, "sent")).toMatchObject({
      automatic: true,
      payee: { status: "approved", by: "node", node: node.nodeId }
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    closeCardPayment(next);
    // The log keeps no proof of an address: the invoice, signed by the node, is the proof.
    const log = await loadCardPayments();
    expect(log.map((entry) => entry.payee)).toEqual([
      { status: "new", name: null, metadata: null, verify: null, verifyAnswer: null },
      { status: "approved", name: null, metadata: null, verify: null, verifyAnswer: null }
    ]);
    expect(log.map((entry) => identifiedPayeeOf(entry))).toEqual([
      { by: "node", id: node.nodeId, name: null },
      { by: "node", id: node.nodeId, name: null }
    ]);

    // Another node: a new merchant, asked.
    const other = testNode(12);
    const three = await tap();
    const third = await wake(three.packet);
    void posCallback(three.request, posInvoice(500n, { seed: 3, signWith: other.secretKey }));
    expect(await until(third, "ready")).toMatchObject({
      payee: { status: "new", by: "node", node: other.nodeId },
      approvable: true
    });
    third.decline();
  });

  it("names the node when the proof of an address does not hold, never the address", async () => {
    // The merchant's service out of reach: its proof proves nothing, its invoice's node is shown.
    const node = testNode(13);
    const metadata = breezTipsMetadata("sattleme01", "Lakeside Bakery");
    const pr = posInvoice(500n, {
      descriptionHash: metadataHash(metadata),
      signWith: node.secretKey
    });
    const { paymentHash } = preimagePair(1);
    breezTips.invoices.set(paymentHash, { pr, settled: false });
    breezTips.unreachable = true;
    const { request, packet } = await tap();
    const payment = await wake(packet);
    void posCallback(request, pr, { metadata, verify: breezTipsVerifyUrl(paymentHash) });
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: null, by: "node", node: node.nodeId },
      cause: "newPayee"
    });
    payment.decline();
    // The proof that did not hold is kept as received, for the holder; the record tells its node.
    let log = await loadCardPayments();
    for (let i = 0; i < 100 && log.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      log = await loadCardPayments();
    }
    expect(log[0]?.payee).toEqual({
      status: "new",
      name: null,
      metadata,
      verify: breezTipsVerifyUrl(paymentHash),
      verifyAnswer: null
    });
    expect(identifiedPayeeOf(log[0])).toEqual({ by: "node", id: node.nodeId, name: null });
  });

  it("pays a payee not identified once confirmed, and never approves it", async () => {
    for (const seed of [1, 2]) {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      // No proof: a point of sale of another card service.
      const answer = posCallback(request, posInvoice(500n, { seed }));
      expect(await until(payment, "ready")).toMatchObject({
        payee: { status: "unidentified" },
        cause: "unidentifiedPayee",
        approvable: false
      });
      await payment.pay();
      await expect(answer).resolves.toEqual({ status: "OK" });
      expect(payment.getView()).toMatchObject({ phase: "sent", approved: false });
      closeCardPayment(payment);
    }
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
    // Nothing asked of any service: there was no proof to check.
    expect(breezTips.requests).toEqual([]);
  });

  it("points out a merchant bearing an approved one's name on another account", async () => {
    await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, Date.now());
    const homonym = merchantInvoice(800n, { username: "sattleme99", name: "LAKESIDE  bakery" });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    void posCallback(request, homonym.pr, homonym.proof);
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new", name: "LAKESIDE bakery", homonym: true },
      cause: "newPayee"
    });
  });

  it("keeps an approval when the merchant changes its name, showing the former one", async () => {
    await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, Date.now() - 1000);
    const renamed = merchantInvoice(800n, { name: "The Lake, bakery" });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    await expect(posCallback(request, renamed.pr, renamed.proof)).resolves.toEqual({
      status: "OK"
    });
    expect(await until(payment, "sent")).toMatchObject({
      automatic: true,
      payee: { status: "approved", name: "The Lake, bakery", formerName: LAC.name }
    });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toMatchObject([{ id: LAC.id, approvedName: LAC.name, lastName: "The Lake, bakery" }]);
  });

  it('"Automatic": pays every valid tap without asking, its payee shown as not checked', async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    const { request, packet } = await tap();
    const payment = await wake(packet);
    await expect(posCallback(request, posInvoice(500n))).resolves.toEqual({ status: "OK" });
    expect(await until(payment, "sent")).toMatchObject({
      automatic: true,
      payee: { status: "unchecked", name: null }
    });
    expect(signIn).not.toHaveBeenCalled();
    // Within the card's limits all the same.
    const above = await tap();
    const refused = await wake(above.packet);
    await expect(posCallback(above.request, posInvoice(20_001n, { seed: 2 }))).resolves.toEqual({
      status: "ERROR",
      reason: "Amount above the card's limit per payment."
    });
    expect(refused.getView()).toMatchObject({ phase: "failed", failure: "aboveLimit" });
  });

  it("refuses a payment its card's wallet cannot hold, telling the merchant and the holder", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    fakeCard().balanceSats = 502n;
    const { request, packet } = await tap();
    const payment = await wake(packet);

    // 500 sats and the wallet's 3 sats of fee: one sat short.
    await expect(posCallback(request, posInvoice(500n))).resolves.toEqual({
      status: "ERROR",
      reason: "Insufficient card balance."
    });
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
    expect(fakeCard().balanceSats).toBe(502n);
    expect(fakeCard().payments).toEqual([]);
    expect(sdk.fakeWallet.balanceSats).toBe(500_000n);
    // Kept for the holder, and never counted against the limits.
    await waitUntil(() => fileSystem.files.has(LOG_URI));
    expect((await loadCardPayments())[0]).toMatchObject({
      outcome: "declined",
      reason: "insufficient_balance"
    });

    // Enough on it: paid.
    fakeCard().balanceSats = 503n;
    const next = await tap();
    const paid = await wake(next.packet);
    await expect(posCallback(next.request, posInvoice(500n, { seed: 2 }))).resolves.toEqual({
      status: "OK"
    });
    expect(paid.getView()).toMatchObject({ phase: "sent" });
    expect(fakeCard().balanceSats).toBe(0n);
  });

  it("pays from the wallet of that card's own words, never another card's", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    // The SDK connections of this test only (the mock keeps every test's).
    const connections = (sdk.connect as jest.Mock).mock.calls.length;
    const { request, packet } = await tap();
    await wake(packet);
    await expect(posCallback(request, posInvoice(500n))).resolves.toEqual({ status: "OK" });

    const root = deriveCardRoot(walletSecret(testSeed()));
    expect(fakeCard().identity).toBe(sdk.fakeIdentityOf(cardWalletPhrase(root, cardId, 1)));
    const storages = (sdk.connect as jest.Mock).mock.calls
      .slice(connections)
      .map(([request]) => (request as { storageDir: string }).storageDir);
    expect(storages).toEqual([
      expect.stringMatching(new RegExp(`/breez-sdk-spark-cards/${cardId}/1$`))
    ]);
  });

  it("never lets two payments made without asking both fit in what the limits leave", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    await setLimits({ maxPaymentsPerHour: 1 });
    const first = await tap();
    const one = await wake(first.packet);
    const firstAnswer = posCallback(first.request, posInvoice(500n, { seed: 1 }));
    await until(one, "paying");
    // A second tap while the first is being paid: both checked, both decided without asking.
    const second = await tap();
    const two = await wake(second.packet);
    const secondAnswer = posCallback(second.request, posInvoice(500n, { seed: 2 }));
    const answers = await Promise.all([firstAnswer, secondAnswer]);
    expect(answers).toContainEqual({ status: "OK" });
    expect(answers).toContainEqual({
      status: "ERROR",
      reason: "Too many payments with this card within the hour."
    });
    expect([one.getView().phase, two.getView().phase].sort()).toEqual(["failed", "sent"]);
    expect(fakeCard().balanceSats).toBe(500_000n - 500n - 3n);
  });

  it("keeps the wallet connected while another card payment uses it, then disconnects it", async () => {
    // A first payment waits for the holder's passkey...
    const first = await tap();
    const one = await wake(first.packet);
    const firstAnswer = posCallback(first.request, posInvoice(500n, { seed: 1 }));
    await until(one, "ready");
    let confirm!: () => void;
    signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = () => resolve({ seed: testSeed(), credentialId: null });
        })
    );
    const paying = one.pay();
    await until(one, "confirming");
    // ...while a second tap comes: checked, the wallet in use for it too.
    const second = await tap();
    const two = await wake(second.packet);
    const secondAnswer = posCallback(second.request, posInvoice(300n, { seed: 2 }));
    await until(two, "ready");
    expect(cardWalletConnected()).toBe(true);
    confirm();
    await paying;
    await expect(firstAnswer).resolves.toEqual({ status: "OK" });
    // The first is done, not the second: the wallet stays for it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cardWalletConnected()).toBe(true);
    two.decline();
    await expect(secondAnswer).resolves.toMatchObject({ status: "ERROR" });
    await waitUntil(() => !cardWalletConnected());
  });

  it('"Always confirm": asks even for an approved merchant, approving nobody', async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "confirm");
    await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, Date.now());
    const approved = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, approved.pr, approved.proof);
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "approved" },
      cause: "unconfirmed",
      approvable: false
    });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    closeCardPayment(payment);

    const fresh = merchantInvoice(800n, { seed: 2, username: "sattleme02", name: "Grocery" });
    const second = await tap();
    const asked = await wake(second.packet);
    const freshAnswer = posCallback(second.request, fresh.pr, fresh.proof);
    expect(await until(asked, "ready")).toMatchObject({ cause: "newPayee", approvable: false });
    await asked.pay();
    await expect(freshAnswer).resolves.toEqual({ status: "OK" });
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved.map(
        (p) => p.id
      )
    ).toEqual([LAC.id]);
  });

  it("asks with the passkey while the app is locked, even for an approved merchant", async () => {
    await approveCardPayee(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, LAC, Date.now());
    closeAccount();
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "approved" },
      cause: "unconfirmed"
    });
    await payment.pay();
    await expect(answer).resolves.toEqual({ status: "OK" });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(getAccountWalletId()).toBeNull();
  });
});

describe("a change made on the web app, before this phone is told", () => {
  const root = deriveCardRoot(walletSecret(testSeed()));
  const LAC = { id: "sattleme01@breez.tips", name: "Lakeside Bakery" };

  /** Another device of the account (the web app) publishes a record. */
  async function publishElsewhere(event: NostrEvent, secretKey: Uint8Array) {
    await publishToRelays(event, {
      relays: currentRelays(),
      channel: "account",
      timeoutMs: 1000,
      authKey: secretKey
    });
  }

  /** `relays` never answer a read of the holder's mode and merchants: that read is late there. */
  function payeesLateOn(relays: string[]) {
    const { publicKey } = derivePayeeRecordKeys(root).nostr;
    for (const url of relays) nostr.silentAuthors.set(url, new Set([publicKey]));
  }

  it("a card suspended there pays nothing at its next tap", async () => {
    const keys = deriveCardRecordKeys(root);
    const state = cardState();
    await publishElsewhere(
      cardStateEvent(keys, {
        ...state,
        suspended: true,
        settingsAt: Date.now(),
        updatedAt: state.updatedAt + 60
      }),
      keys.nostr.secretKey
    );
    // This phone still knows the card as it was.
    expect(cardState().suspended).toBe(false);
    await expect(refusedTap(posInvoice(800n))).resolves.toEqual({
      answer: {
        status: "ERROR",
        reason: "Card paused: the cardholder can resume it in their sattle.me app."
      },
      failure: "suspended"
    });
    expect(cardState().suspended).toBe(true);
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("a card resumed there pays again at its next tap, without asking", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    const keys = deriveCardRecordKeys(root);
    const state = cardState();
    await publishElsewhere(
      cardStateEvent(keys, {
        ...state,
        suspended: true,
        settingsAt: Date.now(),
        updatedAt: state.updatedAt + 60
      }),
      keys.nostr.secretKey
    );
    await expect(refusedTap(posInvoice(800n))).resolves.toMatchObject({ failure: "suspended" });
    const paused = cardState();
    expect(paused.suspended).toBe(true);
    await publishElsewhere(
      cardStateEvent(keys, {
        ...paused,
        suspended: false,
        settingsAt: Date.now() + 1_000,
        updatedAt: paused.updatedAt + 60
      }),
      keys.nostr.secretKey
    );
    const { request, packet } = await tap();
    const payment = await wake(packet);
    await expect(posCallback(request, posInvoice(800n))).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", automatic: true });
    expect(cardState().suspended).toBe(false);
  });

  it("a card suspended there, the relays that answer missing it: the holder asked, nothing paid without asking", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    const keys = deriveCardRecordKeys(root);
    const state = cardState();
    const others = currentRelays().slice(2);
    // The pause reaches three relays of five, a majority, which are silent at the tap.
    await publishToRelays(
      cardStateEvent(keys, {
        ...state,
        suspended: true,
        settingsAt: Date.now(),
        updatedAt: state.updatedAt + 60
      }),
      { relays: others, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    );
    for (const url of others) nostr.unreachable.add(url);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    expect(await until(payment, "ready")).toMatchObject({ phase: "ready" });
    payment.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("a merchant removed there is asked again at its next payment", async () => {
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    const [approved] = [
      ...bookOf(await loadPayeeBooks(TEST_WALLET_ID), {
        cardId,
        walletGeneration: 1
      }).payees.values()
    ];
    const keys = derivePayeeRecordKeys(root);
    await publishElsewhere(
      payeeEvent(keys, {
        ...approved,
        approved: false,
        approvalAt: Date.now(),
        updatedAt: approved.updatedAt + 60
      }),
      keys.nostr.secretKey
    );
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    // Not paid without asking: a new merchant again, approved once confirmed.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new" },
      cause: "newPayee",
      approvable: true
    });
    payment.decline();
    await answer;
    expect(
      (await loadCardPayees(TEST_WALLET_ID, { cardId, walletGeneration: 1 })).approved
    ).toEqual([]);
  });

  it("a merchant removed there is asked again with one relay late for the merchants: the others tell it in time", async () => {
    await approveCardPayee(
      TEST_WALLET_ID,
      { cardId, walletGeneration: 1 },
      LAC,
      Date.now() - 60_000
    );
    const [approved] = [
      ...bookOf(await loadPayeeBooks(TEST_WALLET_ID), {
        cardId,
        walletGeneration: 1
      }).payees.values()
    ];
    const keys = derivePayeeRecordKeys(root);
    await publishElsewhere(
      payeeEvent(keys, {
        ...approved,
        approved: false,
        approvalAt: Date.now(),
        updatedAt: approved.updatedAt + 60
      }),
      keys.nostr.secretKey
    );
    payeesLateOn(currentRelays().slice(0, 1));
    const invoice = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, invoice.pr, invoice.proof);
    // The phone's book still approves it: the relays that answer decide, not that book.
    expect(await until(payment, "ready")).toMatchObject({
      payee: { status: "new" },
      cause: "newPayee"
    });
    expect(fakeCard().balanceSats).toBe(500_000n);
    payment.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("pays without asking with one relay late for the merchants: the others tell the mode in time", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    payeesLateOn(currentRelays().slice(0, 1));
    const { request, packet } = await tap();
    const payment = await wake(packet);
    await expect(posCallback(request, posInvoice(800n))).resolves.toEqual({ status: "OK" });
    expect(payment.getView()).toMatchObject({ phase: "sent", automatic: true });
  });

  it("the merchants not read on a majority of the relays in time: the holder asked, nothing paid without asking", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    // The cards' records answer on every relay; the holder's mode and merchants on two of five.
    payeesLateOn(currentRelays().slice(2));
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    // A stricter mode chosen on the web app might not be known yet: the holder decides.
    expect(await until(payment, "ready")).toMatchObject({ phase: "ready" });
    expect(fakeCard().balanceSats).toBe(500_000n);
    payment.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
    expect(fakeCard().balanceSats).toBe(500_000n);
  });

  it("the relays too slow: the holder asked, nothing paid without asking, CARD_FRESH_READ_MS later", async () => {
    await setCardPayeeMode(TEST_WALLET_ID, { cardId, walletGeneration: 1 }, "automatic", {
      passkeyConfirmed: true
    });
    const release = nostr.holdQueries();
    try {
      const started = Date.now();
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      // A pause made on the web app might not be known yet: the holder decides.
      expect(await until(payment, "ready")).toMatchObject({ phase: "ready" });
      expect(Date.now() - started).toBeGreaterThanOrEqual(CARD_FRESH_READ_MS - 100);
      expect(fakeCard().balanceSats).toBe(500_000n);
      await payment.pay();
      await expect(answer).resolves.toEqual({ status: "OK" });
      expect(payment.getView()).toMatchObject({ phase: "sent", automatic: false });
    } finally {
      release();
    }
  });
});

describe("a card its wallet is proven not to hold", () => {
  const LAC = { name: "Lakeside Bakery" };
  const SHORT = { status: "ERROR", reason: "Insufficient card balance." };

  /** The phases `payment` shows from now on. */
  function phasesOf(payment: CardPayment): CardPaymentView["phase"][] {
    const phases: CardPaymentView["phase"][] = [];
    payment.subscribe(() => phases.push(payment.getView().phase));
    return phases;
  }

  it('is refused before its holder is asked: no "Pay", no passkey, the merchant told', async () => {
    fakeCard().balanceSats = 799n;
    const { pr, proof } = merchantInvoice(800n);
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const phases = phasesOf(payment);
    await expect(posCallback(request, pr, proof)).resolves.toEqual(SHORT);
    // The receipt as the holder would have been asked: whom, from which card, and why not.
    expect(payment.getView()).toMatchObject({
      phase: "failed",
      failure: "insufficientBalance",
      invoice: { amountSats: 800n },
      payee: { status: "new", name: LAC.name },
      card: { cardId }
    });
    expect(phases).not.toContain("ready");
    expect(signIn).not.toHaveBeenCalled();
    expect(fakeCard().payments).toEqual([]);
    expect(fakeCard().balanceSats).toBe(799n);
    // Kept for the holder, as a refusal after the passkey is.
    await waitUntil(() => fileSystem.files.has(LOG_URI));
    expect((await loadCardPayments())[0]).toMatchObject({
      outcome: "declined",
      reason: "insufficient_balance"
    });
    // Its counter kept all the same: that tap is never good again.
    expect(cardState().lastCounter).toBe(2);
  });

  it("is asked for when its wallet holds the amount, not its fee: refused once confirmed", async () => {
    fakeCard().balanceSats = 800n;
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    await payment.pay();
    await expect(answer).resolves.toEqual(SHORT);
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(fakeCard().payments).toEqual([]);
  });

  it("is asked for, the app locked: its wallet opens with the passkey only, then refuses it", async () => {
    closeAccount();
    fakeCard().balanceSats = 0n;
    const { request, packet } = await tap();
    const payment = await wake(packet);
    const answer = posCallback(request, posInvoice(800n));
    await until(payment, "ready");
    await payment.pay();
    await expect(answer).resolves.toEqual(SHORT);
    expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
    expect(fakeCard().payments).toEqual([]);
    expect(cardWalletConnected()).toBe(false);
  });

  it("is asked for when no sync of its wallet reached the network: a recharge may be missing", async () => {
    // Its storage says empty, which nothing proves (the Spark operators unreachable).
    sdk.setSparkReachable(false);
    fakeCard().balanceSats = 0n;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(0);
      expect(payment.getView().phase).toBe("checking");
      // Waited for CARD_BALANCE_READ_MS, then asked.
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS);
      expect(payment.getView()).toMatchObject({ phase: "ready", cause: "unidentifiedPayee" });
      payment.decline();
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason: "Payment declined by the cardholder."
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("closed while its balance is read: told as closed, never kept as short", async () => {
    const synced = sdk.holdFirstSync();
    fakeCard().balanceSats = 0n;
    // The card's panel in "Cards" keeps its wallet connected once the payment let it go.
    const panel = await withCardAccess((access) => leaseCardWallet(access, cardState()));
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS / 2);
      expect(payment.getView()).toMatchObject({ phase: "checking" });
      closeCardPayment(payment);
      await expect(answer).resolves.toEqual({
        status: "ERROR",
        reason: "Payment not confirmed on the cardholder's phone."
      });
      synced();
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS);
      expect(await loadCardPayments()).toEqual([]);
      expect(signIn).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      await panel.release();
    }
  });

  it('proven short only once its holder is asked: refused then, before "Pay"', async () => {
    const synced = sdk.holdFirstSync();
    fakeCard().balanceSats = 0n;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      // The card's wallet reached the network at last.
      synced();
      await jest.advanceTimersByTimeAsync(0);
      await expect(answer).resolves.toEqual(SHORT);
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
      // "Pay" too late: nothing.
      await payment.pay();
      expect(signIn).not.toHaveBeenCalled();
      expect(fakeCard().payments).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('proven short once "Pay" was pressed: refused once, after the passkey', async () => {
    const synced = sdk.holdFirstSync();
    fakeCard().balanceSats = 0n;
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { request, packet } = await tap();
      const payment = await wake(packet);
      const answer = posCallback(request, posInvoice(800n));
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS);
      expect(payment.getView()).toMatchObject({ phase: "ready" });
      const phases = phasesOf(payment);
      let confirm!: () => void;
      signIn.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirm = () => resolve({ seed: testSeed(), credentialId: null });
          })
      );
      const paying = payment.pay();
      // The proof comes while the passkey's prompt shows: the payment goes on once confirmed, its
      // own check refuses it.
      synced();
      await jest.advanceTimersByTimeAsync(0);
      expect(payment.getView()).toMatchObject({ phase: "confirming" });
      confirm();
      await jest.advanceTimersByTimeAsync(CARD_BALANCE_READ_MS);
      await paying;
      await expect(answer).resolves.toEqual(SHORT);
      // Past the passkey, never cut short by the proof.
      expect([...new Set(phases)]).toEqual(["confirming", "paying", "failed"]);
      expect(payment.getView()).toMatchObject({ phase: "failed", failure: "insufficientBalance" });
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(fakeCard().payments).toEqual([]);
      // One refusal, logged once.
      expect(relay.sessions.size).toBe(1);
      const [session] = relay.sessions.values();
      expect(session).toMatchObject({ done: true, outcome: SHORT });
      expect(await loadCardPayments()).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
