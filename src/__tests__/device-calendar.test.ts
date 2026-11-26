// A module: what it declares stays its own.
export {};

declare const __dirname: string;
declare const process: { execPath: string; env: Record<string, string | undefined> };
const { execFileSync } = jest.requireActual<{
  execFileSync(
    file: string,
    args: string[],
    options: { env: Record<string, string | undefined>; encoding: "utf8" }
  ): string;
}>("child_process");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
const { pathToFileURL } = jest.requireActual<{ pathToFileURL(file: string): { href: string } }>(
  "url"
);

/*
 * The device's months (src/lib/locale/calendar.ts) in its own time zone, as the system gives it.
 * The tests run in UTC (jest.config.js), where the device's months
 * are UTC's, and a zone set in a test is not read: each case runs calendar.ts in a Node process of
 * its own, its zone set as it starts (Node strips the file's types).
 */

const CALENDAR = pathToFileURL(join(__dirname, "../lib/locale/calendar.ts")).href;

/** `monthOf` of each time, and `monthStart` of each month, in the time zone `timeZone`. */
function deviceMonths(
  timeZone: string,
  times: number[],
  months: string[]
): { monthOf: string[]; monthStart: number[] } {
  const script = `
    const { deviceCalendar } = await import(${JSON.stringify(CALENDAR)});
    const calendar = deviceCalendar();
    process.stdout.write(JSON.stringify({
      monthOf: ${JSON.stringify(times)}.map((at) => calendar.monthOf(at)),
      monthStart: ${JSON.stringify(months)}.map((month) => calendar.monthStart(month))
    }));
  `;
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" }
  );
  return JSON.parse(output) as { monthOf: string[]; monthStart: number[] };
}

describe("the device's months", () => {
  it("are Zurich's in Zurich: 1 November at 00:30 is November's, summer time included", () => {
    const months = deviceMonths(
      "Europe/Zurich",
      // 31 October at 23:30 UTC, 1 November at 00:30 there; 31 July at 22:30 UTC, 1 August there.
      [Date.UTC(2026, 9, 31, 23, 30), Date.UTC(2026, 9, 31, 22, 30), Date.UTC(2026, 6, 31, 22, 30)],
      ["2026-11", "2026-08"]
    );
    expect(months.monthOf).toEqual(["2026-11", "2026-10", "2026-08"]);
    expect(months.monthStart).toEqual([Date.UTC(2026, 9, 31, 23, 0), Date.UTC(2026, 6, 31, 22, 0)]);
  });

  it("are New York's in New York: 1 November at 02:00 UTC is 31 October there", () => {
    const months = deviceMonths(
      "America/New_York",
      [Date.UTC(2026, 10, 1, 2, 0), Date.UTC(2026, 10, 1, 4, 0)],
      ["2026-11"]
    );
    expect(months.monthOf).toEqual(["2026-10", "2026-11"]);
    expect(months.monthStart).toEqual([Date.UTC(2026, 10, 1, 4, 0)]);
  });

  it("are UTC's in UTC", () => {
    const months = deviceMonths("UTC", [Date.UTC(2026, 9, 31, 23, 30)], ["2026-11"]);
    expect(months.monthOf).toEqual(["2026-10"]);
    expect(months.monthStart).toEqual([Date.UTC(2026, 10, 1)]);
  });
});
