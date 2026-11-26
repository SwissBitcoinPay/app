import i18n from "@/i18n";

import { whenOf } from "@/features/card/LimitsPanel";
import { formatDate } from "@/lib/locale/date";

/*
 * When a payment leaves a window of the card's limits, as "Limits" says it: today's time,
 * tomorrow's, or the date (a phone whose clock was set back logged payments ahead of now).
 */

const t = i18n.getFixedT("en");

/** 14:07, the device's local time, on a day without a change of time. */
const NOW = new Date(2026, 9, 14, 14, 7).getTime();
const time = (at: number) =>
  formatDate(new Date(at), "en-CH", { hour: "2-digit", minute: "2-digit" });

describe("whenOf", () => {
  it("says the time alone today", () => {
    const at = new Date(2026, 9, 14, 23, 59).getTime();
    expect(whenOf(at, NOW, t, "en-CH")).toBe(`at ${time(at)}`);
  });

  it('says "tomorrow" for tomorrow\'s, from midnight', () => {
    const midnight = new Date(2026, 9, 15, 0, 0).getTime();
    expect(whenOf(midnight, NOW, t, "en-CH")).toBe(`tomorrow at ${time(midnight)}`);
    const late = new Date(2026, 9, 15, 23, 30).getTime();
    expect(whenOf(late, NOW, t, "en-CH")).toBe(`tomorrow at ${time(late)}`);
  });

  it("says the date further on, in the device locale", () => {
    const at = new Date(2026, 9, 16, 9, 41).getTime();
    expect(whenOf(at, NOW, t, "en-CH")).toBe(
      `on ${formatDate(new Date(at), "en-CH", { dateStyle: "short", timeStyle: "short" })}`
    );
  });

  it("is written in the app's language, the time in the device's", () => {
    const at = new Date(2026, 9, 15, 9, 41).getTime();
    expect(whenOf(at, NOW, i18n.getFixedT("de"), "en-CH")).toBe(`morgen um ${time(at)}`);
  });
});
