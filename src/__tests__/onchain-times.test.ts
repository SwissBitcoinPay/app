import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { OnchainTransaction } from "@/features/onchain/useOnchainPayment";
import {
  FIRST_SEEN_WAIT_MS,
  useOnchainTimes,
  type SightingsBook
} from "@/features/onchain/useOnchainTimes";
import { UNKNOWN_GIVE_UP_MS } from "@/features/onchain/useReplacedTxs";

import { taprootAddress } from "../../jest/bitcoin";
import type * as MempoolFake from "../../jest/mempool";

/*
 * When each transaction paying a sale's address counts from (useOnchainTimes): mempool.space's
 * first sight, BlockCypher's time near a change of point or out of the mempool
 * (src/lib/onchain/broadcast-time.ts), or that of the payment a replacement (RBF) stands for, whichever of the business's devices
 * settles the sale (its records: a SightingsBook, here in memory; sale-sightings.test.ts covers
 * the device's) or mempool.space's history names (jest/mempool.ts; mempool-rbf.test.ts covers the
 * client).
 */

const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const ADDRESS = taprootAddress(1);
/**
 * When BlockCypher received the first payment (Unix ms): an hour before its replacement. At a change
 * of point (HH:05), both: BlockCypher tells their times, not mempool.space (broadcast-time.ts).
 */
const PAID_AT = Date.UTC(2026, 9, 3, 13, 5);
/** When the sale started (Unix seconds). */
const SINCE = PAID_AT / 1000 - 600;

/** The business's devices' records, shared by every hook of a test; `down`: none can be read. */
const recorded = { txids: [] as string[], down: false };
const book: SightingsBook = {
  record: async (address, txid) => {
    if (recorded.down) throw new Error("relays out of reach");
    if (address === ADDRESS && !recorded.txids.includes(txid)) recorded.txids.push(txid);
  },
  read: async (address, since) =>
    recorded.down ? null : address === ADDRESS && since === SINCE ? [...recorded.txids] : []
};

beforeEach(() => {
  mempool.resetMempool();
  Object.assign(recorded, { txids: [], down: false });
});

/** The transaction `txid` as the watch lists it. */
function listedOf(txid: string): OnchainTransaction {
  const tx = mempool.chain.txs.find((other) => other.txid === txid)!;
  return {
    txid,
    sats: tx.outputs.reduce((sum, [to, sats]) => (to === ADDRESS ? sum + sats : sum), 0n),
    confirmations: tx.height === null ? 0 : mempool.chain.tip - tx.height + 1,
    inputs: [...tx.inputs]
  };
}

/** A payment of 10 000 sats broadcast at `at` (Unix ms, BlockCypher's time): its txid. */
function paidAt(at: number): string {
  const txid = mempool.pay(ADDRESS, 10_000n);
  mempool.chain.txs.find((tx) => tx.txid === txid)!.receivedAt = at;
  return txid;
}

/** The hooks of a test: unmounted after it, their reads and retries with them. */
const mounted = new Set<() => unknown>();

afterEach(async () => {
  for (const unmount of mounted) await unmount();
  mounted.clear();
});

async function times(listed: OnchainTransaction[], withBook: SightingsBook | null = book) {
  const hook = await renderHook(() =>
    useOnchainTimes({ address: ADDRESS, listed, book: withBook, since: SINCE, active: true })
  );
  mounted.add(hook.unmount);
  return {
    result: hook.result,
    unmount: async () => {
      mounted.delete(hook.unmount);
      await hook.unmount();
    }
  };
}

/** A payment of 10 000 sats, received at PAID_AT, then bumped: the replacement's txid. */
function paidThenBumped(): { first: string; bump: string } {
  const first = mempool.pay(ADDRESS, 10_000n);
  mempool.chain.txs.find((tx) => tx.txid === first)!.receivedAt = PAID_AT;
  const bump = mempool.replace(first, { more: [mempool.freshCoin()] });
  mempool.chain.txs.find((tx) => tx.txid === bump)!.receivedAt = PAID_AT + 3600_000;
  return { first, bump };
}

describe("useOnchainTimes, the time of a payment", () => {
  /** 13:20:00 UTC: far from a change of point. */
  const QUIET = Date.UTC(2026, 9, 3, 13, 20);

  it("gives a payment in the mempool mempool.space's first sight, never asking BlockCypher", async () => {
    // mempool.space saw it 3 seconds after BlockCypher.
    mempool.chain.firstSeenLag = 3;
    const txid = paidAt(QUIET);
    const { result } = await times([listedOf(txid)]);
    await waitFor(() => expect(result.current.get(txid)).toBe(QUIET + 3000));
    expect(mempool.chain.firstSeenAsked).toEqual([txid]);
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it.each([
    ["12:59:59", "mempool.space", Date.UTC(2026, 9, 3, 12, 59, 59)],
    ["13:00:00", "BlockCypher", Date.UTC(2026, 9, 3, 13, 0, 0)],
    ["13:04:59", "BlockCypher", Date.UTC(2026, 9, 3, 13, 4, 59)],
    ["13:05:00", "BlockCypher", Date.UTC(2026, 9, 3, 13, 5, 0)],
    ["13:09:59", "BlockCypher", Date.UTC(2026, 9, 3, 13, 9, 59)],
    ["13:10:00", "mempool.space", Date.UTC(2026, 9, 3, 13, 10, 0)]
  ])("seen by mempool.space at %s, takes the time %s gives", async (_, source, seenAt) => {
    // BlockCypher received it 2 seconds before mempool.space saw it.
    mempool.chain.firstSeenLag = 2;
    const txid = paidAt(seenAt - 2000);
    const { result } = await times([listedOf(txid)]);
    const fromMempool = source === "mempool.space";
    await waitFor(() =>
      expect(result.current.get(txid)).toBe(fromMempool ? seenAt : seenAt - 2000)
    );
    expect(mempool.chain.receivedAsked).toEqual(fromMempool ? [] : [txid]);
  });

  it("asks BlockCypher, not mempool.space, for a payment mined already", async () => {
    const txid = paidAt(QUIET);
    mempool.mine();
    const { result } = await times([listedOf(txid)]);
    await waitFor(() => expect(result.current.get(txid)).toBe(QUIET));
    expect(mempool.chain.firstSeenAsked).toEqual([]);
    expect(mempool.chain.receivedAsked).toEqual([txid]);
  });

  it("asks again while mempool.space fails, never BlockCypher instead", async () => {
    const txid = paidAt(QUIET);
    mempool.chain.down.add("https://mempool.space/api");
    const { result } = await times([listedOf(txid)]);
    await waitFor(() => expect(mempool.chain.firstSeenAsked).toEqual([txid]));
    expect(result.current.has(txid)).toBe(false);

    mempool.chain.down.clear();
    await waitFor(() => expect(result.current.get(txid)).toBe(QUIET), { timeout: 8000 });
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  describe("a payment mempool.space does not hold yet", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(QUIET);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("is asked of mempool.space again, until it does", async () => {
      const txid = paidAt(QUIET);
      mempool.chain.firstSeenUnknown = true;
      const { result } = await times([listedOf(txid)]);
      await act(async () => jest.advanceTimersByTimeAsync(1000));
      expect(result.current.has(txid)).toBe(false);

      // Its server behind the one that pushed the payment: it holds it seconds later.
      mempool.chain.firstSeenUnknown = false;
      await act(async () => jest.advanceTimersByTimeAsync(10_000));
      expect(result.current.get(txid)).toBe(QUIET);
      expect(mempool.chain.receivedAsked).toEqual([]);
    });

    it("is asked of BlockCypher past FIRST_SEEN_WAIT_MS", async () => {
      const txid = paidAt(QUIET);
      mempool.chain.firstSeenUnknown = true;
      const { result } = await times([listedOf(txid)]);
      await act(async () => jest.advanceTimersByTimeAsync(FIRST_SEEN_WAIT_MS - 1000));
      expect(result.current.has(txid)).toBe(false);
      expect(mempool.chain.receivedAsked).toEqual([]);

      await act(async () => jest.advanceTimersByTimeAsync(FIRST_SEEN_WAIT_MS));
      expect(result.current.get(txid)).toBe(QUIET);
      expect(mempool.chain.receivedAsked).toEqual([txid]);
    });
  });
});

describe("useOnchainTimes", () => {
  it("gives a payment BlockCypher's time near a change of point, once the sale's records are read", async () => {
    const txid = mempool.pay(ADDRESS, 10_000n);
    mempool.chain.txs.find((tx) => tx.txid === txid)!.receivedAt = PAID_AT;
    const { result } = await times([listedOf(txid)]);
    await waitFor(() => expect(result.current.get(txid)).toBe(PAID_AT));
  });

  it("gives a replacement the time of the payment it replaced, seen by another device", async () => {
    // mempool.space forgot the chain (a day after it was mined): the records alone tell.
    mempool.chain.historyForgets = true;
    // The device that saw the first payment records it for the sale.
    const first = mempool.pay(ADDRESS, 10_000n);
    mempool.chain.txs.find((tx) => tx.txid === first)!.receivedAt = PAID_AT;
    const seeing = await times([listedOf(first)]);
    await waitFor(() => expect(seeing.result.current.get(first)).toBe(PAID_AT));
    await seeing.unmount();
    const bump = mempool.replace(first, { more: [mempool.freshCoin()] });
    mempool.chain.txs.find((tx) => tx.txid === bump)!.receivedAt = PAID_AT + 3600_000;

    // Another device, which only ever saw the replacement: BlockCypher tells what the first paid.
    const { result } = await times([listedOf(bump)]);
    await waitFor(() => expect(result.current.get(bump)).toBe(PAID_AT));
  });

  it("gives a replacement the time of the payment it replaced, from mempool.space's history", async () => {
    // A payer's page: no records, nor ever saw the first payment.
    const { first, bump } = paidThenBumped();
    const { result } = await times([listedOf(bump)], null);
    await waitFor(() => expect(result.current.get(bump)).toBe(PAID_AT));
    expect(mempool.chain.historyAsked).toEqual([bump]);
    // BlockCypher told what the first one paid, spent and when.
    expect(mempool.chain.receivedAsked).toContain(first);
  });

  it("asks mempool.space and BlockCypher once for each transaction, an answer restarting nothing", async () => {
    const one = paidThenBumped();
    const two = paidThenBumped();
    const { result } = await times([listedOf(one.bump), listedOf(two.bump)], null);
    await waitFor(() => expect(result.current.get(two.bump)).toBe(PAID_AT));
    expect(result.current.get(one.bump)).toBe(PAID_AT);
    expect([...mempool.chain.historyAsked].sort()).toEqual([one.bump, two.bump].sort());
    const replacedAsked = mempool.chain.receivedAsked.filter(
      (txid) => txid === one.first || txid === two.first
    );
    expect(replacedAsked.sort()).toEqual([one.first, two.first].sort());
  });

  it("gives a replacement its own time when nothing records nor remembers what it replaced", async () => {
    const { bump } = paidThenBumped();
    mempool.chain.historyForgets = true;
    const { result } = await times([listedOf(bump)], null);
    await waitFor(() => expect(result.current.get(bump)).toBe(PAID_AT + 3600_000));
  });

  it("never moves a payment's time for a transaction it does not replace", async () => {
    // An earlier payment of other coins, gone from the explorers but kept by BlockCypher, that
    // mempool.space names (a lie, or a mistake): no coin in common, no replacement.
    const earlier = mempool.pay(ADDRESS, 10_000n);
    const kept = mempool.chain.txs.find((tx) => tx.txid === earlier)!;
    kept.receivedAt = PAID_AT;
    mempool.drop(earlier);
    mempool.chain.replaced.push(kept);
    const late = mempool.pay(ADDRESS, 10_000n);
    mempool.chain.txs.find((tx) => tx.txid === late)!.receivedAt = PAID_AT + 3600_000;
    mempool.chain.historyAlsoNames.set(late, [earlier]);

    const { result } = await times([listedOf(late)], null);
    await waitFor(() => expect(result.current.get(late)).toBe(PAID_AT + 3600_000));
    expect(mempool.chain.receivedAsked).toContain(earlier);
  });

  it("takes a transaction only mempool.space names, unknown to BlockCypher, for none at once", async () => {
    const txid = mempool.pay(ADDRESS, 10_000n);
    mempool.chain.txs.find((tx) => tx.txid === txid)!.receivedAt = PAID_AT;
    const madeUp = "ab".repeat(32);
    mempool.chain.historyAlsoNames.set(txid, [madeUp]);
    const { result } = await times([listedOf(txid)], null);
    // Within seconds, never UNKNOWN_GIVE_UP_MS of requests for it.
    await waitFor(() => expect(result.current.get(txid)).toBe(PAID_AT));
    expect(mempool.chain.receivedAsked.filter((asked) => asked === madeUp)).toHaveLength(1);
  });

  it("tells a payment no time until mempool.space told its history", async () => {
    const { bump } = paidThenBumped();
    mempool.chain.historyFails = true;
    const { result } = await times([listedOf(bump)], null);
    await waitFor(() => expect(mempool.chain.historyAsked).toContain(bump));
    await waitFor(() => expect(mempool.chain.receivedAsked).toContain(bump));
    // Never the replacement's own time, an hour later.
    expect(result.current.has(bump)).toBe(false);

    mempool.chain.historyFails = false;
    await waitFor(() => expect(result.current.get(bump)).toBe(PAID_AT), { timeout: 8000 });
  });

  it("tells a replacement no time while the payment it replaced has none read yet", async () => {
    // This device saw the first payment, whose time BlockCypher fails to tell, then its bump.
    const first = mempool.pay(ADDRESS, 10_000n);
    mempool.chain.txs.find((tx) => tx.txid === first)!.receivedAt = PAID_AT;
    mempool.chain.receivedFailsFor.add(first);
    const hook = await renderHook(
      ({ listed }: { listed: OnchainTransaction[] }) =>
        useOnchainTimes({ address: ADDRESS, listed, book, since: SINCE, active: true }),
      { initialProps: { listed: [listedOf(first)] } }
    );
    mounted.add(hook.unmount);
    await waitFor(() => expect(mempool.chain.receivedAsked).toContain(first));
    const bump = mempool.replace(first, { more: [mempool.freshCoin()] });
    mempool.chain.txs.find((tx) => tx.txid === bump)!.receivedAt = PAID_AT + 3600_000;
    await hook.rerender({ listed: [listedOf(bump)] });
    await waitFor(() => expect(mempool.chain.receivedAsked).toContain(bump));
    // Never the replacement's own time, an hour later.
    expect(hook.result.current.has(bump)).toBe(false);

    mempool.chain.receivedFailsFor.delete(first);
    await waitFor(() => expect(hook.result.current.get(bump)).toBe(PAID_AT), { timeout: 8000 });
  });

  it("tells no time while the records cannot be read: never a guess", async () => {
    const { bump } = paidThenBumped();
    recorded.down = true;
    const { result } = await times([listedOf(bump)]);
    await waitFor(() => expect(mempool.chain.receivedAsked).toContain(bump));
    expect(result.current.has(bump)).toBe(false);
  });

  describe("a recorded transaction BlockCypher does not know yet", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(PAID_AT + 3600_000);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    /** The first payment recorded by another device, then bumped: the replacement's txid. */
    async function recordedThenBumped(): Promise<{ first: string; bump: string }> {
      const first = mempool.pay(ADDRESS, 10_000n);
      mempool.chain.txs.find((tx) => tx.txid === first)!.receivedAt = PAID_AT;
      const seeing = await times([listedOf(first)]);
      await act(async () => jest.advanceTimersByTimeAsync(1000));
      expect(seeing.result.current.get(first)).toBe(PAID_AT);
      await seeing.unmount();
      const bump = mempool.replace(first, { more: [mempool.freshCoin()] });
      mempool.chain.txs.find((tx) => tx.txid === bump)!.receivedAt = PAID_AT + 3600_000;
      return { first, bump };
    }

    it("is asked again until BlockCypher knows it, its time kept by its replacement", async () => {
      const { bump } = await recordedThenBumped();
      mempool.chain.receivedUnknown = true;
      const { result } = await times([listedOf(bump)]);
      await act(async () => jest.advanceTimersByTimeAsync(1000));
      expect(result.current.has(bump)).toBe(false);

      mempool.chain.receivedUnknown = false;
      await act(async () => jest.advanceTimersByTimeAsync(60_000));
      expect(result.current.get(bump)).toBe(PAID_AT);
    });

    it("is taken for one BlockCypher never received after UNKNOWN_GIVE_UP_MS", async () => {
      const { first, bump } = await recordedThenBumped();
      // BlockCypher never saw the first one.
      mempool.chain.replaced = mempool.chain.replaced.filter(({ txid }) => txid !== first);
      const { result } = await times([listedOf(bump)]);
      await act(async () => jest.advanceTimersByTimeAsync(UNKNOWN_GIVE_UP_MS / 2));
      expect(result.current.has(bump)).toBe(false);

      await act(async () => jest.advanceTimersByTimeAsync(UNKNOWN_GIVE_UP_MS));
      expect(result.current.get(bump)).toBe(PAID_AT + 3600_000);
    });
  });

  describe("mempool.space's history failing", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(PAID_AT + 3600_000);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("is given up on after UNKNOWN_GIVE_UP_MS: the payment's own time", async () => {
      const { bump } = paidThenBumped();
      mempool.chain.historyFails = true;
      const { result } = await times([listedOf(bump)], null);
      await act(async () => jest.advanceTimersByTimeAsync(UNKNOWN_GIVE_UP_MS / 2));
      expect(result.current.has(bump)).toBe(false);

      await act(async () => jest.advanceTimersByTimeAsync(UNKNOWN_GIVE_UP_MS));
      expect(result.current.get(bump)).toBe(PAID_AT + 3600_000);
    });
  });
});
