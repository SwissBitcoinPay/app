import type * as SdkFake from "../../jest/breez-sdk";
import type * as WebFake from "../../jest/breez-sdk-web";
import type { RecoveryQuote, WalletSeed } from "../lib/breez/types";

/*
 * The wallet layer's part of the recovery of funds that left the balance (spark-sdk 0.28.4):
 * what it asks the SDK, and what it accepts of its answers (src/lib/breez/recovery.ts). The
 * orchestration is funds-recovery.test.ts's.
 */

const BREEZ_SDK = "@breeztech/breez-sdk-spark-react-native";
const WEB_SDK = "../lib/breez/web-sdk";
const DESTINATION = "bc1pdestination";
const seed = { tag: "test-seed" } as unknown as WalletSeed;
const webSeed = { type: "mnemonic", mnemonic: "abandon about" } as unknown as WalletSeed;

type SdkMock = typeof SdkFake;

function loadNative() {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
  }));
  /* eslint-disable @typescript-eslint/no-require-imports -- fresh module graph per test */
  const fake = require(BREEZ_SDK) as SdkMock;
  return { fake, ...(require("../lib/breez/wallet") as typeof import("../lib/breez/wallet")) };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function loadWeb() {
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
    ...(require("../lib/breez/wallet.web") as typeof import("../lib/breez/wallet.web"))
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/** The SDK object of the last connection (the wallet layer keeps it to itself). */
async function lastInstance(fake: { connect: unknown }): Promise<Record<string, jest.Mock>> {
  const { results } = (fake.connect as jest.Mock).mock;
  return (await results[results.length - 1].value) as Record<string, jest.Mock>;
}

const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

beforeEach(() => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  jest.clearAllMocks();
});

afterEach(() => {
  if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

describe("the recovery of funds that left the balance (native)", () => {
  it("reads the funds to recover, then none once the SDK saw them recovered", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    await expect(accountRecoveryWallet.getRecoverableFunds(false)).rejects.toMatchObject({
      code: "notConnected"
    });
    fake.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 5000n, method: "cooperative", takenFeeSats: 200n },
      { leafId: "leaf-b", valueSats: 3000n, method: "unilateral", takenFeeSats: 0n }
    ];
    await connectWallet(seed);

    await expect(accountRecoveryWallet.getRecoverableFunds(true)).resolves.toBe(8000n);
    fake.fakeWallet.recovery.recovered.add("leaf-a");
    await expect(accountRecoveryWallet.getRecoverableFunds(false)).resolves.toBe(3000n);
  });

  it("reads the network's rate for the hour, and refuses one out of shape", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    await connectWallet(seed);

    fake.fakeChainFees.hourFee = 7n;
    await expect(accountRecoveryWallet.getHourFeeRate()).resolves.toBe(7n);
    for (const hourFee of [0n, 10_001n]) {
      fake.fakeChainFees.hourFee = hourFee;
      await expect(accountRecoveryWallet.getHourFeeRate()).rejects.toMatchObject({
        name: "WalletError",
        code: "requestFailed"
      });
    }
    fake.fakeChainFees.ratesError = new Error("mempool.space unreachable");
    await expect(accountRecoveryWallet.getHourFeeRate()).rejects.toMatchObject({
      code: "requestFailed"
    });
  });

  it("quotes the leaves worth recovering at the rate, or those named, to the address given", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    fake.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 5000n, method: "cooperative", takenFeeSats: 200n },
      {
        leafId: "leaf-b",
        valueSats: 3000n,
        method: "unilateral",
        takenFeeSats: 0n,
        stage: "refund"
      },
      // 100 + 2 × 111 = 322 sats to recover 300: not worth it at 2 sat/vB.
      { leafId: "leaf-small", valueSats: 300n, method: "cooperative", takenFeeSats: 100n }
    ];
    await connectWallet(seed);

    const quote = await accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null);
    expect(quote).toMatchObject({
      leaves: [
        { leafId: "leaf-a", valueSats: 5000n, method: "cooperative" },
        { leafId: "leaf-b", valueSats: 3000n, method: "unilateral" }
      ],
      destination: DESTINATION,
      feeRateSatPerVbyte: 2n,
      // (200 + 222) + 240 + 200 (the sweep).
      totalFeeSats: 862n,
      needsFunding: false
    });
    const instance = await lastInstance(fake);
    const [[request]] = instance.prepareRecoverFunds.mock.calls as [Record<string, unknown>][];
    expect(request).toMatchObject({
      feeRateSatPerVbyte: 2n,
      // A kind of UTXO only so that a quote that needs funding says so: the app funds none.
      fundingKind: { tag: "P2tr" },
      fundingStrategy: undefined,
      destination: DESTINATION,
      selection: { tag: "RecoverableOnly" }
    });

    const named = await accountRecoveryWallet.prepareRecovery(DESTINATION, 0n, ["leaf-small"]);
    expect(named.leaves).toEqual([
      { leafId: "leaf-small", valueSats: 300n, method: "cooperative" }
    ]);
    expect(instance.prepareRecoverFunds.mock.calls[1][0]).toMatchObject({
      feeRateSatPerVbyte: 0n,
      selection: { tag: "Specific", inner: { leafIds: ["leaf-small"] } }
    });
  });

  it("builds the transactions in broadcast order, and the leaves the operators did not co-sign", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    fake.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 5000n, method: "cooperative", takenFeeSats: 200n },
      {
        leafId: "leaf-c",
        valueSats: 4000n,
        method: "cooperative",
        takenFeeSats: 200n,
        operatorsFail: true
      },
      {
        leafId: "leaf-b",
        valueSats: 3000n,
        method: "unilateral",
        takenFeeSats: 0n,
        stage: "refund"
      },
      // Received with the fee ladder: its refund comes with the child that pays its fee.
      {
        leafId: "leaf-e",
        valueSats: 3500n,
        method: "unilateral",
        takenFeeSats: 0n,
        stage: "refund",
        feeLadder: true
      }
    ];
    await connectWallet(seed);

    const build = await accountRecoveryWallet.buildRecovery(
      await accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null)
    );
    expect(build.leaves.map(({ leafId }) => leafId)).toEqual(["leaf-a", "leaf-b", "leaf-e"]);
    expect(build.failedLeafIds).toEqual(["leaf-c"]);
    expect(
      build.transactions.map(({ kind, leafId, status, childHex }) => ({
        kind,
        leafId,
        status,
        child: childHex !== null
      }))
    ).toEqual([
      { kind: "cooperative", leafId: "leaf-a", status: "ready", child: false },
      { kind: "refund", leafId: "leaf-b", status: "ready", child: false },
      { kind: "refund", leafId: "leaf-e", status: "ready", child: true },
      { kind: "sweep", leafId: null, status: "waiting", child: false }
    ]);
    const sdkRefund = (
      fake.fakeRecoveryBuilds.at(-1)!.response.transactions as { cpfpTxHex?: string }[]
    )[2]!;
    expect(build.transactions[2]!.childHex).toBe(sdkRefund.cpfpTxHex);
    for (const { txid, hex } of build.transactions) {
      expect(txid).toMatch(/^[0-9a-f]{64}$/);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    }
    // Nothing to fund, nothing to sign but the wallet's own.
    const instance = await lastInstance(fake);
    expect(instance.recoverFunds.mock.calls[0][0]).toMatchObject({ fundingInputs: [] });
    expect(instance.recoverFunds.mock.calls[0][1]).toBeUndefined();
  });

  // The SDK quotes such a step only with a funding kind (the fake as the SDK: without one, it
  // refuses the whole selection), which the app gives for that only.
  it("tells a quote that needs funding, and never builds it", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    fake.fakeWallet.recovery.leaves = [
      {
        leafId: "leaf-b",
        valueSats: 3000n,
        method: "unilateral",
        takenFeeSats: 0n,
        needsFunding: true
      }
    ];
    await connectWallet(seed);

    const quote = await accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null);
    expect(quote.needsFunding).toBe(true);
    await expect(accountRecoveryWallet.buildRecovery(quote)).rejects.toMatchObject({
      name: "WalletError",
      code: "requestFailed"
    });
    expect((await lastInstance(fake)).recoverFunds).not.toHaveBeenCalled();
  });

  it("refuses answers out of shape: another destination, a leaf of no value, a bad transaction", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadNative();
    fake.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 5000n, method: "cooperative", takenFeeSats: 200n }
    ];
    await connectWallet(seed);
    const instance = await lastInstance(fake);
    const quote = await accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null);
    const prepared = quote.prepared as unknown as Record<string, unknown>;

    instance.prepareRecoverFunds.mockResolvedValueOnce({ ...prepared, destination: "bc1pother" });
    await expect(
      accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null)
    ).rejects.toMatchObject({ code: "requestFailed" });
    instance.prepareRecoverFunds.mockResolvedValueOnce({
      ...prepared,
      leaves: [{ leafId: "leaf-a", valueSats: 0n, method: fake.RecoveryMethod.Cooperative }]
    });
    await expect(
      accountRecoveryWallet.prepareRecovery(DESTINATION, 2n, null)
    ).rejects.toMatchObject({ code: "requestFailed" });

    const built = (await instance.recoverFunds.getMockImplementation()!(
      { prepared, fundingInputs: [] },
      undefined
    )) as { transactions: Record<string, unknown>[] };
    for (const broken of [
      { txid: "not-a-txid" },
      { txHex: "zz" },
      { cpfpTxHex: "zz" },
      { nodeId: undefined },
      { status: { tag: "Mined" } }
    ]) {
      instance.recoverFunds.mockResolvedValueOnce({
        ...built,
        transactions: [{ ...built.transactions[0], ...broken }]
      });
      await expect(accountRecoveryWallet.buildRecovery(quote)).rejects.toMatchObject({
        code: "requestFailed"
      });
    }
  });
});

describe("the recovery of funds that left the balance (web)", () => {
  it("quotes and builds on the web build's shapes, rates and sats as exact numbers", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadWeb();
    fake.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 5000, method: "cooperative", takenFeeSats: 200 },
      { leafId: "leaf-b", valueSats: 3000, method: "unilateral", takenFeeSats: 0, stage: "sweep" }
    ];
    fake.fakeChainFees.hourFee = 4;
    await connectWallet(webSeed);

    await expect(accountRecoveryWallet.getRecoverableFunds(false)).resolves.toBe(8000n);
    const rate = await accountRecoveryWallet.getHourFeeRate();
    expect(rate).toBe(4n);
    const quote: RecoveryQuote = await accountRecoveryWallet.prepareRecovery(
      DESTINATION,
      rate,
      null
    );
    expect(quote).toMatchObject({
      leaves: [
        { leafId: "leaf-a", valueSats: 5000n, method: "cooperative" },
        { leafId: "leaf-b", valueSats: 3000n, method: "unilateral" }
      ],
      // (200 + 444) + 0 (its refund confirmed) + 400 (the sweep).
      totalFeeSats: 1044n,
      needsFunding: false
    });
    const instance = await lastInstance(fake);
    expect(instance.prepareRecoverFunds.mock.calls[0][0]).toEqual({
      feeRateSatPerVbyte: 4,
      destination: DESTINATION,
      selection: { type: "recoverableOnly" },
      fundingKind: { type: "p2tr" }
    });

    const build = await accountRecoveryWallet.buildRecovery(quote);
    expect(build.transactions.map(({ kind, status }) => [kind, status])).toEqual([
      ["cooperative", "ready"],
      ["refund", "confirmed"],
      ["sweep", "ready"]
    ]);
  });

  it("refuses sats that are not exact, and a rate it would not ask", async () => {
    const { fake, connectWallet, accountRecoveryWallet } = loadWeb();
    await connectWallet(webSeed);
    const instance = await lastInstance(fake);

    instance.getInfo.mockResolvedValueOnce({
      identityPubkey: "02ab",
      balanceSats: 0,
      recoverableFundsSats: 0.5
    });
    await expect(accountRecoveryWallet.getRecoverableFunds(false)).rejects.toMatchObject({
      code: "requestFailed"
    });
    fake.fakeChainFees.hourFee = 2.5;
    await expect(accountRecoveryWallet.getHourFeeRate()).rejects.toMatchObject({
      code: "requestFailed"
    });
    await expect(
      accountRecoveryWallet.prepareRecovery(DESTINATION, 10_001n, null)
    ).rejects.toMatchObject({ code: "requestFailed" });
    expect(instance.prepareRecoverFunds).not.toHaveBeenCalled();
  });
});
