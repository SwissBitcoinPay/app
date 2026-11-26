import type { TFunction } from "i18next";

import { formatSignedFiat, referenceOf, titleOf } from "@/features/wallet/model";
import { formatDate } from "@/lib/locale/date";
import { decimalSeparator, formatInteger } from "@/lib/locale/format";
import { splitFiat } from "@/lib/terminal/amount";

import type { ExportRow } from "./rows";

/*
 * What a line of "Export" says of itself, in the app's language (labels) and the device's number
 * format (amounts), for the CSV (csv.ts) and the PDF (report-html.ts). Amounts are written from
 * integers (hard rule 3): sats as BTC with their 8 decimals, minor units with their currency's.
 */

const SATS_PER_BTC = 100_000_000n;

/**
 * "Description": an invoice's number and recipient, else the sale's note, else what the wallet
 * tells of a transfer (the Lightning address paid, the invoice's description, "Deposit",
 * "Withdrawal"); "" for a sale without a note, whose source says what it is.
 */
export function rowLabel(row: ExportRow, t: TFunction): string {
  const { item } = row;
  if (item.invoice) {
    return [item.invoice.number, item.invoice.recipient].filter((part) => part !== "").join(" · ");
  }
  if (item.note) return item.note;
  if (item.source !== "receive" && item.source !== "send") return "";
  const [payment] = item.payments;
  if (!payment) return "";
  const title = titleOf(payment);
  if ("text" in title) return title.text;
  return title.key === "deposit" || title.key === "withdrawal"
    ? t(`wallet.titles.${title.key}`)
    : "";
}

/** "Source": "Point of sale", "Invoice", "Integration", "Received", "Sent". */
export function rowSource(row: ExportRow, t: TFunction): string {
  return t(`activity.sources.${row.item.source}`);
}

/** "By": "You", an employee's or an integration's name; "" for nobody. */
export function rowBy(row: ExportRow, t: TFunction): string {
  const { by } = row.item;
  if (!by) return "";
  return by.kind === "you" ? t("activity.you") : by.name;
}

/**
 * "Payment type": the networks of its payments, each once ("Lightning", "Bitcoin", "Spark"); a
 * transfer the SDK cannot tell ("unknown") names none, as its details.
 */
export function rowNetworks(row: ExportRow, t: TFunction): string {
  const networks = [
    ...new Set(row.item.payments.flatMap(({ network }) => (network === "unknown" ? [] : [network])))
  ];
  return networks.map((network) => t(`wallet.networks.${network}`)).join(", ");
}

/**
 * "Reference": each payment's (the payment hash, the transaction id, else the wallet's id), each
 * once, separated by spaces.
 */
export function rowReferences(row: ExportRow): string {
  return [...new Set(row.item.payments.map(referenceOf))].join(" ");
}

/**
 * "Remark": what a line says besides its amounts; "" when nothing. A sale "Paid" because the owner
 * accepted what it received (acceptance.ts, its line's amount what it received): "Difference of
 * 20.00 CHF / 0.00020000 BTC, accepted by the owner on 11/1/2026 at 2:32 PM", the difference as the
 * point of sale splits the sale's amount (splitFiat), in BTC from its sats, the date and time in
 * the device's locale.
 */
export function rowRemark(row: ExportRow, t: TFunction, languageTag: string): string {
  const acceptance = row.item.acceptance;
  if (acceptance?.status !== "accepted") return "";
  const received = row.item.sats ?? acceptance.received;
  const missing = acceptance.due > received ? acceptance.due - received : 0n;
  const at = new Date(acceptance.at * 1000);
  const when = {
    date: formatDate(at, languageTag, { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: formatDate(at, languageTag, { hour: "2-digit", minute: "2-digit" }),
    btc: btcText(missing, languageTag, false)
  };
  const { fiat } = acceptance;
  if (!fiat) return t("walletExport.remarks.acceptedSats", when);
  const minor = splitFiat(fiat.minor, acceptance.due, received).restMinor;
  return t("walletExport.remarks.accepted", {
    ...when,
    fiat: fiatText(BigInt(minor), fiat.digits, fiat.currency, languageTag, false)
  });
}

/** `minor` units of `digits` decimals, plain: ASCII digits, no grouping, "-" when negative. */
export function plainMinor(minor: bigint, digits: number, separator: string): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const scale = 10n ** BigInt(digits);
  const whole = (abs / scale).toString();
  const fraction =
    digits > 0 ? `${separator}${(abs % scale).toString().padStart(digits, "0")}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Sats as BTC, plain (plainMinor): "0,00150000", "-0,00002000". */
export function plainBtc(sats: bigint, separator: string): string {
  return plainMinor(sats, 8, separator);
}

/**
 * Sats as BTC to read, signed as the list writes amounts ("+0,00150000 BTC", the true minus sign),
 * its whole part grouped by the device locale: never rounded.
 */
export function btcText(sats: bigint, languageTag: string, signed: boolean): string {
  const negative = sats < 0n;
  const abs = negative ? -sats : sats;
  const whole = formatInteger(abs / SATS_PER_BTC, languageTag);
  const fraction = (abs % SATS_PER_BTC).toString().padStart(8, "0");
  const sign = negative ? "−" : signed && abs > 0n ? "+" : "";
  return `${sign}${whole}${decimalSeparator(languageTag)}${fraction} BTC`;
}

/** Minor units to read, signed as the list ("+1,234.50 CHF", "−12.00 CHF"), grouped. */
export function fiatText(
  minor: bigint,
  digits: number,
  currency: string,
  languageTag: string,
  signed: boolean
): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const sign = negative ? "−" : signed && abs > 0n ? "+" : "";
  return `${formatSignedFiat(abs, digits, languageTag, sign)} ${currency}`;
}
