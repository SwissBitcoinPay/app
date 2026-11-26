// A card's wallet in the iOS extension's engine (src/lib/engine/wallet.ts, card-wallet.ts) over a
// fake of the Breez SDK its host gives (jest/engine-breez.ts): the same `Wallet` the card payment
// core uses in the app, a Lightning invoice paid exactly, everything out of shape refused.
import type { CardAccess } from "@/features/card/states";
import { SendError, WalletError } from "@/lib/breez/errors";
import type { SendQuote, Wallet } from "@/lib/breez/types";
import type { CardPass } from "@/lib/card/card-pass";
import { walletPhraseOf } from "@/lib/card/keys";
import { engineCardWalletStorage, leaseEngineCardWallet } from "@/lib/engine/card-wallet";
import type { HostPayment } from "@/lib/engine/host";
import {
  engineProbeSeed,
  engineSeed,
  engineWallet,
  readHostParsed,
  readHostPayment
} from "@/lib/engine/wallet";
import { PROBE_WALLET_STORAGE, runEngineWalletProbe } from "@/lib/engine/wallet-probe";

import {
  PROBE_WALLET,
  fakeBreez,
  fakeBreezWallet,
  fakePreimage,
  type FakeBreez,
  type FakeBreezWallet
} from "../../jest/engine-breez";
import { fakeEngineHost, type FakeEngineHost } from "../../jest/engine-host";
import { encodeLnurl, makeInvoice } from "../../jest/lightning";

const MNEMONIC = "words of the test wallet";
const STORAGE = "breez-sdk-spark-cards/test/1";

// The build's settings as the extension reads them: its host's (the engine's shim).
jest.mock("expo-constants", () => jest.requireActual("@/lib/engine/shims/expo-constants"));

const scope = globalThis as { __sattlemeHost?: unknown };
let host: FakeEngineHost;
let breez: FakeBreez;
let funds: FakeBreezWallet;

beforeEach(() => {
  breez = fakeBreez();
  funds = fakeBreezWallet(7, 10_000n);
  breez.wallets.set(MNEMONIC, funds);
  host = fakeEngineHost((length) => new Array<number>(length).fill(1), {
    cardAppGroup: "group.example.cards",
    breezNetwork: "mainnet"
  });
  scope.__sattlemeHost = { ...host, breez };
});

afterEach(() => {
  host.stop();
  delete scope.__sattlemeHost;
});

function invoiceOf(sats: bigint, seed = 1, options: { network?: string; timestamp?: number } = {}) {
  const { paymentHash } = fakePreimage(seed);
  return makeInvoice({
    amountMsat: sats * 1000n,
    paymentHash,
    description: "Coffee",
    ...options
  });
}

async function connected(): Promise<Wallet> {
  const wallet = engineWallet(STORAGE, () => breez);
  await wallet.connect(engineSeed(MNEMONIC));
  return wallet;
}

async function quoteOf(wallet: Wallet, bolt11: string): Promise<SendQuote> {
  return wallet.prepareSend(await wallet.parseSendInput(bolt11), null);
}

describe("engineWallet", () => {
  it("connects the wallet of its words on its storage, its id and balance read", async () => {
    const wallet = await connected();
    expect(wallet.isConnected()).toBe(true);
    expect(breez.live()).toEqual([
      expect.objectContaining({ mnemonic: MNEMONIC, storage: STORAGE })
    ]);
    await expect(wallet.getId()).resolves.toBe(funds.identityPubkey);
    await expect(wallet.getBalance(true)).resolves.toBe(10_000n);
  });

  it("pays a Lightning invoice of its exact amount, its fee on top, its preimage read back", async () => {
    const { preimage, paymentHash } = fakePreimage(1);
    funds.preimages.set(paymentHash, preimage);
    const wallet = await connected();
    const bolt11 = invoiceOf(1234n);
    const destination = await wallet.parseSendInput(`lightning:${bolt11}`);
    expect(destination).toEqual(
      expect.objectContaining({
        kind: "bolt11",
        request: bolt11,
        amountSats: 1234n,
        description: "Coffee"
      })
    );
    const quote = await wallet.prepareSend(destination, null);
    expect(quote).toEqual(
      expect.objectContaining({
        kind: "bolt11",
        amountSats: 1234n,
        fees: { onchain: false, feeSats: 2n },
        expiresAt: null
      })
    );
    const sent = await wallet.sendPrepared(quote, { speed: "fast", idempotencyKey: "k-1" });
    expect(sent).toEqual({ id: "pay-k-1", status: "completed" });
    expect(funds.balanceSats).toBe(10_000n - 1236n);
    await expect(wallet.getPayment("pay-k-1")).resolves.toEqual(
      expect.objectContaining({
        direction: "send",
        status: "completed",
        amountSats: 1234n,
        feeSats: 2n,
        network: "lightning",
        paymentHash,
        preimage
      })
    );
  });

  it("sends once per idempotency key", async () => {
    const wallet = await connected();
    const quote = await quoteOf(wallet, invoiceOf(100n));
    const options = { speed: "fast" as const, idempotencyKey: "same" };
    const first = await wallet.sendPrepared(quote, options);
    const again = await wallet.sendPrepared(quote, options);
    expect(again).toEqual(first);
    expect(first.status).toBe("pending");
    expect(funds.balanceSats).toBe(10_000n - 102n);
  });

  it("gives the host the completion timeout, none to wait for when `untilSent`", async () => {
    const send = jest.spyOn(breez, "send");
    const wallet = await connected();
    const quote = await quoteOf(wallet, invoiceOf(100n));
    await wallet.sendPrepared(quote, { speed: "fast", idempotencyKey: "a" });
    await wallet.sendPrepared(quote, { speed: "fast", idempotencyKey: "b", untilSent: true });
    expect(send.mock.calls.map((call) => [call[3], call[4]])).toEqual([
      [false, 20],
      [true, 20]
    ]);
  });

  it("never gives `parse` what is not a Lightning invoice: its server would be asked", async () => {
    const parse = jest.spyOn(breez, "parse");
    const wallet = await connected();
    for (const input of [
      "alice@example.com",
      encodeLnurl("https://example.com/lnurlp/alice"),
      "lnurlp://example.com/alice",
      "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
    ]) {
      await expect(wallet.parseSendInput(input)).rejects.toEqual(
        expect.objectContaining({ code: "unsupported" })
      );
    }
    await expect(wallet.parseSendInput("  ")).rejects.toEqual(
      expect.objectContaining({ code: "unrecognized" })
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses an invoice the SDK read as another one, or as something else", async () => {
    const wallet = await connected();
    const bolt11 = invoiceOf(100n);
    const other = invoiceOf(100n, 2);
    breez.parsed = () => readParsedOf(other);
    await expect(wallet.parseSendInput(bolt11)).rejects.toEqual(
      expect.objectContaining({ code: "unsupported" })
    );
    breez.parsed = () => ({ tag: "other" });
    await expect(wallet.parseSendInput(bolt11)).rejects.toEqual(
      expect.objectContaining({ code: "unsupported" })
    );
    breez.fail.parse = "garbage";
    await expect(wallet.parseSendInput(bolt11)).rejects.toBeInstanceOf(SendError);
  });

  it("refuses an invoice of another network, or expired", async () => {
    const wallet = await connected();
    await expect(wallet.parseSendInput(invoiceOf(100n, 1, { network: "bcrt" }))).rejects.toEqual(
      expect.objectContaining({ code: "otherNetwork" })
    );
    const old = invoiceOf(100n, 1, { timestamp: Math.floor(Date.now() / 1000) - 7200 });
    await expect(wallet.parseSendInput(old)).rejects.toEqual(
      expect.objectContaining({ code: "expired" })
    );
  });

  it("refuses a quote of another amount, fees included, or another method", async () => {
    const wallet = await connected();
    const destination = await wallet.parseSendInput(invoiceOf(100n));
    for (const change of [
      { amountSats: "99" },
      { feesExcluded: false },
      { method: "other" },
      { lightningFeeSats: "-1" },
      { amountSats: 100 }
    ]) {
      breez.quoted = (quote) => ({ ...quote, ...change });
      await expect(wallet.prepareSend(destination, null)).rejects.toEqual(
        expect.objectContaining({ code: "requestFailed" })
      );
    }
  });

  it("pays only an invoice of its own amount", async () => {
    const wallet = await connected();
    const { paymentHash } = fakePreimage(1);
    const destination = await wallet.parseSendInput(makeInvoice({ paymentHash }));
    await expect(wallet.prepareSend(destination, 100n)).rejects.toEqual(
      expect.objectContaining({ code: "unavailable" })
    );
  });

  it("sends no quote of a former connection", async () => {
    const wallet = await connected();
    const quote = await quoteOf(wallet, invoiceOf(100n));
    await wallet.disconnect();
    await wallet.connect(engineSeed(MNEMONIC));
    // The new instance's own quote, of the same id.
    expect((await quoteOf(wallet, invoiceOf(200n))).prepared).toEqual(
      expect.objectContaining({ quoteId: "quote-1" })
    );
    await expect(
      wallet.sendPrepared(quote, { speed: "fast", idempotencyKey: "k" })
    ).rejects.toEqual(expect.objectContaining({ code: "requestFailed" }));
    expect(funds.balanceSats).toBe(10_000n);
  });

  it("tells a sync only once the SDK told its `Synced`, one told early included", async () => {
    const wallet = await connected();
    let synced = false;
    void wallet.waitNetworkSync().then(() => {
      synced = true;
    });
    await settle();
    expect(synced).toBe(false);
    breez.tellSynced(breez.live()[0].id);
    await settle();
    expect(synced).toBe(true);

    await wallet.disconnect();
    const connect = breez.connect;
    breez.connect = (mnemonic, storage, onSynced, done) =>
      connect(mnemonic, storage, onSynced, (id, error) => {
        // Told before the connection answered.
        onSynced();
        done(id, error);
      });
    await wallet.connect(engineSeed(MNEMONIC));
    await expect(wallet.waitNetworkSync()).resolves.toBeUndefined();
  });

  it("disconnects, then lets the SDK's instance go; nothing is called on it after", async () => {
    const wallet = await connected();
    const [instance] = breez.live();
    await wallet.disconnect();
    expect(instance).toEqual(expect.objectContaining({ disconnected: true, released: true }));
    expect(wallet.isConnected()).toBe(false);
    await expect(wallet.getBalance(false)).rejects.toEqual(
      expect.objectContaining({ code: "notConnected" })
    );
  });

  it("lets the instance go when its disconnection fails", async () => {
    const wallet = await connected();
    const [instance] = breez.live();
    breez.fail.disconnect = "stuck";
    const release = jest.spyOn(breez, "release").mockImplementation(() => undefined);
    await expect(wallet.disconnect()).rejects.toThrow("stuck");
    expect(release).toHaveBeenCalledWith(instance.id);
  });

  it("fails to connect as `connectFailed`, holding nothing", async () => {
    const wallet = engineWallet(STORAGE, () => breez);
    breez.fail.connect = "offline";
    await expect(wallet.connect(engineSeed(MNEMONIC))).rejects.toEqual(
      expect.objectContaining({ code: "connectFailed" })
    );
    expect(wallet.isConnected()).toBe(false);
    await wallet.connect(engineSeed(MNEMONIC));
    expect(wallet.isConnected()).toBe(true);
  });

  it("reads a failed read of the SDK as `requestFailed`", async () => {
    const wallet = await connected();
    breez.fail.info = "offline";
    await expect(wallet.getBalance(true)).rejects.toEqual(
      expect.objectContaining({ code: "requestFailed" })
    );
    breez.fail.getPayment = "offline";
    await expect(wallet.getPayment("x")).rejects.toEqual(
      expect.objectContaining({ code: "requestFailed" })
    );
  });

  it("does nothing else a card payment does not use", async () => {
    const wallet = await connected();
    await expect(wallet.receiveInvoice(1n, "")).rejects.toEqual(
      new WalletError("unavailable", "Not done by the card's wallet in the extension")
    );
    await expect(wallet.listPaymentsPage()).rejects.toEqual(
      expect.objectContaining({ code: "unavailable" })
    );
    await expect(wallet.watchChanges(() => undefined)).rejects.toEqual(
      expect.objectContaining({ code: "unavailable" })
    );
  });
});

/** What the SDK's `parse` gives of `bolt11`, an invoice of 100 sats. */
function readParsedOf(bolt11: string) {
  return {
    tag: "bolt11" as const,
    bolt11,
    network: "bitcoin" as const,
    amountMsat: "100000",
    timestamp: String(Math.floor(Date.now() / 1000)),
    expiry: "3600",
    description: null
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe("readHostPayment", () => {
  const payment: HostPayment = {
    id: "p",
    type: "send",
    status: "completed",
    amount: "5",
    fees: "1",
    timestamp: "1700000000",
    method: "lightning",
    details: {
      tag: "lightning",
      description: null,
      lnAddress: null,
      senderComment: null,
      paymentHash: "aa",
      preimage: null
    }
  };

  it("reads the host's payment, its numbers exact", () => {
    expect(readHostPayment(payment)).toEqual({
      id: "p",
      type: "send",
      status: "completed",
      amount: 5n,
      fees: 1n,
      timestamp: 1700000000n,
      method: "lightning",
      details: {
        tag: "lightning",
        description: undefined,
        lnAddress: undefined,
        senderComment: undefined,
        paymentHash: "aa",
        preimage: undefined
      }
    });
    expect(readHostPayment({ ...payment, amount: "18446744073709551615" }).amount).toBe(
      18446744073709551615n
    );
  });

  it.each([
    ["an amount as a number", { amount: 5 }],
    ["a negative amount", { amount: "-5" }],
    ["a fraction", { fees: "1.5" }],
    ["a leading zero", { amount: "05" }],
    ["an unknown status", { status: "done" }],
    ["an unknown method", { method: "card" }],
    ["unknown details", { details: { tag: "magic" } }],
    ["details out of shape", { details: { tag: "lightning", paymentHash: 1 } }],
    ["no id", { id: undefined }]
  ])("refuses %s", (_, change) => {
    expect(() => readHostPayment({ ...payment, ...change })).toThrow(WalletError);
  });

  it("refuses what is no payment", () => {
    for (const value of [null, "p", [], 1]) expect(() => readHostPayment(value)).toThrow();
  });
});

describe("readHostParsed", () => {
  it("reads an invoice, none for another input, refuses the rest", () => {
    expect(readHostParsed({ tag: "other" })).toBeNull();
    expect(
      readHostParsed({
        tag: "bolt11",
        bolt11: "lnbc1",
        network: "bitcoin",
        amountMsat: null,
        timestamp: "1",
        expiry: "2",
        description: null
      })
    ).toEqual({
      bolt11: "lnbc1",
      network: "bitcoin",
      amountMsat: undefined,
      timestamp: 1n,
      expiry: 2n,
      description: undefined
    });
    expect(() => readHostParsed({ tag: "bolt12" })).toThrow(WalletError);
    expect(() =>
      readHostParsed({
        tag: "bolt11",
        bolt11: "lnbc1",
        network: "signet",
        amountMsat: null,
        timestamp: "1",
        expiry: "2"
      })
    ).toThrow(WalletError);
  });
});

describe("leaseEngineCardWallet", () => {
  const CARD_ID = "ab".repeat(16);

  const pass = (cardId = CARD_ID, walletGeneration = 1): CardPass => ({
    cardId,
    walletGeneration,
    uid: "04a39493cc8680",
    keyVersion: 1,
    relayHost: "relay.example.com",
    k1: new Uint8Array(16),
    k2: new Uint8Array(16),
    walletEntropy: new Uint8Array(16).fill(walletGeneration),
    channelSecret: new Uint8Array(32),
    ownSecret: new Uint8Array(32)
  });
  const card = { cardId: CARD_ID, walletGeneration: 1 };

  beforeEach(() => {
    breez.wallets.set(walletPhraseOf(new Uint8Array(16).fill(1)), funds);
  });

  it("connects the card's wallet with its pass, on the extension's storage of it", async () => {
    const lease = await leaseEngineCardWallet(pass(), card);
    expect(engineCardWalletStorage(CARD_ID, 1)).toBe(`breez-sdk-spark-cards/${CARD_ID}/1`);
    expect(breez.live()).toEqual([
      expect.objectContaining({
        mnemonic: walletPhraseOf(new Uint8Array(16).fill(1)),
        storage: `breez-sdk-spark-cards/${CARD_ID}/1`
      })
    ]);
    expect(lease).toEqual(
      expect.objectContaining({ cardId: CARD_ID, generation: 1, walletId: funds.identityPubkey })
    );
    await lease.release();
    expect(breez.live()).toEqual([]);
  });

  it("shares one instance between its leases, disconnected by the last one released", async () => {
    const [first, second] = await Promise.all([
      leaseEngineCardWallet(pass(), card),
      leaseEngineCardWallet(pass(), card)
    ]);
    expect(breez.instances.size).toBe(1);
    await first.release();
    await first.release();
    expect(breez.live()).toHaveLength(1);
    await second.release();
    expect(breez.live()).toEqual([]);
    const again = await leaseEngineCardWallet(pass(), card);
    expect(breez.live()).toHaveLength(1);
    await again.release();
  });

  it("pays with a pass only, of that very card's wallet", async () => {
    const access = { root: new Uint8Array(32) } as unknown as CardAccess;
    await expect(leaseEngineCardWallet(access, card)).rejects.toEqual(
      expect.objectContaining({ code: "unavailable" })
    );
    await expect(leaseEngineCardWallet(pass(CARD_ID, 2), card)).rejects.toThrow(
      "The pass of another card's wallet"
    );
    await expect(leaseEngineCardWallet(pass("cd".repeat(16)), card)).rejects.toThrow(
      "The pass of another card's wallet"
    );
    expect(breez.instances.size).toBe(0);
  });

  it("holds nothing when the wallet does not connect, and connects at the next lease", async () => {
    breez.fail.connect = "offline";
    await expect(leaseEngineCardWallet(pass(), card)).rejects.toEqual(
      expect.objectContaining({ code: "connectFailed" })
    );
    const lease = await leaseEngineCardWallet(pass(), card);
    expect(breez.live()).toHaveLength(1);
    await lease.release();
  });
});

describe("the probe's test wallet", () => {
  it("is connected by the host's own seed, given only to a probe's run", async () => {
    breez.wallets.set(PROBE_WALLET, funds);
    const wallet = engineWallet(PROBE_WALLET_STORAGE, () => breez);
    await wallet.connect(engineProbeSeed());
    expect(breez.live()).toEqual([
      expect.objectContaining({ mnemonic: PROBE_WALLET, storage: "probe" })
    ]);
    await wallet.disconnect();
    // Another run's host has none: no wallet.
    const { connectProbe: _, ...without } = breez;
    const other = engineWallet(PROBE_WALLET_STORAGE, () => without);
    await expect(other.connect(engineProbeSeed())).rejects.toEqual(
      expect.objectContaining({ code: "connectFailed" })
    );
  });
});

describe("runEngineWalletProbe", () => {
  const RUN = "3b241101-e2bb-4255-8caf-4136c566a962";

  beforeEach(() => {
    breez.wallets.set(PROBE_WALLET, funds);
  });

  const probe = (invoice: string, maxSats = 20) =>
    runEngineWalletProbe(
      host,
      invoice,
      RUN,
      maxSats,
      engineWallet(PROBE_WALLET_STORAGE, () => breez)
    );

  /** Tells `Synced` on each instance as soon as it is connected. */
  function syncing() {
    const connectProbe = breez.connectProbe;
    breez.connectProbe = (storage, synced, done) =>
      connectProbe(storage, synced, (id, error) => {
        done(id, error);
        if (id !== null) setTimeout(synced, 1);
      });
  }

  it("connects, syncs, pays the invoice as a card payment does, reads it, then disconnects", async () => {
    const { preimage, paymentHash } = fakePreimage(1);
    funds.preimages.set(paymentHash, preimage);
    syncing();
    const { steps } = await probe(invoiceOf(1n));
    expect(steps.map(({ name, ok, detail }) => [name, ok, detail])).toEqual([
      ["connect", true, "connected"],
      ["synced", true, "synced"],
      ["balance", true, "10000 sats"],
      ["pay", true, "1 sats, fee 2, completed"],
      ["payment", true, "completed, preimage present"],
      ["disconnect", true, "disconnected"]
    ]);
    expect(host.steps).toEqual(["connect", "synced", "balance", "pay", "payment", "disconnect"]);
    expect(funds.payments).toEqual([expect.objectContaining({ id: `pay-${RUN}` })]);
    expect(breez.live()).toEqual([]);
  });

  it("sends nothing over its bound, fee included", async () => {
    syncing();
    const { steps } = await probe(invoiceOf(19n), 20);
    expect(steps.find((step) => step.name === "pay")).toEqual(
      expect.objectContaining({ ok: false, detail: "Over what the test may send" })
    );
    expect(funds.payments).toEqual([]);
    expect(steps.map((step) => step.name)).toEqual([
      "connect",
      "synced",
      "balance",
      "pay",
      "disconnect"
    ]);
  });

  it("stops at its first failure, the wallet disconnected all the same", async () => {
    breez.fail.connectProbe = "no API key";
    const failed = await probe(invoiceOf(1n));
    expect(failed.steps.map(({ name, ok }) => [name, ok])).toEqual([
      ["connect", false],
      ["disconnect", true]
    ]);
    syncing();
    const { steps } = await probe("alice@example.com");
    expect(steps.find((step) => step.name === "pay")).toEqual(
      expect.objectContaining({ ok: false, detail: "Only a Lightning invoice is paid here" })
    );
    expect(breez.live()).toEqual([]);
  });

  it("tells a wallet that never syncs", async () => {
    jest.useFakeTimers();
    try {
      const done = probe(invoiceOf(1n));
      await jest.advanceTimersByTimeAsync(15_001);
      const { steps } = await done;
      expect(steps.map(({ name, ok, detail }) => [name, ok, detail])).toEqual([
        ["connect", true, "connected"],
        ["synced", false, "No sync within 15 s"],
        ["disconnect", true, "disconnected"]
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
