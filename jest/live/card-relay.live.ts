/**
 * A card's whole journey with the app's own code against a REAL card relay
 * (sattleme/relay 2.2.0 or later, contract v2 with sealed push tokens: the phone's reason forwarded
 * as written): channel, hashes with the push token sealed, the point of sale's tap on `/w`, the
 * wake packet read in "app open" mode, the WebSocket, `/cb`, `OK`; then a refusal, the token
 * changed (PATCH) and the channel deleted.
 *
 * Run by hand only (docs/card-relay.md; sattleme/relay's README tells how to run a relay): its
 * name is no test's, so `npm run check` and the CI never run it, as tests never reach the network.
 * With a relay started on this machine:
 *
 *   PUBLIC_HOST=relay.localhost:8080 npm start          # in sattleme/relay (Node 24.12 or later)
 *   CARD_RELAY_LIVE_URL=http://127.0.0.1:8080 npx jest --testMatch '<rootDir>/jest/live/*.live.ts'
 *
 * `relay.localhost` (RFC 6761): the app refuses a single-label host such as `localhost` for a
 * card (relay-host.ts). The relay's URLs (`https://relay.localhost:8080/…`, `wss://…`) are sent to
 * CARD_RELAY_LIVE_URL. Everything else stays fake (wallet, Nostr relays, card, passkey). Without
 * Expo, the relay's notification fails and is only counted: the packet is read as a phone without
 * notifications does.
 */
import { removeChannel, setCardLimit } from "@/features/card/manage";
import { pairCard } from "@/features/card/pairing";
import type { CardPayment, CardPaymentView } from "@/features/card/payment";
import {
  closeCardPayment,
  currentCardPayment,
  readPendingCardWakes,
  resetCardPayments
} from "@/features/card/payments";
import { resetCardStates, withCardAccess } from "@/features/card/states";
import { resetChannelSyncs, syncAccountCards } from "@/features/card/sync";
import { closeAccount } from "@/features/account/session";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { channelSecretOf } from "@/lib/card/keys";
import { loadCardPayments } from "@/lib/card/payment-log";
import { loadPushMarks } from "@/lib/card/push-marks";
import { fetchChannel, fetchRelayInfo } from "@/lib/card/relay-client";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testBackupKey, testSeed } from "../account";
import type * as BreezFake from "../breez-sdk";
import type * as FileSystemFake from "../expo-file-system";
import type * as NotificationsFake from "../expo-notifications";
import { makeInvoice, preimagePair } from "../lightning";
import type * as NfcFake from "../nfc-manager";
import type * as RelaysFake from "../nostr-relays";
import { FakeNtag424 } from "../ntag424";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));
jest.mock("../../src/lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));

const BASE = process.env.CARD_RELAY_LIVE_URL?.replace(/\/+$/, "");
if (!BASE || !/^https?:\/\/[^/]+$/.test(BASE)) {
  throw new Error("CARD_RELAY_LIVE_URL: the relay's base URL, e.g. http://127.0.0.1:8080");
}
/** The relay's PUBLIC_HOST: written in the card, in its callbacks and wake packets. */
const HOST = process.env.CARD_RELAY_LIVE_HOST ?? "relay.localhost:8080";

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../../src/lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const notifications = jest.requireMock<typeof NotificationsFake>("expo-notifications");
const signIn = jest.mocked(signInWithPasskey);

// Node's own HTTP and WebSocket clients: the tests' `fetch` and `WebSocket` (jest.setup.ts) reach
// the fake relays only. Typed here with what is used (the project has no Node types).
type NodeIncoming = {
  statusCode?: number;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: unknown) => void): void;
};
type NodeClient = {
  request(
    url: string,
    options: { method: string; headers: Record<string, string> },
    callback: (response: NodeIncoming) => void
  ): {
    on(event: "error", listener: (error: unknown) => void): void;
    write(body: string): void;
    end(): void;
  };
};
const http = jest.requireActual<NodeClient>("http");
const https = jest.requireActual<NodeClient>("https");
// ws, as the Expo CLI installs it: a WHATWG-like WebSocket (onopen, onmessage, send, close).
const NodeWebSocket = jest.requireActual<{ WebSocket: new (url: string) => WebSocket }>(
  "ws"
).WebSocket;

/** `https://<HOST>/…` (or `lnurlw://`, `wss://`) of the relay, as an address of BASE. */
function local(url: string): string {
  const match = /^(?:https|lnurlw|wss):\/\/([^/]+)(\/.*)$/.exec(url);
  if (!match || match[1] !== HOST) throw new Error(`Not the live relay: ${url}`);
  return BASE + match[2];
}

function request(
  url: string,
  {
    method = "GET",
    headers = {},
    body
  }: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.request(url, { method, headers }, (res) => {
      const chunks: Uint8Array[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const all = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
        let at = 0;
        for (const chunk of chunks) {
          all.set(chunk, at);
          at += chunk.length;
        }
        resolve({ status: res.statusCode ?? 0, text: new TextDecoder().decode(all) });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** The app's `fetch`, to the live relay only: anything else fails as without network. */
async function liveFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const target = local(String(input));
  const answer = await request(target, {
    method: init.method,
    headers: init.headers as Record<string, string> | undefined,
    body: init.body as string | undefined
  });
  return {
    status: answer.status,
    ok: answer.status >= 200 && answer.status < 300,
    text: async () => answer.text,
    json: async () => JSON.parse(answer.text) as unknown
  } as Response;
}

/** The app's WebSocket, to the live relay. */
const createSocket = (url: string) => new NodeWebSocket(local(url).replace(/^http/, "ws"));

/** The point of sale: GET on a URL the relay gave (the card's `lnurlw://`, its `callback`). */
async function pos(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await request(local(url));
  return { status: answer.status, body: JSON.parse(answer.text) as Record<string, unknown> };
}

/** A BOLT11 invoice of the point of sale for `sats`, as the fake wallet reads it too. */
function posInvoice(sats: bigint, seed: number): string {
  const { paymentHash } = preimagePair(seed);
  const timestamp = Math.floor(Date.now() / 1000);
  const description = "Live relay test";
  const pr = makeInvoice({
    amountMsat: sats * 1000n,
    paymentHash,
    description,
    timestamp,
    expirySeconds: 600
  });
  sdk.fakeSend.inputs.set(pr, {
    tag: sdk.InputType_Tags.Bolt11Invoice,
    inner: [
      {
        amountMsat: sats * 1000n,
        description,
        descriptionHash: undefined,
        expiry: 600n,
        invoice: { bolt11: pr, source: {} },
        minFinalCltvExpiryDelta: 18n,
        network: sdk.BitcoinNetwork.Bitcoin,
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

/**
 * The point of sale reads the card (`url`, its `lnurlw://`), the phone takes the packet in "app
 * open" mode: the payment, and the callback with the invoice for `pr` (the point of sale's
 * answer, once the phone answered).
 */
async function tapAndWake(url: string) {
  const withdraw = await pos(url);
  expect(withdraw.status).toBe(200);
  // The relay seals the packet after answering the point of sale, then keeps it 60 s until the
  // phone reads it: read again until it is there, as the app does every 5 s in "app open"
  // mode. The invoice is handed to the phone once it connects.
  let payment: CardPayment | null = null;
  for (let attempt = 0; attempt < 40 && !payment; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    await readPendingCardWakes({ createSocket });
    payment = currentCardPayment();
  }
  if (!payment) throw new Error("No payment from the relay's pending packets");
  const { callback, k1 } = withdraw.body as { callback: string; k1: string };
  return {
    payment,
    withdraw: withdraw.body,
    invoice: (pr: string) => pos(`${callback}?k1=${k1}&pr=${pr}`)
  };
}

async function channelState(cardId: string) {
  const secret = await withCardAccess(async ({ root }) => channelSecretOf(root, cardId, HOST));
  return fetchChannel(HOST, secret);
}

const appFetch = globalThis.fetch;
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
jest.setTimeout(60_000);

beforeAll(async () => {
  globalThis.fetch = liveFetch as typeof fetch;
  // A relay of the contract the app speaks, or nothing runs.
  await expect(fetchRelayInfo(HOST)).resolves.toMatchObject({ protocol: 2 });
});

afterAll(() => {
  globalThis.fetch = appFetch;
});

beforeEach(async () => {
  // The fake SDK's: no real Breez key is needed.
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  fileSystem.resetFileSystem();
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetChannelSyncs();
  resetCardPayments();
  forgetDeviceKey();
  notifications.answerPermission("granted");
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  sdk.fakeWallet.balanceSats = 500_000n;
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(() => {
  resetCardPayments();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

describe(`a card on the live relay ${HOST} (${BASE})`, () => {
  it("pairs, is woken, pays, refuses what its limits refuse, takes a new token, then leaves", async () => {
    // A card of its own each run: random UID, so its own channel.
    const uid = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(7)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const card = new FakeNtag424(`04${uid.slice(2)}`);
    nfc.holdCard(card);

    // The channel: PUT (public key only), then ~1 000 hashes, each with the push token sealed.
    const paired = await pairCard({
      relayHost: HOST,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    const cardId = paired.state.cardId;
    // A card pays from its own wallet (card-wallet.ts), not the account's.
    sdk.fakeCardWallet(cardId).balanceSats = 500_000n;
    expect(paired.activation.status).toBe("ready");
    expect(await channelState(cardId)).toMatchObject({ pending: 1000, nextIdx: 1000 });
    expect((await loadPushMarks()).get(cardId)).toBe(notifications.notifications.token);

    // A tap: the relay answers the point of sale at once, within the protocol's bounds.
    const firstUrl = card.tap();
    const first = await tapAndWake(firstUrl);
    expect(first.withdraw).toMatchObject({
      tag: "withdrawRequest",
      minWithdrawable: 1000,
      // 1 BTC, the protocol's bound since relay 2.1.0 (docs/card-relay.md).
      maxWithdrawable: 100_000_000_000
    });
    expect(String(first.withdraw.callback)).toMatch(
      new RegExp(`^https://${HOST.replace(/\./g, "\\.")}/cb/[0-9a-f]{32}$`)
    );
    const paid = first.invoice(posInvoice(1_500n, 1));
    await until(first.payment, "ready");
    await first.payment.pay();
    await expect(paid).resolves.toEqual({ status: 200, body: { status: "OK" } });
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_500n - 3n);
    closeCardPayment(first.payment);

    // The same tap again: the relay erased its hash (and every earlier one).
    expect(await pos(firstUrl)).toMatchObject({ status: 404, body: { status: "ERROR" } });

    // Above the ceiling per payment (20 000 sats by default): refused before anything shows.
    const second = await tapAndWake(card.tap());
    await expect(second.invoice(posInvoice(20_001n, 2))).resolves.toEqual({
      status: 200,
      body: { status: "ERROR", reason: "Amount above the card's limit per payment." }
    });
    closeCardPayment(second.payment);

    // Past the limit over 24 hours (1 500 sats paid already): refused once the tap is checked.
    await setCardLimit(cardId, "maxDaySats", 2_000n);
    const third = await tapAndWake(card.tap());
    await expect(third.invoice(posInvoice(600n, 3))).resolves.toEqual({
      status: 200,
      body: { status: "ERROR", reason: "The card's 24-hour limit has been reached." }
    });
    closeCardPayment(third.payment);
    expect((await loadCardPayments()).map((entry) => [entry.amountSats, entry.outcome])).toEqual([
      [1_500n, "sent"],
      [600n, "declined"]
    ]);
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 1_500n - 3n);

    // A new Expo token: the hashes still waiting take it (PATCH), none is added.
    const before = await channelState(cardId);
    notifications.notifications.token = "ExponentPushToken[live-token-renewed]";
    const syncs = await syncAccountCards("Card payments");
    expect(syncs.get(cardId)).toMatchObject({ status: "ready" });
    expect((await loadPushMarks()).get(cardId)).toBe("ExponentPushToken[live-token-renewed]");
    expect(await channelState(cardId)).toEqual(before);
    // The card still wakes the phone; declined at the phone, told to the point of sale.
    const fourth = await tapAndWake(card.tap());
    const declined = fourth.invoice(posInvoice(100n, 4));
    await until(fourth.payment, "ready");
    fourth.payment.decline();
    await expect(declined).resolves.toEqual({
      status: 200,
      body: { status: "ERROR", reason: "Payment declined by the cardholder." }
    });
    closeCardPayment(fourth.payment);

    // Its channel deleted, as "Delete the card" does: its taps are unknown to the relay.
    await expect(withCardAccess((access) => removeChannel(access, cardId, HOST))).resolves.toBe(
      "deleted"
    );
    expect(await channelState(cardId)).toBeNull();
    expect((await pos(card.tap())).status).toBe(404);
  });
});
