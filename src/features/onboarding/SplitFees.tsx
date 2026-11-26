import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Callout } from "@/components/ui/Callout";
import { SELL_TRANSFER_FEE } from "@/config/mtpelerin";
import { fiatText, transferThresholdText } from "@/features/sell/parts";
import { formatDate } from "@/lib/locale/date";
import { formatPercent } from "@/lib/locale/format";
import { makeStyles, radius, sans, type } from "@/theme";
import type { PayoutCurrency } from "@/config/payout-currencies";

/**
 * sattle.me's fee (percent points), on everything the merchant takes in: the share kept in bitcoin
 * and the share sold alike. Hard-coded in the app, not read from an API. Waived until
 * BITCOIN_FEE_FREE_UNTIL: shown struck through, 0 % after it, until then.
 */
export const BITCOIN_FEE_PERCENT = 1;

/**
 * The end of the bitcoin fee's waiver: the 31 December 2026 over in Switzerland (Unix ms, midnight
 * of 1 January 2027 in Zurich, UTC+1 in winter). From then on, the fee shows as it is.
 */
export const BITCOIN_FEE_FREE_UNTIL = Date.parse("2026-12-31T23:00:00Z");

/**
 * The last day of the waiver, as it is written: noon of the 31 December in the device's own time
 * zone, which formatDate writes in (noon UTC is already the 1st of January from UTC+12 on).
 */
const BITCOIN_FEE_FREE_LAST_DAY = new Date(2026, 11, 31, 12);

/**
 * Mt Pelerin's fees on the share sold, in addition: its own, set by Mt Pelerin and not sattle.me's,
 * shown as a range. A sale shows Mt Pelerin's exact fees before it is made (its estimate).
 */
export const MTPELERIN_FEE_RANGE_PERCENT = { min: 0.5, max: 1.3 } as const;

/** Whether the bitcoin fee is waived at `now` (Unix ms). */
export function bitcoinFeeWaived(now: number = Date.now()): boolean {
  return now < BITCOIN_FEE_FREE_UNTIL;
}

/** "31 December 2026": the waiver's last day, in the device's locale. */
export function bitcoinFeeFreeUntilText(languageTag: string): string {
  return formatDate(BITCOIN_FEE_FREE_LAST_DAY, languageTag, {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

/** "0.5% to 1.3%": Mt Pelerin's range, in the device's locale. */
export function mtPelerinFeeRangeText(t: TFunction, languageTag: string): string {
  return t("split.feeRange", {
    min: formatPercent(MTPELERIN_FEE_RANGE_PERCENT.min, languageTag),
    max: formatPercent(MTPELERIN_FEE_RANGE_PERCENT.max, languageTag)
  });
}

/**
 * The fees card of "Split", under the bar: one row per fee, each saying what it applies to, so that
 * neither reads as a column's alone. sattle.me's fee first, on everything taken in, converted or
 * not: while it is waived, its rate struck through, 0 % beside it in the green of "Free until …",
 * under it. Then the conversion's, Mt Pelerin's range with its "+", on the share sold only (grey
 * without a fiat share), and how its transfers go in a small warning under it, the row's whole
 * width (with a fiat share only). The sign-up's split and the settings' share it.
 */
export function SplitFees({
  payoutCurrency,
  hasFiat,
  languageTag
}: {
  payoutCurrency: PayoutCurrency;
  hasFiat: boolean;
  languageTag: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const waived = bitcoinFeeWaived();
  const fee = formatPercent(BITCOIN_FEE_PERCENT, languageTag);
  const free = formatPercent(0, languageTag);
  return (
    <View style={styles.fees}>
      <FeeRow
        title={t("split.sattleFee")}
        scope={t("split.sattleFeeScope")}
        promo={waived ? t("split.freeUntil", { date: bitcoinFeeFreeUntilText(languageTag) }) : null}
        rate={
          waived ? (
            // Read as one: "0 % instead of 1 %", not the two figures in a row.
            <View
              accessible
              accessibilityLabel={t("split.waivedRate", { free, fee })}
              style={styles.rates}
            >
              <Text style={[styles.rate, styles.struck]}>{fee}</Text>
              <Text style={[styles.rate, styles.free]}>{free}</Text>
            </View>
          ) : (
            <Text style={styles.rate}>{fee}</Text>
          )
        }
        testID="sattle-fee"
      />
      <View style={styles.divider} />
      <FeeRow
        title={t("split.conversionFee", { currency: t(`currencies.${payoutCurrency}`) })}
        scope={t("split.conversionFeeScope")}
        // No share sold, no transfer: no warning.
        note={hasFiat ? transferNoteText(t, payoutCurrency, languageTag) : null}
        rate={
          <Text style={[styles.rate, !hasFiat && styles.muted]}>
            {t("split.extraFee", { fee: mtPelerinFeeRangeText(t, languageTag) })}
          </Text>
        }
        muted={!hasFiat}
        testID="conversion-fee"
      />
    </View>
  );
}

/**
 * Under Mt Pelerin's fees, how its transfers go: free from the equivalent of 50 CHF, the threshold
 * of the grouped transfer (SPLIT_PAYOUT_THRESHOLD_CHF_MINOR) and of the transfer fee
 * (SELL_TRANSFER_FEE.belowChfMinor) alike; a smaller sale waits in the grouped transfer, or goes
 * at once for the fee: 1 of the payout currency where it is CHF, EUR or GBP, else "the equivalent
 * of" 1 CHF. Exact amounts, as "Sell" tells them before each sale (SalePage.tsx); no rate is read.
 */
function transferNoteText(t: TFunction, currency: PayoutCurrency, languageTag: string): string {
  const own = (SELL_TRANSFER_FEE.currencies as readonly string[]).includes(currency);
  const fee = own
    ? fiatText(SELL_TRANSFER_FEE.minor, currency, languageTag)
    : t("sell.sale.equivalentOf", {
        amount: fiatText(SELL_TRANSFER_FEE.minor, "CHF", languageTag)
      });
  return t("split.transferNote", {
    fee,
    threshold: transferThresholdText(t, currency, languageTag, SELL_TRANSFER_FEE.belowChfMinor)
  });
}

/** One fee: what it is and what it applies to on the left, its rate on the right. */
function FeeRow({
  title,
  scope,
  note = null,
  promo = null,
  rate,
  muted = false,
  testID
}: {
  title: string;
  scope: string;
  /** A small warning under the row, its whole width (Mt Pelerin's transfer fee). */
  note?: string | null;
  /** "Free until 31 December 2026", under its scope. */
  promo?: string | null;
  rate: ReactNode;
  /** No share it applies to (0 % in fiat): its title turns grey. */
  muted?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.fee} testID={testID}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.title, muted && styles.muted]}>{title}</Text>
          <Text style={styles.scope}>{scope}</Text>
          {promo === null ? null : <Text style={styles.promo}>{promo}</Text>}
        </View>
        {rate}
      </View>
      {note === null ? null : (
        <Callout tone="warning" small>
          {note}
        </Callout>
      )}
    </View>
  );
}

const RATE_SIZE = 17;

const useStyles = makeStyles(({ colors, shadow }) => ({
  fees: {
    marginTop: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card
  },
  fee: { gap: 10, paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  divider: { height: 1, backgroundColor: colors.border.faint },
  texts: { flex: 1, minWidth: 0, gap: 3, alignItems: "flex-start" },
  title: {
    ...sans(700),
    fontSize: type.body,
    lineHeight: type.body * 1.3,
    color: colors.text.primary
  },
  scope: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.4,
    color: colors.text.secondary
  },
  // The waiver, a pill under the scope.
  promo: {
    ...sans(700),
    marginTop: 3,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    fontSize: type.caption,
    lineHeight: type.caption * 1.4,
    color: colors.success.fg,
    backgroundColor: colors.success.bg
  },
  rates: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  rate: {
    ...sans(700),
    fontVariant: ["tabular-nums"],
    fontSize: RATE_SIZE,
    lineHeight: RATE_SIZE * 1.25,
    textAlign: "right",
    color: colors.text.primary
  },
  muted: { color: colors.text.secondary },
  // A waived fee: struck through and greyed, the rate that replaces it beside it.
  struck: { textDecorationLine: "line-through", color: colors.text.secondary },
  // What replaces it, in the green of its "Free until …".
  free: { color: colors.success.fg }
}));
