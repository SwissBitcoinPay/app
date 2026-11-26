import type { Article } from "@/lib/catalog/article";

import { maxMinorUnits, rateToFraction } from "./amount";

/*
 * The point of sale's basket ("Items" and the scan): articles of the
 * business's catalogue and their quantities, priced in the point of sale's currency. Exact (hard
 * rule 3): integer minor units end to end. An article priced in another currency (its price keeps
 * the currency it was typed in, src/lib/catalog/article.ts) is converted at the points of the same
 * hour of both currencies (the BTC price of each), to the nearest minor unit, half up, once per
 * unit: a line is that unit price times its quantity.
 */

/** One line: an article of the catalogue (by id) and how many, at least 1. */
export type BasketLine = { id: string; quantity: number };

/** The lines in the order their articles were first added. */
export type Basket = readonly BasketLine[];

/** Most units of one article a line holds. */
export const MAX_LINE_QUANTITY = 999;

/** The basket with `delta` more units of article `id` (a line of 0 leaves the basket). */
export function changeQuantity(basket: Basket, id: string, delta: number): Basket {
  const line = basket.find((item) => item.id === id);
  const quantity = Math.min(MAX_LINE_QUANTITY, Math.max(0, (line?.quantity ?? 0) + delta));
  if (!line) return quantity > 0 ? [...basket, { id, quantity }] : basket;
  if (quantity === 0) return basket.filter((item) => item.id !== id);
  return basket.map((item) => (item.id === id ? { id, quantity } : item));
}

/** How many units of article `id` the basket holds. */
export function quantityOf(basket: Basket, id: string): number {
  return basket.find((item) => item.id === id)?.quantity ?? 0;
}

/** How many units the basket holds in all. */
export function unitCount(basket: Basket): number {
  return basket.reduce((sum, item) => sum + item.quantity, 0);
}

/** `numerator / denominator` to the nearest integer, half up (both positive). */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** A rate (price of 1 BTC) per currency, of one hour's point: undefined when none is known. */
export type RateOf = (currency: string) => number | undefined;

/** The point of sale's currency: its code and the digits of its minor unit. */
export type SaleCurrency = { currency: string; digits: number };

/**
 * One unit of `article` in `to`'s minor units: its price as it is in the same currency (another
 * number of digits rescaled), converted otherwise at both currencies' rates (`rateOf`, of one
 * hour), to the nearest minor unit, half up. Undefined without a rate of either currency.
 */
export function unitPrice(article: Article, to: SaleCurrency, rateOf: RateOf): number | undefined {
  const { minor, digits, currency } = article.price;
  if (currency === to.currency && digits === to.digits) return minor;
  // to = minor × 10^toDigits × rateTo / (10^digits × rateFrom), on integers.
  let numerator = BigInt(minor) * 10n ** BigInt(to.digits);
  let denominator = 10n ** BigInt(digits);
  if (currency !== to.currency) {
    const fromRate = rateOf(currency);
    const toRate = rateOf(to.currency);
    if (fromRate === undefined || toRate === undefined) return undefined;
    const from = rateToFraction(fromRate);
    const target = rateToFraction(toRate);
    numerator *= target.numerator * from.denominator;
    denominator *= target.denominator * from.numerator;
  }
  const converted = roundHalfUp(numerator, denominator);
  return converted > BigInt(Number.MAX_SAFE_INTEGER) ? undefined : Number(converted);
}

export type BasketTotal =
  | { status: "ok"; minor: number; units: number }
  /** An article's currency has no rate now: no amount can be fixed. */
  | { status: "noRate" }
  /** Past the largest amount the point of sale charges (maxMinorUnits). */
  | { status: "tooLarge" };

/**
 * The basket's total in `to`'s minor units: each line its unit price (unitPrice) times its
 * quantity. Lines whose article left the catalogue count for nothing (the screens drop them).
 */
export function basketTotal(
  basket: Basket,
  articles: readonly Article[],
  to: SaleCurrency,
  rateOf: RateOf
): BasketTotal {
  let minor = 0;
  let units = 0;
  for (const line of basket) {
    const article = articles.find(({ id }) => id === line.id);
    if (!article) continue;
    const unit = unitPrice(article, to, rateOf);
    if (unit === undefined) return { status: "noRate" };
    minor += unit * line.quantity;
    units += line.quantity;
    if (minor > maxMinorUnits(to.digits)) return { status: "tooLarge" };
  }
  return { status: "ok", minor, units };
}

/** The basket without the lines whose article is no longer in the catalogue. */
export function keptLines(basket: Basket, articles: readonly Article[]): Basket {
  const kept = basket.filter((line) => articles.some(({ id }) => id === line.id));
  return kept.length === basket.length ? basket : kept;
}

/**
 * A barcode as a GTIN-14: its digits right-justified in 14, zeros before (GS1's rule: every GTIN,
 * GTIN-8, -12 (UPC-A), -13 (EAN) and -14, is unique in that form). The same code is not read
 * alike on every device: on iOS, expo-camera drops the leading 0 of every EAN-13 (a UPC-A is read
 * as an EAN-13 there; BarcodeScannerUtils.swift of expo-camera 57), Android gives the code as ML
 * Kit reads it. Compared as GTIN-14, an article scanned on one device is found on the other.
 */
export function gtinKey(barcode: string): string {
  return barcode.padStart(14, "0");
}

/**
 * The article of `barcode` in the catalogue (the same GTIN, gtinKey), the newest first when several
 * share it.
 */
export function articleOfBarcode(
  articles: readonly Article[],
  barcode: string
): Article | undefined {
  const key = gtinKey(barcode);
  return articles.find((article) => article.barcode !== null && gtinKey(article.barcode) === key);
}
