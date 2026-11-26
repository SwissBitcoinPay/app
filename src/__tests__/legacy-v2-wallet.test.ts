import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Transaction } from "@scure/btc-signer";

import { LEGACY_WALLET_GAP_LIMIT, LEGACY_WALLET_MAX_INPUTS } from "@/config/legacy-v2";
import { MEMPOOL_API_URL } from "@/config/onchain";
import { fetchAddressCoins, type AddressCoins } from "@/lib/onchain/address-coins";
import {
  MIN_TRANSFER_OUTPUT_SATS,
  TransferTooSmallError,
  buildLegacyTransfer,
  coinsTotal,
  isLegacyAccountKey,
  legacyAccountKey,
  legacyAddress,
  legacyWatchKey,
  parseLegacyWatchKey,
  scanLegacyWallet,
  transferableSats,
  wipeLegacyKey,
  type LegacyCoin
} from "@/lib/legacy-v2/wallet";

/*
 * The v2 app's wallet: BIP-84, account 0 of mainnet, without passphrase. The vectors are BIP-84's
 * own (bitcoin/bips, bip-0084.mediawiki, "Test vectors"), of the phrase "abandon … about".
 */

const WORDS =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".split(
    " "
  );
/** A Taproot address, as the account's deposit addresses are. */
const DESTINATION = "bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297";

function txid(n: number): string {
  return n.toString(16).padStart(64, "0");
}

function coin(fields: Partial<LegacyCoin> & { sats: bigint }): LegacyCoin {
  return { txid: txid(1), vout: 0, confirmed: true, chain: 0, index: 0, ...fields };
}

describe("the v2 wallet's keys", () => {
  it("derive the addresses of BIP-84's test vectors", async () => {
    const account = await legacyAccountKey(WORDS);
    expect(legacyAddress(account, 0, 0)).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(legacyAddress(account, 0, 1)).toBe("bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g");
    expect(legacyAddress(account, 1, 0)).toBe("bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el");
  });

  it("keep only a public key, which finds the same addresses and spends nothing", async () => {
    const account = await legacyAccountKey(WORDS);
    const watch = parseLegacyWatchKey(legacyWatchKey(account));
    expect(watch?.privateKey).toBeNull();
    expect(legacyAddress(watch!, 0, 1)).toBe(legacyAddress(account, 0, 1));
    // A private key, or the root's, is no key to keep.
    expect(parseLegacyWatchKey(account.privateExtendedKey)).toBeNull();
    expect(parseLegacyWatchKey("xpub-not-a-key")).toBeNull();
  });

  it("are recognised in the zpub the v2 app gave the v2 server, and in an xpub", async () => {
    const account = await legacyAccountKey(WORDS);
    // BIP-84's "Account 0 root" vector: the very key, in SLIP-132's zpub.
    const zpub =
      "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
    expect(isLegacyAccountKey(account, zpub)).toBe(true);
    expect(isLegacyAccountKey(account, legacyWatchKey(account))).toBe(true);
    // Another wallet's key, a private key, anything else: never.
    const other = await legacyAccountKey(
      "legal winner thank year wave sausage worth useful legal winner thank yellow".split(" ")
    );
    expect(isLegacyAccountKey(account, legacyWatchKey(other))).toBe(false);
    expect(isLegacyAccountKey(account, account.privateExtendedKey)).toBe(false);
    expect(isLegacyAccountKey(account, "zpub-not-a-key")).toBe(false);
    expect(isLegacyAccountKey(account, "")).toBe(false);
  });

  it("are forgotten once wiped", async () => {
    const account = await legacyAccountKey(WORDS);
    wipeLegacyKey(account);
    expect(account.privateKey).toBeNull();
  });
});

describe("scanLegacyWallet", () => {
  /** A fake explorer: the addresses used and the coins they hold. */
  function explorer(byAddress: Map<string, AddressCoins>) {
    const asked: string[] = [];
    const read = jest.fn(async (address: string) => {
      asked.push(address);
      return byAddress.get(address) ?? { used: false, coins: [] };
    });
    return { read, asked };
  }

  it("reads both chains until a gap of unused addresses, and finds their coins", async () => {
    const account = await legacyAccountKey(WORDS);
    const byAddress = new Map<string, AddressCoins>([
      // Payouts on receive addresses 0 to 2, the first one spent already.
      [legacyAddress(account, 0, 0), { used: true, coins: [] }],
      [
        legacyAddress(account, 0, 1),
        { used: true, coins: [{ txid: txid(1), vout: 1, sats: 50_000n, confirmed: true }] }
      ],
      [
        legacyAddress(account, 0, 2),
        { used: true, coins: [{ txid: txid(2), vout: 0, sats: 7_000n, confirmed: false }] }
      ],
      // A payout after a gap of 19 unused addresses: still found.
      [
        legacyAddress(account, 0, 22),
        { used: true, coins: [{ txid: txid(3), vout: 4, sats: 1_000n, confirmed: true }] }
      ],
      // The change of a send of the v2 app.
      [
        legacyAddress(account, 1, 0),
        { used: true, coins: [{ txid: txid(4), vout: 1, sats: 2_500n, confirmed: true }] }
      ]
    ]);
    const { read, asked } = explorer(byAddress);

    const scan = await scanLegacyWallet(account, read);

    expect(scan.coins).toEqual([
      { txid: txid(1), vout: 1, sats: 50_000n, confirmed: true, chain: 0, index: 1 },
      { txid: txid(2), vout: 0, sats: 7_000n, confirmed: false, chain: 0, index: 2 },
      { txid: txid(3), vout: 4, sats: 1_000n, confirmed: true, chain: 0, index: 22 },
      { txid: txid(4), vout: 1, sats: 2_500n, confirmed: true, chain: 1, index: 0 }
    ]);
    expect(scan.next).toEqual({ 0: 23, 1: 1 });
    // Up to the gap after the last used address of each chain (read 4 at a time).
    expect(asked).toContain(legacyAddress(account, 0, 23 + LEGACY_WALLET_GAP_LIMIT - 1));
    expect(asked).not.toContain(legacyAddress(account, 0, 23 + LEGACY_WALLET_GAP_LIMIT + 4));
  });

  it("starts a later look where the last one ended", async () => {
    const account = await legacyAccountKey(WORDS);
    const { read, asked } = explorer(new Map());
    const scan = await scanLegacyWallet(account, read, { 0: 30, 1: 2 });
    expect(scan).toEqual({ coins: [], next: { 0: 30, 1: 2 } });
    expect(asked).not.toContain(legacyAddress(account, 0, 29));
    expect(asked[0]).toBe(legacyAddress(account, 0, 30));
  });

  it("fails rather than miss an address the explorer did not give", async () => {
    const account = await legacyAccountKey(WORDS);
    const read = jest.fn(async () => {
      throw new Error("explorer down");
    });
    await expect(scanLegacyWallet(account, read)).rejects.toThrow("explorer down");
  });

  it("leaves no read running behind it when one fails: it waits for the whole batch", async () => {
    const account = await legacyAccountKey(WORDS);
    // The first address fails at once; the batch's others answer only when let go (a retry).
    let letGo: () => void = () => {};
    const later = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const asked: string[] = [];
    const answered: string[] = [];
    const read = jest.fn(async (address: string): Promise<AddressCoins> => {
      asked.push(address);
      if (address === legacyAddress(account, 0, 0)) throw new Error("explorer down");
      await later;
      answered.push(address);
      return { used: false, coins: [] };
    });
    let ended = false;
    const scan = scanLegacyWallet(account, read).finally(() => {
      ended = true;
    });
    // Let every microtask run: the failure alone does not end the look.
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(asked).toHaveLength(4);
    expect(ended).toBe(false);

    letGo();
    await expect(scan).rejects.toThrow("explorer down");
    // Every read of the batch had ended, and none after it started.
    expect(answered).toEqual([1, 2, 3].map((index) => legacyAddress(account, 0, index)));
    expect(asked).toHaveLength(4);
  });
});

describe("buildLegacyTransfer", () => {
  it("spends every confirmed coin to the destination, less the fee of its size", async () => {
    const account = await legacyAccountKey(WORDS);
    const coins = [
      coin({ txid: txid(1), vout: 1, sats: 50_000n, index: 1 }),
      coin({ txid: txid(2), vout: 0, sats: 7_000n, index: 2, confirmed: false }),
      coin({ txid: txid(4), vout: 1, sats: 2_500n, chain: 1, index: 0 })
    ];

    const transfer = buildLegacyTransfer(account, coins, DESTINATION, 3n);

    expect(transfer.spent.map(({ txid: id }) => id)).toEqual([txid(1), txid(4)]);
    expect(transfer.inputSats).toBe(52_500n);
    expect(transfer.inputSats).toBe(transfer.outputSats + transfer.feeSats);
    const tx = Transaction.fromRaw(hexToBytes(transfer.hex));
    expect(tx.id).toBe(transfer.txid);
    expect(tx.inputsLength).toBe(2);
    expect(tx.outputsLength).toBe(1);
    expect(tx.getOutput(0).amount).toBe(transfer.outputSats);
    // The fee pays the rate on the transaction's size, a vbyte more per coin at most.
    const vsize = BigInt(tx.vsize);
    expect(transfer.feeSats).toBeGreaterThanOrEqual(vsize * 3n);
    expect(transfer.feeSats).toBeLessThanOrEqual((vsize + 2n) * 3n);
    // Its inputs are the coins, the largest first; the unconfirmed one waits for a later transfer.
    expect(bytesToHex(tx.getInput(0).txid!)).toBe(txid(1));
    expect(tx.getInput(0).index).toBe(1);
    expect(bytesToHex(tx.getInput(1).txid!)).toBe(txid(4));
  });

  it("refuses coins that would leave less than the least a transfer must bring", async () => {
    const account = await legacyAccountKey(WORDS);
    expect(() =>
      buildLegacyTransfer(account, [coin({ sats: MIN_TRANSFER_OUTPUT_SATS })], DESTINATION, 2n)
    ).toThrow(TransferTooSmallError);
    expect(() =>
      buildLegacyTransfer(account, [coin({ sats: 10_000n, confirmed: false })], DESTINATION, 2n)
    ).toThrow(TransferTooSmallError);
    // Enough for the fees, however small: always transferred.
    const transfer = buildLegacyTransfer(account, [coin({ sats: 1_000n })], DESTINATION, 1n);
    expect(transfer.outputSats).toBeGreaterThanOrEqual(MIN_TRANSFER_OUTPUT_SATS);
  });

  it("leaves out a coin worth less than its own input's fee: the account gets more", async () => {
    const account = await legacyAccountKey(WORDS);
    const coins = [
      coin({ txid: txid(1), sats: 20_000n, index: 1 }),
      // At 10 sat/vB, its input (68 vB) costs 680 sats: spent, it would bring less than nothing.
      coin({ txid: txid(2), sats: 600n, index: 2 })
    ];
    const transfer = buildLegacyTransfer(account, coins, DESTINATION, 10n);
    expect(transfer.spent.map(({ txid: id }) => id)).toEqual([txid(1)]);
    // Charged a vbyte more per coin (69 vB, 690 sats): 685 sats would still bring less than nothing.
    const near = buildLegacyTransfer(
      account,
      [coins[0]!, coin({ txid: txid(3), sats: 685n, index: 3 })],
      DESTINATION,
      10n
    );
    expect(near.spent.map(({ txid: id }) => id)).toEqual([txid(1)]);
    // Coins all worth less than their fee: nothing to transfer.
    expect(() => buildLegacyTransfer(account, [coins[1]!], DESTINATION, 10n)).toThrow(
      TransferTooSmallError
    );
  });

  it("tells what a transfer moves: never a coin it leaves, nor dust", () => {
    const big = coin({ txid: txid(1), sats: 20_000n, index: 1 });
    // At the least rate (1 sat/vB, 69 vB charged an input): a 60-sat coin is left, never told.
    const dust = coin({ txid: txid(2), sats: 60n, index: 2 });
    const waiting = { ...coin({ txid: txid(3), sats: 5_000n, index: 3 }), confirmed: false };
    expect(transferableSats([big, dust, waiting])).toBe(20_000n);
    expect(transferableSats([dust])).toBe(0n);
    expect(transferableSats([waiting])).toBe(0n);
  });

  it("spends at most LEGACY_WALLET_MAX_INPUTS coins, the largest", async () => {
    const account = await legacyAccountKey(WORDS);
    const coins = Array.from({ length: LEGACY_WALLET_MAX_INPUTS + 3 }, (_, n) =>
      coin({ txid: txid(n + 1), sats: BigInt(1_000 + n) })
    );
    const transfer = buildLegacyTransfer(account, coins, DESTINATION, 1n);
    expect(transfer.spent).toHaveLength(LEGACY_WALLET_MAX_INPUTS);
    expect(transfer.inputSats).toBe(coinsTotal(coins.slice(3)));
  }, 60_000);
});

describe("fetchAddressCoins", () => {
  // The real client: jest.setup.ts replaces it with the fake chain everywhere else.
  const real = jest.requireActual<typeof import("@/lib/onchain/address-coins")>(
    "@/lib/onchain/address-coins"
  );

  function answers(byPath: Record<string, unknown>) {
    return jest.fn(async (url: RequestInfo | URL) => {
      const path = String(url).slice(MEMPOOL_API_URL.length);
      const body = byPath[path];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        json: async () => body
      } as Response;
    });
  }

  const ADDRESS = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
  const stats = (txs: number, funded: number, spent: number) => ({
    tx_count: txs,
    funded_txo_count: funded,
    funded_txo_sum: 0,
    spent_txo_count: spent,
    spent_txo_sum: 0
  });

  it("tells an unused address, a used empty one, and one holding coins", async () => {
    expect(fetchAddressCoins).not.toBe(real.fetchAddressCoins);
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, {
        fetchImpl: answers({
          [`/address/${ADDRESS}`]: { chain_stats: stats(0, 0, 0), mempool_stats: stats(0, 0, 0) }
        })
      })
    ).resolves.toEqual({ used: false, coins: [] });

    const spentOnly = answers({
      [`/address/${ADDRESS}`]: { chain_stats: stats(2, 1, 1), mempool_stats: stats(0, 0, 0) }
    });
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, { fetchImpl: spentOnly })
    ).resolves.toEqual({ used: true, coins: [] });
    // Nothing left to spend: its coins are not asked.
    expect(spentOnly).toHaveBeenCalledTimes(1);

    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, {
        fetchImpl: answers({
          [`/address/${ADDRESS}`]: { chain_stats: stats(1, 1, 0), mempool_stats: stats(1, 1, 0) },
          [`/address/${ADDRESS}/utxo`]: [
            { txid: txid(1), vout: 0, value: 42_000, status: { confirmed: true, block_height: 9 } },
            { txid: txid(2), vout: 3, value: 1_234, status: { confirmed: false } }
          ]
        })
      })
    ).resolves.toEqual({
      used: true,
      coins: [
        { txid: txid(1), vout: 0, sats: 42_000n, confirmed: true },
        { txid: txid(2), vout: 3, sats: 1_234n, confirmed: false }
      ]
    });
  });

  it("refuses an answer out of shape, and fails as the network without one", async () => {
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, {
        fetchImpl: answers({ [`/address/${ADDRESS}`]: { chain_stats: {} } })
      })
    ).rejects.toMatchObject({ name: "ChainError", code: "invalidResponse" });
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, {
        fetchImpl: answers({
          [`/address/${ADDRESS}`]: { chain_stats: stats(1, 1, 0), mempool_stats: stats(0, 0, 0) },
          [`/address/${ADDRESS}/utxo`]: [
            { txid: txid(1), vout: 0, value: 1.5, status: { confirmed: true } }
          ]
        })
      })
    ).rejects.toMatchObject({ code: "invalidResponse" });
    // The same coin twice.
    const same = { txid: txid(1), vout: 0, value: 1, status: { confirmed: true } };
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, {
        fetchImpl: answers({
          [`/address/${ADDRESS}`]: { chain_stats: stats(1, 1, 0), mempool_stats: stats(0, 0, 0) },
          [`/address/${ADDRESS}/utxo`]: [same, same]
        })
      })
    ).rejects.toMatchObject({ code: "invalidResponse" });
    await expect(
      real.fetchAddressCoins(MEMPOOL_API_URL, ADDRESS, { fetchImpl: answers({}) })
    ).rejects.toMatchObject({ code: "network" });
  });
});
