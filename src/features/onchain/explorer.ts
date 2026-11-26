import { MEMPOOL_API_URL, MEMPOOL_WEBSOCKET_URL, NODE_RETRY_AFTER_MS } from "@/config/onchain";
import { getAccountSettings } from "@/features/account/session";
import { loadPosOptions } from "@/features/terminal/options";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { logFailure } from "@/lib/log/log";
import { nodeApiUrl, nodeSocketUrl, type BitcoinNode } from "@/lib/onchain/node";

/*
 * Where this device reads the chain: the merchant's own Bitcoin
 * node when the account names one (src/lib/onchain/node.ts), then, while it does not answer,
 * mempool.space if the owner allowed it ("Use mempool.space"), else nothing ("Lightning
 * only": a sale offers no address meanwhile, and a payment shown is followed once the node is
 * back).
 * Without a node: mempool.space, as before.
 *
 * One explorer, never two: a payment counts once the explorer read shows it deep enough
 * (useOnchainPayment.ts), the owner trusting the node they chose. The payers' pages (`/pay`) read
 * mempool.space (PUBLIC_SOURCES), or the node their link names when the owner passes it on to them
 * (a node of the Internet: isPayersNode). A transaction's link leads to its page on the same
 * explorer (src/lib/onchain/tx-page.ts). What prices an on-chain payment stays public, the same
 * for the merchant and the payer: mempool.space's first sight of a transaction, its history of the
 * replacements and BlockCypher's time (broadcast-time.ts, mempool-rbf.ts, useOnchainTimes.ts).
 */

/** An explorer: its REST API (Esplora's format) and its WebSocket (mempool's). */
export type ChainSource = {
  api: string;
  socket: string;
  /** The merchant's own node, not mempool.space. */
  own: boolean;
};

export const MEMPOOL_SPACE: ChainSource = {
  api: MEMPOOL_API_URL,
  socket: MEMPOOL_WEBSOCKET_URL,
  own: false
};

/** What the payers' pages read, and any device without a node of the merchant's. */
export const PUBLIC_SOURCES: readonly ChainSource[] = [MEMPOOL_SPACE];

/** The explorers for `node` (null: mempool.space), in the order they are asked. */
export function chainSourcesOf(node: BitcoinNode | null): readonly ChainSource[] {
  if (node === null) return PUBLIC_SOURCES;
  const own: ChainSource = {
    api: nodeApiUrl(node.url),
    socket: nodeSocketUrl(node.url),
    own: true
  };
  return node.fallback === "mempool" ? [own, MEMPOOL_SPACE] : [own];
}

/**
 * The merchant's own node this device reads the chain on: the open account's choice on an owner's
 * device (the freshest), else the one its point of sale holds (an employee's, from its channel; an
 * owner's locked device, from the settings: options.ts); null for mempool.space.
 */
export async function deviceBitcoinNode(): Promise<BitcoinNode | null> {
  const settings = getAccountSettings();
  if (settings) return settings.bitcoinNode;
  const profile = await getTerminalProfile();
  if (!profile) return null;
  return (await loadPosOptions(profile)).bitcoinNode;
}

/** The explorers this device reads the chain on (deviceBitcoinNode). */
export async function deviceChainSources(): Promise<readonly ChainSource[]> {
  return chainSourcesOf(await deviceBitcoinNode());
}

/** When each explorer last failed (Date.now()), by API: asked last for NODE_RETRY_AFTER_MS. */
const failedAt = new Map<string, number>();

/** Tests only. */
export function resetExplorerFailures(): void {
  failedAt.clear();
}

/**
 * `sources` in the order to ask them now: one that failed within NODE_RETRY_AFTER_MS goes last, so
 * that a node out of reach (another network, switched off) does not make every read wait for its
 * timeout before mempool.space answers. Never left out: with nothing else, it is asked all the same.
 */
export function orderedSources(sources: readonly ChainSource[]): readonly ChainSource[] {
  const now = Date.now();
  const down = (source: ChainSource) => {
    const at = failedAt.get(source.api);
    return at !== undefined && now - at < NODE_RETRY_AFTER_MS;
  };
  return [...sources.filter((source) => !down(source)), ...sources.filter(down)];
}

/**
 * `read` from the first of `sources` that answers (orderedSources): a failure moves to the next
 * one; with none left, the last failure rejects. An answer out of shape is a failure too: a node
 * that answers something else than mempool's API (a wrong address) is passed over as one that does
 * not answer.
 */
export async function readChain<T>(
  sources: readonly ChainSource[],
  read: (api: string) => Promise<T>
): Promise<T> {
  const order = orderedSources(sources);
  let failure: unknown = new Error("No explorer");
  for (const [index, source] of order.entries()) {
    try {
      const value = await read(source.api);
      failedAt.delete(source.api);
      return value;
    } catch (error) {
      failure = error;
      failedAt.set(source.api, Date.now());
      if (source.own && index < order.length - 1) {
        logFailure(
          "The merchant's Bitcoin node did not answer: the public explorer instead",
          error
        );
      }
    }
  }
  throw failure;
}
