import { useTranslation } from "react-i18next";

import { relativeDayLabel } from "@/features/table/period-label";
import { usePos } from "@/features/terminal/pos";
import type { WalletPayment } from "@/lib/breez/types";
import { formatDate, formatDateCapitalized, withYear } from "@/lib/locale/date";

import {
  formatSignedFiat,
  kindOf,
  pillOf,
  satsToFiatMinor,
  signOf,
  titleOf,
  type DayGroup,
  type Sign
} from "./model";

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const DAY: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };

/**
 * What the wallet screen writes, in the app's language and the device's number and date format:
 * francs at the current rate of the point of sale (its display currency, refreshed every 10
 * minutes), none during a rate outage (never a stale value).
 */
export function useWalletFormat() {
  const { t } = useTranslation();
  const { profile, digits, languageTag, rate } = usePos();
  const currency = profile.currency;
  const current = rate.rate;

  /** "+17,46 CHF", null without a rate; `down`: rounded down, for a minimum (satsToFiatMinor). */
  const fiat = (
    sats: bigint,
    sign: Sign = "",
    rounding: "nearest" | "down" = "nearest"
  ): string | null =>
    current === undefined
      ? null
      : `${formatSignedFiat(satsToFiatMinor(sats, digits, current, rounding), digits, languageTag, sign)} ${currency}`;

  /** The figure alone ("1 217,74"), for AmountBlock. */
  const fiatFigure = (sats: bigint): string | null =>
    current === undefined
      ? null
      : formatSignedFiat(satsToFiatMinor(sats, digits, current), digits, languageTag, "");

  /** "14:32". */
  const time = (timestamp: number): string =>
    formatDate(new Date(timestamp * 1000), languageTag, TIME);

  /**
   * "Today", "Yesterday", else "Wednesday, September 30" (the year when not this one), all in the
   * device locale, as the times and the desktop table's dates: today's and yesterday's words are
   * the device's own (relative-day.ts), the app's translations only when it gives none.
   */
  const day = (when: DayGroup["when"]): string => {
    if (when === "today" || when === "yesterday") return relativeDayLabel(t, languageTag, when);
    return formatDateCapitalized(when, languageTag, withYear(DAY, when));
  };

  /**
   * A date and its time in one sentence of the device locale, words between them included
   * ("Wednesday, September 30 at 2:32 PM", "Mittwoch, 30. September um 14:32"): a row's details,
   * never with words of the app's language.
   */
  const dateTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return formatDateCapitalized(date, languageTag, withYear({ ...DAY, ...TIME }, date));
  };

  const title = (payment: WalletPayment): string => {
    const value = titleOf(payment);
    return "text" in value ? value.text : t(`wallet.titles.${value.key}`);
  };

  /** Its "Type"; null when none is said (kindOf). */
  const kind = (payment: WalletPayment): string | null => {
    const value = kindOf(payment);
    return value === null ? null : t(`wallet.kinds.${value}`);
  };

  /** "Received" or "Sent". */
  const direction = (payment: WalletPayment): string =>
    payment.direction === "receive" ? t("wallet.titles.receipt") : t("wallet.titles.sending");

  const pill = (payment: WalletPayment) => {
    const value = pillOf(payment);
    return value ? { state: value.state, label: t(`wallet.pills.${value.key}`) } : null;
  };

  return {
    currency,
    hasRate: current !== undefined,
    fiat,
    fiatFigure,
    time,
    day,
    dateTime,
    title,
    kind,
    direction,
    pill,
    sign: signOf
  };
}

export type WalletFormat = ReturnType<typeof useWalletFormat>;
