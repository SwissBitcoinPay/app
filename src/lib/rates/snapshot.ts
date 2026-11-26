import { nowUnix, observeRoughTime } from "@/lib/clock";
import {
  HOUR_SECONDS,
  POINT_DELAY_SECONDS,
  fetchHourPoint,
  lastLivePrice,
  pointEnd,
  pointHourOf,
  type FetchOptions
} from "@/lib/rates/sources";

/*
 * BTC→fiat rate of the merchant's currency (`displayCurrency` of the merchant settings): the
 * CoinGecko point that prices the present (sources.ts: the point of the hour that began 5 minutes
 * ago), the same for every currency, without margin. An
 * amount fixed with a point is payable until that point stops pricing amounts (pointEnd) at the
 * latest: past it, no amount may be fixed from it.
 */

/** While the current point is not there (not published yet, or no answer): asked again. */
export const RATE_RETRY_INTERVAL_SEC = 60;
/**
 * The same, in the first minutes of a point's period, when it is normally already published: a
 * point a little late is then seen within seconds, "Charge" never waits long for it.
 */
export const RATE_RETRY_SOON_SEC = 15;
/** How long after a point's period starts RATE_RETRY_SOON_SEC applies. */
const RETRY_SOON_WINDOW_SEC = 10 * 60;

/**
 * When to ask again for a point not there at `now`: soon early in its period, then each minute
 * (each minute after a failure of the source), never past the end of its period, when the next
 * point is the one to read.
 */
export function rateRetryDelaySec(now: number, failed: boolean = false): number {
  const hour = pointHourOf(now);
  const soon = !failed && now - (hour + POINT_DELAY_SECONDS) < RETRY_SOON_WINDOW_SEC;
  return Math.min(soon ? RATE_RETRY_SOON_SEC : RATE_RETRY_INTERVAL_SEC, pointEnd(hour) - now);
}

/** Seconds since the epoch, on the clock of the invoices' issuer as far as known (src/lib/clock.ts). */
export { nowUnix };

/** No usable rate: the current hour's point is not known. */
export class RatesNotReadyError extends Error {
  readonly code = "rates_not_ready";

  constructor() {
    super("rates_not_ready");
    this.name = "RatesNotReadyError";
  }
}

export type RateSnapshot = {
  /**
   * The hour of the point (Unix seconds, HH:00:00 UTC). It fixes amounts from 5 minutes after it,
   * for an hour (pointHourOf), never at another time.
   */
  hour: number;
  /** ISO 4217, uppercase. */
  currency: string;
  source: "coingecko";
  /**
   * Price of 1 BTC in `currency`, exactly as CoinGecko publishes it. A rate, never an amount:
   * amounts stay integer sats (`bigint`) and are converted only at the display edge.
   */
  rate: number;
};

export type RateOptions = FetchOptions & {
  /** Clock, `nowUnix` by default. */
  now?: () => number;
};

/**
 * The point that prices the present for `currency`, null while CoinGecko has not published it yet.
 * Rejects when CoinGecko fails, and for anything but an uppercase fiat ISO 4217 code.
 */
export function fetchRate(
  currency: string,
  options: RateOptions = {}
): Promise<RateSnapshot | null> {
  return fetchRateOnce(currency, options, true);
}

async function fetchRateOnce(
  currency: string,
  options: RateOptions,
  rough: boolean
): Promise<RateSnapshot | null> {
  const asked = Date.now();
  const clock = options.now ?? nowUnix;
  const now = clock();
  const hour = pointHourOf(now);
  const rate = await fetchHourPoint(currency, hour, now, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });
  // CoinGecko's date of its live price, just read: on this device's clock (nowUnix, not a clock of
  // the caller's), a rough correction before any invoice (src/lib/clock.ts); then the point of the
  // present again, once.
  const read = lastLivePrice();
  if (
    rough &&
    clock === nowUnix &&
    read !== null &&
    read.receivedAtMs >= asked &&
    observeRoughTime(read.at, read.receivedAtMs) &&
    pointHourOf(nowUnix()) !== hour
  ) {
    return fetchRateOnce(currency, options, false);
  }
  return rate === null ? null : { hour, currency, source: "coingecko", rate };
}

/**
 * A point fixes amounts during its own period only, from 5 minutes after its hour to 5 minutes
 * after the next (pointHourOf). A time before it is refused too: after the clock goes back, a point
 * must not serve a time it does not belong to. On a device the clock is the user's, which makes
 * this rule matter more, not less.
 */
export function isRateSnapshotFresh(hour: number, currentTime: number = nowUnix()): boolean {
  return (
    Number.isInteger(hour) &&
    hour % HOUR_SECONDS === 0 &&
    Number.isInteger(currentTime) &&
    pointHourOf(currentTime) === hour
  );
}

/** Is there no rate for the present? Otherwise the rate. */
export function rateAvailability(
  snapshot: RateSnapshot | undefined,
  currentTime: number = nowUnix()
): { outage: true; rate: undefined } | { outage: false; rate: number } {
  if (
    snapshot === undefined ||
    !isRateSnapshotFresh(snapshot.hour, currentTime) ||
    !Number.isFinite(snapshot.rate) ||
    snapshot.rate <= 0
  ) {
    return { outage: true, rate: undefined };
  }
  return { outage: false, rate: snapshot.rate };
}

/**
 * Same question, as a guard before fixing a payable amount: holding it from another hour's point
 * would put the exchange risk on the merchant or the payer, and nobody could check it again.
 * Amounts already fixed keep their value until the end of their point's period.
 */
export function requireFreshRate(
  snapshot: RateSnapshot | undefined,
  currentTime: number = nowUnix()
): number {
  const availability = rateAvailability(snapshot, currentTime);
  if (availability.outage) throw new RatesNotReadyError();
  return availability.rate;
}

/**
 * The rate of one currency, in memory. Empty at launch, so an outage until the current point is
 * read. `update()` reads it unless it is already held; resolves with what is held for the present,
 * null while it is not published. Concurrent calls share one request. A new currency needs a new
 * store.
 */
export function createRateStore(currency: string, options: RateOptions = {}) {
  const now = options.now ?? nowUnix;
  let latest: RateSnapshot | undefined;
  let inFlight: Promise<RateSnapshot | null> | null = null;

  return {
    getLatestRate: (): RateSnapshot | undefined => latest,
    availability: () => rateAvailability(latest, now()),
    update(): Promise<RateSnapshot | null> {
      if (latest && isRateSnapshotFresh(latest.hour, now())) return Promise.resolve(latest);
      if (!inFlight) {
        inFlight = fetchRate(currency, { ...options, now })
          .then((snapshot) => {
            if (snapshot) latest = snapshot;
            return snapshot;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return inFlight;
    }
  };
}

export type RateStore = ReturnType<typeof createRateStore>;
