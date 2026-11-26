import { SELL_LIMITS_CHF_MINOR } from "@/config/mtpelerin";

import { decimalToMinor, type MtpDecimal } from "./decimal";
import { deferredSellFunded } from "./sale";
import type { MtpOrder, MtpPerson } from "./types";

/*
 * What the merchant may still sell without an identity verification (999 CHF per transfer and
 * per month, 11,988 CHF a year, the gross amount exchanged, fees included), from the profile's
 * orders: Mt Pelerin gives the figure nowhere else. Every
 * exchange of the profile counts, a buy made elsewhere included. An order whose value in francs
 * cannot be told exactly (another currency, no rate) makes the period's figure unknown rather than
 * smaller: "Sell" never shows more left than there is. Mt Pelerin refuses an order over its
 * limits anyway. Pure.
 */

/**
 * Whether Mt Pelerin approved the profile's identity (the file is approved once `kycLevel` ≥ 2,
 * which lifts the 999 CHF/month limit; a company's at 4): the limits below no longer
 * hold for it. The merchant is identified at Mt Pelerin itself,
 * with the phone number of its login: the app only reads the level.
 */
export function isIdentified(person: Pick<MtpPerson, "type" | "kycLevel">): boolean {
  return person.kycLevel >= (person.type === "company" ? 4 : 2);
}

/** Centimes of CHF. */
const CHF_DIGITS = 2;

/** An order's gross value in centimes, rounded up; null when it cannot be told in CHF. */
export function grossChfMinor(order: MtpOrder): number | null {
  if (order.sourceCurrency === "CHF") return decimalToMinor(order.sourceAmount, CHF_DIGITS, "up");
  if (order.destCurrency !== "CHF" || order.rate === null) return null;
  // `rate`: CHF per source unit, before fees: the source × the rate. With its fees when the
  // order says them (`source_amount_with_fees`), the larger: never less than was exchanged.
  const source =
    order.sourceWithFees !== null && greater(order.sourceWithFees, order.sourceAmount)
      ? order.sourceWithFees
      : order.sourceAmount;
  return productMinor(source, order.rate);
}

/** Whether `a` > `b`. */
function greater(a: MtpDecimal, b: MtpDecimal): boolean {
  const scale = Math.max(a.scale, b.scale);
  return a.units * 10n ** BigInt(scale - a.scale) > b.units * 10n ** BigInt(scale - b.scale);
}

/** ⌈`amount` × `rate`⌉ in centimes, on integers. */
export function productMinor(amount: MtpDecimal, rate: MtpDecimal): number | null {
  const dividend = amount.units * rate.units * 10n ** BigInt(CHF_DIGITS);
  const divisor = 10n ** BigInt(amount.scale + rate.scale);
  const minor = (dividend + divisor - 1n) / divisor;
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

const NOT_COUNTED = ["cancelled", "rejected", "deleted"];

/**
 * Whether `order` counts against the limits: not cancelled nor refused, and not a quote whose rate
 * ended without funds (it exchanged nothing). An order still awaiting its funds counts: it may be
 * paid before its rate ends.
 */
export function countsAgainstLimits(order: MtpOrder, nowSeconds: number): boolean {
  if (NOT_COUNTED.includes(order.status)) return false;
  const current = order.transactionStatus;
  if (current !== null) return !NOT_COUNTED.includes(current);
  // No transaction: a deferred sell validated was funded all the same (deferredSellFunded). Any
  // other without funds yet: a sell wired at once is `validated` from its creation, so its status
  // says nothing; only its rate's end does.
  if (order.status === "finished" || deferredSellFunded(order)) return true;
  return order.expiresAt === null || order.expiresAt > nowSeconds;
}

/** Sold in a period, in centimes; null when unknown. */
export type LimitUse = { usedMinor: number | null; limitMinor: number };

export type SellLimits = { sale: number; month: LimitUse; year: LimitUse };

/** The whole days before today that the month's limit counts, besides today (periodStarts). */
export const MONTH_DAYS = 30;

/**
 * Where the periods start for `date`, Unix seconds, in the device's time zone. The year: midnight
 * of January 1st (a calendar year). The month: Mt Pelerin says "per month" in one place and "a
 * rolling period of 30 days" in its page "Identity verification", and whether its server counts
 * a calendar month or rolling days is not known:
 * the month counts back to midnight MONTH_DAYS days before `date`'s day, which always holds the
 * calendar month too, so "Sell" never shows more left than either way leaves.
 */
export function periodStarts(date: Date): { month: number; year: number } {
  const calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const rolling = new Date(date.getFullYear(), date.getMonth(), date.getDate() - MONTH_DAYS);
  const year = new Date(date.getFullYear(), 0, 1).getTime();
  return {
    month: Math.floor(Math.min(calendarMonth, rolling.getTime()) / 1000),
    year: Math.floor(year / 1000)
  };
}

/**
 * The first moment whose orders the limits count at `date`, Unix seconds: the month's start or the
 * year's, the earlier (early January, the month reaches back into December).
 */
export function limitsFrom(date: Date): number {
  const { month, year } = periodStarts(date);
  return Math.min(month, year);
}

/**
 * The limits used by `orders` (every one since `limitsFrom(now)`), at `now`. Without them all
 * (null), both periods are unknown.
 */
export function sellLimits(orders: readonly MtpOrder[] | null, now: Date): SellLimits {
  const starts = periodStarts(now);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  let month: number | null = orders === null ? null : 0;
  let year: number | null = orders === null ? null : 0;
  for (const order of orders ?? []) {
    const inYear = order.createdAt >= starts.year;
    const inMonth = order.createdAt >= starts.month;
    if ((!inYear && !inMonth) || !countsAgainstLimits(order, nowSeconds)) continue;
    const gross = grossChfMinor(order);
    if (inYear) year = year === null || gross === null ? null : year + gross;
    if (inMonth) month = month === null || gross === null ? null : month + gross;
  }
  return {
    sale: SELL_LIMITS_CHF_MINOR.sale,
    month: { usedMinor: month, limitMinor: SELL_LIMITS_CHF_MINOR.month },
    year: { usedMinor: year, limitMinor: SELL_LIMITS_CHF_MINOR.year }
  };
}

/**
 * What a sale in CHF may still be, fees included (a cap sized on the estimate):
 * the smallest of the sale's limit and what the month and the year have left; null when unknown.
 */
export function chfLeftMinor(limits: SellLimits): number | null {
  const { month, year } = limits;
  if (month.usedMinor === null || year.usedMinor === null) return null;
  return Math.max(
    0,
    Math.min(limits.sale, month.limitMinor - month.usedMinor, year.limitMinor - year.usedMinor)
  );
}
