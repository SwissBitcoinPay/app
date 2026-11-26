/**
 * CoinGecko's public API as the app reads it (src/lib/rates/sources.ts), for the tests that value
 * card movements: the price of 1 BTC per currency (lowercase) and hour (Unix seconds, on an hour).
 * `market_chart?days=1` gives the points of the last 24 hours, then a live price; `market_chart/
 * range` those of the window asked. `down`: every request refused (HTTP 429, as from a shared
 * address). Reset before each test (jest.after-env.ts), with the app's cache of points.
 */

const HOST = "api.coingecko.com";

export const coingecko = {
  prices: new Map<string, Map<number, number>>(),
  down: false,
  /** The URLs asked, in order. */
  requests: [] as string[]
};

export function resetCoingecko(): void {
  coingecko.prices.clear();
  coingecko.down = false;
  coingecko.requests.length = 0;
}

/** The price of 1 BTC in `currency` (ISO 4217) at `hour` (Unix seconds, on an hour). */
export function setCoingeckoPrice(currency: string, hour: number, price: number): void {
  if (hour % 3600 !== 0) throw new Error(`Not an hour: ${hour}`);
  const key = currency.toLowerCase();
  const series = coingecko.prices.get(key) ?? new Map<number, number>();
  coingecko.prices.set(key, series.set(hour, price));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** CoinGecko's answer to `input`, or null for another host. */
export function tryFetch(input: RequestInfo | URL): Promise<Response> | null {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== HOST) return null;
  coingecko.requests.push(url.href);
  if (coingecko.down) return Promise.resolve(json({}, 429));
  const series = coingecko.prices.get(url.searchParams.get("vs_currency") ?? "") ?? new Map();
  const points = [...series].sort(([a], [b]) => a - b);
  const now = Math.floor(Date.now() / 1000);
  if (url.pathname === "/api/v3/coins/bitcoin/market_chart") {
    if (url.searchParams.get("days") !== "1") return Promise.resolve(json({}, 400));
    const prices = points
      .filter(([time]) => time > now - 24 * 3600 && time <= now)
      .map(([time, price]) => [time * 1000, price]);
    // The live price ends the series, at any second.
    const last = points.filter(([time]) => time <= now).pop();
    prices.push([now * 1000 + 1, last?.[1] ?? 1]);
    return Promise.resolve(json({ prices, market_caps: [], total_volumes: [] }));
  }
  if (url.pathname === "/api/v3/coins/bitcoin/market_chart/range") {
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const prices = points
      .filter(([time]) => time >= from && time <= to)
      .map(([time, price]) => [time * 1000, price]);
    return Promise.resolve(json({ prices, market_caps: [], total_volumes: [] }));
  }
  return Promise.resolve(json({}, 404));
}
