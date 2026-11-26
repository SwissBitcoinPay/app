import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { RichText } from "@/components/ui/RichText";
import { isPayoutCurrency } from "@/config/payout-currencies";
import { usePos } from "@/features/terminal/pos";
import { formatPercent } from "@/lib/locale/format";
import { payoutProgress } from "@/lib/mtpelerin/payout";
import type { SplitDue } from "@/lib/mtpelerin/split";
import {
  AMOUNT_EM,
  currencyColors,
  makeStyles,
  palette,
  radius,
  sans,
  stroke,
  tracking,
  type,
  useTheme
} from "@/theme";

import { fiatText, satsText } from "./parts";

/*
 * The split's panel drawn: the receipts as the split of "Settings"
 * draws them (SplitBar: an orange block, a block in the payout currency's colour), read only, and
 * the deferred sells' way to their one transfer.
 */

/** A block narrower than this share (in %) carries no glyph: it would not fit. */
const GLYPH_FROM = 15;
/** A block narrower than this would vanish: it stays a band this wide while its share is not 0. */
const MIN_BLOCK = 10;

/**
 * What the wallet received since the last split's sale, as the split shares it: kept in bitcoin
 * (`receivedSats` less the share), and the share to sell (`dueSats`). The blocks' widths follow
 * the split's percents, for the drawing only; the figures are the legends'.
 */
export function SplitShare({
  due,
  fiatPercent,
  currency,
  testID
}: {
  due: SplitDue;
  /** The fiat share, an integer from 1 to 100. */
  fiatPercent: number;
  /** The bank account's currency: the colour of its block. */
  currency: string;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const bitcoinPercent = 100 - fiatPercent;
  const keptSats = due.receivedSats - due.dueSats;
  const fill = isPayoutCurrency(currency) ? currencyColors[currency].fill : palette.stone;
  const bitcoinEnd = fiatPercent === 0 ? radius.md : 6;
  const fiatStart = bitcoinPercent === 0 ? radius.md : 6;
  return (
    <View style={styles.root} testID={testID}>
      {/* The legends carry the figures: the bar is a drawing, out of reach of screen readers. */}
      <View
        style={styles.bar}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {bitcoinPercent > 0 ? (
          <View
            style={[
              styles.block,
              styles.bitcoinBlock,
              {
                flexGrow: bitcoinPercent,
                borderTopRightRadius: bitcoinEnd,
                borderBottomRightRadius: bitcoinEnd
              }
            ]}
          >
            {bitcoinPercent >= GLYPH_FROM ? (
              <Icon name="bitcoin" size={16} color={palette.white} />
            ) : null}
          </View>
        ) : null}
        <View
          style={[
            styles.block,
            styles.fiatBlock,
            {
              flexGrow: fiatPercent,
              backgroundColor: fill,
              borderTopLeftRadius: fiatStart,
              borderBottomLeftRadius: fiatStart
            }
          ]}
        >
          {fiatPercent >= GLYPH_FROM ? (
            <Icon name="landmark" size={15} color={palette.white} />
          ) : null}
        </View>
      </View>
      <View style={styles.legends}>
        {bitcoinPercent > 0 ? (
          <View style={styles.legend} testID="split-kept">
            <Text style={styles.legendLabel}>
              {t("sell.split.kept", { percent: formatPercent(bitcoinPercent, languageTag) })}
            </Text>
            <Text style={styles.legendFigure}>{satsText(keptSats, languageTag)}</Text>
          </View>
        ) : null}
        <View style={[styles.legend, styles.fiatLegend]} testID="split-share">
          <Text style={[styles.legendLabel, styles.end]}>
            {t("sell.split.share", { percent: formatPercent(fiatPercent, languageTag) })}
          </Text>
          <Text style={[styles.legendFigure, styles.end]}>
            {satsText(due.dueSats, languageTag)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The deferred sells' next transfer, as a gauge: what
 * Mt Pelerin already holds for the account (`heldMinor`, read as the panel opened), this sale
 * (`saleMinor`, its order's amount), on the way to the threshold, and what is left to sell before
 * the transfer. CHF only (payoutProgress): its caller tells the transfer in words otherwise.
 */
export function PayoutGauge({
  heldMinor,
  saleMinor,
  currency
}: {
  heldMinor: number;
  saleMinor: number;
  currency: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { languageTag } = usePos();
  const progress = payoutProgress(heldMinor, saleMinor, currency);
  if (progress === null) return null;
  const amount = (minor: number) => fiatText(minor, currency, languageTag);
  return (
    <View style={styles.payout} testID="split-payout">
      <View style={styles.payoutHead}>
        <Text style={styles.payoutTitle}>{t("sell.split.payout.title")}</Text>
        <View style={styles.payoutThreshold}>
          <Icon name="landmark" size={14} color={colors.text.primary} />
          <Text style={styles.payoutThresholdText}>
            {t("sell.split.payout.threshold", { threshold: amount(progress.thresholdMinor) })}
          </Text>
        </View>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={t("sell.sale.pendingGauge", {
          balance: amount(heldMinor),
          sale: amount(saleMinor),
          threshold: amount(progress.thresholdMinor)
        })}
        accessibilityValue={{
          min: 0,
          max: progress.thresholdMinor,
          now: Math.min(progress.totalMinor, progress.thresholdMinor)
        }}
        testID="split-payout-gauge"
      >
        <View style={[styles.trackHeld, { width: `${progress.heldShare * 100}%` }]} />
        <View style={[styles.trackSale, { width: `${progress.saleShare * 100}%` }]} />
      </View>
      <View style={styles.payoutRows}>
        <View style={styles.payoutRow} testID="split-payout-held">
          <View style={[styles.swatch, styles.trackHeld]} />
          <Text style={styles.payoutLabel}>{t("sell.split.payout.held")}</Text>
          <Text style={styles.payoutFigure}>{amount(heldMinor)}</Text>
        </View>
        <View style={styles.payoutRow} testID="split-payout-sale">
          <View style={[styles.swatch, styles.trackSale]} />
          <Text style={styles.payoutLabel}>{t("sell.split.payout.sale")}</Text>
          <Text style={styles.payoutFigure}>{amount(saleMinor)}</Text>
        </View>
      </View>
      <View style={styles.payoutFoot} testID="split-payout-left">
        <RichText style={styles.payoutText}>
          {progress.leftMinor > 0
            ? t("sell.split.payout.left", { left: amount(progress.leftMinor) })
            : t("sell.split.payout.reached")}
        </RichText>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: 10 },
  bar: { flexDirection: "row", gap: 4, height: 48 },
  block: {
    flexBasis: 0,
    minWidth: MIN_BLOCK,
    alignItems: "center",
    justifyContent: "center"
  },
  bitcoinBlock: {
    backgroundColor: palette.orange,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md
  },
  fiatBlock: { borderTopRightRadius: radius.md, borderBottomRightRadius: radius.md },
  legends: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  legend: { flexShrink: 1, gap: 2 },
  fiatLegend: { marginLeft: "auto", alignItems: "flex-end" },
  end: { textAlign: "right" },
  legendLabel: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  legendFigure: {
    ...sans(700),
    fontSize: 18,
    letterSpacing: tracking(AMOUNT_EM, 18),
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  // On the panel's own surface: a hairline frame, no second background.
  payout: {
    gap: 12,
    padding: 16,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg
  },
  payoutHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payoutTitle: { ...sans(600), fontSize: type.label, color: colors.text.secondary },
  payoutThreshold: { flexDirection: "row", alignItems: "center", gap: 6 },
  payoutThresholdText: { ...sans(700), fontSize: type.label, color: colors.text.primary },
  track: {
    flexDirection: "row",
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    overflow: "hidden"
  },
  // As "Sell"'s gauge (SalePage.tsx PendingGauge): what is held in ink, this sale in orange.
  trackHeld: { backgroundColor: colors.text.primary },
  trackSale: { backgroundColor: palette.orange },
  payoutRows: { gap: 6 },
  payoutRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  payoutLabel: { ...sans(500), flex: 1, fontSize: type.label, color: colors.text.secondary },
  payoutFigure: {
    ...sans(700),
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  payoutFoot: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border.faint },
  payoutText: {
    ...sans(500),
    fontSize: type.label,
    lineHeight: type.label * 1.5,
    color: colors.text.secondary
  }
}));
