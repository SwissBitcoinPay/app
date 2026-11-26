import type * as WebFake from "../../jest/breez-sdk-web";
import { TEST_MNEMONIC } from "../../jest/account";
import { encodeWalletSecret } from "../lib/breez/secret";
import type * as SeedWebModule from "../lib/breez/seed.web";
import type { WalletSeed } from "../lib/breez/types";
import type * as WalletWebModule from "../lib/breez/wallet.web";
import { decodeBolt11 } from "../lib/lightning/bolt11";
import { cardWalletPhrase, deriveCardRoot } from "../lib/card/keys";

/*
 * The card wallets on the web build (wallet.web.ts): the same API as on native
 * (card-wallet-layer.test.ts), on IndexedDB storages of their own and the web build's shapes.
 */

const WEB_SDK = "../lib/breez/web-sdk";
const ROOT = deriveCardRoot(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";

function load() {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
  }));
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
  const fake = require("../../jest/breez-sdk-web") as typeof WebFake;
  jest.doMock(WEB_SDK, () => ({
    loadBreezWeb: async () => ({ sdk: fake, passkeys: fake }),
    isBreezWebLoaded: () => true
  }));
  return {
    fake,
    ...(require("../lib/breez/wallet.web") as typeof WalletWebModule),
    ...(require("../lib/breez/seed.web") as typeof SeedWebModule)
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/** The account's wallet on the web: the fake's identity whatever the seed. */
const accountSeed = { type: "mnemonic", mnemonic: TEST_MNEMONIC } as unknown as WalletSeed;

describe("the card wallets on the web", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
    jest.requireMock<typeof WebFake>("../../jest/breez-sdk-web").resetFakeWallet();
  });

  it("connects a card's wallet with its words on an IndexedDB storage of its own", async () => {
    const loaded = load();
    const connect = jest.spyOn(loaded.fake, "connect");
    await loaded.connectWallet(accountSeed);
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));

    expect(
      connect.mock.calls.map(([request]) => (request as { storageDir: string }).storageDir)
    ).toEqual(["breez-sdk-spark", `breez-sdk-spark-cards/${CARD}/1`]);
    expect((connect.mock.calls[1]![0] as { seed: unknown }).seed).toEqual({
      type: "mnemonic",
      mnemonic: cardWalletPhrase(ROOT, CARD, 1)
    });
    await expect(card.getId()).resolves.toBe(
      loaded.fake.fakeIdentityOf(cardWalletPhrase(ROOT, CARD, 1))
    );
    await expect(loaded.getWalletId()).resolves.toBe(loaded.fake.FAKE_WEB_IDENTITY);
  });

  it("tells each change its SDK announces as on native, until stopped or disconnected", async () => {
    const loaded = load();
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));
    const state = loaded.fake.fakeCardWallet(CARD);
    const changed = jest.fn();
    const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const stop = await card.watchChanges(changed);

    // A payment received, as the web build gives it: read as the wallet reads its payments.
    const paid = {
      id: "paid-1",
      paymentType: "receive",
      status: "completed",
      amount: BigInt(2_100),
      fees: BigInt(0),
      timestamp: 1_790_000_000,
      method: "spark",
      details: { type: "spark" }
    };
    loaded.fake.emitSdkEvent(state, "paymentSucceeded", paid);
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
        network: "spark"
      })
    );
    for (const type of [
      "synced",
      "paymentPending",
      "paymentFailed",
      "newDeposits",
      "claimedDeposits",
      "unclaimedDeposits"
    ]) {
      loaded.fake.emitSdkEvent(state, type);
    }
    loaded.fake.emitSdkEvent(state, "autoOptimization");
    await later();
    expect(changed).toHaveBeenCalledTimes(7);

    expect(changed.mock.calls.slice(1).every(([payment]) => payment === null)).toBe(true);

    await stop();
    expect(loaded.fake.sdkListenerCount(state)).toBe(0);
    loaded.fake.emitSdkEvent(state, "paymentSucceeded", paid);
    await later();
    expect(changed).toHaveBeenCalledTimes(7);

    // Its disconnection removes it too.
    const again = await card.watchChanges(changed);
    await card.disconnect();
    expect(loaded.fake.sdkListenerCount(state)).toBe(0);
    await expect(again()).resolves.toBeUndefined();
  });

  it("moves sats between the account's wallet and a card's by free Spark transfers", async () => {
    const loaded = load();
    loaded.fake.fakeWallet.balanceSats = 9_000;
    await loaded.connectWallet(accountSeed);
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));

    const recharge = await loaded.prepareWalletTransfer(
      await card.getSparkAddress(),
      await card.getId(),
      BigInt(3_000)
    );
    expect(recharge).toMatchObject({ amountSats: BigInt(3_000), feeSats: BigInt(0) });
    await loaded.sendWalletTransfer(recharge, "33333333-3333-4333-8333-333333333333");
    await card.sync();
    await expect(card.getBalance(false)).resolves.toBe(BigInt(3_000));

    const back = await card.prepareTransfer(
      await loaded.getWalletSparkAddress(),
      loaded.fake.FAKE_WEB_IDENTITY,
      BigInt(3_000)
    );
    await card.sendTransfer(back, "44444444-4444-4444-8444-444444444444");
    await loaded.syncWallet();
    await expect(card.getBalance(false)).resolves.toBe(BigInt(0));
    await expect(loaded.getWalletBalance(false)).resolves.toBe(BigInt(9_000));
  });

  it("reads a Spark transfer's fee as the web build gives it, a bigint, else refuses", async () => {
    const loaded = load();
    loaded.fake.fakeWallet.balanceSats = 9_000;
    await loaded.connectWallet(accountSeed);
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));
    const prepare = async () =>
      loaded.prepareWalletTransfer(await card.getSparkAddress(), await card.getId(), BigInt(3_000));

    loaded.fake.fakeSend.sparkFee = BigInt(10);
    await expect(prepare()).resolves.toMatchObject({ amountSats: 3_000n, feeSats: 10n });
    // A string, as the web build of 0.26.1 gave it, or a negative fee: out of shape.
    for (const fee of ["0", -1n, 0]) {
      loaded.fake.fakeSend.sparkFee = fee as bigint;
      await expect(prepare()).rejects.toMatchObject({ name: "WalletError", code: "requestFailed" });
    }
  });

  it("refuses a Spark address of another wallet than the one meant", async () => {
    const loaded = load();
    await loaded.connectWallet(accountSeed);
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));

    await expect(
      loaded.prepareWalletTransfer(
        await card.getSparkAddress(),
        loaded.fake.FAKE_WEB_IDENTITY,
        BigInt(1)
      )
    ).rejects.toMatchObject({ name: "WalletError", code: "requestFailed" });
  });

  it("makes an invoice of exactly the amount asked, given to the web build as a number", async () => {
    const loaded = load();
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));

    const invoice = await card.receiveInvoice(BigInt(700), "Card top-up");

    expect(decodeBolt11(invoice)).toMatchObject({ network: "bc", amountMsat: BigInt(700_000) });
    await expect(
      card.receiveInvoice(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), "x")
    ).rejects.toMatchObject({ code: "requestFailed" });
    // Payable for the time asked.
    const day = await card.receiveInvoice(BigInt(700), "Card top-up", 86_400);
    expect(decodeBolt11(day)?.expirySeconds).toBe(86_400);
  });
  it("empties a card's whole balance as on native: what the recipient gets known before it goes", async () => {
    const loaded = load();
    const ADDRESS = "bakehouse@wallet.example";
    const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";
    const INVOICE = "lnbc250u1pfake";
    loaded.fake.fakeSend.inputs.set(ADDRESS, {
      type: "lightningAddress",
      address: ADDRESS,
      payRequest: { minSendable: 1000, maxSendable: 100_000_000, domain: "wallet.example" }
    });
    loaded.fake.fakeSend.inputs.set(BTC_ADDRESS, {
      type: "bitcoinAddress",
      address: BTC_ADDRESS,
      network: "bitcoin"
    });
    loaded.fake.fakeSend.inputs.set(INVOICE, {
      type: "bolt11Invoice",
      amountMsat: 25_000_000,
      description: "Flour",
      expiry: 3600,
      timestamp: Math.floor(Date.now() / 1000) - 60,
      invoice: { bolt11: INVOICE },
      network: "bitcoin"
    });
    const card = loaded.cardWallet(CARD, 1);
    await card.connect(loaded.mnemonicSeed(cardWalletPhrase(ROOT, CARD, 1)));
    const held = loaded.fake.fakeCardWallet(CARD);

    // A Lightning address: the whole less the service's fee, an invoice of exactly that.
    held.balanceSats = 5_000;
    const lightning = await card.prepareDrain(await card.parseSendInput(ADDRESS), BigInt(5_000));
    expect(lightning).toMatchObject({
      totalSats: BigInt(5_000),
      fees: { onchain: false, feeSats: BigInt(3), receivedSats: BigInt(4_997) }
    });
    await card.sendPrepared(lightning, {
      speed: "medium",
      idempotencyKey: "55555555-5555-4555-8555-555555555555"
    });
    expect(held.balanceSats).toBe(0);

    // A Bitcoin address: the whole less the fee of the speed chosen.
    held.balanceSats = 50_000;
    const onchain = await card.prepareDrain(await card.parseSendInput(BTC_ADDRESS), BigInt(50_000));
    expect(onchain).toMatchObject({
      totalSats: BigInt(50_000),
      fees: {
        onchain: true,
        bySpeed: { fast: BigInt(1840), medium: BigInt(1240), slow: BigInt(740) }
      }
    });
    await card.sendPrepared(onchain, {
      speed: "fast",
      idempotencyKey: "66666666-6666-4666-8666-666666666666"
    });
    expect(held.balanceSats).toBe(0);
    expect(held.payments[0]).toMatchObject({ amount: BigInt(48_160), fees: BigInt(1_840) });

    // Never an invoice: what its recipient gets could not be told exactly.
    held.balanceSats = 5_000;
    await expect(
      card.prepareDrain(await card.parseSendInput(INVOICE), BigInt(5_000))
    ).rejects.toMatchObject({ name: "SendError" });
    // Nor a BIP-21 URI naming its amount: it asks that amount, not the whole balance.
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
    ).rejects.toMatchObject({ name: "SendError", code: "unsupported" });
    expect(held.balanceSats).toBe(5_000);

    // A Spark address: all of it, by a free transfer.
    const spark = loaded.fake.fakeSparkAddress(`02${"ab".repeat(32)}`);
    const transfer = await card.prepareDrain(await card.parseSendInput(spark), BigInt(5_000));
    expect(transfer).toMatchObject({
      kind: "sparkAddress",
      totalSats: BigInt(5_000),
      fees: { onchain: false, feeSats: BigInt(0), receivedSats: BigInt(5_000) }
    });
    await card.sendPrepared(transfer, {
      speed: "medium",
      idempotencyKey: "77777777-7777-4777-8777-777777777777"
    });
    expect(held.balanceSats).toBe(0);
    expect(held.payments[0]).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      amount: BigInt(5_000),
      fees: BigInt(0)
    });
    // One with a fee would spend more than the balance: refused.
    held.balanceSats = 5_000;
    loaded.fake.fakeSend.sparkFee = BigInt(1);
    await expect(
      card.prepareDrain(await card.parseSendInput(spark), BigInt(5_000))
    ).rejects.toMatchObject({ code: "requestFailed" });
    expect(held.balanceSats).toBe(5_000);
  });
});
