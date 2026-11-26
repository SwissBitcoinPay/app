import { MEMPOOL_TIME_MARGIN_SECONDS } from "@/config/onchain";
import { fetchBroadcastTime, nearPointChange } from "@/lib/onchain/broadcast-time";

import { taprootAddress } from "../../jest/bitcoin";
import type * as MempoolFake from "../../jest/mempool";

// The explorers' chain of jest.setup.ts: mempool.space's first sight and BlockCypher's time.
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const at = (time: string) => Date.parse(`2026-10-13T${time}Z`) / 1000;

describe("nearPointChange", () => {
  it("is true between HH:00:00 and HH:09:59", () => {
    expect(MEMPOOL_TIME_MARGIN_SECONDS).toBe(300);
    for (const time of ["13:59:59", "14:10:00", "14:30:00", "00:20:00", "23:50:00"]) {
      expect([time, nearPointChange(at(time))]).toEqual([time, false]);
    }
    for (const time of ["14:00:00", "14:04:59", "14:05:00", "14:09:59", "00:00:00", "00:09:59"]) {
      expect([time, nearPointChange(at(time))]).toEqual([time, true]);
    }
  });
});

describe("fetchBroadcastTime", () => {
  /** A payment broadcast at `time` (BlockCypher's), seen by mempool.space `lag` seconds later. */
  function paid(time: string, lag = 1): string {
    mempool.chain.firstSeenLag = lag;
    const txid = mempool.pay(taprootAddress(1), 5_000n);
    mempool.chain.txs.find((tx) => tx.txid === txid)!.receivedAt = at(time) * 1000;
    return txid;
  }

  it("takes mempool.space's first sight far from a change of point", async () => {
    const txid = paid("14:30:00");
    await expect(fetchBroadcastTime(txid, { inMempool: true, waitForMempool: true })).resolves.toBe(
      (at("14:30:00") + 1) * 1000
    );
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it("takes BlockCypher's time near a change of point", async () => {
    const txid = paid("14:04:00");
    await expect(fetchBroadcastTime(txid, { inMempool: true, waitForMempool: true })).resolves.toBe(
      at("14:04:00") * 1000
    );
    expect(mempool.chain.receivedAsked).toEqual([txid]);
  });

  it("takes BlockCypher's time out of the mempool, without asking mempool.space", async () => {
    const txid = paid("14:30:00");
    await expect(
      fetchBroadcastTime(txid, { inMempool: false, waitForMempool: true })
    ).resolves.toBe(at("14:30:00") * 1000);
    expect(mempool.chain.firstSeenAsked).toEqual([]);
  });

  it("waits for mempool.space while asked to, then asks BlockCypher", async () => {
    const txid = paid("14:30:00");
    mempool.chain.firstSeenUnknown = true;
    await expect(
      fetchBroadcastTime(txid, { inMempool: true, waitForMempool: true })
    ).resolves.toBeNull();
    expect(mempool.chain.receivedAsked).toEqual([]);
    await expect(
      fetchBroadcastTime(txid, { inMempool: true, waitForMempool: false })
    ).resolves.toBe(at("14:30:00") * 1000);
    expect(mempool.chain.receivedAsked).toEqual([txid]);
  });

  it("rejects while mempool.space fails, never asking BlockCypher instead", async () => {
    const txid = paid("14:30:00");
    mempool.chain.down.add("https://mempool.space/api");
    await expect(
      fetchBroadcastTime(txid, { inMempool: true, waitForMempool: false })
    ).rejects.toMatchObject({ code: "network" });
    expect(mempool.chain.receivedAsked).toEqual([]);
  });
});
