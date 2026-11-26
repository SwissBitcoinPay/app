import { HOUR_SECONDS } from "@/lib/rates/sources";

/*
 * What a card's movement was worth when it happened (each payment's fiat amount and its currency
 * are recorded on the relays, and the history shows its value at the time of the transaction):
 * its sats at the CoinGecko point of the hour
 * that priced that time (src/lib/rates/sources.ts, pointHourOf), in the account's currency of
 * then. Kept with the movement once known and never worked out again: a change of currency leaves
 * the past values as they were. A value, never an amount paid:
 * rounded to the nearest minor unit, on integers (satsToFiatMinor, src/features/wallet/model.ts).
 *
 * IRREVERSIBLE: the shape, part of the history's records (history-records.ts) and of the phone's
 * log (payment-log.ts).
 */

export type MovementValue = {
  /** In minor units of `currency`, `digits` decimals. */
  minor: number;
  digits: number;
  /** ISO 4217, uppercase. */
  currency: string;
  /** The point's hour (Unix seconds, HH:00:00 UTC), shown with the value. */
  hour: number;
};

/** A value as written (null: none), checked whole; undefined when out of shape. */
export function parseMovementValue(value: unknown): MovementValue | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (
    typeof v.minor !== "number" ||
    !Number.isSafeInteger(v.minor) ||
    v.minor < 0 ||
    typeof v.digits !== "number" ||
    !Number.isInteger(v.digits) ||
    v.digits < 0 ||
    v.digits > 4 ||
    typeof v.currency !== "string" ||
    !/^[A-Z]{3}$/.test(v.currency) ||
    v.currency === "BTC" ||
    typeof v.hour !== "number" ||
    !Number.isSafeInteger(v.hour) ||
    v.hour < 0 ||
    v.hour % HOUR_SECONDS !== 0
  ) {
    return undefined;
  }
  return { minor: v.minor, digits: v.digits, currency: v.currency, hour: v.hour };
}
