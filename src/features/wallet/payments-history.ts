import type { WalletPayment } from "@/lib/breez/types";
import { listWalletPaymentsPage } from "@/lib/breez/wallet";

/** Payments read per page of the wallet's history (its local storage), as declarations-copy.ts. */
export const PAYMENTS_PAGE_SIZE = 200;

/**
 * The connected wallet's payments created at or after `since` (Unix seconds), the newest first,
 * page after page of its local storage. Newest first: a payment received meanwhile shifts the
 * pages, which read one again (kept once), never miss one. For "Export" (export/load.ts) and the
 * payments' rates (payment-rates.ts).
 */
export async function readWalletPayments(since: number): Promise<WalletPayment[]> {
  const read = new Map<string, WalletPayment>();
  for (let offset = 0; ; offset += PAYMENTS_PAGE_SIZE) {
    const page = await listWalletPaymentsPage({ since, offset, limit: PAYMENTS_PAGE_SIZE });
    for (const payment of page.payments) read.set(payment.id, payment);
    if (page.listed < PAYMENTS_PAGE_SIZE) break;
  }
  return [...read.values()].sort((a, b) => b.timestamp - a.timestamp);
}
