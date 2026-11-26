import type { TFunction } from "i18next";

import { qrRuns } from "@/components/ui/qr-modules";
import { getCountryName } from "@/lib/countries";
import type { Language } from "@/i18n/languages";
import { invoiceTotals, lineNetMinor } from "@/lib/invoice/amounts";
import { formatInvoiceNumber, type Invoice } from "@/lib/invoice/record";
import { formatDate } from "@/lib/locale/date";
import { palette } from "@/theme";

import { businessAddressLines, businessNumbers, type BusinessDetails } from "./business-details";
import { quantityText } from "./form";
import { dueDateLabel, money, moneyWithCurrency, vatLabel } from "./format";
import type { PageMargins } from "./pdf-page";

/*
 * An invoice's PDF ("Download the PDF", its mail's attachment), as one HTML document that
 * expo-print turns into a PDF on the device (pdf.ts) and the browser prints on the web
 * (pdf.web.ts), on A4 pages with INVOICE_MARGINS (pdf-page.ts). Its layout, a monochrome grid of
 * hairlines:
 * the business, its address and its numbers ("Settings › Business", once typed; each number under
 * its name in small capitals, business-details.ts), the recipient on the right under "Billed to"
 * (the business is not repeated there), "Invoice" and its number, the dates, the lines, the totals
 * rate by rate, the notices under their titles ("Payment terms", "Legal notices", each only when
 * typed), then last "Pay in bitcoin", the Bitcoin logo on its right, the payment link's QR code at
 * 50 mm (any QR scanner opens it) beside the link, which opens it too where the PDF reader follows
 * links.
 * Its text is pure black, amounts included, its labels stone. Plus Jakarta Sans only, the brand's
 * font, its figures tabular (`tnum`): the statement's faces
 * (src/features/wallet/export/report-fonts.ts), weights 500, 700 and 800. The thermal ticket's
 * rules do not apply: it is printed on paper or read on a screen. Everything typed is escaped.
 */

/** The invoice's page margins: A4 (pdf-page.ts). */
export const INVOICE_MARGINS: PageMargins = { top: 16, right: 18, bottom: 15, left: 18 };

/** The payment link's QR code on paper, its quiet zone included: scanned from arm's length. */
const QR_SIZE_MM = 50;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/** `text` safe in HTML: its markup characters as entities. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * `text` escaped, for the invoice: the narrow no-break space (U+202F, the group separator of fr-FR
 * amounts, "1 234,50", and of fr-CH ones in older locale data) is not in Plus Jakarta Sans, whose
 * text would take it from another font: a no-break space (U+00A0, which it has) stands for it.
 */
function text(value: string): string {
  return escapeHtml(value.replace(/ /g, " "));
}

/** Line breaks of a multi-line text kept, the text escaped. */
function paragraphs(value: string): string {
  return text(value).replace(/\r?\n/g, "<br>");
}

/** The QR code of `value` as an SVG of `size` pixels, its quiet zone included (4 modules). */
export function qrSvg(value: string, size: number): string {
  const { count, rows } = qrRuns(value);
  const quiet = 4;
  const side = count + quiet * 2;
  const rects = rows
    .flatMap((runs, row) =>
      runs.map(
        (run) =>
          `<rect x="${run.start + quiet}" y="${row + quiet}" width="${run.length}" height="1"/>`
      )
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

export function invoiceHtml(
  invoice: Invoice,
  {
    businessName,
    language,
    languageTag,
    t,
    business = null,
    fontFaces = ""
  }: {
    businessName: string;
    /**
     * Its address and numbers ("Settings › Business", business-details.ts), under its name: each
     * once typed.
     */
    business?: BusinessDetails | null;
    language: Language;
    languageTag: string;
    t: TFunction;
    /**
     * The `@font-face` rules of Plus Jakarta Sans (report-fonts.ts); without them, the system's
     * font. CSS made by the app, never anything typed.
     */
    fontFaces?: string;
  }
): string {
  const { currency } = invoice;
  const { digits } = currency;
  const number = formatInvoiceNumber(invoice.number);
  const totals = invoiceTotals(invoice.lines);
  const issued = new Date((invoice.sent?.at ?? invoice.updatedAt) * 1000);
  const date = formatDate(issued, languageTag, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const due = invoice.dueDate ? dueDateLabel(invoice.dueDate, languageTag, "numeric") : "—";
  const { recipient } = invoice;
  const from = businessAddressLines(business?.businessAddress ?? null, language)
    .map(text)
    .join("<br>");
  // Each number under its name in small capitals, as "Billed to".
  const numbers = (business ? businessNumbers(business, t) : [])
    .map(
      ({ label, value }) =>
        `<div class="number"><span class="label">${text(label)}</span>${text(value)}</div>`
    )
    .join("");
  const address = [
    recipient.name === "" ? "" : `<strong>${text(recipient.name)}</strong>`,
    text(recipient.street),
    text([recipient.postalCode, recipient.city].filter(Boolean).join(" ")),
    text(getCountryName(recipient.country, language))
  ]
    .filter((line) => line !== "")
    .join("<br>");
  // The dates (and the client's reference), each under its label as "Billed to", without a rule:
  // only the lines' table has one, under its labels.
  const facts = [
    { label: t("invoices.pdf.date"), value: date },
    { label: t("invoices.pdf.due"), value: due },
    ...(recipient.reference
      ? [{ label: t("invoices.pdf.reference"), value: recipient.reference }]
      : [])
  ]
    .map(
      ({ label, value }) =>
        `<div><span class="label">${text(label)}</span><span class="value">${text(value)}</span></div>`
    )
    .join("");
  const lines = invoice.lines
    .map(
      (line) => `<tr>
  <td>${text(line.name)}</td>
  <td class="num">${text(quantityText(line.quantity, languageTag))}</td>
  <td class="num">${text(money(line.unitMinor, digits, languageTag))}</td>
  <td class="num">${text(vatLabel(line.vatRate, languageTag))}</td>
  <td class="num">${text(money(lineNetMinor(line), digits, languageTag))}</td>
</tr>`
    )
    .join("\n");
  const vatRows = totals.vat
    .map(
      (group) =>
        `<tr><td>${text(
          t("invoices.lines.vatOn", {
            rate: vatLabel(group.rate, languageTag),
            base: money(group.baseMinor, digits, languageTag)
          })
        )}</td><td class="num">${text(money(group.vatMinor, digits, languageTag))}</td></tr>`
    )
    .join("\n");
  const notices = [
    { title: t("invoices.terms.conditions"), body: invoice.terms },
    { title: t("invoices.terms.legal"), body: invoice.legal }
  ]
    .filter(({ body }) => body.trim() !== "")
    .map(({ title, body }) => `<div><h3>${text(title)}</h3><p>${paragraphs(body)}</p></div>`);
  const link = invoice.sent?.link.url ?? null;
  const pay = link
    ? `<section class="pay">
  <div class="qr">${qrSvg(link, 200)}</div>
  <div class="how">
    <h2>${text(t("invoices.pdf.pay"))}${BITCOIN_LOGO}</h2>
    <p>${text(t("invoices.pdf.payHint"))}</p>
    <p class="link">${isHttpsUrl(link) ? `<a href="${escapeHtml(link)}">${text(link)}</a>` : text(link)}</p>
  </div>
</section>`
    : "";
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<title>${text(t("invoices.pdf.title", { number }))}</title>
<style>
  ${fontFaces}
  /* Printers leave backgrounds out unless told: the payment's box keeps its sand. */
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 500; font-size: 9.5pt; line-height: 1.45; color: ${INK}; font-variant-numeric: tabular-nums; }
  h1, h2, h3, p { margin: 0; }
  strong { font-weight: 700; }
  /* The business's address beside the recipient's, which stays where it was without it. */
  .top { display: flex; align-items: flex-start; }
  .sender { flex: none; width: 98mm; padding-right: 6mm; }
  .business { font-size: 13pt; font-weight: 800; letter-spacing: -0.01em; }
  .from { margin-top: 1.5mm; font-size: 9pt; line-height: 1.45; }
  .numbers { display: flex; flex-wrap: wrap; column-gap: 6mm; row-gap: 2mm; margin-top: 3mm; font-size: 9pt; line-height: 1.45; }
  .numbers .label { margin-bottom: 0.5mm; }
  .recipient { flex: 1; min-width: 0; margin-top: 16.5mm; min-height: 24mm; font-size: 10pt; line-height: 1.5; }
  .label, h3 { display: block; margin-bottom: 1.5mm; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${STONE}; }
  h1 { margin-top: 8mm; font-size: 26pt; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
  h1 span { font-weight: 500; color: ${STONE}; }
  table { width: 100%; border-collapse: collapse; }
  .facts { display: flex; margin-top: 7mm; }
  .facts > div { flex: 1; min-width: 0; padding-right: 4mm; }
  .facts .value { font-size: 10.5pt; font-weight: 700; overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; padding-left: 5mm; }
  .lines { margin-top: 8mm; }
  .lines th { text-align: left; padding: 0 0 2.5mm; border-bottom: 0.3mm solid ${INK}; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${STONE}; }
  .lines th.num { text-align: right; }
  .lines td { padding: 2.6mm 0; border-bottom: 0.2mm solid ${HAIRLINE}; vertical-align: top; }
  .lines td.num { padding-left: 5mm; }
  .sum { display: flex; justify-content: flex-end; margin-top: 4mm; page-break-inside: avoid; break-inside: avoid; }
  .totals { width: 88mm; }
  .totals td { padding: 1.2mm 0; }
  .totals tr.total td { padding-top: 3mm; border-top: 0.3mm solid ${INK}; font-size: 14pt; font-weight: 800; }
  .notices { display: flex; gap: 8mm; margin-top: 9mm; font-size: 8.5pt; page-break-inside: avoid; break-inside: avoid; }
  .notices > div { flex: 1; min-width: 0; }
  .pay { display: flex; gap: 8mm; align-items: center; margin-top: 9mm; padding: 5mm; background: ${SAND}; border-radius: 3mm; page-break-inside: avoid; break-inside: avoid; }
  .pay .qr { flex: none; width: ${QR_SIZE_MM}mm; height: ${QR_SIZE_MM}mm; padding: 1mm; background: #fff; border-radius: 2mm; }
  .pay .qr svg { display: block; width: 100%; height: 100%; }
  .pay .how { flex: 1; min-width: 0; }
  .pay h2 { display: flex; align-items: center; gap: 2.5mm; font-size: 15pt; font-weight: 800; letter-spacing: -0.01em; }
  .btc { flex: none; display: block; width: 6.5mm; height: 6.5mm; }
  .pay p { margin-top: 2mm; }
  .pay .link { margin-top: 4mm; font-size: 7pt; word-break: break-all; color: ${STONE}; }
  .pay .link a { color: inherit; text-decoration: none; }
</style>
</head>
<body>
<div class="top">
  <header class="sender"><div class="business">${text(businessName)}</div>${from === "" ? "" : `<p class="from">${from}</p>`}${numbers === "" ? "" : `<div class="numbers">${numbers}</div>`}</header>
  <div class="recipient"><span class="label">${text(t("invoices.pdf.billedTo"))}</span>${address}</div>
</div>
<h1>${text(t("invoices.pdf.invoice"))} <span>${text(number)}</span></h1>
<div class="facts">${facts}</div>
<table class="lines">
  <thead><tr>
    <th>${text(t("invoices.lines.name"))}</th>
    <th class="num">${text(t("invoices.lines.quantityShort"))}</th>
    <th class="num">${text(t("invoices.lines.unitPriceShort"))}</th>
    <th class="num">${text(t("invoices.lines.vat"))}</th>
    <th class="num">${text(`${t("invoices.lines.amount")} ${currency.code}`)}</th>
  </tr></thead>
  <tbody>
${lines}
  </tbody>
</table>
<div class="sum"><table class="totals"><tbody>
  <tr><td>${text(t("invoices.lines.net"))}</td><td class="num">${text(money(totals.netMinor, digits, languageTag))}</td></tr>
${vatRows}
  <tr class="total"><td>${text(t("invoices.lines.total"))}</td><td class="num">${text(moneyWithCurrency(totals.totalMinor, currency, languageTag))}</td></tr>
</tbody></table></div>
${notices.length > 0 ? `<section class="notices">${notices.join("")}</section>` : ""}
${pay}
</body>
</html>`;
}

// Pure black for the text, the brand's stone and sand (src/theme/tokens.ts) for the labels and the
// payment's box: the palette's, a printed document is light whatever the app's theme.
const INK = "#000";
const STONE = palette.stone;
const SAND = palette.sand;
const HAIRLINE = "rgba(0, 0, 0, 0.14)";

/**
 * The Bitcoin logo, as published on Wikimedia Commons (File:Bitcoin.svg, public domain: below the
 * threshold of originality), its two paths unchanged, at the size of the title it follows.
 */
const BITCOIN_LOGO = `<svg class="btc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(0.00630876,-0.00301984)"><path fill="#f7931a" d="m63.033,39.744c-4.274,17.143-21.637,27.576-38.782,23.301-17.138-4.274-27.571-21.638-23.295-38.78,4.272-17.145,21.635-27.579,38.775-23.305,17.144,4.274,27.576,21.64,23.302,38.784z"/><path fill="#FFF" d="m46.103,27.444c0.637-4.258-2.605-6.547-7.038-8.074l1.438-5.768-3.511-0.875-1.4,5.616c-0.923-0.23-1.871-0.447-2.813-0.662l1.41-5.653-3.509-0.875-1.439,5.766c-0.764-0.174-1.514-0.346-2.242-0.527l0.004-0.018-4.842-1.209-0.934,3.75s2.605,0.597,2.55,0.634c1.422,0.355,1.679,1.296,1.636,2.042l-1.638,6.571c0.098,0.025,0.225,0.061,0.365,0.117-0.117-0.029-0.242-0.061-0.371-0.092l-2.296,9.205c-0.174,0.432-0.615,1.08-1.609,0.834,0.035,0.051-2.552-0.637-2.552-0.637l-1.743,4.019,4.569,1.139c0.85,0.213,1.683,0.436,2.503,0.646l-1.453,5.834,3.507,0.875,1.439-5.772c0.958,0.26,1.888,0.5,2.798,0.726l-1.434,5.745,3.511,0.875,1.453-5.823c5.987,1.133,10.489,0.676,12.384-4.739,1.527-4.36-0.076-6.875-3.226-8.515,2.294-0.529,4.022-2.038,4.483-5.155zm-8.022,11.249c-1.085,4.36-8.426,2.003-10.806,1.412l1.928-7.729c2.38,0.594,10.012,1.77,8.878,6.317zm1.086-11.312c-0.99,3.966-7.1,1.951-9.082,1.457l1.748-7.01c1.982,0.494,8.365,1.416,7.334,5.553z"/></g></svg>`;

/** Whether `value` is an https URL: the only kind the PDF links to (never `javascript:`). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** The PDF's file name: "Invoice-2026-0042.pdf" (its title's words, safe in a file name). */
export function invoiceFileName(invoice: Invoice, t: TFunction): string {
  const title = t("invoices.pdf.title", { number: formatInvoiceNumber(invoice.number) });
  return `${title.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "")}.pdf`;
}
