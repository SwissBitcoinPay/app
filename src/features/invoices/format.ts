import { formatDate } from "@/lib/locale/date";
import { formatPercent } from "@/lib/locale/format";
import type { InvoiceLine } from "@/lib/invoice/amounts";
import { formatFiat } from "@/lib/terminal/amount";

import { dateOf } from "./invoices";
import { quantityText } from "./form";

/*
 * How the invoices write their figures: amounts with the device's separators, the currency after
 * the total only ("319.51 CHF"), the VAT rate in percent ("2.6 %"), a line's quantity and price
 * ("24 × 6.50"), dates of the device's locale. Display only: amounts stay integers
 * (src/lib/invoice/amounts.ts).
 */

/** "156.00". */
export function money(minor: number, digits: number, languageTag: string): string {
  return formatFiat(minor, digits, languageTag);
}

/** "319.51 CHF": the currency after the amount. */
export function moneyWithCurrency(
  minor: number,
  currency: { code: string; digits: number },
  languageTag: string
): string {
  return `${formatFiat(minor, currency.digits, languageTag)} ${currency.code}`;
}

/** "8.1 %", from basis points (display only). */
export function vatLabel(rate: number, languageTag: string): string {
  return formatPercent(rate / 100, languageTag);
}

/** "24 × 6.50". */
export function quantityTimesPrice(line: InvoiceLine, digits: number, languageTag: string): string {
  return `${quantityText(line.quantity, languageTag)} × ${formatFiat(line.unitMinor, digits, languageTag)}`;
}

/** A due date "YYYY-MM-DD" in the device's locale: "8 September" (`style` "dayMonth"),
 * "8 September 2026" ("long"), "08/09/2026" ("numeric"). */
export function dueDateLabel(
  day: string,
  languageTag: string,
  style: "dayMonth" | "long" | "numeric"
): string {
  const options: Intl.DateTimeFormatOptions =
    style === "dayMonth"
      ? { day: "numeric", month: "long" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "2-digit", year: "numeric" };
  return formatDate(dateOf(day), languageTag, options);
}

/** A moment (Unix seconds) as "06/07/2026 · 10:18" in the device's locale. */
export function momentLabel(seconds: number, languageTag: string): string {
  const date = new Date(seconds * 1000);
  const day = formatDate(date, languageTag, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = formatDate(date, languageTag, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}
