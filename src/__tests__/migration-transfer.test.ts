import { schnorr } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { NETWORK, Transaction, p2tr } from "@scure/btc-signer";

import {
  TEST_WALLET_ID,
  openCardHolderAccount,
  openMerchantAccount,
  testSeed
} from "../../jest/account";
import { acceptPassword, legacyV2 } from "../../jest/legacy-v2-server";
import type * as MempoolFake from "../../jest/mempool";
import type * as AccountSession from "@/features/account/session";
import { keychain, putLegacyValue } from "../../jest/react-native-keychain";
import { LEGACY_WALLET_MAX_INPUTS, LEGACY_WALLET_WATCH_INTERVAL_MS } from "@/config/legacy-v2";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import { beginMigration, readWithPassword, resetMigration } from "@/features/migration/flow";
import { forgetFreezeOwed, noteFreezeOwed } from "@/features/migration/freeze";
import { noteLegacyWalletOwner } from "@/features/migration/wallet-owner";
import {
  checkLegacyWallet,
  eraseLegacyWallet,
  resetLegacyWalletCheck,
  subscribeLegacyTransfers,
  transferLegacyWallet,
  transferTypedWords,
  typedLegacyWords
} from "@/features/migration/transfer";
import { accountRecoveryWallet, connectWallet, disconnectWallet } from "@/lib/breez/wallet";
import { wipeDevice } from "@/features/settings/device-wipe";
import { LEGACY_KEYS } from "@/lib/legacy-v2/data";
import { hasLegacyWallet } from "@/lib/legacy-v2/store";
import { legacyAccountKey, legacyAddress, legacyWatchKey } from "@/lib/legacy-v2/wallet";
import { loadLegacyWatch } from "@/lib/legacy-v2/watch-store";
import { parseDepositAddress } from "@/lib/onchain/address";

/*
 * The v2 wallet's money moved to the account's wallet (transfer.ts): over the real wallet layer
 * and the fake SDK (jest/breez-sdk.ts), the fake chain (jest/mempool.ts) and the v2 app's keychain
 * (jest/react-native-keychain.ts).
 */

// One transaction spends a few coins here (500 in the app): a wallet holding more is quick to make.
jest.mock("../config/legacy-v2", () => ({
  ...jest.requireActual("../config/legacy-v2"),
  LEGACY_WALLET_MAX_INPUTS: 3
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { breezNetwork: "mainnet" } } }
}));

const mempool = jest.requireMock<typeof MempoolFake>("@/lib/onchain/esplora");
const apiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;

/** The v2 wallet's words: a BIP-39 test vector, never a real wallet's. */
const V2_WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const PROMPT = { title: "Open your old wallet", cancel: "Cancel" };

async function v2Address(chain: 0 | 1, index: number): Promise<string> {
  return legacyAddress(await legacyAccountKey(V2_WORDS.split(" ")), chain, index);
}

/**
 * The account's deposit addresses: Taproot addresses of real keys (the fake SDK's are programs of
 * one repeated byte, most of them no key, which the transfer refuses to pay rather than lose the
 * money). The key of the scalar `n`, a test value.
 */
function depositAddressOf(n: number): string {
  const secret = new Uint8Array(32);
  secret[31] = n;
  return p2tr(schnorr.getPublicKey(secret), undefined, NETWORK).address!;
}
let deposits = 0;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  mempool.resetMempool();
  resetLegacyWalletCheck();
  await openMerchantAccount();
  await connectWallet(testSeed());
  putLegacyValue(LEGACY_KEYS.mnemonic, V2_WORDS, true);
  // The words the v2 app left go to the account that migrated here (wallet-owner.ts); its v2
  // account not frozen yet: the v2 service may still pay the wallet, its words stay.
  await noteLegacyWalletOwner(TEST_WALLET_ID);
  await noteFreezeOwed(TEST_WALLET_ID);
  deposits = 0;
  jest
    .spyOn(accountRecoveryWallet, "newDepositAddress")
    .mockImplementation(async () => depositAddressOf(++deposits));
});

afterEach(async () => {
  await disconnectWallet();
  closeAccount();
  if (apiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = apiKey;
});

describe("transferLegacyWallet", () => {
  it("notes each transfer's transaction before it is sent, and sends nothing it cannot note", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const before = getAccountSettings()?.legacyTransfers ?? [];
    // The settings cannot be saved: nothing is sent, the coins stay for a later transfer.
    const session = jest.requireActual<typeof AccountSession>("@/features/account/session");
    const failing = jest
      .spyOn(session, "updateAccount")
      .mockRejectedValueOnce(new Error("The settings could not be saved"));
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "failed" });
    expect(mempool.chain.broadcasts).toHaveLength(0);
    expect(getAccountSettings()?.legacyTransfers).toEqual(before);
    failing.mockRestore();

    const first = await transferLegacyWallet(PROMPT);
    if (first.status !== "sent") throw new Error("not sent");
    // A later payout of the v2 service, moved too: both noted, the oldest first.
    mempool.mine();
    mempool.pay(await v2Address(0, 1), 30_000n);
    mempool.mine();
    const second = await transferLegacyWallet(PROMPT);
    if (second.status !== "sent") throw new Error("not sent");
    expect(getAccountSettings()?.legacyTransfers).toEqual([...before, first.txid, second.txid]);
  });

  it("moves the confirmed coins to a new deposit address of the account's wallet", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.pay(await v2Address(0, 1), 12_000n);
    mempool.mine();
    // A payout not confirmed yet: a later transfer moves it.
    mempool.pay(await v2Address(0, 2), 5_000n);

    const outcome = await transferLegacyWallet(PROMPT);

    expect(outcome).toMatchObject({ status: "sent", waitingSats: 5_000n });
    if (outcome.status !== "sent") throw new Error("not sent");
    expect(outcome.outputSats + outcome.feeSats).toBe(52_000n);
    // The words were asked with the app's prompt, once.
    expect(keychain.prompts).toEqual([{ service: LEGACY_KEYS.mnemonic, ...PROMPT }]);
    // Sent through mempool.space: one output, to a deposit address of the account's wallet.
    expect(mempool.chain.broadcasts).toHaveLength(1);
    const [sent] = mempool.chain.broadcasts;
    expect(sent!.txid).toBe(outcome.txid);
    const tx = Transaction.fromRaw(hexToBytes(sent!.hex));
    expect(tx.inputsLength).toBe(2);
    expect(tx.outputsLength).toBe(1);
    expect(tx.getOutput(0).amount).toBe(outcome.outputSats);
    // The network's rate of the hour (the fake SDK's: 2 sat/vB) on its size.
    expect(outcome.feeSats).toBeGreaterThanOrEqual(BigInt(tx.vsize) * 2n);
    expect(outcome.feeSats).toBeLessThanOrEqual(BigInt(tx.vsize + 2) * 2n);
    // Noted in the account's settings: its deposit is no takings (the split's sale, split.ts).
    expect(getAccountSettings()?.legacyTransfers.at(-1)).toBe(outcome.txid);

    // The public key kept, the next look starting at the coin left.
    const { watch } = await loadLegacyWatch();
    expect(watch?.xpub).toMatch(/^xpub/);
    expect(watch?.from).toEqual({ 0: 2, 1: 0 });
  });

  it("pays an address of the account's wallet, never one of the v2 wallet", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const outcome = await transferLegacyWallet(PROMPT);
    if (outcome.status !== "sent") throw new Error("not sent");
    const tx = Transaction.fromRaw(hexToBytes(mempool.chain.broadcasts[0]!.hex));
    const script = tx.getOutput(0).script!;
    // A Taproot output, to the deposit address the account's wallet gave (OP_1, its key).
    expect(accountRecoveryWallet.newDepositAddress).toHaveBeenCalledWith(TEST_WALLET_ID);
    expect(script[0]).toBe(0x51);
    expect(parseDepositAddress(depositAddressOf(1), "mainnet")).toBe(depositAddressOf(1));
    expect(parseDepositAddress(await v2Address(0, 0), "mainnet")).toBeNull();
  });

  it("says when there is nothing, or only money not confirmed yet", async () => {
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "empty" });
    expect(mempool.chain.broadcasts).toEqual([]);

    mempool.pay(await v2Address(0, 0), 8_000n);
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({
      status: "waiting",
      waitingSats: 8_000n
    });
    expect(mempool.chain.broadcasts).toEqual([]);
  });

  it("leaves coins that do not cover the fees where they are", async () => {
    mempool.pay(await v2Address(0, 0), 600n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({
      status: "tooSmall",
      sats: 600n,
      waitingSats: 0n
    });
    expect(mempool.chain.broadcasts).toEqual([]);
  });

  it("asks nothing without words on the device, and says when they could not be read", async () => {
    keychain.entries.clear();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "absent" });
    expect(keychain.prompts).toEqual([]);

    putLegacyValue(LEGACY_KEYS.mnemonic, V2_WORDS, true);
    keychain.biometrics = "dismissed";
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "unreadable" });
  });

  it("fails without moving anything when the explorer does not answer", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    mempool.chain.down.add("https://mempool.space/api");
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "failed" });
    expect(mempool.chain.broadcasts).toEqual([]);
  });

  it("never asks for the words of an account without a wallet of its own", async () => {
    await disconnectWallet();
    closeAccount();
    await openCardHolderAccount();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "failed" });
    expect(keychain.prompts).toEqual([]);
  });

  it("says a transfer the network refused, and moves the coins at the next one", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    // The node refuses whatever comes (the fake answers by txid).
    const refusing = jest
      .spyOn(mempool.chain.broadcastAnswers, "get")
      .mockImplementation(() => "refused");
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "failed" });
    refusing.mockRestore();
    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "sent" });
  });
});

describe('the words typed ("Type my 12 words")', () => {
  it("takes the v2 wallet's words in any case and spacing, never words of no wallet", () => {
    const words = V2_WORDS.split(" ");
    expect(typedLegacyWords(`  ${V2_WORDS.toUpperCase().replace(/ /g, "\n ")}\t`)).toEqual(words);
    // A word changed (its checksum), one missing, 24 words: not a v2 wallet's.
    expect(typedLegacyWords(V2_WORDS.replace("yellow", "zoo"))).toBeNull();
    expect(typedLegacyWords(words.slice(1).join(" "))).toBeNull();
    expect(typedLegacyWords(`${V2_WORDS} ${V2_WORDS}`)).toBeNull();
    expect(typedLegacyWords("")).toBeNull();
  });

  it("moves the coins as the words of the device do, without asking the device", async () => {
    keychain.entries.clear();
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const words = typedLegacyWords(V2_WORDS)!;

    const outcome = await transferTypedWords(words);

    expect(outcome).toMatchObject({ status: "sent", waitingSats: 0n });
    expect(mempool.chain.broadcasts).toHaveLength(1);
    expect(keychain.prompts).toEqual([]);
    // Forgotten once used; the public key kept for "Wallet"'s look.
    expect(words.every((word) => word === "")).toBe(true);
    expect((await loadLegacyWatch()).watch?.from).toEqual({ 0: 1, 1: 0 });
  });

  it("forgets the words of an account without a wallet of its own, moving nothing", async () => {
    await disconnectWallet();
    closeAccount();
    await openCardHolderAccount();
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const words = typedLegacyWords(V2_WORDS)!;
    await expect(transferTypedWords(words)).resolves.toEqual({ status: "failed" });
    expect(words.every((word) => word === "")).toBe(true);
    expect(mempool.chain.calls).toEqual([]);
  });

  it("forgets the words when the transfer fails too", async () => {
    const coins = jest.requireMock<{ fetchAddressCoins: jest.Mock }>("@/lib/onchain/address-coins");
    const spy = jest.spyOn(coins, "fetchAddressCoins").mockRejectedValue(new Error("offline"));
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const words = typedLegacyWords(V2_WORDS)!;
      const transfer = transferTypedWords(words);
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(transfer).resolves.toEqual({ status: "failed" });
      expect(words.every((word) => word === "")).toBe(true);
    } finally {
      jest.useRealTimers();
      spy.mockRestore();
    }
  });

  it("never takes words of a wallet nothing ever paid for the v2 wallet, nor its watch", async () => {
    // The v2 wallet, watched since a first transfer.
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "sent" });
    const before = (await loadLegacyWatch()).watch;
    mempool.chain.broadcasts.length = 0;

    // Two words swapped whose checksum still holds: another wallet, never used.
    const swapped =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const words = typedLegacyWords(swapped)!;
    expect(words).not.toBeNull();
    await expect(transferTypedWords(words)).resolves.toEqual({ status: "unused" });
    expect((await loadLegacyWatch()).watch).toEqual(before);
    expect(mempool.chain.broadcasts).toEqual([]);
    expect(words.every((word) => word === "")).toBe(true);
  });

  describe("when the v2 server listed the v2 app's wallets", () => {
    /** A migration whose v2 account, read on the v2 server, lists `keys` as the v2 app's wallets. */
    async function listing(keys: string[]) {
      legacyV2.account = {
        id: "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
        verified_addresses: keys.map((address) => ({ address, walletConfig: { type: "local" } }))
      };
      acceptPassword("carol@example.com", "the-right-word");
      beginMigration({ role: "owner", account: null, tokens: null, hasWallet: false });
      await expect(readWithPassword("carol@example.com", "the-right-word")).resolves.toEqual({
        ok: true
      });
    }

    afterEach(() => resetMigration());

    it("moves the coins of the words of one of them", async () => {
      await listing([legacyWatchKey(await legacyAccountKey(V2_WORDS.split(" ")))]);
      mempool.pay(await v2Address(0, 0), 40_000n);
      mempool.mine();
      await expect(transferTypedWords(typedLegacyWords(V2_WORDS)!)).resolves.toMatchObject({
        status: "sent"
      });
    });

    it("refuses words of any other wallet before reading anything, even a used one", async () => {
      const other =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      await listing([legacyWatchKey(await legacyAccountKey(V2_WORDS.split(" ")))]);
      const otherKey = await legacyAccountKey(other.split(" "));
      mempool.pay(legacyAddress(otherKey, 0, 0), 40_000n);
      mempool.mine();
      mempool.chain.calls.length = 0;
      const words = typedLegacyWords(other)!;
      await expect(transferTypedWords(words)).resolves.toEqual({ status: "mismatch" });
      expect(mempool.chain.calls).toEqual([]);
      expect(mempool.chain.broadcasts).toEqual([]);
      expect((await loadLegacyWatch()).watch).toBeNull();
      expect(words.every((word) => word === "")).toBe(true);
    });
  });

  it("tells whoever shows a look what a transfer did, whatever it did", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeLegacyTransfers(listener);
    await transferTypedWords(typedLegacyWords(V2_WORDS)!);
    await transferLegacyWallet(PROMPT);
    // Nothing ever paid the v2 wallet here: typed, its words are taken for a slip; read from the
    // device, it is the v2 app's wallet, empty.
    expect(listener.mock.calls).toEqual([[{ status: "unused" }], [{ status: "empty" }]]);
    unsubscribe();
    await transferTypedWords(typedLegacyWords(V2_WORDS)!);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("a later transfer", () => {
  it("starts where the last one left the wallet, not at its first address", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "sent" });
    mempool.pay(await v2Address(0, 1), 9_000n);
    mempool.mine();
    mempool.chain.calls.length = 0;

    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "sent" });
    const read = mempool.chain.calls.map(({ path }) => path);
    expect(read).toContain(`/address/${await v2Address(0, 1)}`);
    expect(read).not.toContain(`/address/${await v2Address(0, 0)}`);
  });

  it("reads an address again once when the explorer failed it", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      mempool.pay(await v2Address(0, 0), 40_000n);
      mempool.mine();
      const coins = jest.requireMock<{ fetchAddressCoins: jest.Mock }>(
        "@/lib/onchain/address-coins"
      );
      let failed = false;
      const spy = jest.spyOn(coins, "fetchAddressCoins").mockImplementation(async (...args) => {
        if (!failed) {
          failed = true;
          throw new Error("HTTP 429");
        }
        return (jest.requireActual("../../jest/mempool") as typeof MempoolFake).fetchAddressCoins(
          ...(args as [string, string])
        );
      });
      const transfer = transferLegacyWallet(PROMPT);
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(transfer).resolves.toMatchObject({ status: "sent" });
      spy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("checkLegacyWallet", () => {
  it("knows nothing before a transfer kept the wallet's public key", async () => {
    await expect(checkLegacyWallet()).resolves.toEqual({ status: "unchecked" });
  });

  it("never offers coins too few to cover a transfer's fees", async () => {
    mempool.pay(await v2Address(0, 0), 600n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "tooSmall" });
    await expect(checkLegacyWallet({ force: true })).resolves.toEqual({ status: "none" });
    // More arrives: worth a transfer now.
    mempool.pay(await v2Address(0, 1), 20_000n);
    mempool.mine();
    await expect(checkLegacyWallet({ force: true })).resolves.toEqual({
      status: "funds",
      confirmedSats: 20_600n,
      waitingSats: 0n
    });
  });

  it("finds what the v2 service paid since, without the words, at most every few hours", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await transferLegacyWallet(PROMPT);
    keychain.prompts = [];
    const now = Date.now();

    await expect(checkLegacyWallet({}, now)).resolves.toEqual({ status: "none" });
    // The v2 service's next payout: on the next address.
    mempool.pay(await v2Address(0, 1), 9_000n);
    // Within the interval: the same answer, the explorer not asked.
    await expect(checkLegacyWallet({}, now + 1_000)).resolves.toEqual({ status: "none" });
    await expect(checkLegacyWallet({}, now + LEGACY_WALLET_WATCH_INTERVAL_MS)).resolves.toEqual({
      status: "funds",
      confirmedSats: 0n,
      waitingSats: 9_000n
    });
    mempool.mine();
    await expect(checkLegacyWallet({ force: true }, now + 2)).resolves.toEqual({
      status: "funds",
      confirmedSats: 9_000n,
      waitingSats: 0n
    });
    // No biometric prompt for a look.
    expect(keychain.prompts).toEqual([]);

    // Moved, the transaction seen by the explorer: the next look finds nothing.
    const moved = await transferLegacyWallet(PROMPT);
    if (moved.status !== "sent") throw new Error("not sent");
    const raw = Transaction.fromRaw(hexToBytes(mempool.chain.broadcasts.at(-1)!.hex));
    mempool.addTransaction(
      moved.txid,
      Array.from({ length: raw.inputsLength }, (_, at) => {
        const input = raw.getInput(at);
        return `${Array.from(input.txid!, (byte) => byte.toString(16).padStart(2, "0")).join("")}:${input.index}`;
      }),
      [[depositAddressOf(deposits), moved.outputSats]]
    );
    await expect(checkLegacyWallet({ force: true })).resolves.toEqual({ status: "none" });
  });
});

describe("the words the v2 app left on this device (wallet-owner.ts)", () => {
  const OTHER = "03" + "ab".repeat(32);

  it("are never read for another account than the one that migrated here", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await noteLegacyWalletOwner(OTHER);
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "absent" });
    await expect(eraseLegacyWallet()).resolves.toBe(false);
    // Nothing asked, sent nor erased.
    expect(keychain.prompts).toEqual([]);
    expect(mempool.chain.broadcasts).toEqual([]);
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it('are no account\'s after "Log out": an account opened next never takes them', async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await wipeDevice();
    // The account of the next person who holds the phone (the same wallet id in this test).
    await openMerchantAccount();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "absent" });
    expect(keychain.prompts).toEqual([]);
    expect(mempool.chain.broadcasts).toEqual([]);
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("are erased once their money moved and the v2 account is frozen", async () => {
    await forgetFreezeOwed(TEST_WALLET_ID);
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const outcome = await transferLegacyWallet(PROMPT);
    expect(outcome).toMatchObject({ status: "sent", waitingSats: 0n, erased: true });
    await expect(hasLegacyWallet()).resolves.toBe(false);
    await expect(loadLegacyWatch()).resolves.toEqual({ watch: null, newer: false });
    // Nothing of the v2 wallet left here: a later transfer finds none.
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "absent" });
  });

  it("are erased when nothing, or only dust, is left", async () => {
    await forgetFreezeOwed(TEST_WALLET_ID);
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "empty", erased: true });
    await expect(hasLegacyWallet()).resolves.toBe(false);

    putLegacyValue(LEGACY_KEYS.mnemonic, V2_WORDS, true);
    await noteLegacyWalletOwner(TEST_WALLET_ID);
    mempool.pay(await v2Address(0, 0), 600n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({
      status: "tooSmall",
      sats: 600n,
      waitingSats: 0n,
      erased: true
    });
    await expect(hasLegacyWallet()).resolves.toBe(false);
  });

  it("stay while money is on its way to the v2 wallet, or its v2 account not frozen", async () => {
    // Not frozen (beforeEach): the v2 service may still pay it.
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toMatchObject({ status: "sent" });
    await expect(hasLegacyWallet()).resolves.toBe(true);

    await forgetFreezeOwed(TEST_WALLET_ID);
    mempool.mine();
    // A payout not confirmed yet, alone or beside coins moved: the words stay for it.
    mempool.pay(await v2Address(0, 1), 5_000n);
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({
      status: "waiting",
      waitingSats: 5_000n
    });
    mempool.pay(await v2Address(0, 2), 30_000n);
    mempool.mine();
    mempool.pay(await v2Address(0, 3), 2_000n);
    const sent = await transferLegacyWallet(PROMPT);
    expect(sent).toMatchObject({ status: "sent", waitingSats: 2_000n });
    expect("erased" in sent && sent.erased).toBeFalsy();
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("stay while a later transfer could still move what is left", async () => {
    await forgetFreezeOwed(TEST_WALLET_ID);
    // Too little at the hour's rate (the fake SDK's 2 sat/vB), enough at the network's least: not
    // dust, a later transfer may move it.
    mempool.pay(await v2Address(0, 0), 800n);
    mempool.mine();
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({
      status: "tooSmall",
      sats: 800n,
      waitingSats: 0n
    });
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("stay while confirmed coins beyond what one transaction spends are left", async () => {
    await forgetFreezeOwed(TEST_WALLET_ID);
    const address = await v2Address(0, 0);
    for (let coin = 0; coin < LEGACY_WALLET_MAX_INPUTS + 1; coin++) mempool.pay(address, 10_000n);
    mempool.mine();
    const outcome = await transferLegacyWallet(PROMPT);
    expect(outcome).toMatchObject({ status: "sent", waitingSats: 0n });
    expect("erased" in outcome && outcome.erased).toBeFalsy();
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("stay when the transfer failed or the words could not be read", async () => {
    await forgetFreezeOwed(TEST_WALLET_ID);
    keychain.biometrics = "dismissed";
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "unreadable" });
    await expect(hasLegacyWallet()).resolves.toBe(true);
    keychain.biometrics = "granted";
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    mempool.chain.down.add("https://mempool.space/api");
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "failed" });
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("are erased without a transfer when their owner keeps the words written down", async () => {
    mempool.pay(await v2Address(0, 0), 40_000n);
    mempool.mine();
    const outcomes: unknown[] = [];
    const unsubscribe = subscribeLegacyTransfers((outcome) => outcomes.push(outcome));
    await expect(eraseLegacyWallet()).resolves.toBe(true);
    unsubscribe();
    // Nothing read nor sent: the money stays in the v2 wallet, for the words written down.
    expect(keychain.prompts).toEqual([]);
    expect(mempool.chain.broadcasts).toEqual([]);
    expect(outcomes).toEqual([]);
    await expect(hasLegacyWallet()).resolves.toBe(false);
    await expect(transferLegacyWallet(PROMPT)).resolves.toEqual({ status: "absent" });
  });
});
