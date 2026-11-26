import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Keypad } from "@/components/ui/Keypad";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { usePos } from "@/features/terminal/pos";
import { formatInteger } from "@/lib/locale/format";
import { formatFiat, type KeypadKey } from "@/lib/terminal/amount";
import { AMOUNT_EM, makeStyles, sans, space, tracked, tracking, type, useTheme } from "@/theme";

import type { AmountEntry } from "./amount-entry";

/*
 * The amount of "Top up", "Lightning invoice" and a return: the figure typed, large, its unit after
 * it; a line under it (its value in the other unit, or why it cannot go); "sats" or the account's
 * currency when a rate is known (none during an outage: sats alone); then the point of sale's
 * keypad.
 */

export function AmountEntryView({
  entry,
  sub,
  warned = false,
  fiatAllowed,
  onKey,
  onUnit,
  children
}: {
  entry: AmountEntry;
  /** The line under the figure (a no-break space when there is nothing to say: no jump). */
  sub: string;
  /** What is typed cannot go (beyond a balance): figure and line in the danger's colour. */
  warned?: boolean;
  /** Fiat may be typed: a rate is known. Without it, sats alone, no choice shown. */
  fiatAllowed: boolean;
  onKey: (key: KeypadKey) => void;
  onUnit?: (unit: AmountEntry["unit"]) => void;
  /** Under the line: "Empty the card" (a return). */
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { profile, digits, languageTag } = usePos();
  const figure =
    entry.unit === "sats"
      ? formatInteger(entry.sats, languageTag)
      : formatFiat(entry.minor, digits, languageTag);
  const unit = entry.unit === "sats" ? "sats" : profile.currency;
  const color = warned ? colors.danger.fg : colors.text.primary;
  return (
    <View style={styles.root}>
      <View style={styles.amount}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${figure} ${unit}`}
          accessibilityLiveRegion="polite"
          style={styles.figureLine}
          testID="card-amount"
        >
          <Text style={[styles.figure, { color }]}>{figure}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
        <Text style={[styles.sub, warned && { color }]} testID="card-amount-sub">
          {sub}
        </Text>
        {children}
        {onUnit && fiatAllowed ? (
          <SegmentedControl
            label={t("cards.wallet.unit")}
            options={[
              { value: "sats", label: "sats" },
              { value: "fiat", label: profile.currency }
            ]}
            value={entry.unit}
            onChange={onUnit}
            style={styles.units}
            testID="card-amount-unit"
          />
        ) : null}
      </View>
      <Keypad onPress={onKey} deleteLabel={t("pos.deleteKey")} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: space[5] },
  amount: { alignItems: "center", gap: space[2], paddingTop: space[3], paddingBottom: space[1] },
  figureLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  figure: {
    ...sans(700),
    fontSize: 48,
    letterSpacing: tracking(AMOUNT_EM, 48),
    lineHeight: 58,
    fontVariant: ["tabular-nums"]
  },
  unit: { ...sans(600), fontSize: 18, color: colors.text.secondary },
  sub: {
    ...sans(500),
    minHeight: 20,
    fontSize: type.label,
    letterSpacing: tracked.label,
    textAlign: "center",
    color: colors.text.secondary
  },
  units: { alignSelf: "center", marginTop: space[2] }
}));
