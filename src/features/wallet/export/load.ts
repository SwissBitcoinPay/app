import { getAccountWalletId } from "@/features/account/session";
import {
  loadDeclarations,
  loadOnchainSales,
  loadRecoveredTransactions
} from "@/features/activity/load";
import {
  acceptanceKey,
  acceptanceTargets,
  applyAcceptances,
  readAcceptances
} from "@/features/activity/acceptance";
import { ownerActivity, type ActivityItem } from "@/features/activity/model";
import {
  activityPeople,
  receivedDeposits,
  receivedPayments,
  type ExportSources
} from "@/features/activity/useActivity";
import { withInvoices } from "@/features/invoices/activity";
import { legacyHistoryItems } from "@/features/activity/legacy-history";
import { openTeam } from "@/features/team/owner";
import { readLegacyHistory } from "@/features/migration/history-import";
import { listPendingDeposits } from "@/lib/breez/wallet";
import { nowUnix } from "@/lib/clock";
import { deriveLinkOwner } from "@/lib/team/keys";

import { readWalletPayments } from "../payments-history";

import type { TimeRange } from "./period";
import { ExportError, exportRows, type ExportRow } from "./rows";

/*
 * Reads what "Export" lists over a period (rows.ts): "Wallet"'s own rows (ownerActivity,
 * src/features/activity/model.ts), built from the wallet's payments of the period rather than its
 * newest ones, with the same declarations, records, orders and invoices as the list. A row is dated
 * by its latest payment and holds all its sale's payments: their sales are read (the registry's
 * declarations) from SALE_SPAN_SECONDS before the period to as long after it, so that a sale whose
 * payments straddle a bound is one row, in the period of its latest payment, never two halves. An
 * invoice of "New invoice" is payable for months (MAX_SALE_SECONDS): the window covers the whole
 * sale of each link the list knows that the period may hold. The payments after the window are read
 * too (the wallet's own storage), without their sales: a row one of them joins (a link's, a
 * transaction the point of sale saw) is dated after the period, and a deposit claimed late is not
 * told unknown. The deposits of "Funds recovered" are read too, to be left out (rows.ts). Never a
 * partial statement: a read of the relays without a majority's answer fails (ExportError "unread"),
 * as "Wallet" waits.
 */

/**
 * How far apart the payments of one sale of the point of sale or of an integration may be: a sale
 * lasts INVOICE_EXPIRY_SECONDS (10 minutes), an integration's invoice an hour at most
 * (docs/integrations.md), with margin for an on-chain payment claimed later. A payment link's sale
 * is bounded by its own end (exportWindow).
 */
export const SALE_SPAN_SECONDS = 24 * 3600;

/**
 * The payments to read for `range`, in Unix seconds (both included): SALE_SPAN_SECONDS around it,
 * widened to the whole sale of each of `links` that may have a payment in it, never past `now`.
 */
export function exportWindow(
  range: TimeRange,
  links: readonly { createdAt: number; endsAt: number }[],
  now: number
): TimeRange {
  let start = range.start - SALE_SPAN_SECONDS;
  let end = range.end + SALE_SPAN_SECONDS;
  for (const link of links) {
    // A payment of its sale comes from its making to its end (its last invoice a little later).
    if (link.createdAt - SALE_SPAN_SECONDS > range.end) continue;
    if (link.endsAt + SALE_SPAN_SECONDS < range.start) continue;
    start = Math.min(start, link.createdAt - SALE_SPAN_SECONDS);
    end = Math.max(end, link.endsAt + SALE_SPAN_SECONDS);
  }
  return { start, end: Math.min(end, now) };
}

/**
 * The lines of `range` (rows.ts), from the open account's wallet (connected, synced with the
 * network: "Export" waits for it, useWalletData) and `sources`, what "Wallet"'s list was built
 * from, and the history copied from the v2 account (legacy-history.ts, every row of the range).
 * Rejects with ExportError "unread" when the roster, a holder's records or the invoices were not
 * read, or a read of the relays had no majority's answer, "receiving" (exportRows); with the
 * wallet's errors when it failed or closed.
 */
export async function loadExportRows(
  range: TimeRange,
  sources: ExportSources,
  now: number = nowUnix()
): Promise<ExportRow[]> {
  const { records, orders, invoices } = sources;
  // Without the roster, no employee's nor integration's mark vouches for a sale: they would be told
  // as the wallet's own receptions. Nor without an employee's or a device's records (their links
  // and sales: who took them), nor the invoices of "New invoice" (their links): the statement would
  // tell those sales otherwise.
  if (records === null || records.roster === null || records.unread > 0 || invoices === null) {
    throw new ExportError("unread");
  }
  const window = exportWindow(range, records.links, now);
  const payments = await readWalletPayments(window.start);
  const deposits = await listPendingDeposits();
  // The sales of the window's payments only: later ones are dated after the period anyway.
  const inWindow = payments.filter((payment) => payment.timestamp <= window.end);
  // Both at once, as "Wallet" reads them: they share their roster's and archive's reads.
  const [declarations, onchain] = await Promise.all([
    loadDeclarations(
      [...receivedPayments(inWindow)].map(([hash, at]) => ({ hash, at })),
      now
    ),
    loadOnchainSales(
      [...receivedDeposits(inWindow, deposits)].map(([txid, at]) => ({ txid, at })),
      now
    )
  ]);
  if (declarations === null) throw new ExportError("unread");
  if (onchain === null || onchain.retry.length > 0) throw new ExportError("unread");
  // The deposits that brought the merchant's funds back ("Funds recovered"): never a line, but
  // unread, one would be told a reception. From a majority of the relays.
  const walletId = getAccountWalletId();
  if (walletId === null) throw new ExportError("unread");
  const recovered = await loadRecoveredTransactions(walletId);
  if (recovered === null) throw new ExportError("unread");
  const items = ownerActivity({
    payments,
    declarations,
    onchainSales: onchain.sales,
    deposits,
    links: records.links,
    sales: records.sales,
    ...activityPeople(records),
    integrationOrders: orders,
    recovered,
    now
  });
  // The owner's acceptances of its sales "Underpaid" (acceptance.ts): an accepted sale is a line,
  // "Paid" at what it received. Unread, it would be left out: from a majority of the relays.
  const targets = acceptanceTargets(items);
  let rowsOf: readonly ActivityItem[] = items;
  if (targets.length > 0) {
    const { team, settings } = openTeam();
    const reads = await readAcceptances(targets, {
      owner: deriveLinkOwner(team).publicKey,
      team,
      relays: settings.relays
    });
    if (targets.some((target) => !reads.has(acceptanceKey(target)))) {
      throw new ExportError("unread");
    }
    rowsOf = applyAcceptances(items, reads);
  }
  // Read by a majority of the relays, as the rest: a statement never leaves its rows out unsaid.
  // Its read only: signing the parts again waits for "Wallet" (history-import.ts).
  const legacy = await readLegacyHistory(now, { refresh: false });
  if (legacy === null) throw new ExportError("unread");
  return exportRows([...withInvoices(rowsOf, invoices), ...legacyHistoryItems(legacy.rows)], range);
}
