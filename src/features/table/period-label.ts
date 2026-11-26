import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { DatePeriod } from "@/lib/date-periods";
import { relativeDayWord } from "@/lib/locale/relative-day";

/**
 * Today's or yesterday's word: the device's own ("Today", "Gestern": relative-day.ts),
 * else the app's translation. The tables' dates, the wallet's days and the "Date" menus.
 */
export function relativeDayLabel(
  t: TFunction,
  languageTag: string,
  when: "today" | "yesterday"
): string {
  return when === "today"
    ? (relativeDayWord(languageTag, 0) ?? t("wallet.today"))
    : (relativeDayWord(languageTag, -1) ?? t("wallet.yesterday"));
}

/**
 * The words of a date period (src/lib/date-periods.ts) in a "Date" column's menu: today's and
 * yesterday's as the tables' dates (relativeDayLabel), then the app's translations of the others.
 */
export function usePeriodLabel(languageTag: string): (period: DatePeriod) => string {
  const { t } = useTranslation();
  return (period) =>
    period === "today" || period === "yesterday"
      ? relativeDayLabel(t, languageTag, period)
      : t(`table.periods.${period}`);
}
