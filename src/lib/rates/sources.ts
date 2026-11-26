import { getWithTimeout } from "@/lib/http";

/*
 * Where the app reads BTC→fiat rates: CoinGecko's hourly points, for every currency, without
 * margin. A point is the price of 1 BTC at an exact hour (HH:00:00 UTC). An amount fixed at a time
 * uses the point of the hour that began 5 minutes before it (pointHourOf): from 14:05:00 to
 * 15:04:59, the point of 14:00, never another. A point's value, as measured, is the same whatever
 * the window asked and whenever it is read (365 days of history without key), so anyone can read
 * it again later and recompute the same amount, to the sat.
 *
 * A new hour's point comes first in the 5-minute series of the last day (`market_chart?days=1`,
 * cached 30 s): 1 to 4 minutes after the hour, where the hourly series give it 15 to 35 minutes
 * after. Its value there is the hourly series' own, to the last digit. So the current point is read
 * from the 5-minute series, older ones from the hourly series, which keep them 365 days.
 *
 * Public API, without key, read from the device: each request sends its IP address to CoinGecko,
 * which limits requests per IP (HTTP 429). Its terms ask for "Powered by CoinGecko" wherever its
 * data is shown. It answers with `Access-Control-Allow-Origin: *`, so the web app reads it too.
 */

export const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";

/** Seconds in an hour: the life of a rate. */
export const HOUR_SECONDS = 3600;

/**
 * A point fixes amounts from this long after its hour, for an hour: the 5-minute series holds it by
 * then (measured 1 to 4 minutes after the hour), so that nobody waits for it.
 */
export const POINT_DELAY_SECONDS = 300;

/** CoinGecko keeps this many days of history for requests without key (refused beyond). */
export const HISTORY_DAYS = 365;

/** A request that hangs must not hold the next one: past this, it fails. */
export const SOURCE_TIMEOUT_MS = 15_000;

export type FetchOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** The hour `time` (Unix seconds) falls in: its first second, HH:00:00 UTC. */
export function hourOf(time: number): number {
  return Math.floor(time / HOUR_SECONDS) * HOUR_SECONDS;
}

/**
 * The hour whose point prices an amount fixed at `time`: the hour that began POINT_DELAY_SECONDS
 * before it. 14:04:59 → 13:00, 14:05:00 → 14:00.
 */
export function pointHourOf(time: number): number {
  return hourOf(time - POINT_DELAY_SECONDS);
}

/** When the point of `hour` stops pricing amounts: 5 minutes after the next hour. */
export function pointEnd(hour: number): number {
  return hour + HOUR_SECONDS + POINT_DELAY_SECONDS;
}

/** Points already read, by currency and hour: a published point never changes. */
const points = new Map<string, number>();

/**
 * The live price that ended the last 5-minute series read: CoinGecko's date of it (Unix seconds,
 * its clock) and when the answer arrived (this device's clock, milliseconds). A rough date of the
 * present (src/lib/clock.ts, observeRoughTime).
 */
let live: { at: number; receivedAtMs: number } | null = null;

export function lastLivePrice(): { at: number; receivedAtMs: number } | null {
  return live;
}

/** Tests only. */
export function resetRatePoints(): void {
  points.clear();
  live = null;
}

const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Whether the 5-minute series of the last day holds the point of `hour`, at `now`. */
function isRecent(hour: number, now: number): boolean {
  return hour > now - DAY_SECONDS + HOUR_SECONDS;
}

/** A series asked: the 5-minute one of the last day, or a window of hourly points. */
type Series = "fiveMinute" | { from: number; to: number };

/**
 * How long after its hour a point may be in the hourly series (15 to 35 minutes, as measured):
 * before, only the 5-minute series can have it.
 */
const HOURLY_DELAY_SECONDS = 15 * 60;

/**
 * The series asked for the point of `hour`, at `now`, in turn until one holds it. An hour of the
 * last day: the 5-minute series, then, once the hourly series may have it, the hourly windows of
 * the last 24 hours and of the last 2 days (a new hour's point comes in either first, 15 to 35
 * minutes after the hour: never before the 5-minute series), for a point the 5-minute
 * series lacks. An older hour: 12 hours of hourly points on each side of it.
 */
function seriesOf(hour: number, now: number): Series[] {
  if (!isRecent(hour, now)) return [{ from: hour - DAY_SECONDS / 2, to: hour + DAY_SECONDS / 2 }];
  if (now - hour < HOURLY_DELAY_SECONDS) return ["fiveMinute"];
  return [
    "fiveMinute",
    { from: now - DAY_SECONDS, to: now },
    { from: now - 2 * DAY_SECONDS, to: now }
  ];
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Price of 1 BTC in `currency` (ISO 4217, uppercase) at `hour` (Unix seconds, on an hour), as
 * CoinGecko publishes it: the number exactly as its JSON gives it. Null while the point is not
 * published yet (the current hour's, in its first minutes). Rejects when CoinGecko fails or
 * answers anything else than its points, for anything but an uppercase fiat code, and for a time
 * that is not on an hour.
 */
export async function fetchHourPoint(
  currency: string,
  hour: number,
  now: number,
  {
    fetchImpl = fetch,
    timeoutMs = SOURCE_TIMEOUT_MS,
    window
  }: FetchOptions & {
    /** The window to ask (fetchHourPoints), around `hour` by default. */
    window?: { from: number; to: number };
  } = {}
): Promise<number | null> {
  if (!/^[A-Z]{3}$/.test(currency) || currency === "BTC") {
    throw new Error(`Not a fiat currency code: ${currency}`);
  }
  if (!Number.isInteger(hour) || hour % HOUR_SECONDS !== 0) {
    throw new Error(`Not an hour: ${hour}`);
  }
  const key = `${currency}|${hour}`;
  const known = points.get(key);
  if (known !== undefined) return known;
  if (hour > now) return null;

  for (const series of window ? [window] : seriesOf(hour, now)) {
    await readSeries(currency, series, fetchImpl, timeoutMs);
    const point = points.get(key);
    if (point !== undefined) return point;
  }
  return null;
}

/**
 * Reads the hourly points of a series into the cache. Rejects as fetchHourPoint. The 5-minute
 * series ends with the live price, at any second: a point on an hour is only taken from it once a
 * later one follows (a live price taken on the second of an hour is not its point).
 */
async function readSeries(
  currency: string,
  series: Series,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<void> {
  const vs = currency.toLowerCase();
  const url =
    series === "fiveMinute"
      ? `${COINGECKO_API_URL}/coins/bitcoin/market_chart?vs_currency=${vs}&days=1`
      : `${COINGECKO_API_URL}/coins/bitcoin/market_chart/range` +
        `?vs_currency=${vs}&from=${series.from}&to=${series.to}`;
  const body = await getWithTimeout(url, fetchImpl, timeoutMs, async (res): Promise<unknown> => {
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  });
  const prices = (body as { prices?: unknown }).prices;
  if (!Array.isArray(prices)) throw new Error("CoinGecko gave no prices");
  const last: unknown = prices[prices.length - 1];
  if (series === "fiveMinute" && Array.isArray(last) && typeof last[0] === "number") {
    live = { at: last[0] / 1000, receivedAtMs: Date.now() };
  }
  const settled = series === "fiveMinute" ? prices.slice(0, -1) : prices;
  for (const entry of settled) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [ms, price] = entry as unknown[];
    // Only points exactly on an hour: any other is not an hourly point.
    if (typeof ms !== "number" || ms % (HOUR_SECONDS * 1000) !== 0 || !isPrice(price)) continue;
    points.set(`${currency}|${ms / 1000}`, price);
  }
}

/** Longest window of hourly points: CoinGecko gives daily points beyond 90 days (its docs). */
const HOURLY_SPAN_SECONDS = 89 * 24 * HOUR_SECONDS;

/**
 * The points of every hour from `from` to `to` (Unix seconds, on hours) that CoinGecko published,
 * by hour: those already read, the others in as few requests as their span needs (one per 89 days
 * at most), oldest first. An hour without a point yet (the current one, in its first minutes) is
 * left out; so are hours older than the history CoinGecko keeps without key. Rejects as
 * fetchHourPoint.
 */
export async function fetchHourPoints(
  currency: string,
  from: number,
  to: number,
  now: number,
  { fetchImpl = fetch, timeoutMs = SOURCE_TIMEOUT_MS }: FetchOptions = {}
): Promise<ReadonlyMap<number, number>> {
  if (!/^[A-Z]{3}$/.test(currency) || currency === "BTC") {
    throw new Error(`Not a fiat currency code: ${currency}`);
  }
  if (![from, to].every((time) => Number.isInteger(time) && time % HOUR_SECONDS === 0)) {
    throw new Error(`Not hours: ${from}, ${to}`);
  }
  const oldest = hourOf(now - (HISTORY_DAYS - 1) * 24 * HOUR_SECONDS);
  const found = new Map<number, number>();
  let missing: number[] = [];
  for (let hour = Math.max(from, oldest); hour <= Math.min(to, now); hour += HOUR_SECONDS) {
    const known = points.get(`${currency}|${hour}`);
    if (known !== undefined) found.set(hour, known);
    else missing.push(hour);
  }
  while (missing.length > 0) {
    const first = missing[0];
    // The last day: the 5-minute series, which holds all its hours (seriesOf).
    const window = isRecent(first, now)
      ? undefined
      : { from: first - HOUR_SECONDS, to: Math.min(first + HOURLY_SPAN_SECONDS, now) };
    // fetchHourPoint reads the whole window into the cache: the other hours come from there.
    await fetchHourPoint(currency, first, now, { fetchImpl, timeoutMs, window });
    const until = window?.to ?? now;
    for (const hour of missing) {
      if (hour > until) break;
      const point = points.get(`${currency}|${hour}`);
      if (point !== undefined) found.set(hour, point);
    }
    missing = missing.filter((hour) => hour > until);
  }
  return found;
}
