import type { TFunction } from "i18next";

import { LOGO_HEIGHT, LOGO_PATHS, LOGO_WIDTH } from "@/components/layout/logo-paths";
import { escapeHtml } from "@/features/invoices/invoice-html";
import type { PageMargins } from "@/features/invoices/pdf-page";
import { dateOf } from "@/features/invoices/invoices";
import type { ActivitySource } from "@/features/activity/model";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { palette } from "@/theme";

import { btcText, fiatText, rowBy, rowLabel, rowRemark, rowSource } from "./describe";
import type { DayRange } from "./period";
import type { ExportRow, RowValue } from "./rows";

/*
 * "Simple (PDF)" of "Export" (as v2's, of the dashboard's activity: its summary, then the list of
 * the lines): a statement of the business, as one HTML document of A4 that expo-print turns into a
 * PDF on the device and the browser prints on the web (src/features/invoices/pdf.ts). v2's was
 * Swiss Bitcoin Pay's, with its commissions and its bank transfers: v3 has neither, the sats are in
 * the merchant's own wallet. The summary counts the lines by source and adds up what came in, what
 * went out and what sending cost, in the merchant's currency or in bitcoin (v2's "Amounts"): each
 * line's value as the CSV tells it (rowValue: a sale in the currency it was typed in; a line
 * without a rate recorded, in bitcoin), the totals the sums of the values shown, one per currency,
 * so that the lines add up to them to the last cent. Everything typed is escaped. Laid out as v2's
 * statement (the logo, the business on the right, the title, the period on a band, the summary's
 * blocks), in Plus Jakarta Sans, the brand's font, with the sattle.me logo alone at its head and
 * foot (no company named as its issuer, the business's own statement), then its lines.
 */

/** The statement's page margins: A4 (src/features/invoices/pdf-page.ts). */
export const REPORT_MARGINS: PageMargins = { top: 16, right: 18, bottom: 16, left: 18 };

/** The amounts of the statement: in the merchant's currency, or in bitcoin. */
export type ReportUnit = "fiat" | "btc";

export type ReportOptions = {
  businessName: string;
  days: DayRange;
  unit: ReportUnit;
  currency: string;
  digits: number;
  /** The app's language, for the document's `lang`. */
  language: string;
  /** The device's locale: numbers and dates. */
  languageTag: string;
  t: TFunction;
  /** When the statement is made. */
  madeAt: Date;
  /**
   * The `@font-face` rules of Plus Jakarta Sans (report-fonts.ts); without them, the system's font.
   * CSS made by the app, never anything typed.
   */
  fontFaces?: string;
};

/** The sources in the summary's order: the sales first, then the transfers. */
const SOURCES: readonly Exclude<ActivitySource, "recovered">[] = [
  "pos",
  "link",
  "integration",
  "receive",
  "send"
];

/** An amount of a currency (minor units), or of bitcoin (sats: `currency` "BTC"). */
type Money = { minor: bigint; currency: string; digits: number };

/** Sums of amounts, one per currency. */
class Totals {
  private readonly sums = new Map<string, Money>();

  add(money: Money): void {
    const known = this.sums.get(money.currency);
    this.sums.set(money.currency, known ? { ...known, minor: known.minor + money.minor } : money);
  }

  /**
   * The sums, the currency of `none` first, then the others by code, bitcoin last; `none` (a zero)
   * when there is none.
   */
  list(none: Money): Money[] {
    const rank = ({ currency }: Money) =>
      currency === none.currency ? 0 : currency === "BTC" ? 2 : 1;
    const sums = [...this.sums.values()].sort(
      (a, b) => rank(a) - rank(b) || (a.currency < b.currency ? -1 : 1)
    );
    return sums.length > 0 ? sums : [none];
  }
}

export function reportHtml(
  rows: readonly ExportRow[],
  /** rowValue of each of `rows`, in their order, for a statement in the currency; else null. */
  values: readonly (RowValue | null)[] | null,
  options: ReportOptions
): string {
  const { businessName, days, unit, currency, digits, language, languageTag, t, madeAt } = options;
  const fontFaces = options.fontFaces ?? "";
  const btc = (sats: bigint): Money => ({ minor: sats, currency: "BTC", digits: 8 });
  // The line's own amount, signed (sent negative), and a sending's fees: in its value's currency
  // in a statement in the currency, else (and without a value) in sats.
  const valueOf = (index: number): RowValue | null =>
    unit === "fiat" ? (values?.[index] ?? null) : null;
  const amountOf = (index: number): Money => {
    const value = valueOf(index);
    return value ? value : btc(rows[index]!.sats);
  };
  const feeOf = (index: number): Money => {
    const value = valueOf(index);
    return value && value.feeMinor !== null
      ? { ...value, minor: value.feeMinor }
      : btc(rows[index]!.feeSats ?? 0n);
  };
  const money = ({ minor, currency: code, digits: decimals }: Money, signed: boolean): string =>
    code === "BTC"
      ? btcText(minor, languageTag, signed)
      : fiatText(minor, decimals, code, languageTag, signed);
  const zero: Money = unit === "fiat" ? { minor: 0n, currency, digits } : btc(0n);

  const received = new Totals();
  const sent = new Totals();
  const fees = new Totals();
  const counts = new Map<ActivitySource, number>();
  // A sending whose fees are not told (a payout copied from the v2 account): no total of the fees
  // then, which would tell less than was paid (never "0").
  const feesKnown = rows.every((row) => row.kind !== "sent" || row.feeSats !== null);
  rows.forEach((row, index) => {
    counts.set(row.item.source, (counts.get(row.item.source) ?? 0) + 1);
    if (row.kind === "sent") {
      sent.add(amountOf(index));
      if (row.feeSats !== null) fees.add(feeOf(index));
    } else received.add(amountOf(index));
  });

  const day = (value: string) =>
    formatDate(dateOf(value), languageTag, { day: "numeric", month: "long", year: "numeric" });
  const period = t("walletExport.pdf.period", { first: day(days.first), last: day(days.last) });
  const made = formatDate(madeAt, languageTag, { day: "numeric", month: "long", year: "numeric" });

  // v2's blocks: what was counted, what came in, what went out (with what sending cost). A total
  // of several currencies: one line each, the label on the first.
  const line = (kind: "lead" | "sub", label: string, value: string) =>
    `<tr class="${kind}"><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(value)}</td></tr>`;
  const lead = (label: string, value: string) => line("lead", label, value);
  const sub = (label: string, value: string) => line("sub", label, value);
  const amounts = (kind: "lead" | "sub", label: string, totals: Totals, negate: boolean) =>
    totals
      .list(zero)
      .map((total, index) =>
        line(
          kind,
          index === 0 ? label : "",
          money(negate ? { ...total, minor: -total.minor } : total, true)
        )
      );
  const blocks = [
    [
      lead(t("walletExport.pdf.count"), formatInteger(rows.length, languageTag)),
      ...SOURCES.flatMap((source) => {
        const n = counts.get(source) ?? 0;
        return n === 0
          ? []
          : [sub(t(`walletExport.pdf.countOf.${source}`), formatInteger(n, languageTag))];
      })
    ],
    amounts("lead", t("walletExport.pdf.received"), received, false),
    ...(counts.has("send")
      ? [
          [
            ...amounts("lead", t("walletExport.pdf.sent"), sent, false),
            ...(feesKnown ? amounts("sub", t("walletExport.pdf.fees"), fees, true) : [])
          ]
        ]
      : [])
  ];
  const summary = blocks
    .map((block) => `<tbody class="block">\n${block.join("\n")}\n</tbody>`)
    .join("\n");

  // "Remark": a column only when a line has one, the width of A4 kept for the labels otherwise.
  const remarks = rows.some((row) => rowRemark(row, t, languageTag) !== "");
  const list = rows
    .map((row, index) => {
      const date = formatDate(new Date(row.item.timestamp * 1000), languageTag, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      const label = rowLabel(row, t) || "—";
      const by = rowBy(row, t) || "—";
      const remark = remarks
        ? `\n  <td class="remark">${escapeHtml(rowRemark(row, t, languageTag))}</td>`
        : "";
      return `<tr>
  <td class="date">${escapeHtml(date)}</td>
  <td>${escapeHtml(label)}</td>
  <td>${escapeHtml(rowSource(row, t))}</td>
  <td>${escapeHtml(by)}</td>${remark}
  <td class="num">${escapeHtml(money(amountOf(index), true))}</td>
</tr>`;
    })
    .join("\n");

  // The amounts' unit in their header when they all share it; else each says its own.
  const units = new Set(rows.map((_, index) => amountOf(index).currency));
  const unitName = units.size === 0 ? zero.currency : units.size === 1 ? [...units][0]! : null;
  const amountHeader =
    unitName === null
      ? t("walletExport.pdf.amountMixed")
      : t("walletExport.pdf.amount", { unit: unitName });
  const notes =
    unit === "fiat"
      ? `<p class="notes">${escapeHtml(
          // The history copied from a v2 account: its prices are the v2 server's, not CoinGecko's.
          t(
            rows.some(({ item }) => item.imported)
              ? "walletExport.pdf.valuesNoteImported"
              : "walletExport.pdf.valuesNote"
          )
        )}</p>`
      : "";
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t("walletExport.pdf.title"))}</title>
<style>
  ${fontFaces}
  /* Printers leave backgrounds out unless told: the period's band keeps its sand. */
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 500; font-size: 10pt; color: ${INK}; }
  .logo { display: block; height: 8mm; width: auto; }
  .business { margin-top: 14mm; text-align: right; font-size: 12pt; font-weight: 700; }
  h1 { margin: 22mm 0 0; font-size: 24pt; font-weight: 800; letter-spacing: -0.01em; }
  .made { margin: 4mm 0 0; font-size: 11pt; }
  .band { margin-top: 8mm; padding: 3mm 4mm; background: ${SAND}; text-align: right; font-size: 11pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  .summary { margin-top: 4mm; }
  .summary td { padding: 1mm 5mm; }
  .summary tbody.block::before { content: ""; display: table-row; height: 5mm; }
  .summary tr.lead td { font-size: 10.5pt; font-weight: 700; }
  .summary tr.sub td { font-size: 9.5pt; color: ${STONE}; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding-left: 4mm; }
  .rule { margin: 8mm 0 0; border: 0; border-top: 0.25mm solid ${RULE}; }
  h2 { margin: 7mm 0 0; font-size: 12pt; font-weight: 800; }
  .list { margin-top: 3mm; }
  .list th { text-align: left; font-size: 8.5pt; font-weight: 700; color: ${STONE}; padding: 0 3mm 2mm 0; border-bottom: 0.25mm solid ${RULE}; }
  .list td { font-size: 9pt; padding: 2mm 3mm 2mm 0; border-bottom: 0.25mm solid ${HAIRLINE}; vertical-align: top; }
  .list .num { padding-right: 0; }
  /* The amounts' header on their right edge, as they are (.list th aligns the others left). */
  .list th.num { text-align: right; }
  .list tr { page-break-inside: avoid; }
  .date { white-space: nowrap; }
  .remark { font-size: 8pt; color: ${STONE}; }
  .empty { margin-top: 3mm; color: ${STONE}; }
  .notes { margin: 6mm 0 0; font-size: 8pt; line-height: 1.5; color: ${STONE}; }
  .foot { margin-top: 12mm; text-align: center; page-break-inside: avoid; }
  .foot .logo { display: inline-block; height: 5mm; }
</style>
</head>
<body>
<header>
  ${logoSvg()}
  <div class="business">${escapeHtml(businessName)}</div>
</header>
<h1>${escapeHtml(t("walletExport.pdf.title"))}</h1>
<p class="made">${escapeHtml(t("walletExport.pdf.made", { date: made }))}</p>
<div class="band">${escapeHtml(period)}</div>
<table class="summary">
${summary}
</table>
<hr class="rule">
<h2>${escapeHtml(t("walletExport.pdf.lines"))}</h2>
${
  rows.length === 0
    ? `<p class="empty">${escapeHtml(t("walletExport.pdf.none"))}</p>`
    : `<table class="list">
  <thead><tr>
    <th>${escapeHtml(t("walletExport.columns.dateAndTime"))}</th>
    <th>${escapeHtml(t("walletExport.columns.label"))}</th>
    <th>${escapeHtml(t("walletExport.columns.source"))}</th>
    <th>${escapeHtml(t("walletExport.columns.by"))}</th>${
      remarks ? `\n    <th>${escapeHtml(t("walletExport.columns.remark"))}</th>` : ""
    }
    <th class="num">${escapeHtml(amountHeader)}</th>
  </tr></thead>
  <tbody>
${list}
  </tbody>
</table>`
}
${notes}
<footer class="foot">${logoSvg()}</footer>
</body>
</html>`;
}

// The brand's colours (src/theme/tokens.ts) and its two lines' inks: the palette's, a printed
// report is light whatever the app's theme.
const INK = palette.ink;
const STONE = palette.stone;
const SAND = palette.sand;
const RULE = palette.ink35;
const HAIRLINE = palette.ink14;

/** The sattle.me logo, a vector (the app's own paths, Logo.tsx), named as Logo.tsx names it. */
function logoSvg(): string {
  const paths = LOGO_PATHS.map(
    ({ fill, d }) => `<path fill="${escapeHtml(fill)}" d="${escapeHtml(d)}"/>`
  ).join("");
  return `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}" role="img" aria-label="sattle.me">${paths}</svg>`;
}
