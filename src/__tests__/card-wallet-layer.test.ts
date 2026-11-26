import type * as SdkFake from "../../jest/breez-sdk";
import { TEST_MNEMONIC, testSeed } from "../../jest/account";
import { makeInvoice, preimagePair } from "../../jest/lightning";
import { encodeWalletSecret } from "../lib/breez/secret";
import type * as SeedModule from "../lib/breez/seed";
import type * as WalletModule from "../lib/breez/wallet";
import { decodeBolt11 } from "../lib/lightning/bolt11";
import { cardWalletPhrase, deriveCardRoot } from "../lib/card/keys";

/*
 * The card wallets of the wallet layer (a wallet of its own for each card):
 * each on its own SDK instance and storage, beside the account's, and the Spark transfers between
 * them (wallet.ts). The fake SDK keeps one state per wallet (jest/breez-sdk.ts).
 */

const BREEZ_SDK = "@breeztech/breez-sdk-spark-react-native";
const DOCUMENTS = "/data/user/0/ch.swissbitcoinpay.checkout.staging/files";

const ROOT = deriveCardRoot(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
/** The card of card-keys.test.ts, and another. */
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";

type SdkMock = Omit<typeof SdkFake, "connect"> & { connect: jest.Mock };

function load() {
  // Fresh module graph, so that each test starts with no wallet connected.
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
  }));
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
  return {
    ...(require("../lib/breez/wallet") as typeof WalletModule),
    ...(require("../lib/breez/seed") as typeof SeedModule),
    sdk: require(BREEZ_SDK) as SdkMock
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/** The card's wallet of `cardId`, connected with its words. */
async function connectCard(loaded: ReturnType<typeof load>, cardId: string = CARD) {
  const wallet = loaded.cardWallet(cardId, 1);
  await wallet.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, cardId, 1)));
  return wallet;
}

describe("the card wallets of the wallet layer", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("connects each card's wallet with its words, on its own storage, beside the account's", async () => {
    const loaded = load();
    await loaded.connectWallet(testSeed());
    const card = await connectCard(loaded);
    const other = await connectCard(loaded, OTHER_CARD);

    const storages = loaded.sdk.connect.mock.calls.map(
      ([request]) => (request as { storageDir: string }).storageDir
    );
    expect(storages).toEqual([
      `${DOCUMENTS}/breez-sdk-spark`,
      `${DOCUMENTS}/breez-sdk-spark-cards/${CARD}/1`,
      `${DOCUMENTS}/breez-sdk-spark-cards/${OTHER_CARD}/1`
    ]);
    const [, cardRequest] = loaded.sdk.connect.mock.calls.map(([request]) => request) as {
      seed: { tag: string; inner: { mnemonic: string; passphrase: unknown } };
    }[];
    expect(cardRequest!.seed).toMatchObject({
      tag: "Mnemonic",
      inner: { mnemonic: cardWalletPhrase(ROOT, CARD, 1), passphrase: undefined }
    });
    // Three wallets connected at once, each its own identity.
    expect([loaded.isWalletConnected(), card.isConnected(), other.isConnected()]).toEqual([
      true,
      true,
      true
    ]);
    await expect(loaded.getWalletId()).resolves.toBe(loaded.sdk.FAKE_IDENTITY_PUBKEY);
    await expect(card.getId()).resolves.toBe(
      loaded.sdk.fakeIdentityOf(cardWalletPhrase(ROOT, CARD, 1))
    );
    await expect(other.getId()).resolves.not.toBe(await card.getId());

    // A card's wallet disconnected: the account's stays.
    await card.disconnect();
    expect(card.isConnected()).toBe(false);
    expect(loaded.isWalletConnected()).toBe(true);
    expect(other.isConnected()).toBe(true);
  });

  it("gives one wallet per card and generation, and refuses an id out of shape", () => {
    const loaded = load();
    expect(loaded.cardWallet(CARD, 1)).toBe(loaded.cardWallet(CARD, 1));
    expect(loaded.cardWallet(CARD, 2)).not.toBe(loaded.cardWallet(CARD, 1));
    expect(loaded.cardWallet(OTHER_CARD, 1)).not.toBe(loaded.cardWallet(CARD, 1));
    for (const id of [CARD.toUpperCase(), `${CARD}/..`, "../breez-sdk-spark", ""]) {
      expect(() => loaded.cardWallet(id, 1)).toThrow(/card id/);
    }
    expect(() => loaded.cardWallet(CARD, 0)).toThrow(/generation/);
  });

  it("recharges a card's wallet from the account's by a free Spark transfer of that amount", async () => {
    const loaded = load();
    loaded.sdk.fakeWallet.balanceSats = BigInt(10_000);
    await loaded.connectWallet(testSeed());
    const card = await connectCard(loaded);
    const cardId = await card.getId();

    const quote = await loaded.prepareWalletTransfer(
      await card.getSparkAddress(),
      cardId,
      BigInt(2_500)
    );
    expect(quote).toMatchObject({
      walletId: cardId,
      amountSats: BigInt(2_500),
      feeSats: BigInt(0)
    });
    await expect(
      loaded.sendWalletTransfer(quote, "11111111-1111-4111-8111-111111111111")
    ).resolves.toMatchObject({ status: "completed" });
    // Sent again with the same key: paid once.
    await loaded.sendWalletTransfer(quote, "11111111-1111-4111-8111-111111111111");

    expect(loaded.sdk.fakeWallet.balanceSats).toBe(BigInt(7_500));
    // Claimed by the card's wallet at its next sync, as the SDK does.
    await expect(card.getBalance(false)).resolves.toBe(BigInt(0));
    await card.sync();
    await expect(card.getBalance(false)).resolves.toBe(BigInt(2_500));
    const { payments } = await card.listPaymentsPage();
    expect(payments).toEqual([
      expect.objectContaining({
        direction: "receive",
        amountSats: BigInt(2_500),
        network: "spark",
        status: "completed"
      })
    ]);
  });

  it("sends a card's balance back to the account's wallet, claimed there at its sync", async () => {
    const loaded = load();
    await loaded.connectWallet(testSeed());
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(4_200);

    const quote = await card.prepareTransfer(
      await loaded.getWalletSparkAddress(),
      loaded.sdk.FAKE_IDENTITY_PUBKEY,
      BigInt(4_200)
    );
    await card.sendTransfer(quote, "22222222-2222-4222-8222-222222222222");

    expect(loaded.sdk.fakeCardWallet(CARD).balanceSats).toBe(BigInt(0));
    expect(loaded.sdk.fakeWallet.balanceSats).toBe(BigInt(0));
    await loaded.syncWallet();
    await expect(loaded.getWalletBalance(false)).resolves.toBe(BigInt(4_200));
  });

  it("never prepares a transfer to a Spark address of another wallet, network or kind", async () => {
    const loaded = load();
    await loaded.connectWallet(testSeed());
    const card = await connectCard(loaded);
    const other = await connectCard(loaded, OTHER_CARD);
    const address = await card.getSparkAddress();
    const regtest = `sparkrt1${await card.getId()}`;
    loaded.sdk.fakeSend.inputs.set(regtest, {
      tag: loaded.sdk.InputType_Tags.SparkAddress,
      inner: [
        {
          address: regtest,
          identityPublicKey: await card.getId(),
          network: loaded.sdk.BitcoinNetwork.Regtest,
          source: {}
        }
      ]
    });
    const refusal = { name: "WalletError", code: "requestFailed" };

    // The address of another card's wallet than the one meant.
    await expect(
      loaded.prepareWalletTransfer(address, await other.getId(), BigInt(1_000))
    ).rejects.toMatchObject(refusal);
    // Another network's.
    await expect(
      loaded.prepareWalletTransfer(regtest, await card.getId(), BigInt(1_000))
    ).rejects.toMatchObject(refusal);
    // Not a Spark address, or nothing to send.
    await expect(
      loaded.prepareWalletTransfer("lnbc1nothing", await card.getId(), BigInt(1_000))
    ).rejects.toMatchObject(refusal);
    await expect(
      loaded.prepareWalletTransfer(address, await card.getId(), BigInt(0))
    ).rejects.toMatchObject(refusal);
    expect(loaded.sdk.fakeWallet.payments).toEqual([]);
  });

  it("refuses a transfer the SDK prepared for another amount (hard rule 3)", async () => {
    const loaded = load();
    await loaded.connectWallet(testSeed());
    const card = await connectCard(loaded);
    loaded.sdk.fakeSend.quotedAmount = BigInt(2_499);

    await expect(
      loaded.prepareWalletTransfer(await card.getSparkAddress(), await card.getId(), BigInt(2_500))
    ).rejects.toMatchObject({ name: "WalletError", code: "requestFailed" });
  });

  it("makes a card's wallet an invoice of exactly the amount asked, on this network", async () => {
    const loaded = load();
    const card = await connectCard(loaded);

    const invoice = await card.receiveInvoice(BigInt(12_345), "Card top-up");

    expect(decodeBolt11(invoice)).toMatchObject({
      network: "bc",
      amountMsat: BigInt(12_345_000),
      description: "Card top-up"
    });
    expect(loaded.sdk.fakeCardWallet(CARD).invoices).toEqual([invoice]);
    await expect(card.receiveInvoice(BigInt(0), "x")).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("makes an invoice payable for the time asked, refusing one the SDK made for another", async () => {
    const loaded = load();
    const card = await connectCard(loaded);
    const invoice = await card.receiveInvoice(BigInt(5_000), "Card top-up", 86_400);
    expect(decodeBolt11(invoice)?.expirySeconds).toBe(86_400);
    const [instance] = (await Promise.all(
      loaded.sdk.connect.mock.results.map((result) => result.value as Promise<unknown>)
    )) as { receivePayment: jest.Mock }[];
    expect(instance!.receivePayment).toHaveBeenLastCalledWith({
      paymentMethod: expect.objectContaining({
        inner: expect.objectContaining({ amountSats: BigInt(5_000), expirySecs: 86_400 })
      })
    });
    // Its default instead: refused, the holder would be told a wrong time.
    instance!.receivePayment.mockResolvedValueOnce({
      paymentRequest: makeInvoice({
        amountMsat: BigInt(5_000_000),
        paymentHash: preimagePair(11).paymentHash,
        expirySeconds: 30 * 86_400
      }),
      fee: BigInt(0)
    });
    await expect(card.receiveInvoice(BigInt(5_000), "x", 86_400)).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("refuses an invoice the SDK made for another amount or network", async () => {
    const loaded = load();
    const card = await connectCard(loaded);
    const [instance] = (await Promise.all(
      loaded.sdk.connect.mock.results.map((result) => result.value as Promise<unknown>)
    )) as { receivePayment: jest.Mock }[];
    const { paymentHash } = preimagePair(9);
    instance!.receivePayment
      .mockResolvedValueOnce({
        paymentRequest: makeInvoice({ amountMsat: BigInt(1_000), paymentHash }),
        fee: BigInt(0)
      })
      .mockResolvedValueOnce({
        paymentRequest: makeInvoice({ amountMsat: BigInt(2_000_000), network: "tb", paymentHash }),
        fee: BigInt(0)
      });

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(card.receiveInvoice(BigInt(2_000), "x")).rejects.toMatchObject({
        code: "requestFailed"
      });
    }
  });

  it("registers a card's own Lightning address, without describing it", async () => {
    const loaded = load();
    await loaded.connectWallet(testSeed());
    await loaded.getWalletLightningAddress(loaded.sdk.FAKE_IDENTITY_PUBKEY, "My Shop");
    const card = await connectCard(loaded);
    const cardId = await card.getId();

    const address = await card.getLightningAddress(cardId, undefined);

    expect(address).toBe(`sattleme${cardId.slice(0, 10)}@breez.tips`);
    // No description: the LNURL server's own ("Pay to …"), nothing of the account.
    expect(loaded.sdk.lightningAddresses.get(`sattleme${cardId.slice(0, 10)}`)).toBe(
      `Pay to sattleme${cardId.slice(0, 10)}@breez.tips`
    );
    // The account's address is still its own.
    await expect(
      loaded.getWalletLightningAddress(loaded.sdk.FAKE_IDENTITY_PUBKEY, "My Shop")
    ).resolves.toBe(`sattleme${loaded.sdk.FAKE_IDENTITY_PUBKEY.slice(0, 10)}@breez.tips`);
  });
});

describe("a card wallet's changes (its SDK's events)", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  /** A turn later: the SDK's callback has returned (watchChanges). */
  const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it("tells each change its SDK announces, once its callback returned, until stopped", async () => {
    const loaded = load();
    const card = await connectCard(loaded);
    const state = loaded.sdk.fakeCardWallet(CARD);
    const changed = jest.fn();
    const stop = await card.watchChanges(changed);
    expect(loaded.sdk.sdkListenerCount(state)).toBe(1);

    const { SdkEvent_Tags: tags } = loaded.sdk;
    // A payment received: the one its event carries, read as the wallet reads its payments.
    const paid = {
      id: "paid-1",
      paymentType: loaded.sdk.PaymentType.Receive,
      status: loaded.sdk.PaymentStatus.Completed,
      amount: BigInt(2_100),
      fees: BigInt(0),
      timestamp: BigInt(1_790_000_000),
      method: loaded.sdk.PaymentMethod.Spark,
      details: { tag: loaded.sdk.PaymentDetails_Tags.Spark, inner: { invoiceDetails: undefined } }
    };
    await loaded.sdk.emitSdkEvent(state, tags.PaymentSucceeded, paid);
    // Never while the SDK's callback runs.
    expect(changed).not.toHaveBeenCalled();
    await later();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "paid-1",
        direction: "receive",
        status: "completed",
        amountSats: BigInt(2_100),
        network: "spark",
        timestamp: 1_790_000_000
      })
    );
    // One out of shape (a timestamp beyond what a number holds exactly): a change, no payment.
    await loaded.sdk.emitSdkEvent(state, tags.PaymentSucceeded, {
      ...paid,
      timestamp: BigInt(2) ** BigInt(63)
    });
    await later();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenLastCalledWith(null);

    for (const tag of [
      tags.Synced,
      tags.PaymentPending,
      tags.PaymentFailed,
      tags.NewDeposits,
      tags.ClaimedDeposits,
      tags.UnclaimedDeposits
    ]) {
      await loaded.sdk.emitSdkEvent(state, tag);
    }
    await later();
    // Without a payment of its own to give (a pending or failed one is no payment received).
    expect(changed).toHaveBeenCalledTimes(8);
    expect(changed.mock.calls.slice(2).every(([payment]) => payment === null)).toBe(true);
    // What says nothing of its balance, payments or deposits.
    for (const tag of [tags.AutoOptimization, tags.LightningAddressChanged]) {
      await loaded.sdk.emitSdkEvent(state, tag);
    }
    await later();
    expect(changed).toHaveBeenCalledTimes(8);

    // Another wallet's events are not its own.
    await loaded.sdk.emitSdkEvent(
      loaded.sdk.fakeCardWallet(OTHER_CARD),
      tags.PaymentSucceeded,
      paid
    );
    await later();
    expect(changed).toHaveBeenCalledTimes(8);

    await stop();
    expect(loaded.sdk.sdkListenerCount(state)).toBe(0);
    await loaded.sdk.emitSdkEvent(state, tags.PaymentSucceeded, paid);
    await later();
    expect(changed).toHaveBeenCalledTimes(8);
  });

  it("stops with its disconnection, its stop then doing nothing nor leaving a failure", async () => {
    const loaded = load();
    const card = await connectCard(loaded);
    const state = loaded.sdk.fakeCardWallet(CARD);
    const stop = await card.watchChanges(jest.fn());
    await card.disconnect();
    expect(loaded.sdk.sdkListenerCount(state)).toBe(0);
    await expect(stop()).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the same module graph
    const { readLog } = require("../lib/log/log") as typeof import("../lib/log/log");
    expect(readLog().entries.map((entry) => entry.event)).not.toContain(
      "Removing a wallet's listener failed"
    );
  });

  it("refuses to listen to a wallet not connected", async () => {
    const loaded = load();
    await expect(loaded.cardWallet(CARD, 1).watchChanges(jest.fn())).rejects.toMatchObject({
      code: "notConnected"
    });
  });
});

describe("Log out", () => {
  it("removes the card wallets' storage with the account's (wipeDevice)", async () => {
    /* eslint-disable @typescript-eslint/no-require-imports -- the fakes of jest.setup.ts */
    const fileSystem =
      jest.requireMock<typeof import("../../jest/expo-file-system")>("expo-file-system");
    const { wipeDevice } =
      require("../features/settings/device-wipe") as typeof import("../features/settings/device-wipe");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const cardDirectory = new fileSystem.Directory(
      fileSystem.Paths.document,
      "breez-sdk-spark-cards",
      CARD,
      "1"
    );
    cardDirectory.create({ intermediates: true });
    new fileSystem.File(cardDirectory, "storage.sql").writeSync("a card's wallet state");

    await wipeDevice();

    expect(
      new fileSystem.Directory(fileSystem.Paths.document, "breez-sdk-spark-cards").exists
    ).toBe(false);
    expect([...fileSystem.files.keys()].some((uri) => uri.includes("breez-sdk-spark-cards"))).toBe(
      false
    );
  });
});

/*
 * "Empty the card" of a card holder's card (a card holder has no main balance): the
 * card's whole balance to a Lightning address or a Bitcoin address, the fees taken from it (the
 * SDK's FeesIncluded, as spark-sdk 0.28.4 does it: jest/breez-sdk.ts), so that nothing is left.
 */
describe("a card wallet's drain", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  const ADDRESS = "bakehouse@wallet.example";
  const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";
  const INVOICE = "lnbc1pfakeamountless";

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  function inputs(loaded: ReturnType<typeof load>) {
    const { sdk } = loaded;
    sdk.resetFakeWallet();
    sdk.resetFakeSend();
    const payRequest = {
      callback: "https://wallet.example/lnurlp/bakehouse/callback",
      minSendable: BigInt(1000),
      maxSendable: BigInt(500_000_000_000),
      metadataStr: "[]",
      commentAllowed: 0,
      domain: "wallet.example",
      url: "https://wallet.example/.well-known/lnurlp/bakehouse",
      address: ADDRESS,
      allowsNostr: undefined,
      nostrPubkey: undefined
    };
    sdk.fakeSend.inputs.set(ADDRESS, {
      tag: sdk.InputType_Tags.LightningAddress,
      inner: [{ address: ADDRESS, payRequest }]
    });
    sdk.fakeSend.inputs.set(BTC_ADDRESS, {
      tag: sdk.InputType_Tags.BitcoinAddress,
      inner: [{ address: BTC_ADDRESS, network: sdk.BitcoinNetwork.Bitcoin, source: {} }]
    });
    sdk.fakeSend.inputs.set(INVOICE, {
      tag: sdk.InputType_Tags.Bolt11Invoice,
      inner: [
        {
          amountMsat: undefined,
          description: "",
          descriptionHash: undefined,
          expiry: BigInt(3600),
          invoice: { bolt11: INVOICE, source: {} },
          minFinalCltvExpiryDelta: BigInt(18),
          network: sdk.BitcoinNetwork.Bitcoin,
          payeePubkey: "02ab",
          paymentHash: "9c1f",
          paymentSecret: "00",
          routingHints: [],
          timestamp: BigInt(Math.floor(Date.now() / 1000) - 60)
        }
      ]
    });
  }

  it("sends a Lightning address the whole balance less its fee, and leaves nothing", async () => {
    const loaded = load();
    inputs(loaded);
    loaded.sdk.fakeSend.lightningFeeSats = BigInt(7);
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(12_000);

    const destination = await card.parseSendInput(ADDRESS);
    const quote = await card.prepareDrain(destination, BigInt(12_000));
    expect(quote).toMatchObject({
      kind: "lightningAddress",
      totalSats: BigInt(12_000),
      fees: { onchain: false, feeSats: BigInt(7), receivedSats: BigInt(11_993) }
    });
    const sent = await card.sendPrepared(quote, {
      speed: "medium",
      idempotencyKey: "4b5d0c1e-2f3a-4b6c-8d7e-9f0a1b2c3d4e"
    });
    expect(sent.status).toBe("completed");
    expect(loaded.sdk.fakeCardWallet(CARD).balanceSats).toBe(BigInt(0));
    // Sent with the fees taken from the whole.
    const [prepared] = (
      loaded.sdk.fakeCardWallet(CARD).payments as { amount: bigint; fees: bigint }[]
    ).slice(0, 1);
    expect(prepared).toMatchObject({ amount: BigInt(11_993), fees: BigInt(7) });
    await card.disconnect();
  });

  it("sends a Bitcoin address the whole balance less the chosen speed's fee", async () => {
    const loaded = load();
    inputs(loaded);
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(50_000);

    const destination = await card.parseSendInput(BTC_ADDRESS);
    const quote = await card.prepareDrain(destination, BigInt(50_000));
    // The fake's fees: 1 840 (fast), 1 240 (medium), 740 (slow).
    expect(quote).toMatchObject({
      kind: "bitcoinAddress",
      totalSats: BigInt(50_000),
      fees: {
        onchain: true,
        bySpeed: { fast: BigInt(1840), medium: BigInt(1240), slow: BigInt(740) }
      }
    });
    await card.sendPrepared(quote, {
      speed: "slow",
      idempotencyKey: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    });
    expect(loaded.sdk.fakeCardWallet(CARD).balanceSats).toBe(BigInt(0));
    const [payment] = loaded.sdk.fakeCardWallet(CARD).payments as { amount: bigint }[];
    expect(payment!.amount).toBe(BigInt(49_260));
    await card.disconnect();
  });

  it("sends a Spark address the whole balance by a free transfer, never one with a fee", async () => {
    const loaded = load();
    inputs(loaded);
    const card = await connectCard(loaded);
    const wallet = loaded.sdk.fakeCardWallet(CARD);
    wallet.balanceSats = BigInt(8_000);
    const destination = await card.parseSendInput(
      loaded.sdk.fakeSparkAddress(`02${"ab".repeat(32)}`)
    );
    const quote = await card.prepareDrain(destination, BigInt(8_000));
    expect(quote).toMatchObject({
      kind: "sparkAddress",
      totalSats: BigInt(8_000),
      fees: { onchain: false, feeSats: BigInt(0), receivedSats: BigInt(8_000) },
      expiresAt: null
    });
    const key = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    await expect(
      card.sendPrepared(quote, { speed: "medium", idempotencyKey: key })
    ).resolves.toEqual({ id: key, status: "completed" });
    expect(wallet.balanceSats).toBe(BigInt(0));
    // The transfer would send its whole amount, a fee on top: more than the balance.
    wallet.balanceSats = BigInt(8_000);
    loaded.sdk.fakeSend.sparkFeeSats = BigInt(2);
    await expect(card.prepareDrain(destination, BigInt(8_000))).rejects.toMatchObject({
      code: "requestFailed"
    });
    expect(wallet.balanceSats).toBe(BigInt(8_000));
    await card.disconnect();
  });

  it("never drains to an invoice: what its recipient gets could not be told exactly", async () => {
    const loaded = load();
    inputs(loaded);
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(5_000);
    const destination = await card.parseSendInput(INVOICE);
    await expect(card.prepareDrain(destination, BigInt(5_000))).rejects.toMatchObject({
      code: "unsupported"
    });
    expect(loaded.sdk.fakeCardWallet(CARD).balanceSats).toBe(BigInt(5_000));
    await card.disconnect();
  });

  it("never drains to a BIP-21 URI naming its amount: it asks that amount, not the whole", async () => {
    const loaded = load();
    inputs(loaded);
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(5_000);
    await expect(
      card.prepareDrain(
        {
          kind: "bitcoinAddress",
          request: `bitcoin:${BTC_ADDRESS}?amount=0.0001`,
          address: BTC_ADDRESS,
          amountSats: BigInt(10_000)
        },
        BigInt(5_000)
      )
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(loaded.sdk.fakeCardWallet(CARD).balanceSats).toBe(BigInt(5_000));
    await card.disconnect();
  });

  it("refuses a drain the SDK prepared for another amount, or one its fees eat whole", async () => {
    const loaded = load();
    inputs(loaded);
    const card = await connectCard(loaded);
    loaded.sdk.fakeCardWallet(CARD).balanceSats = BigInt(5_000);
    const destination = await card.parseSendInput(ADDRESS);

    loaded.sdk.fakeSend.quotedAmount = BigInt(4_000);
    await expect(card.prepareDrain(destination, BigInt(5_000))).rejects.toMatchObject({
      code: "requestFailed"
    });
    loaded.sdk.fakeSend.quotedAmount = null;
    loaded.sdk.fakeSend.lightningFeeSats = BigInt(5_000);
    await expect(card.prepareDrain(destination, BigInt(5_000))).rejects.toMatchObject({
      code: "requestFailed"
    });
    await card.disconnect();
  });
});
