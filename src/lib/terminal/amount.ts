/**
 * Amounts of the point of sale. The keypad composes an integer of minor units (cents); the payable
 * amount is integer sats (`bigint`, hard rule 3), converted once from the rate with an explicit
 * rounding: up to the next whole sat, so that the merchant
 * never receives less than the fiat amount asked. Floats only appear in the rate itself, a price
 * as its source gives it, read exactly as its decimal digits.
 */

import { decimalSeparator, formatInteger, formatPaddedInteger } from "@/lib/locale/format";

const SATS_PER_BTC = 100_000_000n;

/** Largest amount the keypad accepts, in major units: 99 999.99. */
export const MAX_MAJOR_UNITS = 99_999;

/** Decimal digits of a currency's minor unit (2 for CHF, 0 for JPY), from the platform's data. */
export function currencyDigits(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits;
    return typeof digits === "number" && digits >= 0 && digits <= 4 ? digits : 2;
  } catch {
    return 2;
  }
}

/** Largest keypad value, in minor units: 99 999,99 for a currency with two decimals. */
export function maxMinorUnits(digits: number): number {
  const scale = 10 ** digits;
  return MAX_MAJOR_UNITS * scale + (scale - 1);
}

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "del";

/**
 * The keypad's next value, in minor units. Digits shift in from the right ("cash register" entry,
 * as in the design: 2, 4, 5, 0 → 24,50). A key that would pass the maximum is ignored.
 */
export function pressKey(minor: number, key: KeypadKey, digits: number): number {
  if (key === "del") return Math.floor(minor / 10);
  const next = key === "00" ? minor * 100 : minor * 10 + Number(key);
  return next > maxMinorUnits(digits) ? minor : next;
}

/**
 * A positive rate (price of 1 BTC) as an exact fraction of its decimal digits:
 * 95123.45 → 9512345 / 100. Rejects anything but a finite positive number.
 */
export function rateToFraction(rate: number): { numerator: bigint; denominator: bigint } {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Invalid rate: ${rate}`);
  // The shortest decimal that reads back as this float (ECMAScript Number::toString), expanded
  // out of exponent notation.
  const text = rate.toString().includes("e") ? rate.toFixed(20) : rate.toString();
  const [whole, fraction = ""] = text.split(".");
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error(`Invalid rate: ${rate}`);
  return { numerator, denominator: 10n ** BigInt(fraction.length) };
}

/**
 * Sats to ask for `minor` units of fiat at `rate` (fiat per BTC), rounded up to the next whole
 * sat: sats = ⌈minor × 10^8 / (rate × 10^digits)⌉, computed on integers.
 */
export function fiatToSats(minor: number, digits: number, rate: number): bigint {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid amount: ${minor}`);
  const { numerator, denominator } = rateToFraction(rate);
  const dividend = BigInt(minor) * SATS_PER_BTC * denominator;
  const divisor = numerator * 10n ** BigInt(digits);
  return (dividend + divisor - 1n) / divisor;
}

/**
 * A fiat amount in minor units, with the device locale's grouping and decimal separator (AGENTS.md:
 * numbers follow the device locale): 2450 → "24,50" in fr-CH. Built from the integer, never from
 * a float, so that no digit can be off.
 */
export function formatFiat(minor: number, digits: number, languageTag: string): string {
  return formatMinor(minor, digits, languageTag, true);
}

/**
 * A fiat amount in minor units as typed in a field: the device locale's digits and decimal
 * separator, without grouping (2450 → "24,50", 123450 → "1234,50" in fr-CH), so that it pastes
 * into an amount field whatever its parser does with group separators.
 */
export function formatFiatPlain(minor: number, digits: number, languageTag: string): string {
  return formatMinor(minor, digits, languageTag, false);
}

function formatMinor(minor: number, digits: number, languageTag: string, grouped: boolean): string {
  const scale = 10 ** digits;
  const major = Math.floor(minor / scale);
  const whole = grouped
    ? formatInteger(major, languageTag)
    : formatPaddedInteger(major, 1, languageTag);
  if (digits === 0) return whole;
  const fraction = formatPaddedInteger(minor % scale, digits, languageTag);
  return `${whole}${decimalSeparator(languageTag)}${fraction}`;
}

/**
 * Sats as a bitcoin amount in prose, with the device locale's grouping and decimal separator, its
 * trailing zeros left out: 100000000n → "1", 4000000n → "0,04" in fr-CH. Exact, from the integer.
 */
export function formatBtc(sats: bigint, languageTag: string): string {
  if (sats < 0n) throw new Error(`Invalid amount: ${sats}`);
  const whole = formatInteger(sats / SATS_PER_BTC, languageTag);
  const fraction = (sats % SATS_PER_BTC).toString().padStart(8, "0").replace(/0+$/, "");
  if (fraction === "") return whole;
  const digits = formatPaddedInteger(Number(fraction), fraction.length, languageTag);
  return `${whole}${decimalSeparator(languageTag)}${digits}`;
}

/**
 * Sats as a bitcoin amount grouped like the design (SatsAmount): 46918 → "0.00 046 918", the
 * eight decimals in groups of 2, 3 and 3. The spaces are no-break spaces: the figure never wraps.
 */
export function formatSatsGrouped(sats: bigint): string {
  const whole = sats / SATS_PER_BTC;
  const fraction = (sats % SATS_PER_BTC).toString().padStart(8, "0");
  const nbsp = " ";
  return `${whole}.${fraction.slice(0, 2)}${nbsp}${fraction.slice(2, 5)}${nbsp}${fraction.slice(5)}`;
}

/** The grouped figure split into its leading zeros (drawn lighter) and its significant tail. */
export function splitSatsLead(grouped: string): [lead: string, tail: string] {
  let i = 0;
  while (i < grouped.length && /[0.  ]/.test(grouped[i])) i++;
  return [grouped.slice(0, i), grouped.slice(i)];
}

/**
 * The fiat share of a partial payment, for display: `received` sats of a sale of `minor` units
 * for `sats` sats, at the sale's own rate. The received share is rounded down and the rest is what
 * is left of the sale, so that the two always add up to the sale's amount.
 */
export function splitFiat(
  minor: number,
  sats: bigint,
  received: bigint
): { receivedMinor: number; restMinor: number } {
  if (sats <= 0n || received <= 0n) return { receivedMinor: 0, restMinor: minor };
  const share = received >= sats ? BigInt(minor) : (BigInt(minor) * received) / sats;
  const receivedMinor = Number(share);
  return { receivedMinor, restMinor: minor - receivedMinor };
}

/**
 * The fiat share of each of several payments received (`parts`, in sats, in the order shown), for
 * display: each is what it adds to splitFiat's received share, so that the shares always add up to
 * that share, never a minor unit more or less (each one rounded alone could).
 */
export function splitFiatShares(minor: number, sats: bigint, parts: readonly bigint[]): number[] {
  let received = 0n;
  let before = 0;
  return parts.map((part) => {
    received += part;
    const { receivedMinor } = splitFiat(minor, sats, received);
    const share = receivedMinor - before;
    before = receivedMinor;
    return share;
  });
}
