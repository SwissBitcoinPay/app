import { utf8ToBytes } from "@noble/hashes/utils.js";

import { MEMPOOL_API_URL } from "@/config/onchain";
import { getWithTimeout } from "@/lib/http";

import { isNodeKey } from "./bolt11";

/*
 * The name a Lightning node announces (BOLT #7 `node_announcement`, its `alias`), for a card
 * payment's merchant identified by its node (src/lib/card/payee-proof.ts; read from mempool.space,
 * already a third party of the app, which then learns the
 * node of each merchant a card pays and the phone's IP address). Only a public node announces one:
 * a private node (Spark's that signs breez.tips's invoices, a Phoenix wallet's) has none.
 *
 * The alias is the node operator's word only, as a merchant's declared name: anyone may announce
 * any alias, two nodes the same one. It names, it never identifies: the node's key does. And
 * mempool.space's answer is not signed: what it says is read strictly (the node asked, a string of
 * at most what BOLT #7 allows), and is a label, never a decision.
 */

/** A label only: the payment never waits long for it (the payee check, payee-proof.ts). */
export const NODE_ALIAS_TIMEOUT_MS = 3000;
/** BOLT #7: 32 bytes, UTF-8. */
const MAX_ALIAS_BYTES = 32;
/** mempool.space's answer for a node is a few kilobytes: one longer is not read. */
const MAX_ANSWER_LENGTH = 65_536;

export type NodeAliasOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

/**
 * The alias the node `node` (a compressed public key, lowercase hex) announces, as mempool.space
 * tells it; null when it announces none (not public, or an empty alias), or when it cannot be told
 * (no answer in time, an answer out of shape or about another node). Never rejects.
 */
export async function fetchNodeAlias(
  node: string,
  { fetchImpl = fetch, timeoutMs = NODE_ALIAS_TIMEOUT_MS }: NodeAliasOptions = {}
): Promise<string | null> {
  if (!isNodeKey(node)) return null;
  let text: string;
  try {
    text = await getWithTimeout(
      `${MEMPOOL_API_URL}/v1/lightning/nodes/${node}`,
      fetchImpl,
      timeoutMs,
      async (response) => (response.ok ? response.text() : "")
    );
  } catch {
    return null;
  }
  if (text === "" || text.length > MAX_ANSWER_LENGTH) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { public_key: publicKey, alias } = body as Record<string, unknown>;
  if (publicKey !== node || typeof alias !== "string") return null;
  // Announced padded with zero bytes, as BOLT #7 allows.
  const named = alias.replace(/\u0000+$/, "");
  if (named.trim() === "" || utf8ToBytes(named).length > MAX_ALIAS_BYTES) return null;
  return named;
}
