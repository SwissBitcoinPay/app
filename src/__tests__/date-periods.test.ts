import { datePeriodOf } from "@/lib/date-periods";

/** Unix seconds of a local date and time. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime() / 1000;

describe("datePeriodOf", () => {
  it("puts each date in one period, the most recent that holds it", () => {
    // Thursday 15 October 2026, 10:00: its week began on Monday the 12th.
    const now = new Date(2026, 9, 15, 10);
    expect(datePeriodOf(at(2026, 10, 15, 0), now)).toBe("today");
    expect(datePeriodOf(at(2026, 10, 14, 23), now)).toBe("yesterday");
    expect(datePeriodOf(at(2026, 10, 12, 0), now)).toBe("thisWeek");
    expect(datePeriodOf(at(2026, 10, 11, 23), now)).toBe("lastWeek");
    expect(datePeriodOf(at(2026, 10, 5, 0), now)).toBe("lastWeek");
    expect(datePeriodOf(at(2026, 10, 4), now)).toBe("thisMonth");
    expect(datePeriodOf(at(2026, 10, 1, 0), now)).toBe("thisMonth");
    expect(datePeriodOf(at(2026, 9, 30), now)).toBe("lastMonth");
    expect(datePeriodOf(at(2026, 9, 1, 0), now)).toBe("lastMonth");
    expect(datePeriodOf(at(2026, 8, 31), now)).toBe("thisYear");
    expect(datePeriodOf(at(2026, 1, 1, 0), now)).toBe("thisYear");
    expect(datePeriodOf(at(2025, 12, 31), now)).toBe("lastYear");
    expect(datePeriodOf(at(2025, 1, 1, 0), now)).toBe("lastYear");
    expect(datePeriodOf(at(2024, 12, 31, 23), now)).toBe("older");
    // Ahead of the device's clock: today.
    expect(datePeriodOf(at(2026, 10, 16), now)).toBe("today");
  });

  it("counts weeks from Monday, yesterday before this week", () => {
    // Monday 12 October 2026: yesterday is Sunday, of last week; this week holds nothing else.
    const monday = new Date(2026, 9, 12, 9);
    expect(datePeriodOf(at(2026, 10, 11), monday)).toBe("yesterday");
    expect(datePeriodOf(at(2026, 10, 10), monday)).toBe("lastWeek");
    expect(datePeriodOf(at(2026, 10, 5, 0), monday)).toBe("lastWeek");
    expect(datePeriodOf(at(2026, 10, 4), monday)).toBe("thisMonth");
    // Sunday 18 October: its week began on Monday the 12th.
    const sunday = new Date(2026, 9, 18, 9);
    expect(datePeriodOf(at(2026, 10, 12, 0), sunday)).toBe("thisWeek");
    expect(datePeriodOf(at(2026, 10, 11), sunday)).toBe("lastWeek");
  });

  it("carries days and months over the turn of a month and a year", () => {
    // Friday 1 January 2027: yesterday was the last day of last year, of last month too.
    const newYear = new Date(2027, 0, 1, 9);
    expect(datePeriodOf(at(2026, 12, 31), newYear)).toBe("yesterday");
    // Its week began on Monday 28 December 2026.
    expect(datePeriodOf(at(2026, 12, 28, 0), newYear)).toBe("thisWeek");
    expect(datePeriodOf(at(2026, 12, 27), newYear)).toBe("lastWeek");
    expect(datePeriodOf(at(2026, 12, 20), newYear)).toBe("lastMonth");
    expect(datePeriodOf(at(2026, 11, 30), newYear)).toBe("lastYear");
    expect(datePeriodOf(at(2025, 12, 31), newYear)).toBe("older");
  });
});
