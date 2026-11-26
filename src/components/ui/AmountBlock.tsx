import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { splitSatsLead } from "@/lib/terminal/amount";
import {
  AMOUNT_EM,
  makeStyles,
  mono,
  motion,
  palette,
  sans,
  space,
  tracking,
  type,
  useTheme
} from "@/theme";

import { AnimatedAmount, FIGURE_GAP } from "./AnimatedAmount";
import { Masked, spokenAmount, useDiscreet } from "./Discreet";
import { Icon } from "./Icon";

/** A fixed figure following its space on the web (FixedFigure): as the keypad's amount slides. */
const FIT = { duration: motion.amountSlide, easing: Easing.out(Easing.cubic) };

type SatsAmountProps = {
  /** Grouped figure (formatSatsGrouped): "0.00 046 918". */
  value: string;
  size?: number;
  showIcon?: boolean;
  /** Accessible name: the figure read as sats. */
  accessibilityLabel?: string;
};

/**
 * Sats in mono: the leading zeros in grey, the significant digits in bold ink, then "sats". The
 * bitcoin sign in orange (a fill, never text). In a screen's discreet mode, the figure is masked
 * (Masked): the sign and "sats" stay.
 */
export function SatsAmount({
  value,
  size = type.sats,
  showIcon = true,
  accessibilityLabel
}: SatsAmountProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [lead, tail] = splitSatsLead(value);
  const discreet = useDiscreet();
  return (
    <View
      style={styles.sats}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={
        accessibilityLabel === undefined ? undefined : spokenAmount(discreet, accessibilityLabel)
      }
    >
      {showIcon ? <Icon name="bitcoin" size={size + 3.5} color={palette.orange} /> : null}
      <Masked color={colors.text.secondary}>
        <Text style={[styles.satsFigure, { fontSize: size, letterSpacing: tracking(-0.01, size) }]}>
          {lead}
          <Text style={styles.satsTail}>{tail}</Text>
        </Text>
      </Masked>
      <Text style={[styles.satsUnit, { fontSize: size - 1 }]}>sats</Text>
    </View>
  );
}

type AmountBlockProps = {
  /** Formatted fiat figure (formatFiat): "24,50". */
  amount: string;
  currency: string;
  /** Grouped sats under the amount; none while the rate is unknown. */
  sats?: string;
  satsLabel?: string;
  size?: "display" | "large";
  align?: "center" | "left";
  /**
   * The amount in minor units, for an amount typed in place (the keypad): each change of the
   * figure is then animated (AnimatedAmount), its digits sliding one place per key.
   */
  minor?: number;
  /** With `minor`: every character the figure can show, measured ahead (AnimatedAmount). */
  glyphs?: string;
  /**
   * The fiat figure in Bold instead of SemiBold: the point of sale's screens set it; the payment
   * page and the wallet keep SemiBold.
   */
  bold?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The amount of a sale: the fiat figure (76 px on the keypad, 52 elsewhere) in tabular figures so
 * that nothing moves as it changes, the currency code after it, and the sats underneath. In a
 * screen's discreet mode, the figures are masked (Masked): the currency code stays.
 */
export function AmountBlock({
  amount,
  currency,
  sats,
  satsLabel,
  size = "large",
  align = "center",
  minor,
  glyphs,
  bold = false,
  style
}: AmountBlockProps) {
  const styles = useStyles();
  const discreet = useDiscreet();
  const display = size === "display";
  const fontSize = display ? type.amountDisplay : type.amountLarge;
  const figureStyle = [
    styles.figure,
    bold && styles.figureBold,
    { fontSize, lineHeight: fontSize * 1.08, letterSpacing: tracking(AMOUNT_EM, fontSize) }
  ];
  const currencyStyle = [styles.currency, { fontSize: display ? 22 : 18 }];
  return (
    <View
      style={[
        styles.block,
        { alignItems: align === "center" ? "center" : "flex-start" },
        // The animated figure fits itself to the whole width (AnimatedAmount). On the web, a fixed
        // one too (FixedFigure): sized by its content, as in a parent that centres it, the block
        // would be as wide as its figure on one line, past the screen's edge.
        (minor !== undefined || Platform.OS === "web") && styles.stretch,
        style
      ]}
    >
      {minor !== undefined ? (
        <AnimatedAmount
          amount={amount}
          minor={minor}
          currency={currency}
          fontSize={fontSize}
          figureStyle={figureStyle}
          currencyStyle={currencyStyle}
          glyphs={glyphs}
          align={align}
        />
      ) : (
        <FixedFigure
          amount={amount}
          currency={currency}
          label={spokenAmount(discreet, `${amount} ${currency}`)}
          figureStyle={figureStyle}
          currencyStyle={currencyStyle}
          align={align}
        />
      )}
      {sats ? <SatsAmount value={sats} accessibilityLabel={satsLabel} /> : null}
    </View>
  );
}

/** A measured width, unless it is 0 (a screen under another one is `display: none` on the web). */
function keepWidth(event: LayoutChangeEvent, set: (width: number) => void) {
  const width = event.nativeEvent.layout.width;
  if (width > 0) set(width);
}

type FixedFigureProps = {
  amount: string;
  currency: string;
  /** The row's accessible name. */
  label: string;
  figureStyle: StyleProp<TextStyle>;
  currencyStyle: StyleProp<TextStyle>;
  align: "center" | "left";
};

/**
 * A fixed amount's figure and currency code, made smaller when the figure is wider than its space.
 * On iOS and Android, the figure's font shrinks (adjustsFontSizeToFit). react-native-web ignores
 * it (the figure would end in "…"): there the row is as wide as its space, the figure and the code
 * at their full size overflow it evenly, and the row is scaled down as a whole, as the keypad's
 * amount is (AnimatedAmount). The scale is set at once the first time (a figure mounted too wide
 * does not shrink in), then follows the space: a narrower or wider window, a font loaded late.
 * Reduce Motion drops the movement: the new scale at once.
 */
function FixedFigure({
  amount,
  currency,
  label,
  figureStyle,
  currencyStyle,
  align
}: FixedFigureProps) {
  const styles = useStyles();
  const web = Platform.OS === "web";
  const reduceMotion = useReducedMotion();
  const [room, setRoom] = useState(0);
  const [figureWidth, setFigureWidth] = useState(0);
  const [currencyWidth, setCurrencyWidth] = useState(0);
  const natural = figureWidth + FIGURE_GAP + currencyWidth;
  const known = room > 0 && figureWidth > 0 && currencyWidth > 0;
  const scale = useSharedValue(1);
  const placed = useRef(false);
  useEffect(() => {
    if (!web || !known) return;
    // Half a point short is the widths' rounding, not a lack of room.
    const target = room >= natural - 0.5 ? 1 : room / natural;
    scale.set(placed.current && !reduceMotion ? withTiming(target, FIT) : target);
    placed.current = true;
  }, [web, known, room, natural, reduceMotion, scale]);
  const scaled = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  if (!web) {
    return (
      <View style={styles.figureRow} accessible accessibilityLabel={label}>
        <Masked style={styles.shrink}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={figureStyle}>
            {amount}
          </Text>
        </Masked>
        <Text style={currencyStyle}>{currency}</Text>
      </View>
    );
  }
  return (
    <Animated.View
      style={[styles.fitRow, align === "left" ? styles.fitLeft : styles.fitCenter, scaled]}
      onLayout={(event) => keepWidth(event, setRoom)}
      accessible
      accessibilityLabel={label}
    >
      <Masked style={styles.unshrunk}>
        <Text
          style={[figureStyle, styles.unshrunk]}
          onLayout={(event) => keepWidth(event, setFigureWidth)}
        >
          {amount}
        </Text>
      </Masked>
      <Text style={currencyStyle} onLayout={(event) => keepWidth(event, setCurrencyWidth)}>
        {currency}
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  block: { gap: 11 },
  stretch: { alignSelf: "stretch" },
  figureRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: FIGURE_GAP,
    maxWidth: "100%"
  },
  figure: {
    ...sans(600),
    fontVariant: ["tabular-nums"],
    color: colors.text.primary,
    flexShrink: 1
  },
  figureBold: sans(700),
  shrink: { flexShrink: 1 },
  // Web: as wide as its space whatever the figure's width (FixedFigure); its content, never cut
  // nor wrapped, overflows it evenly, then the scale brings it back in.
  fitRow: { alignSelf: "stretch", flexDirection: "row", alignItems: "baseline", gap: FIGURE_GAP },
  fitCenter: { justifyContent: "center", transformOrigin: "center" },
  fitLeft: { justifyContent: "flex-start", transformOrigin: "left" },
  unshrunk: { flexShrink: 0 },
  currency: { ...sans(600), color: colors.text.secondary },
  sats: { flexDirection: "row", alignItems: "center", gap: space[4] },
  satsFigure: { ...mono(500), color: colors.text.secondary },
  satsTail: { ...mono(700), color: colors.text.primary },
  satsUnit: { ...sans(600), color: colors.text.secondary }
}));
