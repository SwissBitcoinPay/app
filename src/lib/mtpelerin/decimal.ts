/*
 * Mt Pelerin's amounts: JSON numbers (`"dest_amount": 2785.4`) or texts
 * (`"total": "13.00"`), read as exact decimals, never as floating-point arithmetic (AGENTS.md
 * "Money is exact"). Turned into the app's integer units (fiat minor units, sats) only, rounded
 * the way each caller names. Pure.
 */

/** `units` × 10^-`scale`: 2785.4 is { units: 27854n, scale: 1 }. Never negative. */
export type MtpDecimal = { units: bigint; scale: number };

/** At most this many digits after the point (an asset's 18 decimals), and 15 before. */
const DECIMAL = /^(\d{1,15})(?:\.(\d{1,18}))?$/;

/**
 * `value` as a decimal: a finite number from 0 written without an exponent, or such a text. Null
 * for anything else (a negative amount, NaN, `1e21`, an empty text).
 */
export function readDecimal(value: unknown): MtpDecimal | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    // A JavaScript number's shortest text: 2785.4 stays "2785.4"; 1e-7 is refused below.
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? "";
  return { units: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

/**
 * `decimal` in minor units of `digits` decimals (CHF: 2), its further digits rounded `down` (what
 * the merchant receives: never more than Mt Pelerin wires) or `up` (fees, amounts counted against
 * a limit: never less). Null past Number.MAX_SAFE_INTEGER.
 */
export function decimalToMinor(
  decimal: MtpDecimal,
  digits: number,
  rounding: "down" | "up"
): number | null {
  let minor: bigint;
  if (decimal.scale <= digits) {
    minor = decimal.units * 10n ** BigInt(digits - decimal.scale);
  } else {
    const divisor = 10n ** BigInt(decimal.scale - digits);
    minor = decimal.units / divisor;
    if (rounding === "up" && decimal.units % divisor !== 0n) minor += 1n;
  }
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/** `decimal` as whole units (sats), null when it has a fraction. */
export function decimalToInteger(decimal: MtpDecimal): bigint | null {
  if (decimal.scale === 0) return decimal.units;
  const divisor = 10n ** BigInt(decimal.scale);
  return decimal.units % divisor === 0n ? decimal.units / divisor : null;
}

/**
 * `decimal` as the text readDecimal reads back to it, exactly: { units: 120n, scale: 2 } is
 * "1.20" (its scale kept), for a record that keeps Mt Pelerin's figures as it gave them.
 */
export function decimalString(decimal: MtpDecimal): string {
  const digits = decimal.units.toString().padStart(decimal.scale + 1, "0");
  if (decimal.scale === 0) return digits;
  return `${digits.slice(0, -decimal.scale)}.${digits.slice(-decimal.scale)}`;
}

/** The price of 1 BTC from Mt Pelerin's price of 1 sat (`rate`), rounded half up: display only. */
export function btcPriceOf(rate: MtpDecimal): bigint {
  const divisor = 10n ** BigInt(rate.scale);
  return (rate.units * 100_000_000n + divisor / 2n) / divisor;
}

/**
 * The sats worth `minor` minor units of a currency of `digits` decimals at Mt Pelerin's `rate`
 * (its price of 1 sat in that currency, before fees), rounded up to the next whole sat: never less
 * than the amount typed. On integers. Null for a rate of 0.
 */
export function minorToSats(minor: number, digits: number, rate: MtpDecimal): bigint | null {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid amount: ${minor}`);
  if (rate.units === 0n) return null;
  // minor × 10^-digits ÷ (units × 10^-scale) = minor × 10^scale ÷ (units × 10^digits).
  const dividend = BigInt(minor) * 10n ** BigInt(rate.scale);
  const divisor = rate.units * 10n ** BigInt(digits);
  return (dividend + divisor - 1n) / divisor;
}
