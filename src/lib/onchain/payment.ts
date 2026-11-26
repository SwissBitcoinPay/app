import { REQUIRED_CONFIRMATIONS } from "@/config/onchain";

import type { ChainTx } from "./esplora";

/**
 * Where an invoice's on-chain payment stands, from the transactions paying its address (all of
 * them: a payer may pay in several times, or replace a transaction, RBF). Pure: the watch
 * (src/features/onchain/useOnchainPayment.ts) feeds it what the explorers say.
 */
export type OnchainStatus =
  /** Nothing pays the address. */
  | { kind: "none" }
  /** Less than asked: `rest` is missing, whatever the confirmations. */
  | { kind: "underpaid"; received: bigint; rest: bigint }
  /** Enough, not deep enough yet: `confirmations` of the shallowest transaction. */
  | { kind: "unconfirmed"; received: bigint; confirmations: number }
  /** Enough, every transaction at `REQUIRED_CONFIRMATIONS` at least. */
  | { kind: "confirmed"; received: bigint; txids: string[] };

/** Confirmations of `tx` at `tipHeight`: 0 in the mempool, 1 in the last block. */
export function confirmationsOf(tx: ChainTx, tipHeight: number | null): number {
  if (!tx.confirmed || tx.blockHeight === null) return 0;
  // An explorer whose tip lags its own transactions still counts a mined one as 1.
  return tipHeight === null ? 1 : Math.max(1, tipHeight - tx.blockHeight + 1);
}

/** Sats the transactions pay the address, in all. */
export function totalReceived(txs: readonly ChainTx[]): bigint {
  return txs.reduce((sum, tx) => sum + tx.received, 0n);
}

/**
 * The status of a payment of `expected` sats made by `txs`. An overpayment counts as paid: the
 * difference reaches the wallet with the rest.
 */
export function onchainStatus(
  txs: readonly ChainTx[],
  tipHeight: number | null,
  expected: bigint
): OnchainStatus {
  const paying = txs.filter((tx) => tx.received > 0n);
  if (paying.length === 0) return { kind: "none" };
  const received = totalReceived(paying);
  if (received < expected) return { kind: "underpaid", received, rest: expected - received };
  const confirmations = Math.min(...paying.map((tx) => confirmationsOf(tx, tipHeight)));
  return confirmations >= REQUIRED_CONFIRMATIONS
    ? { kind: "confirmed", received, txids: paying.map((tx) => tx.txid) }
    : { kind: "unconfirmed", received, confirmations };
}
