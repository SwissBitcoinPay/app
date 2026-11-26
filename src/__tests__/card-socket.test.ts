import { hexToBytes } from "@noble/hashes/utils.js";
import { act, renderHook } from "@testing-library/react-native";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import { socketWakeOf, runCardSocketWake } from "@/features/card/background-wake";
import { deleteCard, reprogramCard } from "@/features/card/manage";
import { reprogramLegacyCard } from "@/features/card/migration";
import { pairCard } from "@/features/card/pairing";
import { refillCardChannel, resetRelayInfo } from "@/features/card/relay-sync";
import { currentCardPayment, resetCardPayments } from "@/features/card/payments";
import { knownCardState, resetCardStates, withCardAccess } from "@/features/card/states";
import {
  cardSocketCovers,
  cardSocketOffered,
  cardSocketOn,
  resumeCardSocket,
  setCardSocket
} from "@/features/card/socket";
import {
  lastChannelSyncs,
  switchCardSocket,
  syncAccountCards,
  useCardSync
} from "@/features/card/sync";
import { useCardWakes } from "@/features/card/useCardWakes";
import { CARD_SOCKET_TASK } from "@/features/card/wake-task.android";
import { wipeDevice } from "@/features/settings/device-wipe";
import i18n from "@/i18n";
import { loadCardPasses } from "@/lib/card/card-pass-store";
import { cardSocketListenHash, cardSocketStatus } from "@/lib/card/card-socket";
import { forgetDeviceKey, loadDeviceKey } from "@/lib/card/device-key";
import { cardIdOf } from "@/lib/card/keys";
import { approveCardPayee } from "@/lib/card/payees";
import { loadPushMarks } from "@/lib/card/push-marks";
import { fetchRelayInfo, isListenHash, putChannel } from "@/lib/card/relay-client";
import { loadCardWakes } from "@/lib/card/wake-journal";
import { readLog } from "@/lib/log/log";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testBackupKey } from "../../jest/account";
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
import { cardSocketState, socketRuns } from "../../jest/card-socket";
import { deletedElsewhere } from "../../jest/card-states";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NotificationsFake from "../../jest/expo-notifications";
import type * as TaskManagerFake from "../../jest/expo-task-manager";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import { FakeNtag424, legacyNtag424 } from "../../jest/ntag424";
import { addLegacyServer, tryFetch as legacyServerFetch } from "../../jest/legacy-card-server";

declare const __dirname: string;

/*
 * The card socket (src/features/card/socket.ts, modules/card-socket): the
 * phone's own connection to its cards' relay (`/v1/listen`), how every Android phone of the staging
 * app is woken for its cards. The relay side is sattleme/relay's; the native side is
 * jest/card-socket.ts here.
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
const taskManager = jest.requireMock<typeof TaskManagerFake>("expo-task-manager");

const HOST = DEFAULT_CARD_RELAY_HOST;
/** A relay the holder chose for another card ("Advanced settings"). */
const OTHER = "relay.example.org";
const LAKESIDE = { username: "sattleme01", name: "Lakeside Bakery" };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

let relay: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;
/** The bodies of `PUT /v1/channel`, in order. */
let puts: Record<string, unknown>[];
/** While set, each `PUT /v1/channel` waits for it before it reaches the relay. */
let holdPuts: Promise<void> | null;

/** An invoice of the bakery's Lightning address on breez.tips, with its proof. */
function merchantInvoice(sats: bigint) {
  const metadata = breezTipsMetadata(LAKESIDE.username, LAKESIDE.name);
  const { paymentHash, preimage } = preimagePair(1);
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

/** The card's only channel on the relay. */
function channel() {
  const channels = [...relay.channels.values()];
  expect(channels).toHaveLength(1);
  return channels[0];
}

/** Resolves once a `PUT /v1/channel` was asked of the relay. */
async function waitForPut(): Promise<void> {
  const count = puts.length;
  for (let turn = 0; turn < 200 && puts.length === count; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(puts.length).toBeGreaterThan(count);
}

/** Turns the socket on or off, then syncs the cards (as "Wake journal" does). */
async function socket(on: boolean): Promise<void> {
  await setCardSocket(on);
  await syncAccountCards("Card payments");
}

beforeEach(async () => {
  jest.replaceProperty(Platform, "OS", "android");
  build.variant = "staging";
  fileSystem.resetFileSystem();
  resetBreezTips();
  puts = [];
  holdPuts = null;
  jest
    .mocked(globalThis.fetch)
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.host === "breez.tips") return breezTipsFetch(input);
      // The v2 server's reset of a v2 card (a migrated card's re-encoding, below).
      const legacy = legacyServerFetch(input, init);
      if (legacy) return legacy;
      if (
        init?.method === "PUT" &&
        url.pathname === "/v1/channel" &&
        typeof init.body === "string"
      ) {
        puts.push(JSON.parse(init.body) as Record<string, unknown>);
        if (holdPuts) return holdPuts.then(() => fetchRelays(input, init));
      }
      return fetchRelays(input, init);
    });
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetCardPayments();
  forgetDeviceKey();
  relay = addRelay(HOST);
  // A relay that serves /v1/listen.
  relay.listen = { heartbeatSeconds: 240 };
  // A token Expo would give (an iPhone's): never asked where the socket is offered.
  notifications.notifications.token = "ExponentPushToken[fake-token-0000000000]";
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
  await approveCardPayee(
    TEST_WALLET_ID,
    { cardId, walletGeneration: 1 },
    { id: `${LAKESIDE.username}@breez.tips`, name: LAKESIDE.name },
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

describe("the relay's side, as the app reads it", () => {
  it("reads what /v1/info announces of /v1/listen, refusing anything out of bounds", async () => {
    expect((await fetchRelayInfo(HOST)).listen).toEqual({ heartbeatSeconds: 240 });
    for (const listen of [
      { heartbeatSeconds: 29 },
      { heartbeatSeconds: 3601 },
      { heartbeatSeconds: 60.5 },
      "yes",
      null
    ]) {
      relay.listen = listen as never;
      expect((await fetchRelayInfo(HOST)).listen).toBeNull();
    }
  });

  it("gives a channel the listening token's hash only in the relay's own form", async () => {
    const secret = new Uint8Array(32).fill(7);
    const publicKey = "B".repeat(87);
    const hash = await cardSocketListenHash(HOST);
    expect(isListenHash(hash)).toBe(true);
    await putChannel(HOST, secret, { publicKey, listen: hash });
    await putChannel(HOST, secret, { publicKey, listen: null });
    await putChannel(HOST, secret, { publicKey });
    expect(puts.slice(-3)).toEqual([
      { pubkey: publicKey, listen: hash },
      { pubkey: publicKey, listen: null },
      { pubkey: publicKey }
    ]);
    // Not 32 bytes in canonical base64url: never sent.
    for (const listen of ["A".repeat(42), "A".repeat(43) + "=", `${"A".repeat(42)}B`, "token"]) {
      await expect(putChannel(HOST, secret, { publicKey, listen })).rejects.toThrow();
    }
  });
});

describe("the card socket", () => {
  it("is offered on Android, in both variants, with its module", () => {
    expect(cardSocketOffered()).toBe(true);
    build.variant = "production";
    expect(cardSocketOffered()).toBe(true);
    build.variant = "staging";
    jest.replaceProperty(Platform, "OS", "ios");
    expect(cardSocketOffered()).toBe(false);
    jest.replaceProperty(Platform, "OS", "android");
    // A binary built without the module (the module found, or not, as the app starts). Loading
    // React Native again sets its own `fetch` and `WebSocket`: the tests' ones are put back.
    const { fetch, WebSocket } = globalThis;
    const modules = globalThis.expo.modules as Record<string, unknown>;
    const linked = modules.CardSocket;
    delete modules.CardSocket;
    try {
      jest.isolateModules(() => {
        const isolated =
          jest.requireActual<typeof import("@/features/card/socket")>("../features/card/socket");
        expect(isolated.cardSocketOffered()).toBe(false);
      });
    } finally {
      modules.CardSocket = linked;
      Object.assign(globalThis, { fetch });
      Object.defineProperty(globalThis, "WebSocket", {
        value: WebSocket,
        configurable: true,
        writable: true
      });
    }
  });

  it("is on by default, Android having no push: no push token asked, the socket wakes the phone", async () => {
    expect(cardSocketOn()).toBe(true);
    // No push on Android: the token was never asked, no tap carries one.
    expect(notifications.notifications.tokenAsks).toBe(0);
    expect((await loadPushMarks()).get(cardId)).toBeNull();
    // The pairing told the card's channel the listening token's hash, and the service its relay.
    const hash = await cardSocketListenHash(HOST);
    expect(channel().listen).toBe(hash);
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    expect(cardSocketStatus()).toMatchObject({ running: true, notification: "shown" });
    expect(lastChannelSyncs().get(cardId)?.result).toMatchObject({ status: "ready" });
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toHaveLength(1);
  });

  it("turned off, then on again by its holder: the channel, the service and the card's pass follow", async () => {
    await socket(false);
    expect(cardSocketOn()).toBe(false);
    expect(channel().listen).toBeNull();
    // Nothing wakes the phone then: open-app mode only, said as such.
    expect(lastChannelSyncs().get(cardId)?.result).toMatchObject({ status: "noPush" });
    await socket(true);
    expect(cardSocketOn()).toBe(true);
    expect(cardSocketState.texts).toEqual({
      channelName: "Card connection",
      title: "Card payments enabled",
      text: "Connected to your cards' relay to pay with the app closed",
      stop: "Stop"
    });
    const hash = await cardSocketListenHash(HOST);
    expect(channel().listen).toBe(hash);
    expect(puts.at(-1)).toMatchObject({ listen: hash });
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    expect(cardSocketStatus()?.connections).toEqual([
      expect.objectContaining({ host: HOST, state: "open", opened: 1 })
    ]);
    // Something now wakes this phone, the app closed: the card's pass is kept for it.
    expect(cardSocketCovers([{ status: "active", relayHost: HOST } as never])).toBe(true);
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toHaveLength(1);
  });

  it("pays an approved merchant from the socket alone, the account closed, and journals it", async () => {
    await socket(true);
    closeAccount();
    const request = await posWithdraw(card.tap());
    // No push token: nothing went through Expo; the packet came on the socket.
    expect(relay.pushes).toEqual([]);
    expect(relay.socketWakes).toHaveLength(1);
    const { pr, proof } = merchantInvoice(12_500n);
    await expect(posCallback(request, pr, proof)).resolves.toEqual({ status: "OK" });
    await socketRuns();
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(500_000n - 12_500n - 3n);
    expect(currentCardPayment()?.getView()).toMatchObject({ phase: "sent" });
    const [wake] = await loadCardWakes();
    expect(wake).toMatchObject({ tapCheck: "cardRoot" });
    expect(Object.keys(wake)).not.toEqual(
      expect.arrayContaining(["via", "sentAt", "originalPriority", "priority"])
    );
    expect(wake.receivedAt).toEqual(expect.any(Number));
    expect(wake.steps.map(({ name }) => name)).toContain("taken");
    expect(cardSocketStatus()?.connections[0]).toMatchObject({ wakes: 1 });
  });

  it("refills a channel after a payment without asking the relay nor the Keystore anything more", async () => {
    await socket(true);
    const refill = async () => {
      // What the relay announced no longer known: as in the process a wake just started.
      resetRelayInfo();
      const asked = relay.requests.length;
      const put = puts.length;
      // The token unreadable: a refill that asked for it would note it.
      cardSocketState.tokenRefusal = "Keystore busy";
      try {
        const result = await withCardAccess(async (access) =>
          refillCardChannel(access, knownCardState(TEST_WALLET_ID, cardId)!, await loadDeviceKey())
        );
        // Neither `/v1/info` nor `PUT /v1/channel`: a refill tells the relay nothing of the socket.
        expect(relay.requests.slice(asked)).not.toContain("GET /v1/info");
        expect(puts).toHaveLength(put);
        expect(readLog().entries.map(({ event }) => event)).not.toContain(
          "Reading the card socket's listening token failed"
        );
        return result;
      } finally {
        cardSocketState.tokenRefusal = null;
      }
    };
    // The socket listens to its relay: the relay sends this phone its taps.
    expect(await refill()).toMatchObject({ status: "ready" });
    // Its state unreadable: the refill done all the same, said as not proven, and noted.
    cardSocketState.statusRefusal = "No React context";
    expect(await refill()).toMatchObject({ status: "noPush" });
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Reading the card socket's relays failed"
    );
    cardSocketState.statusRefusal = null;
    // Off: nothing wakes the phone, said as such.
    await socket(false);
    expect(await refill()).toMatchObject({ status: "noPush" });
  });

  it('its state unreadable at a sync: never told "off", the relay keeps the hash', async () => {
    const hash = await cardSocketListenHash(HOST);
    expect(channel().listen).toBe(hash);
    cardSocketState.statusRefusal = "State unreadable for now";
    await syncAccountCards("Card payments");
    // No `listen` sent: neither the hash nor null.
    expect(puts.at(-1)).not.toHaveProperty("listen");
    expect(channel().listen).toBe(hash);
    // The service keeps its relays: nothing given to it.
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    expect(readLog().entries.map(({ event }) => event)).toEqual(
      expect.arrayContaining([
        "Reading the card socket's state failed",
        "Giving the card socket its relays failed"
      ])
    );
    cardSocketState.statusRefusal = null;
  });

  it("asks no push token at a relay that announces other wakes either: the socket only", async () => {
    relay.wakes = ["alert", "data"];
    // Read again now: the app keeps what a relay announced for an hour.
    resetRelayInfo();
    await syncAccountCards("Card payments");
    closeAccount();
    await posWithdraw(card.tap());
    expect(notifications.notifications.tokenAsks).toBe(0);
    expect(relay.pushes).toEqual([]);
    expect(relay.socketWakes).toHaveLength(1);
  });

  it("turned off: the channel loses the hash, the service its relay, and the card's pass goes", async () => {
    await socket(true);
    await socket(false);
    expect(cardSocketOn()).toBe(false);
    expect(channel().listen).toBeNull();
    expect(cardSocketState.relays).toEqual([]);
    expect(cardSocketStatus()?.connections).toEqual([]);
    // Nothing else wakes this phone (Android has no push): a pass would serve nothing.
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toEqual([]);
    // A tap reaches the phone no more on the socket.
    await posWithdraw(card.tap());
    expect(relay.socketWakes).toEqual([]);
  });

  it("listens to no relay that does not serve /v1/listen, and tells it nothing", async () => {
    relay.listen = null;
    resetRelayInfo();
    const before = puts.length;
    await socket(true);
    expect(puts.slice(before).every((body) => !("listen" in body))).toBe(true);
    expect(cardSocketState.relays).toEqual([]);
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toEqual([]);
  });

  it('is forgotten with "Log out": stopped, its relays and tokens gone', async () => {
    await socket(false);
    const hash = await cardSocketListenHash(HOST);
    await wipeDevice();
    // Back to the default (on) for the next account, nothing to listen to until then.
    expect(cardSocketState.enabled).toBe(true);
    expect(cardSocketState.relays).toEqual([]);
    expect(cardSocketStatus()?.running).toBe(false);
    expect(await cardSocketListenHash(HOST)).not.toBe(hash);
  });

  it("listens to a new card's relay from its pairing on, without waiting for the next sync", async () => {
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    const other = addRelay(OTHER);
    other.listen = { heartbeatSeconds: 300 };
    nfc.holdCard(new FakeNtag424("04112233445566"));
    await pairCard({
      relayHost: OTHER,
      channelName: "Card payments",
      messages: { alert: "Hold the card to the phone" }
    });
    expect(cardSocketState.relays).toHaveLength(2);
    expect(cardSocketState.relays).toEqual(
      expect.arrayContaining([
        { host: OTHER, heartbeatSeconds: 300 },
        { host: HOST, heartbeatSeconds: 240 }
      ])
    );
    expect(other.listeners.has(await cardSocketListenHash(OTHER))).toBe(true);
    expect(cardSocketStatus()?.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: OTHER, state: "open" }),
        expect.objectContaining({ host: HOST, state: "open" })
      ])
    );
  });

  it("while it listens to every card's relay, the app shown reads no pending packets every 5 s", async () => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const reads = () => relay.requests.filter((r) => r === "GET /v1/channel/pending").length;
      const { unmount } = await renderHook(() => useCardWakes(TEST_WALLET_ID));
      await act(() => jest.advanceTimersByTimeAsync(0));
      // Read once as it comes to the foreground, then never while the connection is open.
      const before = reads();
      await act(() => jest.advanceTimersByTimeAsync(15_000));
      expect(reads()).toBe(before);
      // The connection drops (a network change): read again until it is back.
      cardSocketState.connections.get(HOST)!.state = "waiting";
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(reads()).toBe(before + 1);
      cardSocketState.connections.get(HOST)!.state = "open";
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(reads()).toBe(before + 1);
      // Its state unreadable: read as without it, never left unread.
      cardSocketState.statusRefusal = "No React context";
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(reads()).toBe(before + 2);
      expect(readLog().entries.map(({ event }) => event)).toContain(
        "Reading whether the card socket listens failed"
      );
      cardSocketState.statusRefusal = null;
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it("moved to another relay with its card: the new one listened to at once, the former no longer", async () => {
    await socket(true);
    const other = addRelay(OTHER);
    other.listen = { heartbeatSeconds: 240 };
    await reprogramCard(cardId, {
      relayHost: OTHER,
      messages: { alert: "Hold the card to the phone" },
      channelName: "Card payments"
    });
    expect(cardSocketState.relays).toEqual([{ host: OTHER, heartbeatSeconds: 240 }]);
    expect(relay.listeners.size).toBe(0);
    expect(other.listeners.has(await cardSocketListenHash(OTHER))).toBe(true);
  });

  it("listens no longer to the relay of a card deleted on the web app, from the next sync", async () => {
    await socket(true);
    expect(relay.listeners.size).toBe(1);
    await deletedElsewhere(TEST_WALLET_ID, cardId);
    await syncAccountCards("Card payments");
    expect(cardSocketState.relays).toEqual([]);
    expect(relay.listeners.size).toBe(0);
    expect(cardSocketStatus()?.running).toBe(false);
  });

  it("listens no longer to the relay of a card deleted, at once", async () => {
    await socket(true);
    // A deletion waits for the card's wallet to be empty.
    sdk.fakeCardWallet(cardId).balanceSats = 0n;
    await deleteCard(cardId, { inHand: { messages: { alert: "Hold the card to the phone" } } });
    expect(cardSocketState.relays).toEqual([]);
    expect(relay.listeners.size).toBe(0);
  });

  it("listens to a migrated v2 card's relay from its re-encoding on, without waiting for the next sync", async () => {
    await socket(true);
    await deletedElsewhere(TEST_WALLET_ID, cardId);
    await syncAccountCards("Card payments");
    expect(cardSocketState.relays).toEqual([]);
    // A v2 card, programmed with the v2 keys, which only the v2 server holds
    // (src/lib/card/legacy-reset.ts).
    const v2Keys = {
      master: hexToBytes("000102030405060708090a0b0c0d0e0f"),
      meta: hexToBytes("0f0e0d0c0b0a09080706050403020100"),
      file: hexToBytes("a0a1a2a3a4a5a6a7a8a9aaabacadaeaf")
    };
    addLegacyServer("api.swiss-bitcoin-pay.ch").v2Keys = v2Keys;
    const uid = "04aabbccddeeff";
    nfc.holdCard(legacyNtag424({ uid, host: "api.swiss-bitcoin-pay.ch", ...v2Keys }));
    const migrated = await withCardAccess(async (access) => cardIdOf(access.root, hexToBytes(uid)));
    // Its balance already drained (or none): only its erase and re-encoding remain.
    await reprogramLegacyCard(
      { url: "", p: "", c: "", uid, cardId: migrated },
      { channelName: "Card payments", messages: { alert: "Hold the card to the phone" } }
    );
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    expect(relay.listeners.has(await cardSocketListenHash(HOST))).toBe(true);
  });

  it("keeps listening to a relay that cannot tell, and the card's pass with it", async () => {
    await socket(true);
    // Offline (or the relay restarting), once what it announced is no longer trusted.
    resetRelayInfo();
    relay.unreachable = true;
    await syncAccountCards("Card payments");
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    expect(cardSocketStatus()?.running).toBe(true);
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toHaveLength(1);
    // Its answer, not its silence, takes it out.
    relay.unreachable = false;
    relay.listen = null;
    resetRelayInfo();
    await syncAccountCards("Card payments");
    expect(cardSocketState.relays).toEqual([]);
    expect((await loadCardPasses(TEST_WALLET_ID)).passes).toEqual([]);
  });

  it("a listening token unreadable for now: the channel syncs all the same, the hash kept", async () => {
    await socket(true);
    const hash = await cardSocketListenHash(HOST);
    cardSocketState.tokenRefusal = "Keystore busy";
    const results = await syncAccountCards("Card payments");
    expect(results.get(cardId)).toMatchObject({ status: "noPush" });
    // No `listen` sent: the relay keeps the hash it had.
    expect(puts.at(-1)).not.toHaveProperty("listen");
    expect(channel().listen).toBe(hash);
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Reading the card socket's listening token failed"
    );
  });

  it("turned on while a sync runs: its channel learns the hash all the same", async () => {
    await socket(false);
    let release = () => undefined as void;
    holdPuts = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A sync of the app (back in the foreground) tells the relay the socket is off…
    const before = syncAccountCards("Card payments");
    await waitForPut();
    expect(puts.at(-1)).toMatchObject({ listen: null });
    // …while its holder turns it on.
    const switched = switchCardSocket(true, i18n.t);
    holdPuts = null;
    release();
    await before;
    await switched;
    const hash = await cardSocketListenHash(HOST);
    expect(puts.at(-1)).toMatchObject({ listen: hash });
    expect(channel().listen).toBe(hash);
    expect(relay.listeners.has(hash)).toBe(true);
  });

  it("starts its service again where it should run and does not, never where it is off", async () => {
    await socket(true);
    // Running: left as it is.
    const configures = cardSocketState.configures;
    await resumeCardSocket();
    expect(cardSocketState.configures).toBe(configures);
    cardSocketState.serviceDown = true;
    expect(cardSocketStatus()?.running).toBe(false);
    await resumeCardSocket();
    expect(cardSocketStatus()?.running).toBe(true);
    expect(cardSocketState.relays).toEqual([{ host: HOST, heartbeatSeconds: 240 }]);
    await socket(false);
    cardSocketState.serviceDown = true;
    await resumeCardSocket();
    expect(cardSocketState.serviceDown).toBe(true);
    // Its state unreadable: noted, never a rejection (the app calls it without waiting).
    cardSocketState.statusRefusal = "No React context";
    await expect(resumeCardSocket()).resolves.toBeUndefined();
    expect(readLog().entries.map(({ event }) => event)).toContain(
      "Starting the card socket again failed"
    );
    cardSocketState.statusRefusal = null;
  });

  it("is started again as the app comes back to the foreground, before any card sync", async () => {
    await socket(true);
    const listeners = new Set<(state: AppStateStatus) => void>();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      const changed = listener as (state: AppStateStatus) => void;
      if (type === "change") listeners.add(changed);
      return { remove: () => listeners.delete(changed) } as ReturnType<
        typeof AppState.addEventListener
      >;
    });
    const hook = await renderHook(() => useCardSync());
    cardSocketState.serviceDown = true;
    for (const listener of [...listeners]) listener("active");
    await Promise.resolve();
    expect(cardSocketState.serviceDown).toBe(false);
    hook.unmount();
  });

  it("defines its task as the bundle starts", () => {
    expect(CARD_SOCKET_TASK).toBe("card-socket-wake");
    expect(taskManager.isTaskDefined(CARD_SOCKET_TASK)).toBe(true);
  });
});

describe("a socket's wake payload", () => {
  const packet = { epk: "A".repeat(87), iv: "B".repeat(16), ct: "C".repeat(40) };

  it("is read as the service gives it", () => {
    expect(
      socketWakeOf({ packet: JSON.stringify(packet), receivedAt: 1_792_000_000_000, relay: HOST })
    ).toEqual({ packet, receivedAt: 1_792_000_000_000 });
  });

  it("is dropped out of shape, nothing journaled nor paid", async () => {
    for (const payload of [
      null,
      "text",
      { packet, receivedAt: 1 },
      { packet: "{not json", receivedAt: 1 },
      { packet: "42", receivedAt: 1 },
      { packet: JSON.stringify(packet), receivedAt: 0 },
      { packet: JSON.stringify(packet), receivedAt: 1.5 },
      { packet: JSON.stringify(packet), receivedAt: "now" },
      { packet: "x".repeat(4097), receivedAt: 1 }
    ]) {
      expect(socketWakeOf(payload)).toBeNull();
      await runCardSocketWake(payload);
    }
    expect(await loadCardWakes()).toEqual([]);
    expect(currentCardPayment()).toBeNull();
  });

  it("a packet that does not open with the device's key: not taken", async () => {
    await socket(true);
    const state = AppState as unknown as { currentState: unknown };
    state.currentState = "background";
    await runCardSocketWake({
      packet: JSON.stringify(packet),
      receivedAt: Date.now(),
      relay: HOST
    });
    const [wake] = await loadCardWakes();
    expect(wake).toMatchObject({ steps: [expect.objectContaining({ name: "notTaken" })] });

    expect(currentCardPayment()).toBeNull();
  });
});

describe("the native module's names (modules/card-socket)", () => {
  // Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
  const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
  const { readFileSync } = jest.requireActual<{
    readFileSync(path: string, encoding: string): string;
  }>("fs");
  const source = (file: string) =>
    readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "modules",
        "card-socket",
        "android",
        "src",
        "main",
        "java",
        "me",
        "sattle",
        "cardsocket",
        file
      ),
      "utf8"
    );

  it("never change: installed phones keep their state, key, channel and task under them", () => {
    // Renamed, every phone's socket would turn off and leave its former state behind.
    const store = source("CardSocketStore.kt");
    expect(store).toContain('private const val DIR_NAME = "card-socket"');
    expect(store).toContain('private const val FILE_NAME = "state.json"');
    expect(store).toContain('private const val KEY_ALIAS = "card-socket-tokens"');
    // The holder's settings of the notification's channel are kept under its id.
    expect(source("CardSocketService.kt")).toContain('const val CHANNEL_ID = "card-socket"');
    // expo-task-manager keeps the consumer's class name with the registered task.
    expect(source("CardSocketTaskConsumer.kt")).toMatch(
      /^package me\.sattle\.cardsocket\n[\s\S]*\nclass CardSocketTaskConsumer\(/
    );
  });
});
