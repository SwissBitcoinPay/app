import { MEMPOOL_API_URL } from "@/config/onchain";
import { getWithTimeout } from "@/lib/http";

import { CHAIN_TIMEOUT_MS, ChainError, type ChainOptions } from "./esplora";

/*
 * What mempool.space remembers of the transactions a transaction replaced (RBF: the point of sale
 * and payment links only, not the integrations' specification).
 * `GET /api/v1/tx/:txid/rbf` answers the tree of the replacements its node saw, any version's txid
 * given (`{replacements: {tx: {txid}, time, replaces: [...]}, replaces: [txid]}`; its server code,
 * backend/src/api/rbf-cache.ts). `Access-Control-Allow-Origin: *`.
 *
 * What it says is only a lead: it names transactions, whose content and time BlockCypher tells
 * (blockcypher.ts), and a replacement stands for one of them only if both spend a common coin
 * (replacement.ts). A mempool.space that lies can name transactions, never move a payment's time.
 *
 * It forgets: a chain is removed 24 h after its last version was mined or left the mempool
 * (rbf-cache.ts, `evict`), and its servers do not all keep the same (a twentieth of the answers was
 * empty for a chain the others told; two in six the next morning). An empty answer is
 * no proof that nothing was replaced. Asking again is no use: each connection stays on one of its
 * servers (eight answers in a row on one connection were all empty), and the browser
 * and the app keep theirs.
 */

const TXID = /^[0-9a-f]{64}$/;

/**
 * Versions of a chain read at most, and transactions an answer may name (one seen had 10): each
 * one named costs a request to BlockCypher, so a mistaken or lying answer naming
 * hundreds is refused, never followed.
 */
export const MAX_VERSIONS = 25;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A node of the tree (`{tx: {txid}, replaces: [...]}`), or null when it is out of shape. */
function nodeOf(value: unknown): { txid: string; replaces: unknown[] } | null {
  if (!isObject(value) || !isObject(value.tx)) return null;
  const { txid } = value.tx;
  if (typeof txid !== "string" || !TXID.test(txid)) return null;
  if (value.replaces !== undefined && !Array.isArray(value.replaces)) return null;
  return { txid, replaces: (value.replaces as unknown[] | undefined) ?? [] };
}

/**
 * The transactions `tree` says `txid` replaced, directly or through earlier replacements; throws
 * when the tree is out of shape.
 */
function replacedIn(tree: unknown, txid: string, url: string): string[] {
  const outOfShape = () => new ChainError("invalidResponse", `GET ${url}: out of shape`);
  let found: string[] | null = null;
  let visited = 0;
  // Each node, with whether it is `txid` or a version `txid` replaced.
  const stack: { value: unknown; under: boolean }[] = [{ value: tree, under: false }];
  while (stack.length > 0) {
    const { value, under } = stack.pop()!;
    visited += 1;
    if (visited > MAX_VERSIONS) throw outOfShape();
    const node = nodeOf(value);
    if (!node) throw outOfShape();
    const ours = node.txid === txid;
    if (ours) found ??= [];
    else if (under) found!.push(node.txid);
    for (const child of node.replaces) stack.push({ value: child, under: under || ours });
  }
  return found ?? [];
}

/**
 * The transactions mempool.space says `txid` replaced (RBF), the earliest versions included, in no
 * order, MAX_VERSIONS at most; empty when it tells none. Rejects on a failure or an answer out of
 * shape (`ChainError`).
 */
export async function fetchReplacedTxids(
  txid: string,
  { fetchImpl = fetch, timeoutMs = CHAIN_TIMEOUT_MS }: ChainOptions = {}
): Promise<string[]> {
  if (!TXID.test(txid)) throw new ChainError("invalidResponse", `Not a transaction id: ${txid}`);
  const url = `${MEMPOOL_API_URL}/v1/tx/${txid}/rbf`;
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
  if (!isObject(body)) throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
  const { replacements, replaces } = body;
  const replaced = new Set<string>();
  if (replacements !== null && replacements !== undefined) {
    for (const other of replacedIn(replacements, txid, url)) replaced.add(other);
  }
  if (replaces !== null && replaces !== undefined) {
    if (!Array.isArray(replaces) || replaces.length > MAX_VERSIONS) {
      throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
    }
    for (const other of replaces) {
      if (typeof other !== "string" || !TXID.test(other)) {
        throw new ChainError("invalidResponse", `GET ${url}: out of shape`);
      }
      replaced.add(other);
    }
  }
  replaced.delete(txid);
  if (replaced.size > MAX_VERSIONS) {
    throw new ChainError("invalidResponse", `GET ${url}: more than ${MAX_VERSIONS} transactions`);
  }
  return [...replaced];
}
