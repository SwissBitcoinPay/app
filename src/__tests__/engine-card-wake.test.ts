// A card's tap paid in the iOS notification service extension's engine (src/lib/engine/card-wake.ts),
// the app closed: the packet the relay pushed, the card payment core with the extension's ports
// (its own records, the app's shared data read only, the card's wallet over the host's Breez SDK).
// An approved merchant paid, anything its holder must approve handed over to the app, what no one
// may approve refused, nothing taken from a relay that does not hand sessions over.
import { Platform } from "react-native";

import * as cardConfig from "@/config/card";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount } from "@/features/account/session";
import { pairCard } from "@/features/card/pairing";
import { receiveCardWake, resetCardPayments } from "@/features/card/payments";
import { resetCardStates } from "@/features/card/states";
import { syncAccountCards } from "@/features/card/sync";
import { formatSats } from "@/features/wallet/send/amount";
import i18n from "@/i18n";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { walletSecret } from "@/lib/breez/seed";
import { markAppInFront } from "@/lib/card/app-front";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { readExtensionPayments, readExtensionTaps } from "@/lib/card/extension-records";
import { cardWalletPhrase, deriveCardRoot } from "@/lib/card/keys";
import { approveCardPayee } from "@/lib/card/payees";
import { loadCardPayments } from "@/lib/card/payment-log";
import { runEngineCardWake, type EngineWakeOutcome } from "@/lib/engine/card-wake";
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
import { fakeBreez, fakeBreezWallet, type FakeBreezWallet } from "../../jest/engine-breez";
import { fakeEngineHost, type FakeEngineHost } from "../../jest/engine-host";
import type * as FileSystemFake from "../../jest/expo-file-system";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
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
        cardAppGroup: "group.ch.swissbitcoinpay.checkout.staging.cards",
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

const GROUP = "group.ch.swissbitcoinpay.checkout.staging.cards";
const HOST = DEFAULT_CARD_RELAY_HOST;
const LAC = { username: "sattleme01", name: "Lakeside Bakery" };
const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const scope = globalThis as { __sattlemeHost?: unknown };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
/** The app's own French: what the engine's notification must read. */
const fr = i18n.getFixedT("fr");

let relay: FakeCardRelay;
let card: FakeNtag424;
let cardId: string;
let host: FakeEngineHost;
let funds: FakeBreezWallet;

/** An invoice of a merchant's Lightning address on breez.tips, with its proof. */
function merchantInvoice(
  sats: bigint,
  { seed = 1, username = LAC.username, name = LAC.name } = {}
) {
  const metadata = breezTipsMetadata(username, name);
  const { paymentHash, preimage } = preimagePair(seed);
  const pr = makeInvoice({
    amountMsat: sats * 1000n,
    paymentHash,
    descriptionHash: metadataHash(metadata),
    timestamp: Math.floor(Date.now() / 1000)
  });
  breezTips.invoices.set(paymentHash, { pr, settled: false });
  // What the card's wallet's payment releases, in the extension.
  funds.preimages.set(paymentHash, preimage);
  return { pr, proof: { metadata, verify: breezTipsVerifyUrl(paymentHash) } };
}

/** A tap at a point of sale: its withdraw request and the packet the relay pushed this phone. */
async function tap(): Promise<{ request: { callback: string; k1: string }; packet: unknown }> {
  const request = await posWithdraw(card.tap());
  return { request, packet: relay.pushes[relay.pushes.length - 1].data.cr };
}

function wake(packet: unknown, budgetMs = 30_000): Promise<EngineWakeOutcome> {
  return runEngineCardWake(packet, Date.now(), { language: "fr", budgetMs });
}

beforeEach(async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  // The extension pays: an iPhone keeps the cards' passes, the app writes its marker.
  jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", true);
  fileSystem.resetFileSystem();
  fileSystem.setSharedContainers([GROUP]);
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
  jest
    .mocked(signInWithPasskey)
    .mockReset()
    .mockResolvedValue({ seed: testSeed(), credentialId: null });
  relay = addRelay(HOST);
  relay.handOver = true;
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
  await approveCardPayee(
    TEST_WALLET_ID,
    { cardId, walletGeneration: 1 },
    { id: `${LAC.username}@breez.tips`, name: LAC.name },
    Date.now()
  );
  // The app's start sync: the push token sealed in the card's channel, its pass kept, its own copies.
  await syncAccountCards("Card payments");
  // The card's wallet in the extension: the host's Breez SDK.
  const breez = fakeBreez();
  funds = fakeBreezWallet(5, 500_000n);
  const root = deriveCardRoot(walletSecret(testSeed()));
  breez.wallets.set(cardWalletPhrase(root, cardId, 1), funds);
  host = fakeEngineHost((length) => new Array<number>(length).fill(7), {
    cardAppGroup: GROUP,
    breezNetwork: "mainnet"
  });
  scope.__sattlemeHost = { ...host, breez };
  // The app closed.
  closeAccount();
  resetCardStates();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  host.stop();
  delete scope.__sattlemeHost;
  resetCardPayments();
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  jest.restoreAllMocks();
});

describe("a card's tap in the extension's engine (card-wake.ts)", () => {
  it("pays an approved merchant from the card's wallet, its outcome in the extension's records", async () => {
    const { request, packet } = await tap();
    const { pr, proof } = merchantInvoice(12_500n);
    const [answer, outcome] = await Promise.all([posCallback(request, pr, proof), wake(packet)]);
    expect(answer).toEqual({ status: "OK" });
    expect(outcome).toEqual({
      outcome: "paid",
      amountSats: 12_500n,
      status: "completed",
      // The app's notice of a payment that left (card-notices.ts), in the holder's language.
      notice: {
        title: `Paiement par carte : ${formatSats(12_500n, "fr")}`,
        body: `${formatSats(12_500n, "fr")} pour ${fr("card.payee.quoted", { name: LAC.name })}`
      },
      // The packet left out: the app, opened from it, takes no session already answered.
      data: { kind: "cardPaid" }
    });
    expect(funds.balanceSats).toBe(500_000n - 12_500n - 2n);
    // Written by the extension, read by the app with its own.
    expect(readExtensionPayments()).toEqual([
      expect.objectContaining({ cardId, amountSats: 12_500n, outcome: "sent" })
    ]);
    expect(await loadCardPayments()).toEqual([
      expect.objectContaining({ cardId, outcome: "sent" })
    ]);
    expect(readExtensionTaps().get(cardId)).toMatchObject({ lastCounter: 2 });
    // Paid by the extension's own SDK instance: none of the app's was used.
    expect(sdk.fakeCardWallet(cardId).balanceSats).toBe(0n);
  });

  it("hands a payment its holder must approve over to the app, which takes the same tap", async () => {
    const { request, packet } = await tap();
    const { pr, proof } = merchantInvoice(800n, { username: "sattleme09", name: "New Coffee" });
    let answered = false;
    const answer = posCallback(request, pr, proof).then((result) => {
      answered = true;
      return result;
    });
    const outcome = await wake(packet);
    expect(outcome).toEqual({
      outcome: "handedOver",
      amountSats: 800n,
      notice: {
        title: "En attente : Paiement par carte",
        body: `${formatSats(800n, "fr")} pour ${fr("card.payee.quoted", { name: "New Coffee" })}. Cliquez pour confirmer, la caisse attend.`
      },
      // The packet kept: the app, opened from the notification, takes the session.
      data: null
    });
    expect(relay.handedOver).toBe(1);
    // Nothing paid, nothing answered: the point of sale still waits.
    expect(funds.balanceSats).toBe(500_000n);
    expect(answered).toBe(false);
    // The tap given back: the app takes it (never "already seen").
    expect(readExtensionTaps().has(cardId)).toBe(false);
    await openTestAccount({ usage: "card", signUp: "card" });
    // The same card's wallet, as the app's Breez SDK reads it.
    sdk.fakeCardWallet(cardId).balanceSats = 500_000n;
    const payment = await receiveCardWake(packet, Date.now(), TEST_WALLET_ID);
    expect(payment).not.toBeNull();
    for (let i = 0; i < 400 && payment!.getView().phase !== "ready"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const seen = payment!.getView();
    expect(seen.phase === "failed" ? seen.failure : seen.phase).toBe("ready");
    payment!.decline();
    await expect(answer).resolves.toMatchObject({ status: "ERROR" });
  });

  it("refuses what no one may approve, the point of sale told in the holder's language", async () => {
    const { request, packet } = await tap();
    // Above the card's ceiling per payment (20 000 sats by default).
    const { pr, proof } = merchantInvoice(25_000n);
    const [answer, outcome] = await Promise.all([posCallback(request, pr, proof), wake(packet)]);
    expect(outcome).toEqual({
      outcome: "refused",
      failure: "aboveLimit",
      // Refused as it was read: no amount told (its invoice is not one the card pays).
      amountSats: null,
      notice: {
        title: "Refusé : Paiement par carte",
        body: fr("card.payment.failure.aboveLimit")
      },
      data: { kind: "cardWake" }
    });
    expect(answer).toMatchObject({
      status: "ERROR",
      reason: "Montant au-dessus du plafond par paiement de la carte."
    });
    expect(funds.balanceSats).toBe(500_000n);
  });

  it("tells nothing of a session it never had: its packet is left to the app that took it", async () => {
    const { packet } = await tap();
    // The app, opened as the notification came, took the session first: the relay gives one
    // socket each session.
    await openTestAccount({ usage: "card", signUp: "card" });
    const taken = await receiveCardWake(packet, Date.now(), TEST_WALLET_ID);
    expect(taken).not.toBeNull();
    for (
      let i = 0;
      i < 400 && ![...relay.sessions.values()].some((session) => session.socket);
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    closeAccount();
    const outcome = await wake(packet);
    expect(outcome).toEqual({
      outcome: "refused",
      failure: "unreachable",
      amountSats: null,
      notice: null,
      data: null
    });
    expect(readExtensionPayments()).toEqual([]);
    expect(funds.balanceSats).toBe(500_000n);
    taken!.close();
  });

  it("hands over a payment it has no time left to send", async () => {
    const { request, packet } = await tap();
    const { pr, proof } = merchantInvoice(1_000n);
    const answer = posCallback(request, pr, proof);
    // Less than ENGINE_SEND_MIN_LEFT_MS: an approved merchant too waits for the app.
    const outcome = await wake(packet, 11_000);
    expect(outcome).toMatchObject({
      outcome: "handedOver",
      notice: {
        title: "En attente : Paiement par carte",
        body: expect.stringContaining(fr("card.payee.quoted", { name: LAC.name }))
      },
      data: null
    });
    expect(funds.balanceSats).toBe(500_000n);
    // The point of sale still waits, for the app.
    void answer;
  });

  it("takes nothing from a relay that does not hand sessions over, nor while the app is in front", async () => {
    relay.handOver = false;
    const first = await tap();
    await expect(wake(first.packet)).resolves.toEqual({
      outcome: "skipped",
      reason: "noHandOver",
      notice: null,
      data: null
    });
    relay.handOver = true;
    markAppInFront(Date.now());
    const second = await tap();
    await expect(wake(second.packet)).resolves.toEqual({
      outcome: "skipped",
      reason: "inFront",
      notice: null,
      data: null
    });
    expect(readExtensionTaps().size).toBe(0);
    expect(funds.balanceSats).toBe(500_000n);
  });

  it("takes no tap in a build whose extension does not pay cards", async () => {
    jest.replaceProperty(cardConfig, "IOS_EXTENSION_PAYS_CARDS", false);
    const { packet } = await tap();
    await expect(wake(packet)).resolves.toEqual({
      outcome: "skipped",
      reason: "off",
      notice: null,
      data: null
    });
    expect(readExtensionTaps().size).toBe(0);
  });

  it("takes no packet it cannot open, nor one older than a session", async () => {
    await expect(wake({ epk: "x", iv: "y", ct: "z" })).resolves.toEqual({
      outcome: "skipped",
      reason: "packet",
      notice: null,
      data: null
    });
    const { packet } = await tap();
    await expect(
      runEngineCardWake(packet, Date.now() - 3 * 60_000, { language: "fr", budgetMs: 30_000 })
    ).resolves.toEqual({ outcome: "skipped", reason: "packet", notice: null, data: null });
  });
});
