/**
 * The amount typed in "Send", in francs or in sats (the merchant switches between both). Read on
 * integers only (hard rule 3): francs as minor units, sats as a bigint. Francs become sats once, at
 * the current rate, rounded up to the next whole sat as at the point of sale (`fiatToSats`): the
 * recipient never receives less than the francs typed.
 */

import { decimalSeparator, formatInteger } from "@/lib/locale/format";
import { MAX_SATS } from "@/lib/sats";
import { formatFiatPlain, maxMinorUnits } from "@/lib/terminal/amount";

import { satsToFiatMinor } from "../model";

export type AmountUnit = "fiat" | "sats";

/** Spaces and apostrophes that group digits ("1 234", "1'234", "1’234"). */
const GROUPING = /[\s  '’]/g;

/**
 * Francs typed as minor units: digits with at most one decimal separator ("," or ".", whatever
 * the device's), at most `digits` decimals, grouping spaces and apostrophes ignored. Null for an
 * empty or invalid text, or one past the keypad's maximum (99 999,99).
 */
export function parseFiatMinor(text: string, digits: number): number | null {
  const cleaned = text.replace(GROUPING, "");
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(cleaned);
  if (!match || cleaned === "" || cleaned === "." || cleaned === ",") return null;
  const [, whole = "", fraction = ""] = match;
  if (fraction.length > digits) return null;
  const minor = Number(whole || "0") * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor) || minor > maxMinorUnits(digits)) return null;
  return minor;
}

/** Sats typed: digits only, grouping spaces and apostrophes ignored. Null when invalid. */
export function parseSats(text: string): bigint | null {
  const cleaned = text.replace(GROUPING, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const sats = BigInt(cleaned);
  return sats > BigInt(MAX_SATS) ? null : sats;
}

/** Sats as typed in the field, without grouping: 15000 → "15000". */
export function satsText(sats: bigint): string {
  return sats.toString();
}

/** Sats for a sentence or a button: "15 000 sats" with the device locale's grouping. */
export function formatSats(sats: bigint, languageTag: string): string {
  return `${formatInteger(sats, languageTag)} sats`;
}

/**
 * The field's text in the other unit when the merchant switches: francs → the sats they convert
 * to (`toSats`), sats → their value in francs at the current rate. Empty when the text is not an
 * amount yet.
 */
export function convertAmountText(
  text: string,
  from: AmountUnit,
  options: {
    digits: number;
    languageTag: string;
    rate: number;
    toSats: (minor: number) => bigint;
  }
): string {
  if (from === "fiat") {
    const minor = parseFiatMinor(text, options.digits);
    return minor === null ? "" : satsText(options.toSats(minor));
  }
  const sats = parseSats(text);
  if (sats === null) return "";
  const minor = satsToFiatMinor(sats, options.digits, options.rate);
  if (minor > BigInt(maxMinorUnits(options.digits))) return "";
  return formatFiatPlain(Number(minor), options.digits, options.languageTag);
}

/** The decimal separator to show in the placeholder of a francs field ("0,00"). */
export function fiatPlaceholder(digits: number, languageTag: string): string {
  return digits === 0 ? "0" : `0${decimalSeparator(languageTag)}${"0".repeat(digits)}`;
}
