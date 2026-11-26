import { MEMPOOL_API_URL } from "@/config/onchain";
import { getWithTimeout } from "@/lib/http";

import { CHAIN_TIMEOUT_MS, ChainError, type ChainOptions } from "./esplora";

/*
 * When mempool.space first saw a transaction in its mempool (broadcast-time.ts):
 * `GET /api/v1/transaction-times?txId[]=<txid>` answers `[<Unix seconds>]`,
 * 0 for a transaction its mempool does not hold (mined, replaced, or not seen yet). Its server
 * code: backend/src/api/bitcoin/bitcoin.routes.ts (getTransactionTimes) and
 * backend/src/api/mempool.ts (getFirstSeenForTransactions). `Access-Control-Allow-Origin: *`.
 *
 * Each of its servers keeps its own time: eight answers for one transaction gave four values over
 * 7 seconds. The first answer this device got is kept: its own view of a sale never
 * moves. mempool.space already knows the address and its transactions (the address's watch): asking
 * it tells no one anything new.
 */

const TXID = /^[0-9a-f]{64}$/;

/** The first sight read of each transaction (Unix seconds). */
const firstSeen = new Map<string, number>();

/** Tests only. */
export function resetFirstSeen(): void {
  firstSeen.clear();
}

/**
 * When mempool.space first saw `txid` in its mempool (Unix seconds); null when its mempool does not
 * hold it. Rejects on a failure or an answer out of shape (`ChainError`).
 */
export async function fetchFirstSeen(
  txid: string,
  { fetchImpl = fetch, timeoutMs = CHAIN_TIMEOUT_MS }: ChainOptions = {}
): Promise<number | null> {
  if (!TXID.test(txid)) throw new ChainError("invalidResponse", `Not a transaction id: ${txid}`);
  const known = firstSeen.get(txid);
  if (known !== undefined) return known;

  // `txId[]` percent-encoded: brackets are not allowed as such in a query (RFC 3986), which a
  // native HTTP stack may refuse; mempool.space reads both.
  const url = `${MEMPOOL_API_URL}/v1/transaction-times?txId%5B%5D=${txid}`;
  let body: unknown;
  try {
    body = await getWithTimeout(url, fetchImpl, timeoutMs, async (res): Promise<unknown> => {
      if (!res.ok) throw new ChainError("network", `${url} → ${res.status}`);
      return res.json();
    });
  } catch (error) {
    if (error instanceof ChainError) throw error;
    throw new ChainError("network", error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(body) || body.length !== 1) {
    throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
  }
  const [seconds] = body as unknown[];
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds < 0) {
    throw new ChainError("invalidResponse", `GET ${url}: not a time`);
  }
  if (seconds === 0) return null;
  firstSeen.set(txid, seconds);
  return seconds;
}
