import type { WalletSeed } from "../lib/breez/types";

import type * as SdkFake from "../../jest/breez-sdk";
import { taprootAddress } from "../../jest/bitcoin";
import { PREVIOUS_INSTANCE_TIMEOUT_MS } from "../lib/breez/connection";
import type * as ChainNodeModule from "../lib/breez/chain-node";
import type * as WalletModule from "../lib/breez/wallet";

const BREEZ_SDK = "@breeztech/breez-sdk-spark-react-native";

// See breez-status.test.ts: overrides of the SDK mock must be undone.
const defaultSdkMock: unknown = jest.requireMock(BREEZ_SDK);

// An opaque stand-in: the wallet layer passes the seed through without reading it.
const seed = { tag: "test-seed" } as unknown as WalletSeed;

type SdkMock = Omit<typeof SdkFake, "connect"> & { connect: jest.Mock };

function loadWallet(breezNetwork: unknown = "mainnet") {
  // Fresh module graph, so that each test starts with no wallet connected.
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork } } }
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../lib/breez/wallet") as typeof WalletModule;
}

/** The SDK instance wallet.ts gets when it requires it lazily (same module registry). */
function sdkMock(): SdkMock {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(BREEZ_SDK) as SdkMock;
}

/** The SDK object of the last connection: connectWallet keeps it to itself. */
async function lastInstance<T>(): Promise<T> {
  const { results } = sdkMock().connect.mock;
  return (await results[results.length - 1].value) as T;
}

/** Waits until the SDK call `mock` has started: a call still queued is refused by a disconnect. */
async function waitForCall(mock: jest.Mock) {
  for (let turn = 0; turn < 100 && mock.mock.calls.length === 0; turn++) await Promise.resolve();
  expect(mock).toHaveBeenCalled();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("connectWallet", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    // The SDK mock object survives jest.resetModules() (see afterEach): reset its call counts.
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.doMock(BREEZ_SDK, () => defaultSdkMock);
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("connects on the network of the build, with the API key, in the app sandbox", async () => {
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();

    await connectWallet(seed);

    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(sdk.connect).toHaveBeenCalledWith({
      config: {
        network: 0,
        apiKey: "test-api-key",
        syncIntervalSecs: 60,
        // At most 300 sats to claim a deposit, early or not (config.ts), not left to the SDK's
        // default.
        maxDepositClaimFee: {
          onchain: new sdk.MaxOnchainFee.Fixed({ amount: BigInt(300) }),
          proportionalPpm: undefined
        },
        // The watchtower's fee ladder, on: a refund received with it pays its own fee.
        watchtowerFeeLadderEnabled: true
      },
      seed,
      storageDir: "/data/user/0/ch.swissbitcoinpay.checkout.staging/files/breez-sdk-spark"
    });
  });

  it("refuses to connect on mainnet without an API key", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();

    await expect(connectWallet(seed)).rejects.toMatchObject({
      name: "WalletError",
      code: "notConfigured"
    });
    expect(sdk.connect).not.toHaveBeenCalled();

    // The failed attempt does not keep the wallet slot.
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("tells ahead of the passkey prompt whether the build can connect a wallet", () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    expect(() => loadWallet().checkWalletConfig()).toThrow(
      expect.objectContaining({ name: "WalletError", code: "notConfigured" })
    );
    expect(() => loadWallet("signet").checkWalletConfig()).toThrow(
      expect.objectContaining({ code: "notConfigured" })
    );
    expect(() => loadWallet("regtest").checkWalletConfig()).not.toThrow();

    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    expect(() => loadWallet().checkWalletConfig()).not.toThrow();
  });

  it("connects to regtest without an API key", async () => {
    delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    const { connectWallet } = loadWallet("regtest");
    const sdk = sdkMock();

    await connectWallet(seed);

    expect((sdk.connect.mock.calls[0][0] as { config: unknown }).config).toEqual({
      network: 1,
      apiKey: undefined,
      syncIntervalSecs: 60,
      maxDepositClaimFee: {
        onchain: new sdk.MaxOnchainFee.Fixed({ amount: BigInt(300) }),
        proportionalPpm: undefined
      },
      watchtowerFeeLadderEnabled: true
    });
    // Regtest keeps the SDK's own chain service: its hosted instance needs the SDK's credentials.
    expect(sdk.newRestChainService).not.toHaveBeenCalled();
    expect(sdk.SdkBuilder.last?.chainService).toBeUndefined();
  });

  it("refuses a network the app does not support", async () => {
    const { connectWallet } = loadWallet("signet");
    const sdk = sdkMock();

    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "notConfigured" });
    expect(sdk.connect).not.toHaveBeenCalled();
  });

  it("reports the SDK as unavailable when its native library fails to load", async () => {
    jest.doMock(BREEZ_SDK, () => {
      throw new Error("BreezSdkSparkReactNative could not be found");
    });
    const { connectWallet } = loadWallet();

    await expect(connectWallet(seed)).rejects.toMatchObject({
      code: "unavailable",
      cause: new Error("BreezSdkSparkReactNative could not be found")
    });
  });

  it("wraps a failed SDK connection and frees the wallet slot", async () => {
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();
    const sdkError = new Error("Network error");
    sdk.connect.mockRejectedValueOnce(sdkError);

    await expect(connectWallet(seed)).rejects.toMatchObject({
      code: "connectFailed",
      cause: sdkError
    });
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("keeps one wallet at a time, until it is disconnected", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const pending = deferred<{ disconnect: jest.Mock }>();
    sdk.connect.mockReturnValueOnce(pending.promise);

    const first = connectWallet(seed);
    // Double tap while connecting, then again once connected.
    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "alreadyConnected" });
    const instance = { disconnect: jest.fn(async () => undefined), uniffiDestroy: jest.fn() };
    pending.resolve(instance);
    await expect(first).resolves.toBeUndefined();
    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "alreadyConnected" });
    expect(sdk.connect).toHaveBeenCalledTimes(1);

    await disconnectWallet();
    expect(instance.disconnect).toHaveBeenCalledTimes(1);
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("does not open the storage again while the previous wallet is closing", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const closing = deferred<void>();
    const instance = { disconnect: jest.fn(() => closing.promise), uniffiDestroy: jest.fn() };
    sdk.connect.mockResolvedValueOnce(instance);
    await connectWallet(seed);

    const disconnecting = disconnectWallet();
    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "alreadyConnected" });
    // Destroyed once disconnected only: `disconnect` uses the object too.
    expect(instance.uniffiDestroy).not.toHaveBeenCalled();
    closing.resolve();
    await disconnecting;
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);

    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("disconnects a wallet that was still connecting", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const pending = deferred<{ disconnect: jest.Mock; uniffiDestroy: jest.Mock }>();
    sdk.connect.mockReturnValueOnce(pending.promise);
    const instance = { disconnect: jest.fn(async () => undefined), uniffiDestroy: jest.fn() };

    const connecting = connectWallet(seed);
    const disconnecting = disconnectWallet();
    pending.resolve(instance);
    await connecting;
    await disconnecting;

    expect(instance.disconnect).toHaveBeenCalledTimes(1);
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the SDK object once disconnected: it holds the wallet's keys", async () => {
    const { connectWallet, disconnectWallet, getWalletId } = loadWallet();
    await connectWallet(seed);
    const instance = await lastInstance<{ disconnect: jest.Mock; uniffiDestroy: jest.Mock }>();

    await disconnectWallet();

    expect(instance.disconnect).toHaveBeenCalledTimes(1);
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
    expect(instance.uniffiDestroy.mock.invocationCallOrder[0]).toBeGreaterThan(
      instance.disconnect.mock.invocationCallOrder[0]
    );
    await expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
  });

  it("refuses new calls while the wallet disconnects", async () => {
    const { connectWallet, disconnectWallet, getWalletId } = loadWallet();
    const sdk = sdkMock();
    const closing = deferred<void>();
    const getInfo = jest.fn(async () => ({ identityPubkey: "02ab" }));
    sdk.connect.mockResolvedValueOnce({
      disconnect: jest.fn(() => closing.promise),
      getInfo,
      uniffiDestroy: jest.fn()
    });
    await connectWallet(seed);

    const disconnecting = disconnectWallet();
    await expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
    expect(getInfo).not.toHaveBeenCalled();
    closing.resolve();
    await disconnecting;
  });

  it("starts no call asked for while it connected, once it disconnects", async () => {
    const { connectWallet, disconnectWallet, getWalletId } = loadWallet();
    const sdk = sdkMock();
    const pending = deferred<{
      disconnect: jest.Mock;
      getInfo: jest.Mock;
      uniffiDestroy: jest.Mock;
    }>();
    sdk.connect.mockReturnValueOnce(pending.promise);
    const instance = {
      disconnect: jest.fn(async () => undefined),
      getInfo: jest.fn(async () => ({ identityPubkey: "02ab" })),
      uniffiDestroy: jest.fn()
    };

    const connecting = connectWallet(seed);
    const reading = expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
    const disconnecting = disconnectWallet();
    pending.resolve(instance);
    await connecting;

    await reading;
    await disconnecting;
    expect(instance.getInfo).not.toHaveBeenCalled();
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("disconnects and destroys once when asked again while disconnecting", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const closing = deferred<void>();
    const instance = { disconnect: jest.fn(() => closing.promise), uniffiDestroy: jest.fn() };
    sdk.connect.mockResolvedValueOnce(instance);
    await connectWallet(seed);

    const first = disconnectWallet();
    const second = disconnectWallet();
    closing.resolve();
    await Promise.all([first, second]);

    expect(instance.disconnect).toHaveBeenCalledTimes(1);
    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the SDK object even when disconnecting it fails", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const sdkError = new Error("Background task did not stop");
    const instance = {
      disconnect: jest.fn().mockRejectedValue(sdkError),
      uniffiDestroy: jest.fn()
    };
    sdk.connect.mockResolvedValueOnce(instance);
    await connectWallet(seed);

    await expect(disconnectWallet()).rejects.toBe(sdkError);

    expect(instance.uniffiDestroy).toHaveBeenCalledTimes(1);
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("frees the wallet slot even when destroying the SDK object fails", async () => {
    const { connectWallet, disconnectWallet } = loadWallet();
    const sdk = sdkMock();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const destroyError = new Error("UnexpectedNullPointer");
    sdk.connect.mockResolvedValueOnce({
      disconnect: jest.fn(async () => undefined),
      uniffiDestroy: jest.fn(() => {
        throw destroyError;
      })
    });
    await connectWallet(seed);

    await expect(disconnectWallet()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith("Destroying the wallet's SDK instance failed", destroyError);
    warn.mockRestore();
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("tells when a wallet is connected, and whoever listens", async () => {
    const { connectWallet, disconnectWallet, isWalletConnected, subscribeWallet } = loadWallet();
    const sdk = sdkMock();
    const pending = deferred<{ disconnect: jest.Mock; uniffiDestroy: jest.Mock }>();
    sdk.connect.mockReturnValueOnce(pending.promise);
    const closing = deferred<void>();
    const instance = { disconnect: jest.fn(() => closing.promise), uniffiDestroy: jest.fn() };
    const listener = jest.fn();
    const unsubscribe = subscribeWallet(listener);

    const connecting = connectWallet(seed);
    // Not while it connects.
    expect(isWalletConnected()).toBe(false);
    pending.resolve(instance);
    await connecting;
    expect(isWalletConnected()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // No longer once it starts disconnecting.
    const disconnecting = disconnectWallet();
    expect(isWalletConnected()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    closing.resolve();
    await disconnecting;
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await connectWallet(seed);
    expect(isWalletConnected()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does nothing on disconnect when no wallet is connected", async () => {
    const { disconnectWallet } = loadWallet();
    const sdk = sdkMock();

    await expect(disconnectWallet()).resolves.toBeUndefined();
    expect(sdk.connect).not.toHaveBeenCalled();
  });
});

describe("SDK builder", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("is destroyed once built: it holds the seed", async () => {
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();

    await connectWallet(seed);

    expect(sdk.SdkBuilder.last?.seed).toBe(seed);
    expect(sdk.SdkBuilder.last?.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("is destroyed when the build fails too", async () => {
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();
    sdk.connect.mockRejectedValueOnce(new Error("Storage locked"));

    await expect(connectWallet(seed)).rejects.toMatchObject({ code: "connectFailed" });
    expect(sdk.SdkBuilder.last?.uniffiDestroy).toHaveBeenCalledTimes(1);
  });
});

describe("chain service", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("is the SDK's own on mainnet (mempool.space), without the watch of deposit addresses", async () => {
    const { connectWallet } = loadWallet();
    const sdk = sdkMock();

    await connectWallet(seed);

    expect(sdk.newRestChainService).toHaveBeenCalledWith(
      "https://mempool.space/api",
      sdk.Network.Mainnet,
      sdk.ChainApiType.MempoolSpace,
      undefined,
      { proxy: undefined }
    );
    const inner = await sdk.newRestChainService.mock.results[0].value;
    const service = sdk.SdkBuilder.last?.chainService as ReturnType<typeof sdk.fakeChainService>;
    // The only caller of getAddressUtxos is that watch: it hears of no deposit, without a request.
    await expect(service.getAddressUtxos("bc1p…")).resolves.toEqual([]);
    expect(inner.getAddressUtxos).not.toHaveBeenCalled();
    // Everything else is the SDK's service.
    await expect(service.tipHeight()).resolves.toBe(900_000);
    await service.getTransactionHex("ab");
    await service.getOutspend("ab", 1);
    await service.getTransactionStatus("ab");
    await service.getAddressTxos("bc1p…");
    await service.broadcastTransaction("00");
    await service.recommendedFees();
    expect(inner.getTransactionHex).toHaveBeenCalledWith("ab", undefined);
    expect(inner.getOutspend).toHaveBeenCalledWith("ab", 1, undefined);
    expect(inner.getTransactionStatus).toHaveBeenCalledWith("ab", undefined);
    expect(inner.getAddressTxos).toHaveBeenCalledWith("bc1p…", undefined);
    expect(inner.broadcastTransaction).toHaveBeenCalledWith("00", undefined);
    expect(inner.recommendedFees).toHaveBeenCalledTimes(1);
  });

  // HTTPS only: the SDK's Rust client is not bound by Android's
  // rule on unencrypted requests, so a node saved in http:// is never handed to it as such.
  it('hands a node saved in http:// to the wallet over HTTPS only, "Lightning only" kept', async () => {
    const { connectWallet } = loadWallet();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setChainNodeSource } = require("../lib/breez/chain-node") as typeof ChainNodeModule;
    setChainNodeSource(() => ({
      url: "http://umbrel.local:3006",
      fallback: "none",
      payers: false
    }));
    const sdk = sdkMock();

    await connectWallet(seed);

    expect(sdk.newRestChainService.mock.calls.map(([url]) => url)).toEqual([
      "https://umbrel.local:3006/api"
    ]);
  });

  it("reads the merchant's own node first, then mempool.space when it fails and the owner allows it", async () => {
    const { connectWallet } = loadWallet();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setChainNodeSource } = require("../lib/breez/chain-node") as typeof ChainNodeModule;
    setChainNodeSource(() => ({
      url: "https://192.168.1.20:3006",
      fallback: "mempool",
      payers: false
    }));
    const sdk = sdkMock();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await connectWallet(seed);

      expect(sdk.newRestChainService.mock.calls.map(([url]) => url)).toEqual([
        "https://192.168.1.20:3006/api",
        "https://mempool.space/api"
      ]);
      const [node, mempool] = await Promise.all(
        sdk.newRestChainService.mock.results.map(
          (result) => result.value as Promise<ReturnType<typeof sdk.fakeChainService>>
        )
      );
      const service = sdk.SdkBuilder.last?.chainService as ReturnType<typeof sdk.fakeChainService>;
      // The node answers: mempool.space is never asked.
      await expect(service.tipHeight()).resolves.toBe(900_000);
      expect(node.tipHeight).toHaveBeenCalledTimes(1);
      expect(mempool.tipHeight).not.toHaveBeenCalled();
      // The node fails: mempool.space answers the same call.
      node.broadcastTransaction.mockRejectedValueOnce(new Error("unreachable"));
      await service.broadcastTransaction("00");
      expect(mempool.broadcastTransaction).toHaveBeenCalledWith("00", undefined);
      // Never the watch of deposit addresses, on either.
      await expect(service.getAddressUtxos("bc1p…")).resolves.toEqual([]);
      expect(node.getAddressUtxos).not.toHaveBeenCalled();
      expect(mempool.getAddressUtxos).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('reads the merchant\'s own node alone for "Lightning only"', async () => {
    const { connectWallet } = loadWallet();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setChainNodeSource } = require("../lib/breez/chain-node") as typeof ChainNodeModule;
    setChainNodeSource(() => ({ url: "https://node.example.ch", fallback: "none", payers: false }));
    const sdk = sdkMock();

    await connectWallet(seed);

    expect(sdk.newRestChainService.mock.calls.map(([url]) => url)).toEqual([
      "https://node.example.ch/api"
    ]);
    const [node] = await Promise.all(
      sdk.newRestChainService.mock.results.map(
        (result) => result.value as Promise<ReturnType<typeof sdk.fakeChainService>>
      )
    );
    const service = sdk.SdkBuilder.last?.chainService as ReturnType<typeof sdk.fakeChainService>;
    node.recommendedFees.mockRejectedValueOnce(new Error("unreachable"));
    await expect(service.recommendedFees()).rejects.toThrow("unreachable");
  });
});

describe("newDepositAddress", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  const WALLET_ID = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("asks the wallet for a new address each time, never its current one", async () => {
    const { connectWallet, newDepositAddress } = loadWallet();
    const sdk = sdkMock();
    await connectWallet(seed);
    const wallet = await lastInstance<{ receivePayment: jest.Mock }>();
    const before = sdk.depositAddresses.handedOut;

    await expect(newDepositAddress(WALLET_ID)).resolves.toBe(taprootAddress(before + 1));
    await expect(newDepositAddress(WALLET_ID)).resolves.toBe(taprootAddress(before + 2));
    expect(wallet.receivePayment).toHaveBeenCalledWith({
      paymentMethod: new sdk.ReceivePaymentMethod.BitcoinAddress({ newAddress: true })
    });
  });

  it("never gives another wallet's address", async () => {
    const { connectWallet, newDepositAddress } = loadWallet();
    await connectWallet(seed);

    await expect(
      newDepositAddress("02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9")
    ).rejects.toMatchObject({ code: "notConnected" });
  });

  it("gives no address once its wallet was disconnected meanwhile", async () => {
    const { connectWallet, disconnectWallet, newDepositAddress } = loadWallet();
    await connectWallet(seed);
    const wallet = await lastInstance<{ receivePayment: jest.Mock; uniffiDestroy: jest.Mock }>();
    const answer = deferred<{ paymentRequest: string; fee: bigint }>();
    wallet.receivePayment.mockReturnValueOnce(answer.promise);

    const address = newDepositAddress(WALLET_ID);
    await waitForCall(wallet.receivePayment);
    await disconnectWallet();
    answer.resolve({ paymentRequest: taprootAddress(200), fee: BigInt(0) });

    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    // Destroyed once the call ended.
    expect(wallet.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer that is not a taproot address of the build's network", async () => {
    const { connectWallet, newDepositAddress } = loadWallet();
    await connectWallet(seed);
    const wallet = await lastInstance<{ receivePayment: jest.Mock }>();
    wallet.receivePayment.mockResolvedValueOnce({
      paymentRequest: taprootAddress(7, "bcrt"),
      fee: BigInt(0)
    });
    wallet.receivePayment.mockResolvedValueOnce({
      paymentRequest: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      fee: BigInt(0)
    });

    await expect(newDepositAddress(WALLET_ID)).rejects.toMatchObject({ code: "requestFailed" });
    await expect(newDepositAddress(WALLET_ID)).rejects.toMatchObject({ code: "requestFailed" });
  });

  it("wraps a failed SDK request", async () => {
    const { connectWallet, newDepositAddress } = loadWallet();
    await connectWallet(seed);
    const wallet = await lastInstance<{ receivePayment: jest.Mock }>();
    const sdkError = new Error("Service connection failed");
    wallet.receivePayment.mockRejectedValueOnce(sdkError);

    await expect(newDepositAddress(WALLET_ID)).rejects.toMatchObject({
      code: "requestFailed",
      cause: sdkError
    });
  });

  it("needs a connected wallet", async () => {
    const { newDepositAddress } = loadWallet();
    await expect(newDepositAddress(WALLET_ID)).rejects.toMatchObject({ code: "notConnected" });
  });
});

describe("listPendingDeposits", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  const TX = "AB".repeat(32);

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  /** A `DepositInfo` as the bindings give it. */
  const deposit = (over: Record<string, unknown> = {}) => ({
    txid: TX,
    vout: 1,
    amountSats: BigInt(1500),
    isMature: true,
    refundTx: undefined,
    refundTxId: undefined,
    refundState: undefined,
    claimError: undefined,
    instantClaimStatus: undefined,
    maxClaimFee: undefined,
    ...over
  });

  it("reads the deposits not credited yet, and those that wait for lower fees, with their price", async () => {
    const { connectWallet, listPendingDeposits } = loadWallet();
    const sdk = sdkMock();
    await connectWallet(seed);
    await expect(listPendingDeposits()).resolves.toEqual([]);
    sdk.fakeWallet.unclaimedDeposits = [
      deposit({
        claimError: {
          tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
          inner: { tx: TX, vout: 1, requiredFeeSats: BigInt(301) }
        }
      }),
      deposit({
        vout: 2,
        isMature: false,
        claimError: { tag: sdk.DepositClaimError_Tags.Generic, inner: { message: "down" } }
      }),
      // Credited by an early claim: its payment comes through listPayments.
      deposit({ vout: 3, instantClaimStatus: { tag: sdk.InstantClaimStatus_Tags.Claimed } }),
      deposit({
        vout: 4,
        instantClaimStatus: { tag: sdk.InstantClaimStatus_Tags.Submitted, inner: { claimId: "c" } }
      }),
      // Being refunded: never comes to the wallet.
      deposit({ vout: 5, refundTxId: "cd".repeat(32) }),
      // Out of shape.
      deposit({ vout: 6, txid: "not-a-txid" }),
      deposit({ vout: -1 }),
      deposit({ vout: 7, amountSats: 1500.5 }),
      deposit({ vout: 9, amountSats: BigInt(0) }),
      deposit({ vout: 8, isMature: "yes" }),
      // Refused within 300 sats (under the 99 of an older app: the next sync claims it), then at a
      // price above its value or out of shape (waiting all the same, its price not told).
      ...[BigInt(150), BigInt(300), BigInt(1501), 150.5].map((requiredFeeSats, i) =>
        deposit({
          vout: 10 + i,
          claimError: {
            tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
            inner: { tx: TX, vout: 10 + i, requiredFeeSats }
          }
        })
      ),
      // Not mature: only a claim ahead of maturity was refused; claimed at maturity, it waits for
      // no lower price.
      deposit({
        vout: 14,
        isMature: false,
        claimError: {
          tag: sdk.DepositClaimError_Tags.MaxDepositClaimFeeExceeded,
          inner: { tx: TX, vout: 14, requiredFeeSats: BigInt(450) }
        }
      }),
      // Too small to claim at maturity at the current fees (spark-sdk 0.28.4): it waits for lower
      // ones, its price not told. Not mature, as a refused early claim: claimed at maturity.
      deposit({
        vout: 15,
        claimError: { tag: sdk.DepositClaimError_Tags.DepositTooSmall, inner: { tx: TX, vout: 15 } }
      }),
      deposit({
        vout: 16,
        isMature: false,
        claimError: { tag: sdk.DepositClaimError_Tags.DepositTooSmall, inner: { tx: TX, vout: 16 } }
      })
    ];
    const credited = (vout: number) => ({
      txid: TX.toLowerCase(),
      vout,
      amountSats: 1500n,
      mature: true,
      waitsForFees: false
    });
    await expect(listPendingDeposits()).resolves.toEqual([
      { ...credited(1), waitsForFees: true, claimFeeSats: 301n },
      { ...credited(2), mature: false },
      credited(4),
      credited(10),
      credited(11),
      { ...credited(12), waitsForFees: true },
      { ...credited(13), waitsForFees: true },
      { ...credited(14), mature: false },
      { ...credited(15), waitsForFees: true },
      { ...credited(16), mature: false }
    ]);
  });

  it("wraps a failed SDK request, and needs a connected wallet", async () => {
    const { connectWallet, listPendingDeposits } = loadWallet();
    await expect(listPendingDeposits()).rejects.toMatchObject({ code: "notConnected" });
    await connectWallet(seed);
    const wallet = await lastInstance<{ listUnclaimedDeposits: jest.Mock }>();
    const sdkError = new Error("Storage error");
    wallet.listUnclaimedDeposits.mockRejectedValueOnce(sdkError);
    await expect(listPendingDeposits()).rejects.toMatchObject({
      code: "requestFailed",
      cause: sdkError
    });
  });
});

describe("getWalletId", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("is the identity public key of the connected wallet, read without waiting for a sync", async () => {
    const { connectWallet, getWalletId } = loadWallet();
    const sdk = sdkMock();
    const getInfo = jest.fn(async () => ({ identityPubkey: "02ab", balanceSats: BigInt(0) }));
    sdk.connect.mockResolvedValueOnce({ disconnect: jest.fn(), getInfo });
    await connectWallet(seed);

    await expect(getWalletId()).resolves.toBe("02ab");
    expect(getInfo).toHaveBeenCalledWith({ ensureSynced: false });
  });

  it("needs a connected wallet", async () => {
    const { connectWallet, disconnectWallet, getWalletId } = loadWallet();

    await expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
    await connectWallet(seed);
    await disconnectWallet();
    await expect(getWalletId()).rejects.toMatchObject({ code: "notConnected" });
  });

  it("wraps a failed SDK request", async () => {
    const { connectWallet, getWalletId } = loadWallet();
    const sdk = sdkMock();
    const sdkError = new Error("Storage error");
    sdk.connect.mockResolvedValueOnce({
      disconnect: jest.fn(),
      getInfo: jest.fn().mockRejectedValue(sdkError)
    });
    await connectWallet(seed);

    await expect(getWalletId()).rejects.toMatchObject({ code: "requestFailed", cause: sdkError });
  });
});

describe("walletIdOf", () => {
  const words =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const wordsSeed = { tag: "Mnemonic", inner: { mnemonic: words, passphrase: undefined } };

  beforeEach(() => jest.clearAllMocks());

  it("is the identity of the seed's signers, without connecting any wallet, their keys freed", async () => {
    const { walletIdOf } = loadWallet();
    const sdk = sdkMock();
    const before = { ...sdk.signersMade };

    await expect(walletIdOf(wordsSeed as unknown as WalletSeed)).resolves.toBe(
      sdk.FAKE_IDENTITY_PUBKEY
    );
    // The seed-based connect's keys (recovery-phrase-sdk.test.ts): its words, the build's network,
    // the network's default account.
    expect(sdk.defaultExternalSigners).toHaveBeenCalledWith(
      words,
      undefined,
      sdk.Network.Mainnet,
      undefined
    );
    expect(sdk.connect).not.toHaveBeenCalled();
    expect(sdk.signersMade.count - before.count).toBe(1);
    // Both signers (the Spark one and the SDK's own) destroyed once read.
    expect(sdk.signersMade.destroyed - before.destroyed).toBe(2);
  });

  it("uses the regtest keys on a regtest build", async () => {
    const { walletIdOf } = loadWallet("regtest");
    const sdk = sdkMock();
    await walletIdOf(wordsSeed as unknown as WalletSeed);
    expect(sdk.defaultExternalSigners).toHaveBeenCalledWith(
      words,
      undefined,
      sdk.Network.Regtest,
      undefined
    );
  });

  it("refuses a seed of raw entropy, never naming the account otherwise", async () => {
    const { walletIdOf } = loadWallet();
    const entropy = { tag: "Entropy", inner: [new ArrayBuffer(32)] } as unknown as WalletSeed;
    await expect(walletIdOf(entropy)).rejects.toMatchObject({ code: "requestFailed" });
    expect(sdkMock().defaultExternalSigners).not.toHaveBeenCalled();
  });

  it("wraps a failure of the SDK, its signers freed all the same", async () => {
    const { walletIdOf } = loadWallet();
    const sdk = sdkMock();
    const failure = new Error("Invalid mnemonic");
    sdk.defaultExternalSigners.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(walletIdOf(wordsSeed as unknown as WalletSeed)).rejects.toMatchObject({
      code: "requestFailed",
      cause: failure
    });

    const destroyed = { spark: jest.fn(), breez: jest.fn() };
    sdk.defaultExternalSigners.mockImplementationOnce(() => ({
      sparkSigner: {
        getIdentityPublicKey: jest.fn().mockRejectedValue(failure),
        uniffiDestroy: destroyed.spark
      },
      breezSigner: { getIdentityPublicKey: jest.fn(), uniffiDestroy: destroyed.breez }
    }));
    await expect(walletIdOf(wordsSeed as unknown as WalletSeed)).rejects.toMatchObject({
      code: "requestFailed",
      cause: failure
    });
    expect(destroyed.spark).toHaveBeenCalledTimes(1);
    expect(destroyed.breez).toHaveBeenCalledTimes(1);
  });

  it("refuses what is no wallet id", async () => {
    const { walletIdOf } = loadWallet();
    sdkMock().defaultExternalSigners.mockImplementationOnce(() => ({
      sparkSigner: {
        getIdentityPublicKey: jest.fn(async () => ({ bytes: new ArrayBuffer(0) })),
        uniffiDestroy: jest.fn()
      },
      breezSigner: { getIdentityPublicKey: jest.fn(), uniffiDestroy: jest.fn() }
    }));
    await expect(walletIdOf(wordsSeed as unknown as WalletSeed)).rejects.toMatchObject({
      code: "requestFailed"
    });
  });
});

describe("getWalletLightningAddress", () => {
  const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  const FAKE_IDENTITY_PUBKEY = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

  beforeEach(() => {
    process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
    else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
  });

  it("registers the connected wallet's Lightning address, with the business name", async () => {
    const { connectWallet, getWalletLightningAddress } = loadWallet();
    await connectWallet(seed);

    await expect(getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5")).resolves.toBe(
      "sattleme02c6047f94@breez.tips"
    );
  });

  it("never gives another wallet's address for this wallet's profile", async () => {
    const { connectWallet, getWalletLightningAddress } = loadWallet();
    await connectWallet(seed);

    await expect(
      getWalletLightningAddress(
        "02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
        "Merchant 36F9"
      )
    ).rejects.toMatchObject({ code: "notConnected" });
  });

  it("gives no address once its wallet was disconnected while it was registered", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress } = loadWallet();
    await connectWallet(seed);
    const sdk = await lastInstance<{ getLightningAddress: jest.Mock; uniffiDestroy: jest.Mock }>();
    const lookup = deferred<{ lightningAddress: string }>();
    sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);

    const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
    await waitForCall(sdk.getLightningAddress);
    // The wallet is disconnected and connected again meanwhile.
    await disconnectWallet();
    // The registration still uses the object: it is destroyed once that ends.
    expect(sdk.uniffiDestroy).not.toHaveBeenCalled();
    const reconnecting = connectWallet(seed);
    lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });

    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    await reconnecting;
    expect(sdk.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("connects again only once the previous instance is destroyed: one per storage", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress, isWalletConnected } =
      loadWallet();
    const mock = sdkMock();
    await connectWallet(seed);
    const sdk = await lastInstance<{ getLightningAddress: jest.Mock; uniffiDestroy: jest.Mock }>();
    const lookup = deferred<{ lightningAddress: string }>();
    sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);
    const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
    await waitForCall(sdk.getLightningAddress);
    await disconnectWallet();

    // A payment being sent stands for this call: the next connection waits for it.
    const reconnecting = connectWallet(seed);
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(isWalletConnected()).toBe(false);

    lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });
    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    await reconnecting;
    expect(mock.connect).toHaveBeenCalledTimes(2);
    expect(mock.connect.mock.invocationCallOrder[1]).toBeGreaterThan(
      sdk.uniffiDestroy.mock.invocationCallOrder[0]
    );
    expect(isWalletConnected()).toBe(true);
  });

  it("gives up on a previous instance still used after the timeout, and creates none", async () => {
    jest.useFakeTimers();
    try {
      const { connectWallet, disconnectWallet, getWalletLightningAddress } = loadWallet();
      const mock = sdkMock();
      await connectWallet(seed);
      const sdk = await lastInstance<{ getLightningAddress: jest.Mock }>();
      const lookup = deferred<{ lightningAddress: string }>();
      sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);
      const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
      await waitForCall(sdk.getLightningAddress);
      await disconnectWallet();

      const reconnecting = connectWallet(seed);
      const failure = expect(reconnecting).rejects.toMatchObject({ code: "alreadyConnected" });
      await jest.advanceTimersByTimeAsync(PREVIOUS_INSTANCE_TIMEOUT_MS);
      await failure;
      expect(mock.connect).toHaveBeenCalledTimes(1);

      // The slot is free: a later attempt waits again, then connects once the call ends.
      const later = connectWallet(seed);
      lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });
      await expect(address).rejects.toMatchObject({ code: "notConnected" });
      await later;
      expect(mock.connect).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("creates no instance when disconnected while it waits for the previous one", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress, isWalletConnected } =
      loadWallet();
    const mock = sdkMock();
    await connectWallet(seed);
    const sdk = await lastInstance<{ getLightningAddress: jest.Mock }>();
    const lookup = deferred<{ lightningAddress: string }>();
    sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);
    const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
    await waitForCall(sdk.getLightningAddress);
    await disconnectWallet();

    const reconnecting = connectWallet(seed);
    const failure = expect(reconnecting).rejects.toMatchObject({ code: "notConnected" });
    // Till mode while it waits.
    const disconnecting = disconnectWallet();
    lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });
    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    await failure;
    await disconnecting;

    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(isWalletConnected()).toBe(false);
    await expect(connectWallet(seed)).resolves.toBeUndefined();
  });

  it("disconnects at once a connection still waiting for the previous instance", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress } = loadWallet();
    const mock = sdkMock();
    await connectWallet(seed);
    const sdk = await lastInstance<{ getLightningAddress: jest.Mock }>();
    const lookup = deferred<{ lightningAddress: string }>();
    sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);
    const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
    await waitForCall(sdk.getLightningAddress);
    await disconnectWallet();
    const reconnecting = connectWallet(seed);

    // Till mode while it waits: neither waits for the call still running on the previous one.
    await disconnectWallet();
    await expect(reconnecting).rejects.toMatchObject({ code: "notConnected" });
    expect(mock.connect).toHaveBeenCalledTimes(1);

    lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });
    await expect(address).rejects.toMatchObject({ code: "notConnected" });
  });

  it("gives no address answered while its wallet was being disconnected", async () => {
    const { connectWallet, disconnectWallet, getWalletLightningAddress } = loadWallet();
    await connectWallet(seed);
    const sdk = await lastInstance<{
      getLightningAddress: jest.Mock;
      disconnect: jest.Mock;
      uniffiDestroy: jest.Mock;
    }>();
    const lookup = deferred<{ lightningAddress: string }>();
    sdk.getLightningAddress.mockReturnValueOnce(lookup.promise);
    const closing = deferred<void>();
    sdk.disconnect.mockReturnValueOnce(closing.promise);

    const address = getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "Merchant 9EE5");
    await waitForCall(sdk.getLightningAddress);
    // Another account signs in: the address answers while this wallet is still closing.
    const disconnecting = disconnectWallet();
    lookup.resolve({ lightningAddress: "sattleme02c6047f94@breez.tips" });

    await expect(address).rejects.toMatchObject({ code: "notConnected" });
    expect(sdk.uniffiDestroy).not.toHaveBeenCalled();
    closing.resolve();
    await disconnecting;
    expect(sdk.uniffiDestroy).toHaveBeenCalledTimes(1);
  });

  it("needs a connected wallet", async () => {
    const { getWalletLightningAddress } = loadWallet();
    await expect(getWalletLightningAddress(FAKE_IDENTITY_PUBKEY, "x")).rejects.toMatchObject({
      code: "notConnected"
    });
  });
});
