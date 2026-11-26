import { calendarDate, dateOf } from "@/features/invoices/invoices";
import { formatDate } from "@/lib/locale/date";

/*
 * The period "Export" covers (as v2's "Period" of the dashboard's activity): this month, last
 * month, this year, last year, or two days chosen. Calendar days of the device's time zone, as the
 * list's days (wallet/model.ts), from the first day's midnight to the last day's end; never past
 * today, when nothing was paid yet.
 */

export const EXPORT_PERIODS = ["thisMonth", "lastMonth", "thisYear", "lastYear", "custom"] as const;

export type ExportPeriod = (typeof EXPORT_PERIODS)[number];

/** The periods "Export" draws as tiles (calendar pages): all but `custom`. */
export const PRESET_PERIODS = [
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear"
] as const satisfies readonly ExportPeriod[];

export type PresetPeriod = (typeof PRESET_PERIODS)[number];

/** Whether a preset covers a year (its tile draws a stack of pages) rather than a month. */
export function isYearPeriod(period: PresetPeriod): boolean {
  return period === "thisYear" || period === "lastYear";
}

/**
 * What a preset's tile writes on its calendar page: its month's short name ("OCT") or its year
 * ("2026"), from its first day, in the device's locale (Intl, as every date: src/lib/locale/), the
 * month in upper case.
 */
export function periodGlyph(period: PresetPeriod, days: DayRange, languageTag: string): string {
  const date = dateOf(days.first);
  if (isYearPeriod(period)) return formatDate(date, languageTag, { year: "numeric" });
  const month = formatDate(date, languageTag, { month: "short" });
  try {
    return month.toLocaleUpperCase(languageTag);
  } catch {
    // Not a tag the engine takes ("en-US@posix"): the default rules.
    return month.toUpperCase();
  }
}

/**
 * The first day a period may start on: Bitcoin's first block (3 January 2009), before which no
 * payment can be. The wallets of sattle.me are of 2026, but the history copied from a v2 account
 * (src/features/migration/history-import.ts) goes back to the v2 service's first sales. Only
 * bounds the days offered.
 */
export const EXPORT_FIRST_DAY = "2009-01-03";

/** Two calendar days, "YYYY-MM-DD", the first not after the last. */
export type DayRange = { first: string; last: string };

/** What a period covers, in Unix seconds: from `start` to `end`, both included. */
export type TimeRange = { start: number; end: number };

/**
 * The days of `period` seen on `today` (the device's calendar): the preset's, or `custom`'s for
 * "Specific dates". Null when the days are not a period: the first after the last, the last after
 * today, or the first before EXPORT_FIRST_DAY (custom days only: a preset's days always are one).
 */
export function periodDays(period: PresetPeriod, today: Date, custom: DayRange): DayRange;
export function periodDays(period: ExportPeriod, today: Date, custom: DayRange): DayRange | null;
export function periodDays(period: ExportPeriod, today: Date, custom: DayRange): DayRange | null {
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = (y: number, m: number, d: number) => calendarDate(new Date(y, m, d));
  const now = day(year, month, today.getDate());
  switch (period) {
    case "thisMonth":
      return { first: day(year, month, 1), last: now };
    // Date carries a month out of range into the year before, and day 0 to the month before's last.
    case "lastMonth":
      return { first: day(year, month - 1, 1), last: day(year, month, 0) };
    case "thisYear":
      return { first: day(year, 0, 1), last: now };
    case "lastYear":
      return { first: day(year - 1, 0, 1), last: day(year - 1, 11, 31) };
    case "custom": {
      const { first, last } = custom;
      if (!isDay(first) || !isDay(last)) return null;
      if (first > last || last > now || first < EXPORT_FIRST_DAY) return null;
      return { first, last };
    }
  }
}

/** Whether `value` is a calendar day "YYYY-MM-DD" that exists (not "2026-02-30"). */
function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && calendarDate(dateOf(value)) === value;
}

/**
 * The seconds `days` cover: from the first day's midnight to the second before the midnight after
 * the last, in the device's time zone (a day of 23 or 25 hours stays one).
 */
export function timeRange(days: DayRange): TimeRange {
  const start = dateOf(days.first).getTime() / 1000;
  const after = dateOf(days.last);
  after.setDate(after.getDate() + 1);
  return { start, end: after.getTime() / 1000 - 1 };
}
