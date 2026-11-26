/*
 * Months as the device counts them, in its own time zone: what its holder calls "October"
 * ("History" goes back a month at a time so). What is kept by
 * month is counted in UTC instead (month-head.ts), the same whatever the time zone of the device
 * that wrote it; what shows is counted here.
 */

export type Calendar = {
  /** The month ("YYYY-MM") of the time `at` (ms). */
  monthOf: (at: number) => string;
  /** When the month ("YYYY-MM") starts (ms). */
  monthStart: (month: string) => number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The month after `month` ("YYYY-MM"). */
export function monthAfter(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${pad(number + 1)}`;
}

/** The device's months, as `Date` reads its time zone (the system's, on Hermes as in browsers). */
const DEVICE: Calendar = {
  monthOf: (at) => {
    const date = new Date(at);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  },
  monthStart: (month) => {
    const [year, number] = month.split("-").map(Number);
    return new Date(year, number - 1, 1).getTime();
  }
};

/** The device's calendar (see above). */
export function deviceCalendar(): Calendar {
  return DEVICE;
}
