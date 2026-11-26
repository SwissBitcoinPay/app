import type { TFunction } from "i18next";

import type { ExportSources } from "@/features/activity/useActivity";
import { sharePdf } from "@/features/invoices/pdf";
import { nowUnix } from "@/lib/clock";

import { paymentRatesWritten, readPaymentRates } from "../payment-rates";
import { exportCsv, needsValues, type ExportColumn } from "./csv";
import { loadExportRows } from "./load";
import { timeRange, type DayRange } from "./period";
import { reportFontFaces } from "./report-fonts";
import { REPORT_MARGINS, reportHtml, type ReportUnit } from "./report-html";
import { ExportError, rowValue, type ExportRow, type RowValue } from "./rows";
import { shareCsv } from "./share";

/*
 * "Export" end to end: the lines of the period (load.ts), their values when the file shows any
 * (valuesOf: the rates recorded at their payments), then the file, which the share sheet sends (the
 * browser downloads the CSV, prints the PDF).
 */

/** The two files of v2's "Export type": "Simple (PDF)" and "Detailed (CSV)". */
export type ExportFormat = "pdf" | "csv";

export type ExportRequest = {
  days: DayRange;
  format: ExportFormat;
  /** "Simple (PDF)": its amounts in the currency or in bitcoin. */
  unit: ReportUnit;
  /** "Detailed (CSV)": its columns. */
  columns: readonly ExportColumn[];
};

/** What the export is made with besides the merchant's choices (the screen's). */
export type ExportContext = {
  sources: ExportSources;
  businessName: string;
  /** The merchant's currency ("Reference currency") and its decimals. */
  currency: string;
  digits: number;
  /**
   * The file's language (the app's, or the one the merchant picked: DocumentLanguageChip), its
   * locale (numbers, dates: documentLocale) and its words.
   */
  language: string;
  languageTag: string;
  t: TFunction;
  /** The share sheet's title, in the app's language (the merchant reads it, not the file). */
  shareTitle: string;
};

/**
 * The value of each of `rows` (rowValue), from the rates recorded at their payments
 * (src/features/wallet/payment-rates.ts), never from CoinGecko:
 * those being written first, then those of the lines' payments, read from a majority of the
 * relays. Rejects with ExportError "unread" without that majority.
 */
export async function valuesOf(rows: readonly ExportRow[]): Promise<(RowValue | null)[]> {
  // A loop, not Math.min(...): a year of a busy shop's payments is more than a call takes.
  let since = Infinity;
  let until = -Infinity;
  for (const row of rows) {
    for (const { status, timestamp } of row.item.payments) {
      if (status !== "completed") continue;
      since = Math.min(since, timestamp);
      until = Math.max(until, timestamp);
    }
  }
  if (since > until) return rows.map(() => null);
  await paymentRatesWritten();
  const rates = await readPaymentRates(since, until);
  if (rates === null) throw new ExportError("unread");
  return rows.map((row) => rowValue(row, rates));
}

/**
 * The file's name: the business's name, then the period's first and last days (v2's, from its
 * server: "My-Shop_2026-10-01_2026-10-31.csv"), in characters every file system takes.
 */
export function exportFileName(businessName: string, days: DayRange, format: ExportFormat): string {
  const name =
    businessName
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "export";
  return `${name}_${days.first}_${days.last}.${format}`;
}

/**
 * Makes the file of `request` and opens the share sheet with it, unless `wanted()` turned false
 * meanwhile ("Export" closed: the file is not offered any more). Rejects as its steps do.
 */
export async function runExport(
  request: ExportRequest,
  context: ExportContext,
  wanted: () => boolean = () => true
): Promise<void> {
  const { days, format, unit, columns } = request;
  const { sources, businessName, currency, digits, language, languageTag, t, shareTitle } = context;
  const now = nowUnix();
  const rows = await loadExportRows(timeRange(days), sources, now);
  const fileName = exportFileName(businessName, days, format);
  if (format === "csv") {
    const values = needsValues(columns) ? await valuesOf(rows) : null;
    const csv = exportCsv(rows, values, { columns, currency, digits, languageTag, t });
    if (wanted()) await shareCsv(csv, fileName, shareTitle);
    return;
  }
  const values = unit === "fiat" ? await valuesOf(rows) : null;
  const html = reportHtml(rows, values, {
    businessName,
    days,
    unit,
    currency,
    digits,
    language,
    languageTag,
    t,
    madeAt: new Date(now * 1000),
    fontFaces: await reportFontFaces()
  });
  if (wanted()) await sharePdf(html, t("walletExport.pdf.title"), fileName, REPORT_MARGINS);
}
