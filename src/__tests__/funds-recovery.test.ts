import { TEST_MNEMONIC, TEST_WALLET_ID, testSeed } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";
import { DEFAULT_RELAYS } from "@/config/relays";
import {
  copyFundsRecoveries,
  readRecoveredTransactions,
  recoverFunds,
  type FundsRecoveryParams
} from "@/features/wallet/funds-recovery";
import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  accountRecoveryWallet,
  connectWallet,
  disconnectWallet,
  isWalletConnected
} from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { parseDepositAddress } from "@/lib/onchain/address";
import {
  fundsRecoveriesEvent,
  fundsRecoveriesOf,
  fundsRecoveryAddress,
  fundsRecoveryFilter,
  type FundsRecoveries,
  type RecoverySubject
} from "@/lib/recovery/record";
import { deriveFundsRecoveryKeys, deriveTeamKeys } from "@/lib/team/keys";

/*
 * The automatic recovery of a wallet's funds that left its balance (funds-recovery.ts): over the
 * real wallet layer and the fake SDK (jest/breez-sdk.ts), the fake relays and mempool.space.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));
jest.mock("@/lib/log/log", () => ({ logFailure: jest.fn(), logEvent: jest.fn() }));

const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const mempool = jest.requireMock<typeof MempoolFake>("@/lib/onchain/esplora");
const relays = jest.requireMock<typeof RelaysFake>("@/lib/nostr/relay");
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: TEST_MNEMONIC }));
const ACCOUNT: RecoverySubject = { kind: "account" };
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

function params(over: Partial<FundsRecoveryParams> = {}): FundsRecoveryParams {
  return {
    wallet: accountRecoveryWallet,
    walletId: TEST_WALLET_ID,
    subject: ACCOUNT,
    team,
    relays: DEFAULT_RELAYS,
    own: () => isWalletConnected(),
    now: () => 1_800_000_000,
    ...over
  };
}

/** The account's record as a majority of the relays hold it. */
async function heldRecord(): Promise<FundsRecoveries | null> {
  const keys = deriveFundsRecoveryKeys(team);
  const answers = await queryRelays(fundsRecoveryFilter(keys, ACCOUNT), {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000
  });
  return fundsRecoveriesOf(keys, ACCOUNT, "mainnet", answers, TEST_WALLET_ID).recoveries;
}

/** Deposit addresses the fake SDK handed out before the test (its count runs across tests). */
let handedOutBefore = 0;
const handedOut = () => sdk.depositAddresses.handedOut - handedOutBefore;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  handedOutBefore = sdk.depositAddresses.handedOut;
  relays.resetRelays();
  jest.clearAllMocks();
  await connectWallet(testSeed());
});

afterEach(async () => {
  await disconnectWallet();
  if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

describe("recoverFunds", () => {
  it("does nothing while nothing left the balance", async () => {
    await expect(recoverFunds(params())).resolves.toEqual({ status: "none" });
    // Not even a read of the relays, nor a deposit address handed out.
    expect(relays.calls).toEqual([]);
    expect(handedOut()).toBe(0);
  });

  it("brings a cooperative leaf back to an address of its own, recorded before it is sent", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];

    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: false,
      stranded: 0
    });

    // Its reserved address, a deposit address of the wallet, the same in its record.
    const record = await heldRecord();
    const destination = record?.destination?.address ?? "";
    expect(parseDepositAddress(destination, "mainnet")).toBe(destination);
    expect(handedOut()).toBe(1);
    // The co-signed recovery to it, sent through mempool.space, its txid in the record first.
    const [build] = sdk.fakeRecoveryBuilds;
    expect(build?.response.destination).toBe(destination);
    const [tx] = build!.response.transactions as { txid: string; txHex: string }[];
    expect(mempool.chain.broadcasts).toEqual([{ txid: tx!.txid, hex: tx!.txHex }]);
    expect(record?.recoveries).toEqual([{ txid: tx!.txid, valueSats: 50_000n, at: 1_800_000_000 }]);
  });

  it("keeps the address it reserved, on every attempt and every device", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    await recoverFunds(params());
    const first = (await heldRecord())?.destination?.address;
    // Sent again at the next attempt: the network holds it already.
    const [{ txid }] = mempool.chain.broadcasts;
    mempool.chain.broadcastAnswers.set(txid, "known");

    await expect(recoverFunds(params({ now: () => 1_800_000_600 }))).resolves.toMatchObject({
      status: "done",
      sent: 1
    });
    expect((await heldRecord())?.destination?.address).toBe(first);
    expect(handedOut()).toBe(1);
    // The same co-signed transaction (same address, same rate): recorded once.
    expect((await heldRecord())?.recoveries).toHaveLength(1);
  });

  it("waits for a lower rate when what it adds passes 300 sats a leaf, whatever was taken before", async () => {
    // 3 sat/vB × 111 vB = 333 sats added: too much. The 5 000 sats the watchtower's transaction
    // took are gone whatever is done: never counted.
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 5000n }
    ];
    sdk.fakeChainFees.hourFee = 3n;
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 0,
      waiting: true,
      stranded: 0
    });
    expect(sdk.fakeRecoveryBuilds).toEqual([]);
    expect(mempool.chain.broadcasts).toEqual([]);

    // 2 sat/vB: 222 sats added, within.
    sdk.fakeChainFees.hourFee = 2n;
    await expect(recoverFunds(params())).resolves.toMatchObject({ status: "done", sent: 1 });
  });

  it("recovers a unilateral leaf step by step: its refund now, its sweep once it confirmed", async () => {
    const leaf: BreezFake.FakeRecoveryLeaf = {
      leafId: "leaf-b",
      valueSats: 30_000n,
      method: "unilateral",
      takenFeeSats: 0n,
      stage: "timelock"
    };
    sdk.fakeWallet.recovery.leaves = [leaf];
    // 1 sat/vB: its refund's 120 sats and the sweep's 100 added, within 300.
    sdk.fakeChainFees.hourFee = 1n;
    // Its refund's timelock not over: nothing to send yet.
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 0,
      waiting: true,
      stranded: 0
    });

    leaf.stage = "refund";
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: true,
      stranded: 0
    });
    leaf.stage = "sweep";
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: false,
      stranded: 0
    });
    // The sweep brings it to the reserved address: recorded with the leaf's value.
    const sweep = (sdk.fakeRecoveryBuilds.at(-1)!.response.transactions as { txid: string }[]).at(
      -1
    )!;
    expect((await heldRecord())?.recoveries).toContainEqual({
      txid: sweep.txid,
      valueSats: 30_000n,
      at: 1_800_000_000
    });
  });

  it("sends a refund received with the fee ladder with the child that pays its fee, as a package", async () => {
    const leaf: BreezFake.FakeRecoveryLeaf = {
      leafId: "leaf-e",
      valueSats: 30_000n,
      method: "unilateral",
      takenFeeSats: 0n,
      stage: "refund",
      feeLadder: true
    };
    sdk.fakeWallet.recovery.leaves = [leaf];
    sdk.fakeChainFees.hourFee = 1n;

    // Its refund alone pays no fee: it goes with its child, then the sweep once it confirmed.
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: true,
      stranded: 0
    });
    const [refund] = sdk.fakeRecoveryBuilds[0]!.response.transactions as {
      txid: string;
      txHex: string;
      cpfpTxHex: string;
    }[];
    expect(mempool.chain.broadcasts).toEqual([
      { txid: refund!.txid, hex: refund!.txHex, childHex: refund!.cpfpTxHex }
    ]);

    // Refused by the node (its parent not confirmed yet, a replacement): tried again later.
    mempool.chain.broadcastAnswers.set(refund!.txid, "refused");
    await expect(recoverFunds(params({ now: () => 1_800_000_600 }))).resolves.toEqual({
      status: "done",
      sent: 0,
      waiting: true,
      stranded: 0
    });

    leaf.stage = "sweep";
    await expect(recoverFunds(params({ now: () => 1_800_001_200 }))).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: false,
      stranded: 0
    });
    expect(mempool.chain.broadcasts.at(-1)).not.toHaveProperty("childHex");
  });

  it("leaves out a unilateral leaf only Bitcoin from outside the wallet recovers, the others go", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n },
      {
        leafId: "leaf-b",
        valueSats: 30_000n,
        method: "unilateral",
        takenFeeSats: 0n,
        stage: "refund",
        needsFunding: true
      },
      {
        leafId: "leaf-c",
        valueSats: 20_000n,
        method: "unilateral",
        takenFeeSats: 0n,
        stage: "sweep"
      }
    ];

    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 2,
      waiting: false,
      stranded: 1
    });
    expect(jest.mocked(logFailure)).toHaveBeenCalledWith(
      "Funds left the balance that only Bitcoin from outside the wallet recovers"
    );
    // Built: the cooperative leaf on its own, then the unilateral leaf that needs nothing.
    expect(
      sdk.fakeRecoveryBuilds.map(({ response }) =>
        (response.leaves as { leafId: string }[]).map(({ leafId }) => leafId)
      )
    ).toEqual([["leaf-a"], ["leaf-c"]]);
  });

  it("tries a leaf the operators did not co-sign again later, sending the others", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n },
      {
        leafId: "leaf-d",
        valueSats: 40_000n,
        method: "cooperative",
        takenFeeSats: 400n,
        operatorsFail: true
      }
    ];
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 1,
      waiting: true,
      stranded: 0
    });
  });

  it("waits while a majority of the relays cannot be read or take the record", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(recoverFunds(params())).resolves.toEqual({ status: "later" });
    relays.unreachable.clear();

    // Readable, but they refuse every write: no address reserved, nothing sent.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(recoverFunds(params())).resolves.toEqual({ status: "later" });
    expect(sdk.fakeRecoveryBuilds).toEqual([]);
    expect(mempool.chain.broadcasts).toEqual([]);
  });

  it("never writes over a newer app's record", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    const keys = deriveFundsRecoveryKeys(team);
    const newer = sealRecord({
      type: "funds-recovery",
      value: { version: 2 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: fundsRecoveryAddress(keys, ACCOUNT),
      createdAt: 1_799_000_000
    });
    await publishToRelays(newer, { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000 });

    await expect(recoverFunds(params())).resolves.toEqual({ status: "later" });
    expect(handedOut()).toBe(0);
    expect(mempool.chain.broadcasts).toEqual([]);
  });

  it("uses the address another device reserved", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    const keys = deriveFundsRecoveryKeys(team);
    const address = taprootAddress(42);
    await publishToRelays(
      fundsRecoveriesEvent(
        keys,
        {
          subject: ACCOUNT,
          walletId: TEST_WALLET_ID,
          destination: { address, at: 1_799_000_000 },
          recoveries: []
        },
        1_799_000_000
      ),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000 }
    );

    await recoverFunds(params());
    expect(handedOut()).toBe(0);
    expect(sdk.fakeRecoveryBuilds[0]?.response.destination).toBe(address);
  });

  it("tries again later when mempool.space does not answer, or the wallet disconnects", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    mempool.chain.broadcastFails = true;
    await expect(recoverFunds(params())).resolves.toEqual({
      status: "done",
      sent: 0,
      waiting: true,
      stranded: 0
    });
    expect(jest.mocked(logFailure)).toHaveBeenCalledWith(
      "Sending a recovery's transaction failed",
      expect.anything()
    );

    // Its connection ended: nothing more on another one.
    await expect(recoverFunds(params({ own: () => false }))).resolves.toEqual({
      status: "later"
    });
    await disconnectWallet();
    await expect(recoverFunds(params())).resolves.toEqual({ status: "later" });
  });

  it("tells the journal when the SDK fails, and tries again later", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    sdk.fakeChainFees.ratesError = new Error("mempool.space unreachable");
    await expect(recoverFunds(params())).resolves.toEqual({ status: "later" });
    expect(jest.mocked(logFailure)).toHaveBeenCalledWith(
      "Recovering a wallet's funds failed",
      expect.objectContaining({ name: "WalletError" })
    );
  });
});

describe("copyFundsRecoveries", () => {
  const NEW = ["wss://new-1.example", "wss://new-2.example"];
  const CARD: RecoverySubject = { kind: "card", cardId: "0".repeat(32), walletGeneration: 1 };

  function recordOf(subject: RecoverySubject, txids: number): FundsRecoveries {
    return {
      subject,
      walletId: TEST_WALLET_ID,
      destination: { address: taprootAddress(1), at: 1_800_000_000 },
      recoveries: Array.from({ length: txids }, (_, i) => ({
        txid: (i + 1).toString(16).padStart(64, "0"),
        valueSats: 1000n,
        at: 1_800_000_000 + i
      }))
    };
  }

  it("copies each wallet's newest record, as it is, to the new relays that lack it", async () => {
    const keys = deriveFundsRecoveryKeys(team);
    const call = (relayList: readonly string[]) => ({
      relays: relayList,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
    const older = fundsRecoveriesEvent(keys, recordOf(ACCOUNT, 1), 1_800_000_100);
    const newest = fundsRecoveriesEvent(keys, recordOf(ACCOUNT, 2), 1_800_000_200);
    const card = fundsRecoveriesEvent(keys, recordOf(CARD, 1), 1_800_000_150);
    // A newer app's, copied as it is too.
    const newer = sealRecord({
      type: "funds-recovery",
      value: { version: 2 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: fundsRecoveryAddress(keys, { ...CARD, walletGeneration: 2 } as RecoverySubject),
      createdAt: 1_800_000_300
    });
    await publishToRelays(older, call(DEFAULT_RELAYS));
    await publishToRelays(newest, call(DEFAULT_RELAYS.slice(0, 1)));
    await publishToRelays(card, call(DEFAULT_RELAYS));
    await publishToRelays(newer, call(DEFAULT_RELAYS.slice(1, 2)));
    // A copy a relay lies about (not signed by the author): never copied.
    const forged = { ...newest, created_at: 1_800_000_900 };
    relays.stored.set(DEFAULT_RELAYS[2]!, [
      ...(relays.stored.get(DEFAULT_RELAYS[2]!) ?? []),
      forged
    ]);

    const callsBefore = relays.calls.length;
    await copyFundsRecoveries(team, DEFAULT_RELAYS, [...NEW, DEFAULT_RELAYS[0]!]);

    for (const relay of NEW) {
      const ids = (relays.stored.get(relay) ?? []).map(({ id }) => id).sort();
      expect(ids).toEqual([newest.id, card.id, newer.id].sort());
    }
    // A relay of both lists: only what it lacked.
    expect(
      relays.calls
        .slice(callsBefore)
        .filter(({ operation, relay }) => operation === "publish" && relay === DEFAULT_RELAYS[0])
        .map(({ event }) => event?.id)
    ).toEqual([newer.id]);
    const read = fundsRecoveriesOf(
      keys,
      ACCOUNT,
      "mainnet",
      new Map(NEW.map((relay) => [relay, relays.stored.get(relay) ?? []])),
      TEST_WALLET_ID
    );
    expect(read.recoveries?.recoveries).toHaveLength(2);
  });

  it("never rejects, the relays out of reach", async () => {
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(copyFundsRecoveries(team, DEFAULT_RELAYS, NEW)).resolves.toBeUndefined();
    expect(NEW.every((relay) => (relays.stored.get(relay) ?? []).length === 0)).toBe(true);
  });
});

describe("readRecoveredTransactions", () => {
  it("names the transactions that brought funds back, with what each recovered", async () => {
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-a", valueSats: 50_000n, method: "cooperative", takenFeeSats: 400n }
    ];
    await recoverFunds(params());
    const [{ txid }] = mempool.chain.broadcasts;

    await expect(
      readRecoveredTransactions(team, TEST_WALLET_ID, ACCOUNT, DEFAULT_RELAYS)
    ).resolves.toEqual(new Map([[txid, 50_000n]]));
    // Another wallet's record: none of them.
    await expect(
      readRecoveredTransactions(
        team,
        TEST_WALLET_ID,
        { kind: "card", cardId: "0".repeat(32), walletGeneration: 1 },
        DEFAULT_RELAYS
      )
    ).resolves.toEqual(new Map());
  });

  it("is null when fewer than a majority answered, or a newer app's copy may name more", async () => {
    // A recovery unread would be told a reception: nothing from fewer than a majority, for "Wallet"
    // as for "Export".
    const half = DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2));
    for (const relay of half) relays.unreachable.add(relay);
    await expect(
      readRecoveredTransactions(team, TEST_WALLET_ID, ACCOUNT, DEFAULT_RELAYS)
    ).resolves.toBeNull();
    relays.unreachable.delete(half[0]!);
    await expect(
      readRecoveredTransactions(team, TEST_WALLET_ID, ACCOUNT, DEFAULT_RELAYS)
    ).resolves.toEqual(new Map());
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(
      readRecoveredTransactions(team, TEST_WALLET_ID, ACCOUNT, DEFAULT_RELAYS)
    ).resolves.toBeNull();
    relays.resetRelays();
    const keys = deriveFundsRecoveryKeys(team);
    await publishToRelays(
      sealRecord({
        type: "funds-recovery",
        value: { version: 2 },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: fundsRecoveryAddress(keys, ACCOUNT),
        createdAt: 1_800_000_000
      }),
      { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: keys.nostr.secretKey }
    );
    await expect(
      readRecoveredTransactions(team, TEST_WALLET_ID, ACCOUNT, DEFAULT_RELAYS)
    ).resolves.toBeNull();
  });
});
