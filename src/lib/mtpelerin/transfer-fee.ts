import { SELL_MIN_WIRED_MINOR, SELL_TRANSFER_FEE } from "@/config/mtpelerin";
import { currencyDigits } from "@/lib/terminal/amount";

import { decimalToMinor, type MtpDecimal } from "./decimal";
import type { MtpBalances } from "./types";

/*
 * Mt Pelerin's transfer fee of a sale wired at once (SELL_TRANSFER_FEE: 1 CHF, EUR or GBP, or the
 * equivalent of 1 CHF, below the equivalent of 50 CHF). Its estimate and its order
 * leave it out: on dev/test, an order of 10 000 sats wired at once came back with
 * `dest_amount` 5.43 CHF and fees of 0, the same figures as its estimate and as a deferred sell's.
 * So the app takes it from what they wire, and says it: what the merchant receives is what Mt
 * Pelerin wires less this fee. A deferred sell pays none. Pure.
 */

/** Centimes of CHF. */
const CHF_DIGITS = 2;

/**
 * The same sats sold into CHF, at Mt Pelerin's rate (an estimate; the sale itself when it is
 * in CHF): what they wire, which tells the threshold's "equivalent", and the price of 1 sat
 * (`exchangeRate.mid`), which tells the equivalent of 1 CHF.
 */
export type ChfSide = { wired: MtpDecimal; rate: MtpDecimal | null };

/**
 * The transfer fee, in minor units of `currency`, of a sale that wires `rate` per sat (the price of
 * 1 sat in `currency`, before fees) and `chf` once in francs; 0 for a deferred sell or from the
 * threshold on. Null when it cannot be told: no francs read (`chf`), or no rate to give the
 * equivalent of 1 CHF in a currency where the fee is not 1. The equivalent is rounded up: never a
 * fee smaller than Mt Pelerin's.
 */
export function transferFeeMinor({
  deferred,
  currency,
  rate,
  chf
}: {
  deferred: boolean;
  currency: string;
  rate: MtpDecimal | null;
  chf: ChfSide | null;
}): number | null {
  if (deferred) return 0;
  if (chf === null) return null;
  // Below the threshold only: its centimes rounded down, as what is wired is shown. Past the range
  // a number holds: far above it.
  const chfMinor = decimalToMinor(chf.wired, CHF_DIGITS, "down");
  if (chfMinor === null || chfMinor >= SELL_TRANSFER_FEE.belowChfMinor) return 0;
  if ((SELL_TRANSFER_FEE.currencies as readonly string[]).includes(currency)) {
    return SELL_TRANSFER_FEE.minor;
  }
  if (rate === null || chf.rate === null || chf.rate.units === 0n) return null;
  // The fee's centimes × (price of 1 sat in `currency` / its price in CHF), in `currency`'s minor
  // units: fee × 10^digits × units × 10^chfScale / (10^CHF_DIGITS × chfUnits × 10^scale).
  const numerator =
    BigInt(SELL_TRANSFER_FEE.minor) *
    10n ** BigInt(currencyDigits(currency)) *
    rate.units *
    10n ** BigInt(chf.rate.scale);
  const denominator = 10n ** BigInt(CHF_DIGITS) * chf.rate.units * 10n ** BigInt(rate.scale);
  const minor = (numerator + denominator - 1n) / denominator;
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

/**
 * What the merchant receives of a sale that wires `wired` of `currency`, less the transfer fee, in
 * its minor units rounded down (never more than Mt Pelerin wires); 0 when the fee takes it all.
 * Null past the range a number holds.
 */
export function receivedMinor(
  wired: MtpDecimal,
  currency: string,
  feeMinor: number
): number | null {
  const minor = decimalToMinor(wired, currencyDigits(currency), "down");
  return minor === null ? null : Math.max(0, minor - feeMinor);
}

/**
 * Whether a sale that wires `wired` of `currency` leaves the merchant something once the transfer
 * fee is taken (SELL_MIN_WIRED_MINOR: never 0). An amount
 * past the range a number holds is something.
 */
export function wiresSomething(wired: MtpDecimal, currency: string, feeMinor: number): boolean {
  const received = receivedMinor(wired, currency, feeMinor);
  return received === null || received >= SELL_MIN_WIRED_MINOR;
}

/**
 * What Mt Pelerin holds for a bank account of `currency` from its deferred sells (`balances`,
 * read now), in its minor units rounded down: 0 when it lists nothing in that currency
 * (only `validated` deferred sells are counted: dev/test answers `{}` without any). Null past
 * the range a number holds.
 */
export function heldMinor(balances: MtpBalances, currency: string): number | null {
  const held = balances.find((entry) => entry.currency === currency);
  return held === undefined ? 0 : decimalToMinor(held.total, currencyDigits(currency), "down");
}
