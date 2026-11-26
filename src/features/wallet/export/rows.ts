import type { ActivityItem } from "@/features/activity/model";
import { satsToFiatMinor } from "@/features/wallet/model";
import type { WalletPayment } from "@/lib/breez/types";
import type { PaymentRate } from "@/lib/rates/payment-rates";
import { currencyDigits } from "@/lib/terminal/amount";

import type { TimeRange } from "./period";

/*
 * The lines of "Export" (everything done): the rows of "Wallet" whose state is final, "Paid" (a
 * sale of the point of sale, an invoice, an integration's), "Received" and "Sent" (the wallet's own
 * transfers), each as the list shows it; never "Funds recovered" (src/features/activity/model.ts).
 * Amounts stay integer sats (hard rule 3); a line's value in a currency (rowValue) is the sale's
 * own amount, else its sats at the price of bitcoin recorded at its payment, rounded to the nearest
 * minor unit: a value told, never an amount paid (unlike v2's amount invoiced).
 */

/** What a line is, by its row's source: a sale paid, a transfer received, or one sent. */
export type ExportKind = "paid" | "received" | "sent";

export type ExportRow = {
  item: ActivityItem;
  kind: ExportKind;
  /** What moved, in sats: received positive, sent negative (fees excluded, as the list). */
  sats: bigint;
  /**
   * What the wallet paid on top of a transfer it sent (its payments' fees); null for what it
   * received, whose fees the app does not tell (the details' "Fees" are a sending's only).
   */
  feeSats: bigint | null;
};

/** Why an export did not happen, for its message (ExportSheet). */
export type ExportFailure =
  /** A read of the relays without a majority's answer, or a deposit's sale not decided yet. */
  | "unread"
  /** A sale seen paid on-chain whose transaction the wallet does not know yet. */
  | "receiving";

export class ExportError extends Error {
  readonly failure: ExportFailure;

  constructor(failure: ExportFailure, options?: ErrorOptions) {
    super(`Export failed: ${failure}`, options);
    this.name = "ExportError";
    this.failure = failure;
  }
}

const KINDS = {
  pos: "paid",
  link: "paid",
  integration: "paid",
  receive: "received",
  send: "sent"
} as const;

/**
 * The lines of `items` (the owner's rows, the newest first) dated within `range`, the oldest first:
 * those done (no state), whose money the wallet's list shows (`payments`). A sale whose sats are
 * not in the balance yet is "Confirming" (model.ts), never listed here: it is a line of the period
 * its sats are credited in. A paid link none of whose payments the read listed was paid outside the
 * read (another period's line). A row done without an amount would make a wrong statement:
 * ExportError "receiving" rather than leaving it out.
 */
export function exportRows(items: readonly ActivityItem[], range: TimeRange): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const item of items) {
    // "Funds recovered": the merchant's own funds back in the balance, never a line: the sales they
    // came from are lines already.
    if (item.source === "recovered") continue;
    if (item.state !== null || item.timestamp < range.start || item.timestamp > range.end) continue;
    if (item.sats === null) throw new ExportError("receiving");
    // A row copied from the v2 account has no payment of the wallet: a line all the same.
    if (item.payments.length === 0 && !item.imported) continue;
    const kind = KINDS[item.source];
    rows.push({
      item,
      kind,
      sats: kind === "sent" ? -item.sats : item.sats,
      // A row copied from the v2 account tells no fee: none told, never "0".
      feeSats:
        kind === "sent" && !item.imported
          ? item.payments.reduce(
              (total, payment) =>
                payment.status === "completed" ? total + payment.feeSats : total,
              0n
            )
          : null
    });
  }
  return rows.sort(
    (a, b) =>
      a.item.timestamp - b.item.timestamp ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0)
  );
}

/** What a line is worth in a currency (rowValue). */
export type RowValue = {
  /** Minor units of `currency`, signed as `sats`. */
  minor: bigint;
  /** ISO 4217, uppercase, and its decimals. */
  currency: string;
  digits: number;
  /** A sending's fees, minor units of `currency`; null when none are told (rows.ts). */
  feeMinor: bigint | null;
  /** Whether `minor` is the sale's own amount, as it was typed; else the line's sats at `rate`. */
  own: boolean;
  /** The rate recorded at the line's payment (its latest), null when none was. */
  rate: PaymentRate | null;
};

/**
 * The rate recorded at `row`'s payment (src/features/wallet/payment-rates.ts): its latest done,
 * the one the row is dated by (model.ts); null when none was recorded.
 */
export function rowRate(
  row: ExportRow,
  rates: ReadonlyMap<string, PaymentRate>
): PaymentRate | null {
  // A row copied from the v2 account: the v2 server's price of then (legacy-history.ts).
  if (row.item.imported) return row.item.imported.rate;
  let latest: WalletPayment | null = null;
  for (const payment of row.item.payments) {
    if (payment.status !== "completed") continue;
    if (!latest || payment.timestamp > latest.timestamp) latest = payment;
  }
  return (latest && rates.get(latest.id)) ?? null;
}

/**
 * `row`'s value (no CoinGecko for an export, a sale in its own currency): the sale's own amount, in
 * the currency it was typed in; else its sats at the rate recorded at its payment (rowRate), in
 * that rate's currency, rounded to the nearest minor unit (satsToFiatMinor, on integers); null
 * without either (the line tells bitcoin only). A sending's fees at the same rate.
 */
export function rowValue(row: ExportRow, rates: ReadonlyMap<string, PaymentRate>): RowValue | null {
  const rate = rowRate(row, rates);
  const { fiat } = row.item;
  if (fiat !== null) {
    return {
      minor: BigInt(fiat.minor),
      currency: fiat.currency,
      digits: fiat.digits,
      feeMinor: null,
      own: true,
      rate
    };
  }
  if (rate === null) return null;
  const digits = currencyDigits(rate.currency);
  const negative = row.sats < 0n;
  const minor = satsToFiatMinor(negative ? -row.sats : row.sats, digits, rate.rate);
  return {
    minor: negative ? -minor : minor,
    currency: rate.currency,
    digits,
    feeMinor: row.feeSats === null ? null : satsToFiatMinor(row.feeSats, digits, rate.rate),
    own: false,
    rate
  };
}
