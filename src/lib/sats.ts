/**
 * 21 000 000 BTC in sats: no amount is larger. A safe integer, so exact as a JSON number (the
 * records that carry amounts as numbers: leases, witnesses, checkout links).
 */
export const MAX_SATS = 2_100_000_000_000_000;

/** Whether `value` is a whole number of sats from 1 to MAX_SATS, as a JSON number. */
export function isSatsNumber(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_SATS
  );
}
