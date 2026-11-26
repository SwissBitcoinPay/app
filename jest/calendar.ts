import type { Calendar } from "@/lib/locale/calendar";

/**
 * A device's calendar `offsetHours` ahead of UTC (behind it when negative), with no daylight saving:
 * the device's months for the tests, which run in UTC (jest.config.js).
 */
export function fixedCalendar(offsetHours: number): Calendar {
  const offset = offsetHours * 3_600_000;
  return {
    monthOf: (at) => new Date(at + offset).toISOString().slice(0, 7),
    monthStart: (month) => {
      const [year, number] = month.split("-").map(Number);
      return Date.UTC(year, number - 1, 1) - offset;
    }
  };
}
