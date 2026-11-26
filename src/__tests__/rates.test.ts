import { clockOffsetSeconds, nowUnix, observeInvoiceDate, resetClock } from "@/lib/clock";
import {
  RatesNotReadyError,
  createRateStore,
  fetchRate,
  isRateSnapshotFresh,
  rateAvailability,
  rateRetryDelaySec,
  requireFreshRate,
  type RateSnapshot
} from "@/lib/rates/snapshot";
import {
  COINGECKO_API_URL,
  HOUR_SECONDS,
  POINT_DELAY_SECONDS,
  fetchHourPoint,
  fetchHourPoints,
  hourOf,
  pointEnd,
  pointHourOf,
  resetRatePoints
} from "@/lib/rates/sources";

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const down = () => ({ ok: false, status: 429, json: async () => ({}) }) as Response;

/** An hour: 2026-10-03 16:00:00 UTC. */
const H = 1_791_043_200;
/** A price as CoinGecko writes it: every digit counts. */
const CHF_AT_H = 70286.80869983822;

type Market = {
  /** Points per currency (lowercase): Unix seconds → price. */
  points: Record<string, Record<number, unknown>>;
  down?: boolean;
  /** Hours whose point the 24-hour window does not give yet (the 2-day one does). */
  lateInDay?: Set<number>;
  /** Hours whose point the 5-minute series does not give. */
  notInFiveMinute?: Set<number>;
  /** The 5-minute series ends with this point, the live price, instead of one a minute later. */
  live?: [number, number];
};

const FIVE_MINUTE = `${COINGECKO_API_URL}/coins/bitcoin/market_chart?`;
const RANGE = `${COINGECKO_API_URL}/coins/bitcoin/market_chart/range?`;

/**
 * CoinGecko over `market`: the range API gives the points inside the window asked; the 5-minute
 * series of the last day gives those of the 24 hours up to the newest, then the live price.
 */
function coingecko(market: Market) {
  return jest.fn(async (url: string) => {
    const parsed = new URL(url);
    const series = market.points[parsed.searchParams.get("vs_currency") ?? ""] ?? {};
    const entries = Object.entries(series).map(([time, price]): [number, unknown] => [
      Number(time),
      price
    ]);
    if (url.startsWith(FIVE_MINUTE)) {
      if (parsed.searchParams.get("days") !== "1") throw new Error(`unexpected ${url}`);
      if (market.down) return down();
      const newest = Math.max(0, ...entries.map(([time]) => time));
      const prices = entries
        .filter(([time]) => time > newest - 24 * 3600 && !market.notInFiveMinute?.has(time))
        .map(([time, price]) => [time * 1000, price]);
      const [liveTime, livePrice] = market.live ?? [newest + 60, 1];
      prices.push([liveTime * 1000, livePrice]);
      return json({ prices, market_caps: [], total_volumes: [] });
    }
    if (!url.startsWith(RANGE)) throw new Error(`unexpected ${url}`);
    if (market.down) return down();
    const from = Number(parsed.searchParams.get("from"));
    const to = Number(parsed.searchParams.get("to"));
    const day = to - from <= 24 * 3600;
    const prices = entries
      .filter(([time]) => time >= from && time <= to)
      .filter(([time]) => !(day && market.lateInDay?.has(time)))
      .map(([time, price]) => [time * 1000, price]);
    return json({ prices, market_caps: [], total_volumes: [] });
  }) as unknown as typeof fetch & jest.Mock;
}

/** What the `call`-th request asked: the 5-minute series, or a window of hourly points. */
const windowOf = (fetchImpl: jest.Mock, call = 0) => {
  const url = new URL(fetchImpl.mock.calls[call][0] as string);
  const currency = url.searchParams.get("vs_currency");
  if (url.pathname.endsWith("/market_chart")) {
    return { currency, days: Number(url.searchParams.get("days")) };
  }
  return {
    currency,
    from: Number(url.searchParams.get("from")),
    to: Number(url.searchParams.get("to"))
  };
};

beforeEach(() => {
  resetRatePoints();
});

describe("hourOf", () => {
  it("is the first second of the hour", () => {
    expect(hourOf(H)).toBe(H);
    expect(hourOf(H + 1)).toBe(H);
    expect(hourOf(H + HOUR_SECONDS - 1)).toBe(H);
    expect(hourOf(H + HOUR_SECONDS)).toBe(H + HOUR_SECONDS);
  });
});

describe("pointHourOf", () => {
  it("is the hour that began 5 minutes before", () => {
    expect(POINT_DELAY_SECONDS).toBe(300);
    // 16:04:59: still the point of 15:00; 16:05:00: the point of 16:00, until 17:04:59.
    expect(pointHourOf(H + 299)).toBe(H - HOUR_SECONDS);
    expect(pointHourOf(H + 300)).toBe(H);
    expect(pointHourOf(H + HOUR_SECONDS + 299)).toBe(H);
    expect(pointHourOf(H + HOUR_SECONDS + 300)).toBe(H + HOUR_SECONDS);
    expect(pointEnd(H)).toBe(H + HOUR_SECONDS + 300);
  });
});

describe("fetchHourPoint", () => {
  it("gives the point of the hour exactly as CoinGecko writes it, from the 5-minute series", async () => {
    const fetchImpl = coingecko({
      points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343, [H]: CHF_AT_H } }
    });
    await expect(fetchHourPoint("CHF", H, H + 310, { fetchImpl })).resolves.toBe(CHF_AT_H);
    // The current hour: the 5-minute series of the last day, where it comes first.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(windowOf(fetchImpl)).toEqual({ currency: "chf", days: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), {
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal)
    });
  });

  it("asks 12 hours on each side of an hour older than a day", async () => {
    const old = H - 30 * 86400;
    const fetchImpl = coingecko({ points: { mxn: { [old]: 1302512.0203492914 } } });
    await expect(fetchHourPoint("MXN", old, H, { fetchImpl })).resolves.toBe(1302512.0203492914);
    expect(windowOf(fetchImpl)).toEqual({ currency: "mxn", from: old - 43200, to: old + 43200 });
  });

  it("is null while the point of the hour is not published, and asks again", async () => {
    const market: Market = { points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343 } } };
    const fetchImpl = coingecko(market);
    // Not in the 5-minute series yet; the hourly ones give it 15 to 35 minutes later: not asked.
    await expect(fetchHourPoint("CHF", H, H + 30, { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    market.points.chf[H] = CHF_AT_H;
    await expect(fetchHourPoint("CHF", H, H + 90, { fetchImpl })).resolves.toBe(CHF_AT_H);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never takes the live price at the end of the 5-minute series for an hour's point", async () => {
    // The live price, read on the second of the hour: not the hour's point, which comes after.
    const market: Market = {
      points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343 } },
      live: [H, 70301]
    };
    const fetchImpl = coingecko(market);
    await expect(fetchHourPoint("CHF", H, H + 5, { fetchImpl })).resolves.toBeNull();
    market.points.chf[H] = CHF_AT_H;
    market.live = undefined;
    await expect(fetchHourPoint("CHF", H, H + 125, { fetchImpl })).resolves.toBe(CHF_AT_H);
  });

  it("looks in the hourly windows for an older hour of the last day the 5-minute series lacks", async () => {
    const hour = H - 3 * HOUR_SECONDS;
    const fetchImpl = coingecko({
      points: { chf: { [hour]: 70100.25, [H]: CHF_AT_H } },
      notInFiveMinute: new Set([hour]),
      lateInDay: new Set([hour])
    });
    await expect(fetchHourPoint("CHF", hour, H + 610, { fetchImpl })).resolves.toBe(70100.25);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(windowOf(fetchImpl, 0)).toEqual({ currency: "chf", days: 1 });
    expect(windowOf(fetchImpl, 1)).toEqual({ currency: "chf", from: H + 610 - 86400, to: H + 610 });
    expect(windowOf(fetchImpl, 2)).toEqual({
      currency: "chf",
      from: H + 610 - 2 * 86400,
      to: H + 610
    });
  });

  it("looks in the hourly windows for the current point the 5-minute series lacks, once they may have it", async () => {
    const market: Market = {
      points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343, [H]: CHF_AT_H } },
      notInFiveMinute: new Set([H])
    };
    const fetchImpl = coingecko(market);
    // 16:10: the hourly series give a point 15 to 35 minutes after its hour, not asked yet.
    await expect(fetchHourPoint("CHF", H, H + 600, { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // 16:20: the 5-minute series still lacks it, the 24-hour window has it.
    await expect(fetchHourPoint("CHF", H, H + 1200, { fetchImpl })).resolves.toBe(CHF_AT_H);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(windowOf(fetchImpl, 1)).toEqual({ currency: "chf", days: 1 });
    expect(windowOf(fetchImpl, 2)).toEqual({
      currency: "chf",
      from: H + 1200 - 86400,
      to: H + 1200
    });
  });

  it("keeps a published point: the same hour is never asked twice", async () => {
    const fetchImpl = coingecko({ points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343 } } });
    // Not published yet: the 5-minute series asked.
    await fetchHourPoint("CHF", H, H + 30, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The previous hour came with the same answer.
    await expect(fetchHourPoint("CHF", H - HOUR_SECONDS, H + 40, { fetchImpl })).resolves.toBe(
      70268.33792348343
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("only takes points exactly on an hour, with a positive price", async () => {
    const fetchImpl = coingecko({
      points: { chf: { [H + 300]: 1, [H - HOUR_SECONDS]: "70268", [H - 2 * HOUR_SECONDS]: -5 } }
    });
    await expect(fetchHourPoint("CHF", H, H + 600, { fetchImpl })).resolves.toBeNull();
    await expect(
      fetchHourPoint("CHF", H - HOUR_SECONDS, H + 600, { fetchImpl })
    ).resolves.toBeNull();
  });

  it("never asks for an hour to come, nor for anything but a fiat code on an hour", async () => {
    const fetchImpl = coingecko({ points: {} });
    await expect(fetchHourPoint("CHF", H + HOUR_SECONDS, H, { fetchImpl })).resolves.toBeNull();
    for (const code of ["chf", "BTC", "sat", "CHFX", ""]) {
      await expect(fetchHourPoint(code, H, H + 1, { fetchImpl })).rejects.toThrow(
        /Not a fiat currency code/
      );
    }
    await expect(fetchHourPoint("CHF", H + 1, H + 2, { fetchImpl })).rejects.toThrow(/Not an hour/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects on an HTTP error and on an answer without prices", async () => {
    await expect(
      fetchHourPoint("CHF", H, H + 1, { fetchImpl: coingecko({ points: {}, down: true }) })
    ).rejects.toThrow(/429/);
    const odd = jest.fn(async () => json({ error: "nope" })) as unknown as typeof fetch;
    await expect(fetchHourPoint("CHF", H, H + 1, { fetchImpl: odd })).rejects.toThrow(/no prices/);
  });

  it("gives up on a request that does not answer in time", async () => {
    const hanging = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        })
    ) as unknown as typeof fetch;
    await expect(
      fetchHourPoint("CHF", H, H + 1, { fetchImpl: hanging, timeoutMs: 10 })
    ).rejects.toThrow(/Aborted/);
  });
});

describe("fetchHourPoints", () => {
  const DAY = 24 * HOUR_SECONDS;
  /** One point per hour, its price the hour's index (`hours` hours before H, up to H). */
  function series(hours: number): Record<number, number> {
    const points: Record<number, number> = {};
    for (let i = 0; i <= hours; i++) points[H - i * HOUR_SECONDS] = 60000 + i;
    return points;
  }

  it("reads every hour of a span of a few days in one request", async () => {
    const fetchImpl = coingecko({ points: { chf: series(72) } });
    const from = H - 3 * DAY;
    const points = await fetchHourPoints("CHF", from, H - HOUR_SECONDS, H + 1200, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(windowOf(fetchImpl)).toEqual({
      currency: "chf",
      from: from - HOUR_SECONDS,
      to: H + 1200
    });
    expect(points.size).toBe(72);
    expect(points.get(from)).toBe(60072);
    expect(points.get(H - HOUR_SECONDS)).toBe(60001);

    // Read again: from memory.
    await fetchHourPoints("CHF", from, H - HOUR_SECONDS, H + 1200, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads the hours of the last day from the 5-minute series, in one request", async () => {
    const fetchImpl = coingecko({ points: { chf: series(30) } });
    const points = await fetchHourPoints("CHF", H - 20 * HOUR_SECONDS, H, H + 400, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(windowOf(fetchImpl)).toEqual({ currency: "chf", days: 1 });
    expect(points.size).toBe(21);
    expect(points.get(H)).toBe(60000);
  });

  it("asks one window of hourly points per 89 days (daily beyond 90)", async () => {
    const fetchImpl = coingecko({ points: { chf: series(100 * 24) } });
    const from = H - 100 * DAY;
    const points = await fetchHourPoints("CHF", from, H, H + 1200, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of [0, 1]) {
      const { from: start, to: end } = windowOf(fetchImpl, call) as { from: number; to: number };
      expect(end - start).toBeLessThanOrEqual(89 * DAY + HOUR_SECONDS);
    }
    expect(points.size).toBe(100 * 24 + 1);
  });

  it("leaves out an hour without a point yet, and hours past CoinGecko's history", async () => {
    const fetchImpl = coingecko({ points: { chf: series(48) } });
    // The current hour (H + 1 h) is not published yet.
    const now = H + HOUR_SECONDS + 300;
    const points = await fetchHourPoints("CHF", H - HOUR_SECONDS, H + HOUR_SECONDS, now, {
      fetchImpl
    });
    expect([...points.keys()]).toEqual([H - HOUR_SECONDS, H]);

    // A year and more ago: never asked (CoinGecko refuses it without key).
    const old = jest.fn() as unknown as typeof fetch & jest.Mock;
    const none = await fetchHourPoints("CHF", H - 400 * DAY, H - 370 * DAY, H, { fetchImpl: old });
    expect(none.size).toBe(0);
    expect(old).not.toHaveBeenCalled();
  });

  it("rejects when CoinGecko fails, and for anything but hours of a fiat currency", async () => {
    const fetchImpl = coingecko({ points: {}, down: true });
    await expect(fetchHourPoints("CHF", H - DAY, H, H + 60, { fetchImpl })).rejects.toThrow("429");
    await expect(fetchHourPoints("BTC", H - DAY, H, H + 60, { fetchImpl })).rejects.toThrow();
    await expect(fetchHourPoints("CHF", H - DAY + 1, H, H + 60, { fetchImpl })).rejects.toThrow();
  });
});

describe("fetchRate", () => {
  it("is the point of the hour that began 5 minutes ago", async () => {
    const fetchImpl = coingecko({ points: { eur: { [H - HOUR_SECONDS]: 75000, [H]: 75260.5 } } });
    await expect(fetchRate("EUR", { fetchImpl, now: () => H + 1234 })).resolves.toEqual({
      hour: H,
      currency: "EUR",
      source: "coingecko",
      rate: 75260.5
    });
    // 16:04: still the point of 15:00.
    await expect(fetchRate("EUR", { fetchImpl, now: () => H + 240 })).resolves.toMatchObject({
      hour: H - HOUR_SECONDS,
      rate: 75000
    });
  });

  it("is null until it is published", async () => {
    const fetchImpl = coingecko({ points: { eur: { [H - HOUR_SECONDS]: 75000 } } });
    await expect(fetchRate("EUR", { fetchImpl, now: () => H + 305 })).resolves.toBeNull();
  });

  describe("on this device's clock, before any invoice", () => {
    /** The present, by CoinGecko: 16:20, its live price dated 100 s before (its usual lag). */
    const PRESENT = H + 1200;
    const market = () =>
      coingecko({
        points: { chf: { [H - HOUR_SECONDS]: 49000, [H]: 50000 } },
        live: [PRESENT - 100, 50100]
      });
    const deviceAt = (time: number) => jest.spyOn(Date, "now").mockReturnValue(time * 1000);
    afterEach(() => jest.restoreAllMocks());

    it("corrects a clock far ahead with CoinGecko's date of its live price", async () => {
      // 70 minutes ahead: it asked the point of 17:00, not published, and no invoice could ever
      // correct it.
      deviceAt(PRESENT + 70 * 60);
      await expect(fetchRate("CHF", { fetchImpl: market() })).resolves.toMatchObject({
        hour: H,
        rate: 50000
      });
      expect(nowUnix()).toBe(PRESENT);
    });

    it("corrects a payer's phone a few minutes ahead, and a clock behind", async () => {
      deviceAt(PRESENT + 180);
      await fetchRate("CHF", { fetchImpl: market() });
      expect(nowUnix()).toBe(PRESENT);

      resetClock();
      resetRatePoints();
      deviceAt(PRESENT - 600);
      await fetchRate("CHF", { fetchImpl: market() });
      expect(nowUnix()).toBe(PRESENT);
    });

    it("corrects it through the rate store, as the point of sale reads it", async () => {
      deviceAt(PRESENT + 70 * 60);
      const store = createRateStore("CHF", { fetchImpl: market() });
      await expect(store.update()).resolves.toMatchObject({ hour: H, rate: 50000 });
      expect(store.availability()).toEqual({ outage: false, rate: 50000 });
    });

    it("leaves a clock within the usual lag of the live price", async () => {
      deviceAt(PRESENT + 40);
      await fetchRate("CHF", { fetchImpl: market() });
      expect(clockOffsetSeconds()).toBe(0);
    });

    it("never moves a clock an invoice measured: exact to the second", async () => {
      deviceAt(PRESENT + 70 * 60);
      observeInvoiceDate(PRESENT + 70 * 60, (PRESENT + 70 * 60) * 1000, (PRESENT + 70 * 60) * 1000);
      await fetchRate("CHF", { fetchImpl: market() });
      expect(clockOffsetSeconds()).toBe(0);
    });
  });
});

describe("rate availability", () => {
  const snapshot: RateSnapshot = { hour: H, currency: "CHF", source: "coingecko", rate: CHF_AT_H };

  it("a point fixes amounts during its own period only, from 5 minutes after its hour", () => {
    expect(isRateSnapshotFresh(H, H + 300)).toBe(true);
    expect(isRateSnapshotFresh(H, H + HOUR_SECONDS + 299)).toBe(true);
    expect(isRateSnapshotFresh(H, H + HOUR_SECONDS + 300)).toBe(false);
    // Before its period: the previous point's.
    expect(isRateSnapshotFresh(H, H + 299)).toBe(false);
    expect(isRateSnapshotFresh(H - HOUR_SECONDS, H + 299)).toBe(true);
    // Not an hour.
    expect(isRateSnapshotFresh(H + 1, H + 302)).toBe(false);
  });

  it("is an outage without a point or with another period's", () => {
    expect(rateAvailability(undefined, H + 300).outage).toBe(true);
    expect(rateAvailability(snapshot, H + 359)).toEqual({ outage: false, rate: CHF_AT_H });
    expect(rateAvailability(snapshot, pointEnd(H)).outage).toBe(true);
    expect(rateAvailability({ ...snapshot, rate: 0 }, H + 300).outage).toBe(true);
  });

  it("refuses to fix an amount without the point of the present", () => {
    expect(requireFreshRate(snapshot, H + 301)).toBe(CHF_AT_H);
    expect(() => requireFreshRate(snapshot, pointEnd(H))).toThrow(RatesNotReadyError);
    let error: unknown;
    try {
      requireFreshRate(undefined, H + 300);
    } catch (caught) {
      error = caught;
    }
    expect((error as RatesNotReadyError).code).toBe("rates_not_ready");
  });
});

describe("rateRetryDelaySec", () => {
  it("asks again for a late point every 15 s early in its period, then every minute", () => {
    expect(rateRetryDelaySec(H + 300)).toBe(15);
    expect(rateRetryDelaySec(H + 300 + 599)).toBe(15);
    expect(rateRetryDelaySec(H + 300 + 600)).toBe(60);
    // After a failure of the source: every minute.
    expect(rateRetryDelaySec(H + 300, true)).toBe(60);
  });

  it("never asks again past the end of the period: the next point is the one to read", () => {
    // 17:04:30: the period of 16:00 ends in 30 s.
    expect(rateRetryDelaySec(H + HOUR_SECONDS + 270)).toBe(30);
    expect(rateRetryDelaySec(H + HOUR_SECONDS + 270, true)).toBe(30);
    // 16:04:59: the period of 15:00 ends in a second.
    expect(rateRetryDelaySec(H + 299)).toBe(1);
  });
});

describe("rate store", () => {
  function setUp(market: Market) {
    let clock = H + POINT_DELAY_SECONDS;
    const fetchImpl = coingecko(market);
    const store = createRateStore("CHF", { fetchImpl, now: () => clock });
    const update = (time: number) => {
      clock = time;
      return store.update();
    };
    const at = (time: number) => {
      clock = time;
      return store.availability();
    };
    return { fetchImpl, store, update, at };
  }

  it("is an outage until the point of the hour is published", async () => {
    const market: Market = { points: { chf: { [H - HOUR_SECONDS]: 70268.33792348343 } } };
    const { update, at } = setUp(market);
    // 16:05:10: the point of 16:00 is late.
    expect(at(H + 310).outage).toBe(true);
    await expect(update(H + 310)).resolves.toBeNull();
    expect(at(H + 310).outage).toBe(true);
    market.points.chf[H] = CHF_AT_H;
    await expect(update(H + 325)).resolves.toMatchObject({ hour: H, rate: CHF_AT_H });
    expect(at(H + 325)).toEqual({ outage: false, rate: CHF_AT_H });
  });

  it("holds the point for its period, then needs the next point", async () => {
    const market: Market = { points: { chf: { [H]: CHF_AT_H } } };
    const { fetchImpl, store, update, at } = setUp(market);
    await update(H + 400);
    await update(H + HOUR_SECONDS + 299);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 17:05: the point held no longer fixes anything, the source is down.
    market.down = true;
    expect(at(pointEnd(H)).outage).toBe(true);
    await expect(update(pointEnd(H) + 5)).rejects.toThrow(/429/);
    expect(store.getLatestRate()).toMatchObject({ hour: H });
    expect(at(pointEnd(H) + 5).outage).toBe(true);

    market.down = false;
    market.points.chf[H + HOUR_SECONDS] = 70300;
    await expect(update(pointEnd(H) + 65)).resolves.toMatchObject({
      hour: H + HOUR_SECONDS,
      rate: 70300
    });
  });

  it("shares one request between concurrent updates", async () => {
    const { fetchImpl, store } = setUp({ points: { chf: { [H]: CHF_AT_H } } });
    const [a, b] = await Promise.all([store.update(), store.update()]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
