import type * as BreezFake from "../../jest/breez-sdk";
import type * as WebFake from "../../jest/breez-sdk-web";
import { encodeLnurl } from "../../jest/lightning";
import type { SendDestination, WalletSeed } from "../lib/breez/types";
import type * as WalletModule from "../lib/breez/wallet";

// An opaque stand-in: the wallet layer passes the seed through without reading it.
const seed = { tag: "test-seed" } as unknown as WalletSeed;
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

const ADDRESS = "bakehouse@wallet.example";
const INVOICE = "lnbc237u1pfake";
const BTC_ADDRESS = "bc1qm4tz8s0xk7v9yfh3e5c2nq6wjr8ad2wz9";
const KEY = "4b5d0c1e-2f3a-4b6c-8d7e-9f0a1b2c3d4e";

/** Unix seconds from now. */
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
});

afterEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

function mockConfig() {
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
  }));
}

/* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
function loadNative() {
  jest.resetModules();
  mockConfig();
  const fake = require("@breeztech/breez-sdk-spark-react-native") as typeof BreezFake;
  fake.resetFakeWallet();
  fake.resetFakeSend();
  return { fake, ...(require("../lib/breez/wallet") as typeof WalletModule) };
}

function loadWeb() {
  jest.resetModules();
  mockConfig();
  const fake = require("../../jest/breez-sdk-web") as typeof WebFake;
  fake.resetFakeWallet();
  fake.resetFakeSend();
  jest.doMock("../lib/breez/web-sdk", () => ({
    loadBreezWeb: async () => ({ sdk: fake, passkeys: fake }),
    isBreezWebLoaded: () => true
  }));
  return { fake, ...(require("../lib/breez/wallet.web") as typeof WalletModule) };
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** The native SDK's `InputType`s the tests parse, as the bindings give them. */
function nativeInputs(fake: typeof BreezFake) {
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
  const invoice = (
    network: number,
    amountMsat: bigint | undefined,
    timestamp = BigInt(inSeconds(-60))
  ) => ({
    amountMsat,
    description: "Flour T45, 25 kg",
    descriptionHash: undefined,
    expiry: BigInt(3600),
    invoice: { bolt11: INVOICE, source: {} },
    minFinalCltvExpiryDelta: BigInt(18),
    network,
    payeePubkey: "02ab",
    paymentHash: "9c1f",
    paymentSecret: "00",
    routingHints: [],
    timestamp
  });
  return { payRequest, invoice };
}

describe("parseSendInput (native)", () => {
  it("reads a Lightning address with its bounds in whole sats", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    const { payRequest } = nativeInputs(fake);
    const parsedRequest = { ...payRequest, minSendable: BigInt(1500) };
    fake.fakeSend.inputs.set(ADDRESS, {
      tag: fake.InputType_Tags.LightningAddress,
      inner: [{ address: ADDRESS, payRequest: parsedRequest }]
    });
    await connectWallet(seed);
    await expect(parseSendInput(`  ${ADDRESS} `)).resolves.toEqual({
      kind: "lightningAddress",
      request: ADDRESS,
      address: ADDRESS,
      // 1500 msat: at least 2 whole sats; 500 000 000 000 msat: 500 000 000 sats.
      minSats: BigInt(2),
      maxSats: BigInt(500_000_000),
      // Kept for the quotes, opaque to the app.
      payRequest: parsedRequest
    });
    await disconnectWallet();
  });

  it("reads an invoice's amount, description and end, without its lightning: scheme", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    const details = nativeInputs(fake).invoice(fake.BitcoinNetwork.Bitcoin, BigInt(25_000_000));
    fake.fakeSend.inputs.set(INVOICE, { tag: fake.InputType_Tags.Bolt11Invoice, inner: [details] });
    await connectWallet(seed);
    const destination = await parseSendInput(`LIGHTNING:${INVOICE}`);
    expect(destination).toEqual({
      kind: "bolt11",
      request: INVOICE,
      amountSats: BigInt(25_000),
      description: "Flour T45, 25 kg",
      expiresAt: Number(details.timestamp + details.expiry)
    });
    await disconnectWallet();
  });

  it("refuses an expired invoice, another network's, and a fraction of a sat", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    const { invoice } = nativeInputs(fake);
    fake.fakeSend.inputs.set("expired", {
      tag: fake.InputType_Tags.Bolt11Invoice,
      inner: [invoice(fake.BitcoinNetwork.Bitcoin, BigInt(1000), BigInt(inSeconds(-7200)))]
    });
    fake.fakeSend.inputs.set("testnet", {
      tag: fake.InputType_Tags.Bolt11Invoice,
      inner: [invoice(fake.BitcoinNetwork.Testnet3, BigInt(1000))]
    });
    fake.fakeSend.inputs.set("msat", {
      tag: fake.InputType_Tags.Bolt11Invoice,
      inner: [invoice(fake.BitcoinNetwork.Bitcoin, BigInt(1500))]
    });
    await connectWallet(seed);
    await expect(parseSendInput("expired")).rejects.toMatchObject({ code: "expired" });
    await expect(parseSendInput("testnet")).rejects.toMatchObject({ code: "otherNetwork" });
    await expect(parseSendInput("msat")).rejects.toMatchObject({ code: "unsupported" });
    await disconnectWallet();
  });

  it("takes a BIP-21 URI's invoice first, else its address and amount", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    const address = {
      tag: fake.InputType_Tags.BitcoinAddress,
      inner: [{ address: BTC_ADDRESS, network: fake.BitcoinNetwork.Bitcoin, source: {} }]
    };
    const invoice = {
      tag: fake.InputType_Tags.Bolt11Invoice,
      inner: [nativeInputs(fake).invoice(fake.BitcoinNetwork.Bitcoin, BigInt(2_000_000))]
    };
    const bip21 = (paymentMethods: unknown[]) => ({
      tag: fake.InputType_Tags.Bip21,
      inner: [{ amountSat: BigInt(2000), paymentMethods, extras: [], uri: "bitcoin:" }]
    });
    fake.fakeSend.inputs.set("both", bip21([address, invoice]));
    fake.fakeSend.inputs.set("onchain", bip21([address]));
    await connectWallet(seed);
    await expect(parseSendInput("both")).resolves.toMatchObject({
      kind: "bolt11",
      request: INVOICE,
      amountSats: BigInt(2000)
    });
    await expect(parseSendInput("onchain")).resolves.toEqual({
      kind: "bitcoinAddress",
      request: BTC_ADDRESS,
      address: BTC_ADDRESS,
      amountSats: BigInt(2000)
    });
    await disconnectWallet();
  });

  it("tells what it does not pay from what it does not know, and an address it cannot reach", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    fake.fakeSend.inputs.set("lno1offer", { tag: fake.InputType_Tags.Bolt12Offer, inner: [{}] });
    await connectWallet(seed);
    await expect(parseSendInput("lno1offer")).rejects.toMatchObject({ code: "unsupported" });
    await expect(parseSendInput("hello")).rejects.toMatchObject({ code: "unrecognized" });
    await expect(parseSendInput("nobody@nowhere.example")).rejects.toMatchObject({
      code: "unreachable"
    });
    // An LNURL (LUD-01, LUD-17) the SDK could not resolve: its service did not answer.
    const lnurl = encodeLnurl("https://pay.example.com/lnurlp/bakehouse");
    await expect(parseSendInput(`lightning:${lnurl}`)).rejects.toMatchObject({
      code: "lnurlUnreachable"
    });
    await expect(parseSendInput("lnurlp://pay.example.com/lnurlp/bakehouse")).rejects.toMatchObject(
      {
        code: "lnurlUnreachable"
      }
    );
    // jest.resetModules() gives the module its own classes: compared by name and code.
    await expect(parseSendInput("   ")).rejects.toMatchObject({
      name: "SendError",
      code: "unrecognized"
    });
    await disconnectWallet();
  });

  it("never asks cash.app for a cashtag, which spark-sdk 0.28.4 would resolve there", async () => {
    const { fake, connectWallet, parseSendInput, disconnectWallet } = loadNative();
    const { payRequest } = nativeInputs(fake);
    fake.fakeSend.inputs.set("alice@cash.app", {
      tag: fake.InputType_Tags.LightningAddress,
      inner: [{ address: "alice@cash.app", payRequest }]
    });
    await connectWallet(seed);
    for (const input of ["$alice", " $alice@cash.app ", "lightning:$alice"]) {
      await expect(parseSendInput(input)).rejects.toMatchObject({
        name: "SendError",
        code: "unrecognized"
      });
    }
    expect(fake.fakeSend.cashtagsAsked).toEqual([]);
    // The same address typed as one is the merchant's choice: asked of its server as any other.
    await expect(parseSendInput("alice@cash.app")).resolves.toMatchObject({
      kind: "lightningAddress",
      address: "alice@cash.app"
    });
    await disconnectWallet();
  });

  it("needs the wallet connected", async () => {
    const { parseSendInput } = loadNative();
    await expect(parseSendInput(ADDRESS)).rejects.toMatchObject({ code: "notConnected" });
  });
});

describe("prepareSend and sendPrepared (native)", () => {
  async function connected() {
    const loaded = loadNative();
    const { fake } = loaded;
    const { payRequest, invoice } = nativeInputs(fake);
    fake.fakeWallet.balanceSats = BigInt(1_000_000);
    fake.fakeSend.inputs.set(ADDRESS, {
      tag: fake.InputType_Tags.LightningAddress,
      inner: [{ address: ADDRESS, payRequest }]
    });
    fake.fakeSend.inputs.set(INVOICE, {
      tag: fake.InputType_Tags.Bolt11Invoice,
      inner: [invoice(fake.BitcoinNetwork.Bitcoin, BigInt(25_000_000))]
    });
    fake.fakeSend.inputs.set(BTC_ADDRESS, {
      tag: fake.InputType_Tags.BitcoinAddress,
      inner: [{ address: BTC_ADDRESS, network: fake.BitcoinNetwork.Bitcoin, source: {} }]
    });
    await loaded.connectWallet(seed);
    const instance = (await fake.connect.mock.results[fake.connect.mock.results.length - 1]
      .value) as Record<string, jest.Mock>;
    return { ...loaded, instance };
  }

  it("pays a Lightning address the amount asked, fees on top, once per idempotency key", async () => {
    const { fake, instance, parseSendInput, prepareSend, sendPrepared, disconnectWallet } =
      await connected();
    const destination = await parseSendInput(ADDRESS);
    const quote = await prepareSend(destination, BigInt(150_000));
    expect(quote).toMatchObject({
      kind: "lightningAddress",
      amountSats: BigInt(150_000),
      fees: { onchain: false, feeSats: BigInt(3) }
    });
    expect(instance.prepareLnurlPay).toHaveBeenCalledWith(
      expect.objectContaining({ amount: BigInt(150_000), feePolicy: undefined })
    );
    const sent = await sendPrepared(quote, { speed: "medium", idempotencyKey: KEY });
    // Known by its idempotency key, as the SDK names it (send/mod.rs, 0.28.4).
    expect(sent).toEqual({ id: KEY, status: "completed" });
    expect(instance.lnurlPay).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: KEY })
    );
    // Tried again with the same key: the payment already made, nothing more leaves.
    await expect(sendPrepared(quote, { speed: "medium", idempotencyKey: KEY })).resolves.toEqual(
      sent
    );
    expect(fake.fakeWallet.balanceSats).toBe(BigInt(1_000_000 - 150_003));
    await disconnectWallet();
  });

  it("quotes an LNURL with the parameters parse read, without asking its server again", async () => {
    const { fake, instance, parseSendInput, prepareSend } = await connected();
    const lnurl = encodeLnurl("https://pay.example.com/lnurlp/bakehouse");
    const { payRequest } = nativeInputs(fake);
    const lnurlRequest = { ...payRequest, address: undefined, domain: "pay.example.com" };
    fake.fakeSend.inputs.set(lnurl, { tag: fake.InputType_Tags.LnurlPay, inner: [lnurlRequest] });

    const address = await parseSendInput(ADDRESS);
    const service = await parseSendInput(lnurl);
    expect(service).toMatchObject({ kind: "lnurlPay", domain: "pay.example.com" });
    await prepareSend(address, BigInt(1000));
    await prepareSend(address, BigInt(2000));
    await prepareSend(service, BigInt(3000));
    // One parse per recipient, none per quote: each quote only asks the service's callback.
    expect(instance.parse).toHaveBeenCalledTimes(2);
    const calls = instance.prepareLnurlPay.mock.calls as [{ payRequest: unknown }][];
    const parsedAddress = fake.fakeSend.inputs.get(ADDRESS)!.inner[0] as { payRequest: unknown };
    expect(calls).toHaveLength(3);
    expect(calls[0][0].payRequest).toBe(parsedAddress.payRequest);
    expect(calls[1][0].payRequest).toBe(parsedAddress.payRequest);
    expect(calls[2][0].payRequest).toBe(lnurlRequest);
  });

  it("pays an invoice its own amount, never another, waiting for Lightning a while", async () => {
    const { instance, parseSendInput, prepareSend, sendPrepared, disconnectWallet } =
      await connected();
    const destination = await parseSendInput(INVOICE);
    // An amount given for an invoice that has one is ignored: the SDK would refuse it.
    const quote = await prepareSend(destination, null);
    expect(quote.amountSats).toBe(BigInt(25_000));
    expect(instance.prepareSendPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: undefined })
    );
    await sendPrepared(quote, { speed: "medium", idempotencyKey: KEY });
    const [request] = instance.sendPayment.mock.calls[0] as [
      { options: { tag: string; inner: unknown }; idempotencyKey: string }
    ];
    expect(request.options.tag).toBe("Bolt11Invoice");
    expect(request.options.inner).toEqual({ preferSpark: false, completionTimeoutSecs: 20 });
    expect(request.idempotencyKey).toBe(KEY);
    await disconnectWallet();
  });

  it("quotes a Bitcoin address per speed, and sends at the speed chosen", async () => {
    const { fake, instance, parseSendInput, prepareSend, sendPrepared, getWalletPayment } =
      await connected();
    const destination = await parseSendInput(BTC_ADDRESS);
    const quote = await prepareSend(destination, BigInt(400_000));
    // Each speed's fee is the provider's plus the network's.
    expect(quote.fees).toEqual({
      onchain: true,
      bySpeed: { fast: BigInt(1840), medium: BigInt(1240), slow: BigInt(740) }
    });
    fake.fakeSend.sentStatus = fake.PaymentStatus.Pending;
    const sent = await sendPrepared(quote, { speed: "slow", idempotencyKey: KEY });
    expect(sent.status).toBe("pending");
    const [request] = instance.sendPayment.mock.calls[0] as [
      { options: { inner: { confirmationSpeed: number } } }
    ];
    expect(request.options.inner.confirmationSpeed).toBe(fake.OnchainConfirmationSpeed.Slow);
    await expect(getWalletPayment(sent.id)).resolves.toMatchObject({
      direction: "send",
      status: "pending",
      amountSats: BigInt(400_000),
      feeSats: BigInt(740),
      network: "bitcoin"
    });
  });

  it("pays a Spark address the exact amount by a transfer, on this network only", async () => {
    const { fake, instance, parseSendInput, prepareSend, sendPrepared } = await connected();
    const address = fake.fakeSparkAddress(`02${"cd".repeat(32)}`);
    const destination = await parseSendInput(` ${address} `);
    expect(destination).toEqual({ kind: "sparkAddress", request: address, address });
    fake.fakeSend.inputs.set("sparkrt1other", {
      tag: fake.InputType_Tags.SparkAddress,
      inner: [
        {
          address: "sparkrt1other",
          identityPublicKey: `02${"cd".repeat(32)}`,
          network: fake.BitcoinNetwork.Regtest,
          source: {}
        }
      ]
    });
    await expect(parseSendInput("sparkrt1other")).rejects.toMatchObject({ code: "otherNetwork" });

    // An amount is needed: a Spark address names none.
    await expect(prepareSend(destination, null)).rejects.toMatchObject({ code: "requestFailed" });
    const quote = await prepareSend(destination, BigInt(21_000));
    expect(quote).toMatchObject({
      kind: "sparkAddress",
      amountSats: BigInt(21_000),
      fees: { onchain: false, feeSats: BigInt(0) },
      expiresAt: null
    });
    await expect(sendPrepared(quote, { speed: "medium", idempotencyKey: KEY })).resolves.toEqual({
      id: KEY,
      status: "completed"
    });
    // A plain transfer, never an HTLC nor a Lightning payment.
    const [request] = instance.sendPayment.mock.calls[0] as [
      { options: { tag: string; inner: { htlcOptions?: unknown } } }
    ];
    expect(request.options.tag).toBe("SparkAddress");
    expect(request.options.inner.htlcOptions).toBeUndefined();
    expect(fake.fakeWallet.balanceSats).toBe(BigInt(1_000_000 - 21_000));
  });

  it("refuses a Spark quote of a token, or of another amount", async () => {
    const { fake, instance, parseSendInput, prepareSend } = await connected();
    const destination = await parseSendInput(fake.fakeSparkAddress(`02${"cd".repeat(32)}`));
    const prepare = instance.prepareSendPayment.getMockImplementation()!;
    instance.prepareSendPayment.mockImplementationOnce(async (request: unknown) => {
      const response = (await prepare(request)) as { paymentMethod: { inner: object } };
      return {
        ...response,
        paymentMethod: {
          ...response.paymentMethod,
          inner: { ...response.paymentMethod.inner, tokenIdentifier: "btkn1" }
        }
      };
    });
    await expect(prepareSend(destination, BigInt(1000))).rejects.toMatchObject({
      code: "requestFailed"
    });
    fake.fakeSend.quotedAmount = BigInt(999);
    await expect(prepareSend(destination, BigInt(1000))).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("refuses a quote for another amount than the one asked", async () => {
    const { fake, parseSendInput, prepareSend } = await connected();
    const destination = await parseSendInput(ADDRESS);
    fake.fakeSend.quotedAmount = BigInt(150_001);
    await expect(prepareSend(destination, BigInt(150_000))).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("gives a quote's end: the LNURL service's invoice, the on-chain fee quote", async () => {
    const { instance, parseSendInput, prepareSend } = await connected();
    const before = inSeconds(0);
    const lnurl = await prepareSend(await parseSendInput(ADDRESS), BigInt(1000));
    // The fake service's invoice is valid 10 minutes.
    expect(lnurl.expiresAt).toBeGreaterThanOrEqual(before + 600);
    expect(lnurl.expiresAt).toBeLessThanOrEqual(inSeconds(600));
    // An estimate (expiresAt 0) has no end; a quote a provider issued has its own.
    const estimate = await prepareSend(await parseSendInput(BTC_ADDRESS), BigInt(1000));
    expect(estimate.expiresAt).toBeNull();
    const prepare = instance.prepareSendPayment.getMockImplementation()!;
    // Read once: a second may pass between the quote and the check (a busy CI runner).
    const quoteEnd = inSeconds(300);
    instance.prepareSendPayment.mockImplementationOnce(async (request: unknown) => {
      const response = (await prepare(request)) as {
        paymentMethod: { inner: { feeQuote: { expiresAt: bigint } } };
      };
      response.paymentMethod.inner.feeQuote.expiresAt = BigInt(quoteEnd);
      return response;
    });
    const issued = await prepareSend(await parseSendInput(BTC_ADDRESS), BigInt(1000));
    expect(issued.expiresAt).toBe(quoteEnd);
  });

  it("refuses a quote whose fees would come out of the amount", async () => {
    const { fake, instance, parseSendInput, prepareSend } = await connected();
    const prepare = instance.prepareLnurlPay.getMockImplementation()!;
    instance.prepareLnurlPay.mockImplementationOnce(async (request: unknown) => ({
      ...((await prepare(request)) as object),
      feePolicy: fake.FeePolicy.FeesIncluded
    }));
    await expect(prepareSend(await parseSendInput(ADDRESS), BigInt(1000))).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("wraps a failed send", async () => {
    const { fake, parseSendInput, prepareSend, sendPrepared } = await connected();
    const quote = await prepareSend(await parseSendInput(ADDRESS), BigInt(1000));
    fake.fakeSend.sendError = new Error("NetworkError");
    const failure = sendPrepared(quote, { speed: "medium", idempotencyKey: KEY });
    await expect(failure).rejects.toMatchObject({ name: "WalletError", code: "requestFailed" });
  });
});

describe("send (web)", () => {
  it("reads, quotes and sends with the web build's numbers, as bigints", async () => {
    const { fake, connectWallet, parseSendInput, prepareSend, sendPrepared, disconnectWallet } =
      loadWeb();
    fake.fakeWallet.balanceSats = 1_000_000;
    fake.fakeSend.inputs.set(ADDRESS, {
      type: "lightningAddress",
      address: ADDRESS,
      payRequest: { minSendable: 1000, maxSendable: 100_000_000, domain: "wallet.example" }
    });
    fake.fakeSend.inputs.set(BTC_ADDRESS, {
      type: "bitcoinAddress",
      address: BTC_ADDRESS,
      network: "bitcoin"
    });
    fake.fakeSend.inputs.set("testnet", {
      type: "bitcoinAddress",
      address: "tb1q",
      network: "testnet3"
    });
    fake.fakeSend.inputs.set(INVOICE, {
      type: "bolt11Invoice",
      amountMsat: 25_000_000,
      description: "Flour",
      expiry: 3600,
      timestamp: inSeconds(-60),
      invoice: { bolt11: INVOICE },
      network: "bitcoin"
    });
    await connectWallet(seed);

    const address: SendDestination = await parseSendInput(ADDRESS);
    expect(address).toMatchObject({ minSats: BigInt(1), maxSats: BigInt(100_000) });
    // A maximum past Number's exact range (a service without a real limit): clamped, not refused.
    fake.fakeSend.inputs.set("unlimited@wallet.example", {
      type: "lightningAddress",
      address: "unlimited@wallet.example",
      payRequest: { minSendable: 1000, maxSendable: 2.1e18, domain: "wallet.example" }
    });
    await expect(parseSendInput("unlimited@wallet.example")).resolves.toMatchObject({
      maxSats: BigInt(Number.MAX_SAFE_INTEGER) / BigInt(1000)
    });
    const lnQuote = await prepareSend(address, BigInt(5000));
    expect(lnQuote.fees).toEqual({ onchain: false, feeSats: BigInt(3) });
    // The parameters parse read, not a second parse.
    const instance = (await fake.connect.mock.results[fake.connect.mock.results.length - 1]
      .value) as Record<string, jest.Mock>;
    const parsed = (instance.parse.mock.calls as [string][]).filter(([text]) => text === ADDRESS);
    expect(parsed).toHaveLength(1);
    const [[prepared]] = instance.prepareLnurlPay.mock.calls as [{ payRequest: unknown }][];
    expect(prepared.payRequest).toBe(
      (fake.fakeSend.inputs.get(ADDRESS) as { payRequest: unknown }).payRequest
    );
    expect(lnQuote.expiresAt).toBeGreaterThan(inSeconds(0));
    await expect(sendPrepared(lnQuote, { speed: "medium", idempotencyKey: KEY })).resolves.toEqual({
      id: KEY,
      status: "completed"
    });

    await expect(parseSendInput(INVOICE)).resolves.toMatchObject({ amountSats: BigInt(25_000) });
    await expect(parseSendInput("testnet")).rejects.toMatchObject({ code: "otherNetwork" });
    await expect(
      parseSendInput(encodeLnurl("https://pay.example.com/lnurlp/bakehouse"))
    ).rejects.toMatchObject({ code: "lnurlUnreachable" });
    // As on native: a cashtag is never given to `parse`, which would ask cash.app.
    fake.fakeSend.inputs.set("alice@cash.app", fake.fakeSend.inputs.get(ADDRESS)!);
    await expect(parseSendInput("$alice")).rejects.toMatchObject({ code: "unrecognized" });
    expect(fake.fakeSend.cashtagsAsked).toEqual([]);

    const onchain = await prepareSend(await parseSendInput(BTC_ADDRESS), BigInt(400_000));
    expect(onchain.fees).toEqual({
      onchain: true,
      bySpeed: { fast: BigInt(1840), medium: BigInt(1240), slow: BigInt(740) }
    });
    await disconnectWallet();
  });

  it("pays a Spark address as on native, on this network only", async () => {
    const { fake, connectWallet, parseSendInput, prepareSend, sendPrepared, disconnectWallet } =
      loadWeb();
    fake.fakeWallet.balanceSats = 100_000;
    fake.fakeSend.inputs.set("sparkrt1other", {
      type: "sparkAddress",
      address: "sparkrt1other",
      identityPublicKey: `02${"cd".repeat(32)}`,
      network: "regtest",
      source: {}
    });
    await connectWallet(seed);
    const address = fake.fakeSparkAddress(`02${"cd".repeat(32)}`);
    const destination = await parseSendInput(address);
    expect(destination).toEqual({ kind: "sparkAddress", request: address, address });
    await expect(parseSendInput("sparkrt1other")).rejects.toMatchObject({ code: "otherNetwork" });
    const quote = await prepareSend(destination, BigInt(21_000));
    expect(quote).toMatchObject({
      kind: "sparkAddress",
      amountSats: BigInt(21_000),
      fees: { onchain: false, feeSats: BigInt(0) }
    });
    const instance = (await fake.connect.mock.results[fake.connect.mock.results.length - 1]
      .value) as Record<string, jest.Mock>;
    await expect(sendPrepared(quote, { speed: "medium", idempotencyKey: KEY })).resolves.toEqual({
      id: KEY,
      status: "completed"
    });
    const [[request]] = instance.sendPayment.mock.calls as [{ options: { type: string } }][];
    expect(request.options).toEqual({ type: "sparkAddress" });
    expect(fake.fakeWallet.balanceSats).toBe(100_000 - 21_000);
    // A fee the web build gives as anything but a bigint: refused.
    fake.fakeSend.sparkFee = "0" as unknown as bigint;
    await expect(prepareSend(destination, BigInt(1000))).rejects.toMatchObject({
      code: "requestFailed"
    });
    await disconnectWallet();
  });
});
