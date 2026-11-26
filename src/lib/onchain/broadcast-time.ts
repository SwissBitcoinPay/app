import { MEMPOOL_TIME_MARGIN_SECONDS } from "@/config/onchain";
import { HOUR_SECONDS, POINT_DELAY_SECONDS } from "@/lib/rates/sources";

import { fetchTxReceived } from "./blockcypher";
import { fetchFirstSeen } from "./mempool-times";

/*
 * When a transaction paying a sale's address was broadcast, whose hour prices it
 * (useOnchainTimes), for the point of sale and payment links:
 * - in the mempool, mempool.space's first sight (mempool-times.ts), which already watches the
 *   address: no other third party learns of the sale;
 * - within MEMPOOL_TIME_MARGIN_SECONDS of a change of point (HH:05: between HH:00 and HH:10),
 *   BlockCypher's time (blockcypher.ts): mempool.space's servers, a few seconds apart, could put
 *   the payment in two hours, one device paid and the other underpaid;
 * - out of the mempool (mined, replaced), BlockCypher's time too: mempool.space no longer tells.
 * Out of the margin, two devices take the same hour, and so does BlockCypher's time (asked by the
 * owner's devices that settle a payment link once its transaction is mined, SaleSettler) unless it
 * received the transaction more than the margin apart from mempool.space.
 */

/**
 * Whether `seconds` (Unix) is within MEMPOOL_TIME_MARGIN_SECONDS of a change of point: between
 * HH:00:00 and HH:09:59 with the 5-minute delay of the points.
 */
export function nearPointChange(seconds: number): boolean {
  const sincePoint =
    (((seconds - POINT_DELAY_SECONDS) % HOUR_SECONDS) + HOUR_SECONDS) % HOUR_SECONDS;
  return (
    sincePoint < MEMPOOL_TIME_MARGIN_SECONDS ||
    sincePoint >= HOUR_SECONDS - MEMPOOL_TIME_MARGIN_SECONDS
  );
}

/**
 * When `txid` was broadcast (Unix ms), or null while that is not known yet: asked again. A
 * transaction `inMempool` (listed unconfirmed) is asked of mempool.space first; while mempool.space
 * does not hold it yet (its server a second behind the one that pushed it), it is asked again as
 * long as `waitForMempool`, then of BlockCypher. Rejects on a failure (`ChainError`).
 */
export async function fetchBroadcastTime(
  txid: string,
  { inMempool, waitForMempool }: { inMempool: boolean; waitForMempool: boolean }
): Promise<number | null> {
  if (inMempool) {
    const seen = await fetchFirstSeen(txid);
    if (seen !== null && !nearPointChange(seen)) return seen * 1000;
    if (seen === null && waitForMempool) return null;
  }
  return fetchTxReceived(txid);
}
