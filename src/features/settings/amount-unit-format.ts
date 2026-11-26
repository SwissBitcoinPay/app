/**
 * Storage key of "Currency shown first" (the value the lists of
 * movements write first, the display currency by default), on the device only (amount-unit.ts).
 * Never rename it: installed apps keep the choice there.
 */
export const AMOUNT_UNIT_KEY = "amount-unit";

/** Format of the stored record. A change of format needs a new version. */
const AMOUNT_UNIT_VERSION = 1;

/** What a list of movements writes first: the value in the display currency, or the sats. */
export type AmountUnit = "fiat" | "sats";

/** Without a choice (none yet, or not read yet): the display currency first. */
export const DEFAULT_AMOUNT_UNIT: AmountUnit = "fiat";

export function serializeAmountUnit(unit: AmountUnit): string {
  return JSON.stringify({ version: AMOUNT_UNIT_VERSION, unit });
}

/**
 * A stored record, null when absent, damaged or of another format (a newer app's: the default then,
 * never written over unasked).
 */
export function parseAmountUnit(stored: string | null): AmountUnit | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; unit?: unknown } | null;
    return value?.version === AMOUNT_UNIT_VERSION &&
      (value.unit === "fiat" || value.unit === "sats")
      ? value.unit
      : null;
  } catch {
    return null;
  }
}
