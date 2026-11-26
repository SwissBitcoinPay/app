import { MEMPOOL_API_URL } from "@/config/onchain";

import { CHAIN_TIMEOUT_MS, ChainError, type ChainOptions } from "./esplora";

/*
 * Broadcasting a signed transaction through mempool.space (`POST /api/tx`: the raw transaction in
 * hex as the body; the answer is its txid as plain text, or an HTTP 400 carrying the node's error,
 * `sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}`).
 * For the recovery of funds that left the balance (src/features/wallet/funds-recovery.ts): the SDK
 * builds and signs those transactions, and never broadcasts them (spark-sdk 0.28.4, its guide
 * "Recovering funds" names this endpoint for those that go alone). mempool.space is already one
 * of the app's third parties: it learns the device's IP and the transaction.
 *
 * Sending a transaction again is harmless: the recovery sends each step that is ready at every
 * attempt, and a node that holds it already, or a block, says so (`known`). The answer is
 * untrusted: a txid other than the transaction's is refused.
 *
 * A transaction that pays no fee of its own goes with the child that pays it, as a package
 * (broadcastPackage): `POST /api/tx` refuses it alone (the SDK's guide "Recovering funds").
 */

/**
 * What became of a broadcast: `sent`, the node took it; `known`, it holds it already (in a block or
 * its mempool); `refused`, the node refused it (its inputs spent by another version, a replacement
 * paying too little, a timelock not over yet): a later attempt builds what can go then.
 */
export type BroadcastOutcome = "sent" | "known" | "refused";

const TXID = /^[0-9a-f]{64}$/;
/** The node's errors that say it holds the transaction already (Bitcoin Core's -27, or its words). */
const KNOWN =
  /"code"\s*:\s*-27\b|already in (?:block ?chain|the mempool|mempool)|txn-already-known/i;

/** POSTs `body` to `url`: its HTTP status and text; ChainError `network` without an answer. */
async function post(
  url: string,
  body: string,
  contentType: string,
  options: ChainOptions
): Promise<{ status: number; body: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CHAIN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal: controller.signal
    });
    return { status: response.status, body: (await response.text()).trim() };
  } catch (error) {
    throw new ChainError("network", `POST ${url} failed: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Broadcasts the transaction `hex`, whose id is `txid` (lowercase hex). Rejects with ChainError
 * `network` when mempool.space does not answer, or answers neither a txid nor a node's refusal;
 * `invalidResponse` when it names another transaction.
 */
export async function broadcastTransaction(
  hex: string,
  txid: string,
  options: ChainOptions = {},
  baseUrl: string = MEMPOOL_API_URL
): Promise<BroadcastOutcome> {
  if (!TXID.test(txid)) throw new Error("Invalid txid");
  const url = `${baseUrl}/tx`;
  const { status, body } = await post(url, hex, "text/plain", options);
  if (status >= 200 && status < 300) {
    if (body.toLowerCase() !== txid) {
      throw new ChainError("invalidResponse", `POST ${url}: another transaction's id`);
    }
    return "sent";
  }
  // The node's refusal: mempool.space passes it on as an HTTP 400.
  if (status === 400) return KNOWN.test(body) ? "known" : "refused";
  throw new ChainError("network", `POST ${url}: HTTP ${status}`);
}

/**
 * Broadcasts the transaction `parentHex`, whose id is `parentTxid` (lowercase hex), with its child
 * `childHex`, which pays its fee, as a package: `POST /api/txs/package`, the two raw transactions
 * in hex as a JSON array, the parent first (mempool's backend, mempool.space's and a node's own:
 * Bitcoin Core's `submitpackage`, whose answer it passes on). Bitcoin Core answers an entry per
 * transaction (`tx-results`, by wtxid, each naming its txid), with an `error` for one its mempool
 * refused, and `package_msg` "success" when both are in it, sent now or held already. The answer
 * is untrusted: one that names other transactions than the two is refused. Rejects as
 * broadcastTransaction does; a backend without this endpoint (an older one: HTTP 404) as the
 * network, so that the next explorer is asked.
 */
export async function broadcastPackage(
  parentHex: string,
  parentTxid: string,
  childHex: string,
  options: ChainOptions = {},
  baseUrl: string = MEMPOOL_API_URL
): Promise<BroadcastOutcome> {
  if (!TXID.test(parentTxid)) throw new Error("Invalid txid");
  const url = `${baseUrl}/txs/package`;
  const { status, body } = await post(
    url,
    JSON.stringify([parentHex, childHex]),
    "application/json",
    options
  );
  // A refusal of the package as a whole (one that does not parse, a topology Bitcoin Core does not
  // take): mempool's backend answers it as an HTTP 400.
  if (status === 400) return "refused";
  if (status < 200 || status >= 300) throw new ChainError("network", `POST ${url}: HTTP ${status}`);
  const errors = packageErrors(body, parentTxid);
  if (errors === null) {
    throw new ChainError("invalidResponse", `POST ${url}: not the package's answer`);
  }
  if (errors.length === 0) return "sent";
  return errors.every((error) => KNOWN.test(error)) ? "known" : "refused";
}

/**
 * The errors of `submitpackage`'s answer `body` for a package of two whose parent is `parentTxid`
 * (none when both are in the node's mempool); null when it is not such an answer.
 */
function packageErrors(body: string, parentTxid: string): string[] | null {
  let answer: unknown;
  try {
    answer = JSON.parse(body);
  } catch {
    return null;
  }
  if (!answer || typeof answer !== "object") return null;
  const { package_msg: message, "tx-results": results } = answer as Record<string, unknown>;
  if (typeof message !== "string" || !results || typeof results !== "object") return null;
  const entries = Object.values(results as Record<string, unknown>);
  if (entries.length !== 2) return null;
  const errors: string[] = [];
  const txids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return null;
    const { txid, error } = entry as Record<string, unknown>;
    if (typeof txid !== "string" || !TXID.test(txid.toLowerCase())) return null;
    txids.add(txid.toLowerCase());
    if (error !== undefined) {
      if (typeof error !== "string") return null;
      errors.push(error);
    }
  }
  if (txids.size !== 2 || !txids.has(parentTxid)) return null;
  // "success" only when every one is in the mempool: an error otherwise, even if none is named.
  if (message !== "success" && errors.length === 0) errors.push(message);
  return errors;
}
