import { MAX_INVOICE_LINES, MAX_QUANTITY_UNITS, MAX_VAT_BASIS_POINTS } from "@/config/invoices";
import { maxMinorUnits, rateToFraction } from "@/lib/terminal/amount";

/*
 * The amounts of an invoice ("New invoice"), exact (hard rule 3):
 * integers end to end, formatted only for display. A line's quantity is in hundredths of a unit
 * (1,5 h is 150), its unit price before VAT in minor units of the invoice's currency, its VAT rate
 * in basis points (8,1 % is 810). Two roundings, both written here and both to the nearest minor
 * unit, half up, as an invoice states them ("VAT 2.6 % on 264.00" = 6.86, "VAT 8.1 % on 45.00" =
 * 3.65): a line's amount when its quantity has
 * hundredths, and the VAT of each rate, on the sum of that rate's lines.
 */

/** One line of an invoice, as typed or taken from an article. */
export type InvoiceLine = {
  /** Its designation: trimmed, filled. */
  name: string;
  /** Hundredths of a unit, positive: 100 is one. */
  quantity: number;
  /** The price of one unit before VAT, in minor units of the invoice's currency (0 or more). */
  unitMinor: number;
  /** Basis points, 0 to MAX_VAT_BASIS_POINTS. */
  vatRate: number;
};

/** The VAT of one rate: the sum of its lines before VAT, and its tax. */
export type VatGroup = { rate: number; baseMinor: number; vatMinor: number };

export type InvoiceTotals = {
  /** Before VAT: the sum of the lines' amounts. */
  netMinor: number;
  /** One group per rate, the lowest rate first; a rate of 0 % is left out (no tax to state). */
  vat: VatGroup[];
  /** What the client pays: before VAT and every rate's tax. */
  totalMinor: number;
};

/** `numerator / denominator` rounded to the nearest integer, half up (both positive). */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** `numerator / denominator` rounded up (both positive). */
function roundUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function isValidLine(line: InvoiceLine, digits: number): boolean {
  return (
    line.name.trim() !== "" &&
    Number.isSafeInteger(line.quantity) &&
    line.quantity > 0 &&
    line.quantity <= MAX_QUANTITY_UNITS * 100 + 99 &&
    Number.isSafeInteger(line.unitMinor) &&
    line.unitMinor >= 0 &&
    line.unitMinor <= maxMinorUnits(digits) &&
    Number.isSafeInteger(line.vatRate) &&
    line.vatRate >= 0 &&
    line.vatRate <= MAX_VAT_BASIS_POINTS
  );
}

/** A line's amount before VAT: quantity × unit price, to the nearest minor unit (half up). */
export function lineNetMinor(line: Pick<InvoiceLine, "quantity" | "unitMinor">): number {
  return Number(roundHalfUp(BigInt(line.quantity) * BigInt(line.unitMinor), 100n));
}

/** The totals of `lines`, every line valid (isValidLine). */
export function invoiceTotals(lines: readonly InvoiceLine[]): InvoiceTotals {
  const bases = new Map<number, bigint>();
  let net = 0n;
  for (const line of lines) {
    const amount = BigInt(lineNetMinor(line));
    net += amount;
    bases.set(line.vatRate, (bases.get(line.vatRate) ?? 0n) + amount);
  }
  const vat: VatGroup[] = [...bases.entries()]
    .filter(([rate]) => rate > 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, base]) => ({
      rate,
      baseMinor: Number(base),
      vatMinor: Number(roundHalfUp(base * BigInt(rate), 10_000n))
    }));
  const total = net + vat.reduce((sum, group) => sum + BigInt(group.vatMinor), 0n);
  return { netMinor: Number(net), vat, totalMinor: Number(total) };
}

/**
 * Whether `lines` make an invoice that can be sent: one line at least, MAX_INVOICE_LINES at most,
 * each valid, and a total above zero and within what a payment link asks (the point of sale's
 * largest amount, maxMinorUnits).
 */
export function isPayable(lines: readonly InvoiceLine[], digits: number): boolean {
  if (lines.length === 0 || lines.length > MAX_INVOICE_LINES) return false;
  if (!lines.every((line) => isValidLine(line, digits))) return false;
  const { totalMinor } = invoiceTotals(lines);
  return totalMinor > 0 && totalMinor <= maxMinorUnits(digits);
}

const GROUPING = /[\s  '’]/g;

/**
 * A decimal typed by the merchant, with at most `decimals` digits after its separator (a comma or
 * a dot), grouping spaces and apostrophes ignored, as an integer of that many decimals: "1,5" with
 * 2 → 150. Null when it is not one, or above `max` (in that integer's unit).
 */
export function parseScaled(text: string, decimals: number, max: number): number | null {
  const cleaned = text.trim().replace(GROUPING, "");
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(cleaned);
  if (!match || cleaned === "" || cleaned === "." || cleaned === ",") return null;
  const [, whole = "", fraction = ""] = match;
  if (fraction.length > decimals) return null;
  const value =
    Number(whole || "0") * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

/** A quantity typed, in hundredths; null when not a positive one within MAX_QUANTITY_UNITS. */
export function parseQuantity(text: string): number | null {
  const value = parseScaled(text, 2, MAX_QUANTITY_UNITS * 100 + 99);
  return value !== null && value > 0 ? value : null;
}

/** A VAT rate typed in percent ("8,1"), in basis points; null when not one of 0 to 100 %. */
export function parseVatRate(text: string): number | null {
  return parseScaled(text.replace(/%/g, ""), 2, MAX_VAT_BASIS_POINTS);
}

/**
 * A price of `from` (minor units, its digits) in the invoice's currency `to`, at the points of the
 * same hour of both (price of 1 BTC in each, src/lib/rates/): minor_to = minor_from × rate_to ×
 * 10^digits_to / (rate_from × 10^digits_from), rounded up to the next minor unit (an article of
 * another currency: the merchant never asks less than the price converted).
 * Computed on integers; the rates are prices, read exactly as their decimal digits.
 */
export function convertPrice(
  from: { minor: number; digits: number; rate: number },
  to: { digits: number; rate: number }
): number {
  if (!Number.isSafeInteger(from.minor) || from.minor < 0) {
    throw new Error(`Invalid amount: ${from.minor}`);
  }
  const source = rateToFraction(from.rate);
  const target = rateToFraction(to.rate);
  const numerator =
    BigInt(from.minor) * target.numerator * source.denominator * 10n ** BigInt(to.digits);
  const denominator = source.numerator * target.denominator * 10n ** BigInt(from.digits);
  const converted = roundUp(numerator, denominator);
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Converted price too large");
  return Number(converted);
}
