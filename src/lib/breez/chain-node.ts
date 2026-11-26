import { logFailure } from "@/lib/log/log";
import { nodeApiUrl, type BitcoinNode } from "@/lib/onchain/node";

import { MAINNET_CHAIN_SERVICE_URL } from "./config";

/*
 * Where the wallets read the chain on mainnet: the merchant's own
 * Bitcoin node when the open account names one (src/lib/onchain/node.ts), then mempool.space while
 * it does not answer, if the owner allowed it; mempool.space without a node, as before. The app's
 * features tell it (src/features/account/session.ts registers the account's choice): this module
 * stays below them. Read when a wallet connects: a change applies from its next connection.
 */

let nodeOf: () => BitcoinNode | null = () => null;

/** Registers what tells the open account's node (null for mempool.space). */
export function setChainNodeSource(source: () => BitcoinNode | null): void {
  nodeOf = source;
}

/**
 * The chain services' REST APIs, in the order to ask them: the merchant's node, then mempool.space
 * when allowed; mempool.space alone without a node.
 */
export function chainServiceUrls(): string[] {
  let node: BitcoinNode | null = null;
  try {
    node = nodeOf();
  } catch (error) {
    logFailure("Could not read the account's Bitcoin node: the public explorer instead", error);
  }
  if (node === null) return [MAINNET_CHAIN_SERVICE_URL];
  const own = nodeApiUrl(node.url);
  return node.fallback === "mempool" ? [own, MAINNET_CHAIN_SERVICE_URL] : [own];
}

/** When the wallet last fell back to mempool.space (Date.now()): told once a minute at most. */
let fellBackAt = 0;
const FALLBACK_NOTE_EVERY_MS = 60_000;

/** Says in the app's journal that the node did not answer the wallet, once a minute at most. */
function noteFallback(): void {
  const now = Date.now();
  if (now - fellBackAt < FALLBACK_NOTE_EVERY_MS) return;
  fellBackAt = now;
  logFailure("The merchant's Bitcoin node did not answer the wallet: the public explorer instead");
}

/** The methods of a chain service, as both SDK builds name them. */
type ChainMethods = {
  [name: string]: (...args: never[]) => Promise<unknown>;
};

/**
 * `services` as one chain service: each call goes to the first, and to the next one when it fails.
 * With one service, that service as it is. Plain objects only, whose own keys are its methods (the
 * wallets' `withoutAddressWatch`): the SDK's own services keep theirs on their prototype.
 */
export function firstAnswering<T extends object>(services: readonly T[]): T {
  const [first, ...rest] = services;
  if (first === undefined) throw new Error("No chain service");
  if (rest.length === 0) return first;
  const methods = Object.keys(first) as (keyof T & string)[];
  return Object.fromEntries(
    methods.map((name) => [
      name,
      async (...args: never[]) => {
        let failure: unknown;
        for (const [index, service] of services.entries()) {
          try {
            return await (service as unknown as ChainMethods)[name]!(...args);
          } catch (error) {
            failure = error;
            if (index < services.length - 1) noteFallback();
          }
        }
        throw failure;
      }
    ])
  ) as T;
}
