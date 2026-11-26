import { MEMPOOL_TX_PAGE_URL } from "@/config/onchain";

import { nodeTxPageUrl, type PayerNode } from "./node";

const TXID = /^[0-9a-f]{64}$/i;

/**
 * `txid` as a transaction id is written, in lower case (the same transaction in any case), null
 * for anything but one (64 hex characters): it comes from an explorer, never trusted as it is.
 */
export function normalTxid(txid: string): string | null {
  return TXID.test(txid) ? txid.toLowerCase() : null;
}

/**
 * The page of the transaction `txid` on the explorer the screen reads the chain on: the merchant's
 * own node when it reads there (`node`, in its one spelling: src/lib/onchain/node.ts; a payer's
 * page, the node its link names), else mempool.space (null). The node's own page even while it does
 * not answer and mempool.space is read instead: the explorer the owner chose, and with "Lightning
 * only" nothing may go to mempool.space. Null for anything but a txid (normalTxid).
 */
export function txPageUrl(txid: string, node: PayerNode | null): string | null {
  const id = normalTxid(txid);
  if (id === null) return null;
  return `${pagesOf(node)}${id}`;
}

/**
 * The explorer a screen reads the chain on, as its texts name it (a transaction's link, txPageUrl;
 * the point of sale's "could not check the Bitcoin address in time"): the host (and port) of the
 * merchant's node (`node.example.ch`, `umbrel.local:3006`), else `mempool.space`.
 */
export function explorerName(node: PayerNode | null): string {
  // An address in its one spelling (normalizeNodeUrl) and mempool.space's: `scheme://authority/…`;
  // anything else (never so) said whole, rather than a name it is not.
  const pages = pagesOf(node);
  return /^https?:\/\/([^/]+)/.exec(pages)?.[1] ?? pages;
}

/** Where `node`'s transaction pages are (`…/tx/`): the node's, else mempool.space's. */
function pagesOf(node: PayerNode | null): string {
  return node === null ? MEMPOOL_TX_PAGE_URL : nodeTxPageUrl(node.url);
}
