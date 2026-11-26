import { REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import type { ConfirmingTransaction, PaymentMethod } from "@/features/terminal/useSale";
import type { SaleFinal } from "@/lib/payment-link/final";

/**
 * A transaction that paid the address, on the payer's page: its confirmations (REQUIRED_CONFIRMATIONS
 * at most), null when they are not known (never a guess); `confirmed` once the payment counts
 * (useOnchainPayment: every transaction paying the address REQUIRED_CONFIRMATIONS deep).
 */
export type DetailTransaction = { txid: string; confirmations: number | null; confirmed: boolean };

/**
 * What the payer's page tells of a payment being confirmed, or paid: when the request was made,
 * how it was paid, and each transaction
 * that paid its address with its confirmations. No time of payment: LUD-21 tells none, nor does a
 * final version.
 */
export type PaymentDetails = {
  /** Unix seconds: when the request was made (the sale's start, the invoice's date). */
  createdAt: number;
  /** How it was paid; null when nothing proves it. */
  method: PaymentMethod | null;
  /** In the order they were received, those whose time is not known last. */
  transactions: DetailTransaction[];
};

/** How a payment was made, from what proves each part; null when nothing does. */
export function methodOf(lightning: boolean, onchain: boolean): PaymentMethod | null {
  if (lightning && onchain) return "mixed";
  if (lightning) return "lightning";
  return onchain ? "onchain" : null;
}

/** By when each was received (unknown last), then by id: an order that never depends on a list's. */
function chronological<T extends { txid: string; receivedAt: number | null }>(
  txs: readonly T[]
): T[] {
  const time = (tx: T) => tx.receivedAt ?? Number.POSITIVE_INFINITY;
  return [...txs].sort(
    (a, b) => time(a) - time(b) || (a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0)
  );
}

/**
 * Transactions an address watch still follows: each as deep as mempool.space shows it now, up to
 * REQUIRED_CONFIRMATIONS (deeper says nothing more to the payer); confirmed once `proven`, the
 * watch's payment paid (every one of them that deep).
 */
export function watchedTransactions(
  txs: readonly ConfirmingTransaction[],
  proven: boolean
): DetailTransaction[] {
  return chronological(txs).map(({ txid, confirmations }) => {
    const shown = Math.min(Math.max(0, confirmations), REQUIRED_CONFIRMATIONS);
    return { txid, confirmations: shown, confirmed: proven && shown === REQUIRED_CONFIRMATIONS };
  });
}

/**
 * Transactions of a payment no watch follows any more (a checkout link paid over Lightning stops
 * watching its address): confirmed when `proven` and last seen REQUIRED_CONFIRMATIONS deep (as
 * watchedTransactions: one listed after the watch's verdict was not cross-checked), otherwise not
 * known, never a count that may have changed since.
 */
export function settledTransactions(
  txs: readonly ConfirmingTransaction[],
  proven: boolean
): DetailTransaction[] {
  return chronological(txs).map(({ txid, confirmations }) =>
    proven && confirmations >= REQUIRED_CONFIRMATIONS
      ? { txid, confirmations: REQUIRED_CONFIRMATIONS, confirmed: true }
      : { txid, confirmations: null, confirmed: false }
  );
}

/**
 * A sale's final version "paid" (final.ts). Its transactions carry no confirmations, but a sale is
 * paid on-chain only once every transaction paying its address is REQUIRED_CONFIRMATIONS deep
 * (useOnchainPayment), and its final version is published only then (useSale's
 * settlement). Unless its invoices alone paid what was due: the sale is paid at once then, its
 * transactions however deep they were, not known.
 */
export function finalPaidDetails(final: SaleFinal, createdAt: number): PaymentDetails {
  const lightningSats = final.lightning.reduce((sum, paid) => sum + paid.sats, 0n);
  const byLightning = final.due === null || lightningSats >= final.due;
  const transactions = final.onchain?.transactions ?? [];
  return {
    createdAt,
    method: methodOf(final.lightning.length > 0, transactions.length > 0),
    transactions: chronological(transactions).map(({ txid }) =>
      byLightning
        ? { txid, confirmations: null, confirmed: false }
        : { txid, confirmations: REQUIRED_CONFIRMATIONS, confirmed: true }
    )
  };
}
