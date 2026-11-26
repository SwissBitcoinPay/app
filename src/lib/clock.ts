/*
 * The time the app counts sales in: this device's clock, corrected to the clock of the service that
 * dates the merchant's invoices. Each Lightning invoice
 * carries the date its issuer gave it (BOLT11 `timestamp`, whole seconds, covered by the invoice's
 * signature), and the other side of a sale judges an invoice by that date only (the period of the
 * point that prices it, src/lib/registry/registry.ts). So each invoice a sale receives bounds how
 * far off this device's clock is (`observeInvoiceDate`), and `nowUnix` reads the issuer's time from
 * then on. No device is refused for its clock: it is corrected. In memory only: the first invoice
 * of each launch measures it again.
 *
 * An invoice must end exactly when its sale or its point's period ends (HH:05:00), and its end is
 * its date plus the expiry asked: so the app also predicts the date the issuer will give an
 * invoice (`expectedInvoiceDate`), and asks it when the issuer will most likely date it in the
 * middle of one of its seconds, away from the edges where the date could be either
 * (`invoiceRequestDelayMs`). Measured with breez.tips: 10 of 11 dates predicted
 * right, the one missed narrowing the bounds for the next ones.
 */

/** Bounds of the offset (seconds to add to this device's clock): what every invoice allows. */
let low = Number.NEGATIVE_INFINITY;
let high = Number.POSITIVE_INFINITY;
/** The correction nowUnix applies: kept while within the bounds, so that it rarely moves. */
let offset = 0;
/** Seconds from a request's sending to its invoice's dating, as last seen: half its round trip. */
let lag = 0;
const listeners = new Set<() => void>();

/** Seconds since the epoch, on the issuer's clock as far as known (this device's until then). */
export function nowUnix(): number {
  return Math.floor(Date.now() / 1000 + offset);
}

/** The correction `nowUnix` applies to this device's clock, in seconds. */
export function clockOffsetSeconds(): number {
  return offset;
}

/** The best estimate of the offset: the middle of its bounds, once an invoice gave some. */
function bestOffset(): number {
  return Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : offset;
}

/**
 * An invoice dated `timestamp` (the issuer's clock, whole seconds) answered a request sent at
 * `sentAtMs` and answered at `receivedAtMs` (this device's clock, milliseconds). The issuer dated it
 * in between: its clock read `timestamp` to `timestamp + 1` while this one read `sentAtMs` to
 * `receivedAtMs`, which bounds the offset. The bounds of every invoice are intersected (they
 * narrow, invoice after invoice); bounds that no longer meet the earlier ones (a clock set since)
 * start over from this invoice. The correction is kept while within them, else set to their
 * middle. Returns whether the correction changed.
 */
export function observeInvoiceDate(
  timestamp: number,
  sentAtMs: number,
  receivedAtMs: number
): boolean {
  if (!Number.isSafeInteger(timestamp) || !(receivedAtMs >= sentAtMs)) return false;
  const from = timestamp - receivedAtMs / 1000;
  const to = timestamp + 1 - sentAtMs / 1000;
  if (Math.max(low, from) <= Math.min(high, to)) {
    low = Math.max(low, from);
    high = Math.min(high, to);
  } else {
    low = from;
    high = to;
  }
  lag = (receivedAtMs - sentAtMs) / 2000;
  if (offset >= low && offset <= high) return false;
  offset = (low + high) / 2;
  for (const listener of listeners) listener();
  return true;
}

/**
 * CoinGecko's 5-minute series ends with its live price, which it dates 84 to 113 s before the
 * answer arrives (11 reads in CHF and EUR: its own delay and 30 s of cache): a rough
 * date of the present, before any invoice.
 */
const ROUGH_TYPICAL_LAG_SECONDS = 100;
/** Past this lag, this device's clock is taken to be off. */
const ROUGH_MAX_LAG_SECONDS = 150;

/**
 * Before any invoice measured the clock: a service dated the present `serviceSeconds` (its clock,
 * Unix seconds) in an answer received at `receivedAtMs` (this device's clock). When this device's
 * corrected clock is not within the lag such a date has, it is corrected to that date plus its usual
 * lag: a clock far ahead would ask CoinGecko for a point not published yet, never
 * get an invoice to correct it, and could not take a payment; a payer's phone a few minutes ahead
 * would take a sale for ended. Never once an invoice gave bounds: those are exact to the second.
 * Returns whether the correction changed.
 */
export function observeRoughTime(serviceSeconds: number, receivedAtMs: number): boolean {
  if (Number.isFinite(low) || Number.isFinite(high) || !Number.isFinite(serviceSeconds)) {
    return false;
  }
  const here = receivedAtMs / 1000 + offset;
  if (here >= serviceSeconds && here <= serviceSeconds + ROUGH_MAX_LAG_SECONDS) return false;
  offset = serviceSeconds + ROUGH_TYPICAL_LAG_SECONDS - receivedAtMs / 1000;
  for (const listener of listeners) listener();
  return true;
}

/**
 * The date the issuer will most likely give an invoice asked at `sentAtMs` (this device's clock):
 * an invoice asked to end at `end` is asked for `end - expectedInvoiceDate(…)` seconds.
 */
export function expectedInvoiceDate(sentAtMs: number = Date.now()): number {
  return Math.floor(sentAtMs / 1000 + bestOffset() + lag);
}

/**
 * How long to wait, from `nowMs`, before asking an invoice: until the issuer will most likely date
 * it in the middle of one of its seconds (at most a second).
 */
export function invoiceRequestDelayMs(nowMs: number = Date.now()): number {
  const at = nowMs / 1000 + bestOffset() + lag;
  const fraction = at - Math.floor(at);
  return Math.round(((fraction <= 0.5 ? 0.5 : 1.5) - fraction) * 1000);
}

/**
 * Calls `listener` whenever the correction changes: what was scheduled on the clock before (the
 * next point's read, src/features/terminal/useRate.ts) is to be scheduled again, a sale's start
 * read again (useClockOffset). Returns the unsubscription.
 */
export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `deviceMs`, a moment on this device's clock (Date.now), in Unix seconds of the issuer's clock as
 * corrected by `correction` (clockOffsetSeconds): a sale's start, tapped before any invoice told the
 * correction, follows it once known (src/features/terminal/pos.tsx).
 */
export function issuerSeconds(deviceMs: number, correction: number = offset): number {
  return Math.floor(deviceMs / 1000 + correction);
}

/** Back to this device's clock (tests). */
export function resetClock(): void {
  low = Number.NEGATIVE_INFINITY;
  high = Number.POSITIVE_INFINITY;
  offset = 0;
  lag = 0;
}
