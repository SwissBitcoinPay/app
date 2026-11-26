import { satsToFiatMinor } from "@/features/wallet/model";
import { parseFiatMinor, parseSats, satsText } from "@/features/wallet/send/amount";
import {
  fiatToSats,
  formatFiatPlain,
  maxMinorUnits,
  pressKey,
  type KeypadKey
} from "@/lib/terminal/amount";

/*
 * An amount typed on the point of sale's keypad ("Top up", "Lightning invoice", a return): whole
 * sats, or the account's currency as the point of sale takes it (cents shifting in from the right,
 * at most 99,999.99: pressKey), its sats rounded up to the
 * next whole sat at the hour's rate (fiatToSats). Integers end to end.
 */

/** The most sats typed: eight digits, 99,999,999 (the keypad's). */
export const MAX_ENTRY_SATS = 99_999_999n;

/** What is typed, and in what. */
export type AmountEntry = { unit: "sats" | "fiat"; sats: bigint; minor: number };

export const EMPTY_ENTRY: AmountEntry = { unit: "sats", sats: 0n, minor: 0 };

/** Sats typed after `key`: digits shift in from the right; one past MAX_ENTRY_SATS is ignored. */
export function pressSatsKey(value: bigint, key: KeypadKey): bigint {
  if (key === "del") return value / 10n;
  const next = key === "00" ? value * 100n : value * 10n + BigInt(key);
  return next > MAX_ENTRY_SATS ? value : next;
}

/** `entry` after `key`, in its unit (`digits`: the currency's decimals). */
export function pressEntryKey(entry: AmountEntry, key: KeypadKey, digits: number): AmountEntry {
  return entry.unit === "sats"
    ? { ...entry, sats: pressSatsKey(entry.sats, key) }
    : { ...entry, minor: pressKey(entry.minor, key, digits) };
}

/**
 * The sats `entry` stands for: as typed, or its fiat at `rate` rounded up to the next whole sat;
 * null for fiat without a rate (an outage: no amount is fixed, requireFreshRate).
 */
export function entrySats(
  entry: AmountEntry,
  digits: number,
  rate: number | undefined
): bigint | null {
  if (entry.unit === "sats") return entry.sats;
  if (rate === undefined) return null;
  return fiatToSats(entry.minor, digits, rate);
}

/*
 * The same entry typed in a field on a desktop ("Top up", a return, "Lightning invoice", as
 * "Send"): its text read as it is typed, what does not read as an amount
 * refused (the field keeps its text), within the keypad's limits.
 */

/** Whether `a` and `b` are the same amount in the same unit. */
export function sameEntry(a: AmountEntry, b: AmountEntry): boolean {
  return a.unit === b.unit && a.sats === b.sats && a.minor === b.minor;
}

/**
 * The field's text for `entry` when it was not typed ("Empty the card"), as "Send" writes
 * it: sats without grouping (a locale's comma would read as a decimal separator), the currency
 * with the locale's decimal separator; empty for nothing.
 */
export function entryText(entry: AmountEntry, digits: number, languageTag: string): string {
  if (entry.unit === "sats") return entry.sats === 0n ? "" : satsText(entry.sats);
  return entry.minor === 0 ? "" : formatFiatPlain(entry.minor, digits, languageTag);
}

/**
 * The entry a field's `text` reads as, in `unit` (`digits`: the currency's decimals): grouping
 * spaces and apostrophes ignored, one decimal separator for the currency, nothing for an empty
 * field; null for what does not read as an amount, or beyond the keypad's limits.
 */
export function readEntryText(
  text: string,
  unit: AmountEntry["unit"],
  digits: number
): AmountEntry | null {
  if (text.trim() === "") return { unit, sats: 0n, minor: 0 };
  if (unit === "sats") {
    const sats = parseSats(text);
    return sats === null || sats > MAX_ENTRY_SATS ? null : { unit, sats, minor: 0 };
  }
  const minor = parseFiatMinor(text, digits);
  return minor === null ? null : { unit, sats: 0n, minor };
}

/**
 * `entry` in the other unit at `rate` (the instant's): fiat to the next whole sat as everywhere,
 * sats to the nearest minor unit; nothing when there is no rate, or beyond the keypad's limits.
 */
export function switchedEntry(
  entry: AmountEntry,
  digits: number,
  rate: number | undefined
): AmountEntry {
  if (entry.unit === "sats") {
    const minor =
      rate === undefined || entry.sats === 0n ? 0n : satsToFiatMinor(entry.sats, digits, rate);
    return {
      unit: "fiat",
      sats: 0n,
      minor: minor > BigInt(maxMinorUnits(digits)) ? 0 : Number(minor)
    };
  }
  const sats = rate === undefined || entry.minor === 0 ? 0n : fiatToSats(entry.minor, digits, rate);
  return { unit: "sats", sats: sats > MAX_ENTRY_SATS ? 0n : sats, minor: 0 };
}
