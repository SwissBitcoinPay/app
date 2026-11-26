import type { TFunction } from "i18next";

import { SPLIT_PAYOUT_THRESHOLD_CHF_MINOR } from "@/config/mtpelerin";
import { formatInteger } from "@/lib/locale/format";
import { maskedIban } from "@/lib/mtpelerin/accounts";
import { btcPriceOf, decimalToInteger, decimalToMinor } from "@/lib/mtpelerin/decimal";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { receivedMinor } from "@/lib/mtpelerin/transfer-fee";
import { currencyDigits, formatFiat } from "@/lib/terminal/amount";

/*
 * A sale to Mt Pelerin in the details of its row of "Wallet" (src/features/activity/
 * parts.tsx): what its record keeps (sale-record.ts), in the words of
 * "Sell"'s quote, which the merchant agreed to. What it receives, Mt Pelerin's
 * transfer fee taken (transfer-fee.ts), rounded down (never more than Mt Pelerin wires), its fees
 * up (never less), as the quote showed them (parts.tsx). Its section of the details: the lines
 * below, the order last, pressed to follow the sale
 * (OrderPage). How a deferred sale is wired out later (the grouped transfer) is not told:
 * Mt Pelerin's API links no deferred order to the transfer that pays it out.
 * Pure.
 */

export type MtpSaleLine = {
  /** For the tests and the screen readers' order. */
  key: "received" | "rate" | "fee" | "transferFee" | "account" | "transfer" | "order";
  label: string;
  value: string;
  /**
   * Under the value, smaller: the account's IBAN (masked, `detailMono`), how the transfer goes.
   * Absent: none.
   */
  detail?: string;
  /** The detail is a code (an IBAN): in the mono font. */
  detailMono?: true;
  /** An amount of the merchant's: hidden in the discreet mode (Masked). */
  masked: boolean;
};

/** "1,20 CHF": `minor` units of `currency`, the device's separators. */
function fiatOf(minor: number, currency: string, languageTag: string): string {
  return `${formatFiat(minor, currencyDigits(currency), languageTag)} ${currency}`;
}

/**
 * The lines of `sale`: what the merchant receives, its rate, Mt Pelerin's fees and transfer fee,
 * the bank account (none for a deferred sale), how it is wired, and its order. A figure Mt Pelerin
 * did not give (or past what a number holds) is left out, never guessed.
 */
export function mtpSaleLines(
  sale: MtpSaleRecord,
  t: TFunction,
  languageTag: string
): MtpSaleLine[] {
  const lines: MtpSaleLine[] = [];
  const { currency } = sale.received;
  const received = receivedMinor(sale.received.amount, currency, sale.transferFeeMinor);
  if (received !== null) {
    lines.push({
      key: "received",
      label: t("activity.mtpSale.received"),
      value: fiatOf(received, currency, languageTag),
      masked: true
    });
  }
  if (sale.rate !== null) {
    lines.push({
      key: "rate",
      label: t("sell.quote.rate"),
      value: t("sell.quote.ratePrice", {
        price: `${formatInteger(btcPriceOf(sale.rate), languageTag)} ${currency}`
      }),
      masked: false
    });
  }
  const fee = sale.fees === null ? null : feeText(sale.fees, sale, t, languageTag);
  if (fee !== null) {
    lines.push({ key: "fee", label: t("sell.quote.fee"), value: fee, masked: true });
  }
  // A sale wired at once below Mt Pelerin's threshold (none otherwise: never "0,00").
  if (sale.transferFeeMinor > 0) {
    lines.push({
      key: "transferFee",
      label: t("sell.sale.transferFee"),
      value: fiatOf(sale.transferFeeMinor, currency, languageTag),
      masked: true
    });
  }
  // A deferred sale names no account: its transfer is made later,
  // to the account as it is then; a record of format 1 still has it, never shown.
  const { iban, holder } = sale.account;
  if (!sale.deferred && iban !== null && holder !== null) {
    lines.push({
      key: "account",
      label: t("sell.quote.account"),
      value: holder,
      detail: maskedIban(iban),
      detailMono: true,
      masked: false
    });
  }
  lines.push(
    {
      key: "transfer",
      label: t("sell.sale.transfer"),
      // "Immediate" or "Deferred", and what it means.
      value: t(sale.deferred ? "sell.sale.transferLater" : "sell.sale.transferNow"),
      detail: sale.deferred
        ? t("activity.mtpSale.transferLaterNote", {
            threshold: thresholdText(t, currency, languageTag)
          })
        : t("activity.mtpSale.transferNowNote"),
      masked: false
    },
    { key: "order", label: t("sell.order.reference"), value: sale.shortId, masked: false }
  );
  return lines;
}

/**
 * Mt Pelerin's fees as the quote showed them (parts.tsx `feeTexts`): in the sale's currency, rounded
 * up; or in sats, their value at the sale's rate beside. Null in any other unit.
 */
function feeText(
  fees: NonNullable<MtpSaleRecord["fees"]>,
  sale: MtpSaleRecord,
  t: TFunction,
  languageTag: string
): string | null {
  // None taken: said in words, as the wallet's fees are ("None", not "0.00 CHF · 0 sats").
  if (fees.total.units === 0n) return t("wallet.detail.noFee");
  const { currency } = sale.received;
  const digits = currencyDigits(currency);
  if (fees.currency === currency) {
    const minor = decimalToMinor(fees.total, digits, "up");
    return minor === null ? null : fiatOf(minor, currency, languageTag);
  }
  // In the sold asset: sats, whole (the only asset "Sell" sells, sale.ts `sellAssetOf`).
  if (fees.currency.toLowerCase() !== "sat") return null;
  const sats = decimalToInteger(fees.total);
  if (sats === null) return null;
  const satsText = `${formatInteger(sats, languageTag)} ${sats === 1n ? "sat" : "sats"}`;
  if (sale.rate === null) return satsText;
  const worth = decimalToMinor(
    { units: sats * sale.rate.units, scale: sale.rate.scale },
    digits,
    "up"
  );
  return worth === null ? satsText : `${fiatOf(worth, currency, languageTag)} · ${satsText}`;
}

/**
 * "50 CHF", "the equivalent of 50 CHF": the threshold of Mt Pelerin's grouped transfer, in
 * francs, as "Sell" says it (parts.tsx `transferThresholdText`).
 */
function thresholdText(t: TFunction, currency: string, languageTag: string): string {
  const amount = fiatOf(SPLIT_PAYOUT_THRESHOLD_CHF_MINOR, "CHF", languageTag);
  return currency === "CHF" ? amount : t("sell.sale.equivalentOf", { amount });
}

/**
 * What "Track the sale" opens "Sell" on: the sale's order at Mt Pelerin, looked for since
 * the sale was made (its record's `at`, Unix seconds, in ms).
 */
export function saleOrderTarget(sale: MtpSaleRecord): { orderId: string; fromMs: number } {
  return { orderId: sale.orderId, fromMs: sale.at * 1000 };
}
