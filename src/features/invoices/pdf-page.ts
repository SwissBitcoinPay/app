/*
 * The page of the app's PDFs, an invoice's (invoice-html.ts) and the wallet's statement
 * (src/features/wallet/export/report-html.ts): A4, with the margins each document gives. Its own
 * module, without a platform version, shared by pdf.ts and pdf.web.ts (as report-font-face.ts).
 *
 * expo-print (58) makes a page of US Letter unless told its size (612 × 792 points, its native
 * code), and sets its margins in a different place on each system: iOS from its `margins` option,
 * Android and the browser from the document's `@page` rule. So a document leaves its page out, and
 * the printing adds it (withPage): the margins on one side only, never twice.
 */

/** Margins of a page, in millimetres. */
export type PageMargins = { top: number; right: number; bottom: number; left: number };

/** A4 in points (1/72 in), whole: expo-print's Android code reads its size as integers. */
export const A4_POINTS = { width: 595, height: 842 } as const;

const NO_MARGINS: PageMargins = { top: 0, right: 0, bottom: 0, left: 0 };

/** Millimetres in points. */
export function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

/** `margins` in points, as expo-print's `margins` option takes them (iOS). */
export function marginsInPoints(margins: PageMargins): PageMargins {
  return {
    top: mmToPoints(margins.top),
    right: mmToPoints(margins.right),
    bottom: mmToPoints(margins.bottom),
    left: mmToPoints(margins.left)
  };
}

/**
 * `html` with its page, A4 with `margins` (none: the printing sets them), as a `@page` rule at the
 * end of its head, where it prevails over any of its own.
 */
export function withPage(html: string, margins: PageMargins = NO_MARGINS): string {
  const { top, right, bottom, left } = margins;
  const rule = `<style>@page { size: A4; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }</style>`;
  const head = html.indexOf("</head>");
  return head === -1 ? `${rule}${html}` : `${html.slice(0, head)}${rule}\n${html.slice(head)}`;
}
