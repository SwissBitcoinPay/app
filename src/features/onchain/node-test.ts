import { Address, NETWORK } from "@scure/btc-signer";

import { NODE_STALE_TIP_SECONDS, NODE_TEST_TIMEOUT_MS } from "@/config/onchain";
import { logFailure } from "@/lib/log/log";
import { ChainError, fetchAddressTxs, fetchTipHeight, fetchTipTime } from "@/lib/onchain/esplora";
import { nodeApiUrl } from "@/lib/onchain/node";
import { nowUnix } from "@/lib/clock";
import { secureRandomBytes } from "@/lib/random";

/*
 * "Test the connection" of "Bitcoin node": whether the node
 * at an address serves what the devices read there (src/features/onchain/explorer.ts), from this
 * device, on its network now:
 * - it answers, with mempool's API (the chain's height);
 * - it lists an address's transactions: a mempool without its address index (electrs, Fulcrum)
 *   could not see a payment;
 * - its last block is recent (NODE_STALE_TIP_SECONDS): a node still catching up would show a
 *   payment as unpaid, and an address paid since as never paid.
 * The address asked is random, a taproot address nobody holds: the test tells the node nothing of
 * the business. Nothing goes to mempool.space.
 */

export type NodeTest =
  /** All three: `height` its chain's. */
  | { status: "ok"; height: number }
  /** No answer: off, another network, a wrong address or port, refused by the browser. */
  | { status: "unreachable" }
  /** An answer, but not mempool's API (another service at that address). */
  | { status: "notMempool" }
  /** mempool's API, without addresses: its address index is missing or not built yet. */
  | { status: "noAddressIndex" }
  /** Behind: its last block is `ageSeconds` old. */
  | { status: "behind"; height: number; ageSeconds: number };

/** A taproot address of 32 random bytes: no one can have paid it. */
function unusedAddress(): string {
  return Address(NETWORK)
    .encode({ type: "tr", pubkey: secureRandomBytes(32) })
    .toLowerCase();
}

/** Tests the node at `url` (its one spelling, src/lib/onchain/node.ts). Never rejects. */
export async function testBitcoinNode(
  url: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<NodeTest> {
  const api = nodeApiUrl(url);
  const chainOptions = { ...options, timeoutMs: NODE_TEST_TIMEOUT_MS };
  let height: number;
  try {
    height = await fetchTipHeight(api, chainOptions);
  } catch (error) {
    if (error instanceof ChainError && error.code === "invalidResponse") {
      return { status: "notMempool" };
    }
    logFailure("Testing the Bitcoin node: no answer", error);
    return { status: "unreachable" };
  }
  try {
    await fetchAddressTxs(api, unusedAddress(), chainOptions);
  } catch (error) {
    logFailure("Testing the Bitcoin node: no address index", error);
    return { status: "noAddressIndex" };
  }
  try {
    const ageSeconds = Math.max(0, nowUnix() - (await fetchTipTime(api, chainOptions)));
    return ageSeconds > NODE_STALE_TIP_SECONDS
      ? { status: "behind", height, ageSeconds }
      : { status: "ok", height };
  } catch (error) {
    logFailure("Testing the Bitcoin node: its last block unread", error);
    return { status: "notMempool" };
  }
}
