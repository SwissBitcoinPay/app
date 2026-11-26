import type { TFunction } from "i18next";

import { decimalSeparator } from "@/lib/locale/format";
import { formatDate } from "@/lib/locale/date";

import {
  plainBtc,
  plainMinor,
  rowBy,
  rowLabel,
  rowNetworks,
  rowReferences,
  rowRemark,
  rowSource
} from "./describe";
import type { ExportRow, RowValue } from "./rows";

/*
 * "Detailed (CSV)" of "Export" (as v2's detailed Excel CSV of the dashboard's activity): one line
 * per row, the oldest first, the columns the merchant ticks. v2's columns that v3 has the data of,
 * in its order: its split between bitcoin and francs and its fees (Swiss Bitcoin Pay's conversion)
 * have none here; "By", "Payment type" and the fees of what the wallet sent are v3's. The columns
 * in the merchant's currency hold a line's value in it only (rowValue): a sale typed in another
 * currency tells its amount in "Amount entered" and "Currency entered", a line without a rate
 * recorded tells bitcoin only.
 * Read by spreadsheets in the device's locale, as v2's: its decimal separator, and ";" between
 * columns where that separator is a comma; ASCII digits without grouping; dates and times as the
 * device writes them. UTF-8 with its byte order mark (Excel reads accents only with it), lines
 * ended by CRLF, fields quoted as RFC 4180 says, with the separator chosen. A text that starts like
 * a formula (a note typed by an employee, a payer's description) is made inert: a spreadsheet would
 * run it.
 */

export const EXPORT_COLUMNS = [
  "dateAndTime",
  "label",
  "source",
  "by",
  "network",
  "reference",
  "bitcoinAmount",
  "bitcoinFees",
  "fiatAmount",
  "fiatFees",
  "originalAmount",
  "originalCurrency",
  "bitcoinPrice",
  // "Remark": what a line says besides (rowRemark).
  "remark"
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

/** Ticked when "Export" opens: v2's own choice among the columns v3 has. */
export const DEFAULT_COLUMNS: readonly ExportColumn[] = [
  "dateAndTime",
  "label",
  "source",
  "reference",
  "bitcoinAmount",
  "fiatAmount",
  // A line's difference accepted by the owner: the statement would not tell it otherwise.
  "remark"
];

/** The columns whose header names the merchant's currency (`walletExport.columns`). */
const FIAT_COLUMNS: ReadonlySet<ExportColumn> = new Set(["fiatAmount", "fiatFees", "bitcoinPrice"]);

/** The columns whose values come from what was typed or received: made inert (guarded). */
const TEXT_COLUMNS: ReadonlySet<ExportColumn> = new Set([
  "label",
  "source",
  "by",
  "network",
  "reference",
  "originalCurrency",
  "remark"
]);

/** The columns that need a line's value in the currency (its rate, rowValue). */
export function needsValues(columns: readonly ExportColumn[]): boolean {
  return columns.some((column) => FIAT_COLUMNS.has(column));
}

/** The byte order mark of UTF-8: Excel reads a CSV as UTF-8 only after it. */
const BOM = "﻿";

/**
 * A spreadsheet runs a cell that starts with = + - @ (or a tab, a carriage return) as a formula: an
 * apostrophe before it keeps it text (OWASP "CSV Injection").
 */
function inert(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** `value` as a field: quoted when it holds the separator, a quote or a line break (RFC 4180). */
function field(value: string, separator: string): string {
  return value.includes(separator) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export type CsvOptions = {
  columns: readonly ExportColumn[];
  /** The merchant's currency ("Reference currency") and its decimals. */
  currency: string;
  digits: number;
  /** The device's locale: numbers, dates, separators. */
  languageTag: string;
  t: TFunction;
};

/**
 * The CSV of `rows` (the oldest first) with `values` (rowValue, one per row, in the same order;
 * null when no column needs them): `columns` in EXPORT_COLUMNS' order, whatever the order ticked.
 */
export function exportCsv(
  rows: readonly ExportRow[],
  values: readonly (RowValue | null)[] | null,
  { columns, currency, digits, languageTag, t }: CsvOptions
): string {
  const shown = EXPORT_COLUMNS.filter((column) => columns.includes(column));
  const decimal = decimalSeparator(languageTag);
  const separator = decimal === "," ? ";" : ",";
  const header = shown.map((column) =>
    FIAT_COLUMNS.has(column)
      ? t(`walletExport.columns.${column}`, { currency })
      : t(`walletExport.columns.${column}`)
  );
  const lines = rows.map((row, index) => {
    // In the merchant's currency only: another's has no place in its columns.
    const found = values?.[index] ?? null;
    const value = found?.currency === currency && found.digits === digits ? found : null;
    const rate = found?.rate?.currency === currency ? found.rate.rate : null;
    const { fiat } = row.item;
    const cell = (column: ExportColumn): string => {
      switch (column) {
        case "dateAndTime":
          return formatDate(new Date(row.item.timestamp * 1000), languageTag, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });
        case "label":
          return rowLabel(row, t);
        case "source":
          return rowSource(row, t);
        case "by":
          return rowBy(row, t);
        case "network":
          return rowNetworks(row, t);
        case "reference":
          return rowReferences(row);
        case "bitcoinAmount":
          return plainBtc(row.sats, decimal);
        case "bitcoinFees":
          return row.feeSats === null ? "" : plainBtc(row.feeSats, decimal);
        // An empty cell for a value not known (no rate): "0.00" would tell an amount of nothing.
        case "fiatAmount":
          return value === null ? "" : plainMinor(value.minor, digits, decimal);
        case "fiatFees":
          return value === null || value.feeMinor === null
            ? ""
            : plainMinor(value.feeMinor, digits, decimal);
        case "originalAmount":
          return fiat ? plainMinor(BigInt(fiat.minor), fiat.digits, decimal) : "";
        case "originalCurrency":
          return fiat?.currency ?? "";
        // A rate, never an amount: written to its currency's minor unit, as v2.
        case "bitcoinPrice":
          return rate === null ? "" : rate.toFixed(digits).replace(".", decimal);
        case "remark":
          return rowRemark(row, t, languageTag);
      }
    };
    return shown
      .map((column) => {
        const text = cell(column);
        return field(TEXT_COLUMNS.has(column) ? inert(text) : text, separator);
      })
      .join(separator);
  });
  return `${BOM}${[header.map((text) => field(text, separator)).join(separator), ...lines].join("\r\n")}\r\n`;
}
