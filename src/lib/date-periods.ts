/**
 * The periods a table's dates are filtered by ("Date"'s menu): today,
 * yesterday, this week, last week, this month, last month, this year, last year, and older. Each
 * date is in one only, the first of that order whose start it is on or after: yesterday is not
 * "This week" too, and "This week" holds this week's days before yesterday. So the
 * periods follow each other in time, the most recent first, and a period that starts after the one
 * before it holds nothing (a week that began today: "This week" is empty). Weeks start on
 * Monday (ISO 8601, the app's countries; Hermes has no `Intl.Locale` week data). Calendar days of
 * the device's time zone; a date ahead of the device's clock is today's.
 */

export const DATE_PERIODS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
  "older"
] as const;

export type DatePeriod = (typeof DATE_PERIODS)[number];

type PeriodStarts = readonly [DatePeriod, number][];

// The starts of the last day asked: a table classifies each of its rows several times a render
// (its filter, its menu), all on one day.
let cached: { day: string; starts: PeriodStarts } | null = null;

/** Where each period but "older" starts (Unix milliseconds), seen on `now`'s local day. */
function periodStarts(now: Date): PeriodStarts {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const day = `${year}-${month}-${date}`;
  if (cached?.day === day) return cached.starts;
  // Local midnights; Date carries a day or a month out of range into the one before.
  const start = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  const sinceMonday = (now.getDay() + 6) % 7;
  const starts: PeriodStarts = [
    ["today", start(year, month, date)],
    ["yesterday", start(year, month, date - 1)],
    ["thisWeek", start(year, month, date - sinceMonday)],
    ["lastWeek", start(year, month, date - sinceMonday - 7)],
    ["thisMonth", start(year, month, 1)],
    ["lastMonth", start(year, month - 1, 1)],
    ["thisYear", start(year, 0, 1)],
    ["lastYear", start(year - 1, 0, 1)]
  ];
  cached = { day, starts };
  return starts;
}

/** The period of `timestamp` (Unix seconds), seen at `now`. */
export function datePeriodOf(timestamp: number, now: Date): DatePeriod {
  const at = timestamp * 1000;
  for (const [period, from] of periodStarts(now)) if (at >= from) return period;
  return "older";
}
