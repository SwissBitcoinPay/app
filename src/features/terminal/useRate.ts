import { useEffect, useMemo, useState } from "react";

import { subscribeClock } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { pointEnd } from "@/lib/rates/sources";
import {
  createRateStore,
  nowUnix,
  rateAvailability,
  rateRetryDelaySec,
  type RateSnapshot,
  type RateStore
} from "@/lib/rates/snapshot";

/** How often freshness is checked again between reads: a rate ends with its period on its own. */
const FRESHNESS_TICK_MS = 30_000;

export type RateState = {
  /** Price of 1 BTC in the currency: the point that prices the present, undefined until known. */
  rate: number | undefined;
  /** The hour of `rate` (Unix seconds, HH:00:00 UTC), undefined with it. */
  hour: number | undefined;
  /** True until the first answer (or failure) of the rate's source for the currency asked. */
  loading: boolean;
  /**
   * The rate at this instant, undefined when none is known for the present: what an amount is
   * fixed with. `rate` is the one of the last render, whose period may have ended since (up to
   * FRESHNESS_TICK_MS).
   */
  current: () => number | undefined;
};

/**
 * The BTC rate of `currency` for the point of sale (src/lib/rates/): the CoinGecko point that
 * prices the present (the hour that began 5 minutes ago), read now, again as soon as its period
 * ends (HH:05), and while the next point is not published, every 15 s for 10 minutes, then every
 * minute (every minute after a failure). Without it no amount may be fixed: `rate` is undefined
 * and "Charge" stays disabled.
 */
export function useRate(currency: string | null): RateState {
  // A currency known later (the payer's page reads it from its link): a store for it then.
  const store = useMemo(() => (currency === null ? null : createRateStore(currency)), [currency]);
  const [snapshot, setSnapshot] = useState<RateSnapshot | undefined>(undefined);
  // The store whose source answered (or failed): loading until the currency asked has, also after
  // a change of currency ("Settings"), whose first read is not an outage.
  const [answered, setAnswered] = useState<RateStore | null>(null);
  const loading = store === null || answered !== store;
  // The time freshness is judged at, as state: the React Compiler memoizes what a render computes
  // from its inputs, so a clock read inside rateAvailability would never be read again.
  const [now, setNow] = useState(nowUnix);
  // The clock corrected by an invoice's date (src/lib/clock.ts): the point of the present may be
  // another one, and the next read was scheduled on the clock before. Read again at once.
  const [clockChanges, setClockChanges] = useState(0);
  useEffect(() => subscribeClock(() => setClockChanges((count) => count + 1)), []);

  useEffect(() => {
    if (store === null) return;
    const source = store;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (seconds: number) => {
      timer = setTimeout(read, Math.max(1, seconds) * 1000);
    };
    function read() {
      source
        .update()
        .then((next) => {
          if (!alive) return;
          setNow(nowUnix());
          if (next) {
            setSnapshot(next);
            // Held until its period ends (5 minutes after the next hour): then the next point.
            schedule(pointEnd(next.hour) - nowUnix());
          } else {
            // Not published yet: soon early in its period, when it is normally already there, and
            // at its end at the latest (the next point).
            schedule(rateRetryDelaySec(nowUnix()));
          }
        })
        .catch((error: unknown) => {
          logFailure(`Rate of ${currency} unavailable`, error);
          if (alive) schedule(rateRetryDelaySec(nowUnix(), true));
        })
        .finally(() => {
          if (alive) setAnswered(source);
        });
    }
    read();
    const tickTimer = setInterval(() => setNow(nowUnix()), FRESHNESS_TICK_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tickTimer);
    };
    // Read again on a clock corrected (`clockChanges`).
  }, [store, currency, clockChanges]);

  // Only the point of the currency asked: another currency's never prices this one.
  const held = snapshot?.currency === currency ? snapshot : undefined;
  const availability = rateAvailability(held, now);
  const current = () => {
    const time = nowUnix();
    const rate = rateAvailability(held, time).rate;
    // Its hour ended since the last render: shown as an outage at once.
    if (rate === undefined && availability.rate !== undefined) setNow(time);
    return rate;
  };
  return {
    rate: availability.rate,
    hour: availability.rate === undefined ? undefined : held?.hour,
    loading,
    current
  };
}
