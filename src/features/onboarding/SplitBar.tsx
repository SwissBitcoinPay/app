import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type KeyDownEvent,
  type LayoutChangeEvent,
  type ViewStyle
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  type SharedValue,
  withTiming
} from "react-native-reanimated";

import { Icon } from "@/components/ui/Icon";
import type { PayoutCurrency } from "@/config/payout-currencies";
import { formatPercentParts } from "@/lib/locale/format";
import {
  currencyColors,
  makeStyles,
  motion,
  palette,
  radius,
  sans,
  stroke,
  type,
  useTheme
} from "@/theme";

type SplitBarProps = {
  /** Integer between 0 and 100. */
  bitcoinPercent: number;
  onChange: (bitcoinPercent: number) => void;
  currency: PayoutCurrency;
  /** The currency tag: opens the payout currency picker. */
  onPickCurrency: () => void;
  /** Device locale, for the figures. */
  languageTag: string;
  bitcoinLabel: string;
  accessibilityLabel: string;
  /** Spoken value, e.g. "70 % en bitcoin, 30 % en francs suisses". */
  accessibilityValueText: string;
  /** Accessible name of the currency tag. */
  currencyLabel: string;
  testID?: string;
};

// Geometry, in points.
/** The bar and the figures that leave it, above it. */
const HEIGHT = 160;
const BAR_TOP = 64;
const BAR_HEIGHT = 96;
/** Between the two blocks. */
const GAP = 4;
/** A block narrower than this would vanish: it stays a band this wide while its share is not 0. */
const MIN_BLOCK = 12;
const HANDLE_WIDTH = 22;
const HANDLE_HEIGHT = 44;
/** Centre of the handle at either end, and its closest approach to them. */
const HANDLE_INSET = 17;
/** A figure leaves its block under this share (it no longer fits in it). */
const OUT_BELOW = 25;
/** The figure out of its block: above the bar, smaller (44 → 30 points). */
const OUT_SHIFT = -BAR_HEIGHT;
const OUT_SCALE = 0.68;
/** The line between a figure out of its block and its band, down to the bar. */
const LINE_TOP = 50;
const LINE_HEIGHT = BAR_TOP - LINE_TOP;
const LINE_WIDTH = 1.5;

/** Where the blocks, the handle and the link lines stand for a share, on a bar this wide. */
export function splitGeometry(bitcoinPercent: number, width: number) {
  const p = bitcoinPercent;
  const q = 100 - p;
  const bitcoinWidth =
    q === 0
      ? width
      : p === 0
        ? 0
        : Math.min(Math.max((p / 100) * width - GAP / 2, MIN_BLOCK), width - GAP - MIN_BLOCK);
  // On the gap between the blocks, kept off the rounded ends.
  const handle =
    q === 0
      ? width - HANDLE_INSET
      : p === 0
        ? HANDLE_INSET
        : Math.min(Math.max(bitcoinWidth + GAP / 2, HANDLE_INSET), width - HANDLE_INSET);
  return {
    bitcoinWidth,
    handle,
    bitcoinLine: Math.max(6, (p / 200) * width - 1),
    fiatLine: Math.min(width - 7, ((p + q / 2) / 100) * width + 1)
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Keys of the ARIA slider pattern, to the value they lead to. */
const KEYS = new Map<string, (value: number) => number>([
  ["ArrowRight", (value) => value + 1],
  ["ArrowUp", (value) => value + 1],
  ["ArrowLeft", (value) => value - 1],
  ["ArrowDown", (value) => value - 1],
  ["PageUp", (value) => value + 10],
  ["PageDown", (value) => value - 10],
  ["Home", () => 0],
  ["End", () => 100]
]);

// CSS `ease-out` and `ease`. Sizes and positions are movement: they change at
// once with Reduce Motion (withTiming's default follows the system setting). Colours are fades:
// they are kept.
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
const MOVE = { duration: motion.splitBar, easing: EASE_OUT };
const FIGURE = { duration: motion.splitFigure, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
const LINE = { duration: motion.splitFade, easing: EASE_OUT };
const FADE = {
  duration: motion.splitFade,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  reduceMotion: ReduceMotion.Never
};

/** On its block's colour, the currency tag is white 22 %; out of it, the currency colour. */
const TAG_ON_BLOCK = "rgba(255, 255, 255, 0.22)";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// react-native-web sets any CSS cursor; React Native's types only list "auto" and "pointer".
const RESIZE_CURSOR =
  Platform.OS === "web" ? ({ cursor: "ew-resize" } as unknown as ViewStyle) : null;

/**
 * The bitcoin / fiat split: an orange block and a block in the payout currency's
 * colour, dragged at the handle or anywhere on the bar: the bar follows the finger, the shares go
 * by steps of 1 %. Each block carries its share; under 25 % the share slides out above the bar,
 * smaller, joined to its band by a line. The fiat block carries the currency tag, which opens the
 * currency picker.
 *
 * One adjustable element for assistive technologies (and on the web, a keyboard slider); the
 * currency tag is a separate button.
 */
export function SplitBar({
  bitcoinPercent,
  onChange,
  currency,
  onPickCurrency,
  languageTag,
  bitcoinLabel,
  accessibilityLabel,
  accessibilityValueText,
  currencyLabel,
  testID
}: SplitBarProps) {
  // While a finger drags the bar: the whole % under it, drawn by the bar alone. The screen gets it
  // on release (onChange), and at once when it crosses 100 % (dots and button follow): a render of
  // the whole sign-up at every % made the drag lag on phones.
  const { colors } = useTheme();
  const styles = useStyles();
  const [dragged, setDragged] = useState<number | null>(null);
  const p = dragged ?? bitcoinPercent;
  const q = 100 - p;
  const bitcoinOut = p < OUT_BELOW;
  const fiatOut = q < OUT_BELOW;
  const fill = currencyColors[currency].fill;

  const [width, setWidth] = useState(0);
  // Page x of the bar's left edge, captured when the touch starts.
  const origin = useRef(0);
  const dragging = useRef(false);
  // The last whole % of the drag: release may come before the render that shows it.
  const lastDragged = useRef(bitcoinPercent);
  // The last share handed over to the screen (onChange), which may not have re-rendered yet.
  const handedOver = useRef(bitcoinPercent);

  // Web: react-native-web makes an adjustable view neither a tab stop nor keyboard-operable (the
  // accessibility actions below are native only). It forwards `onKeyDown` to the element: its
  // React event carries the browser's in `nativeEvent`.
  const webKeyboard =
    Platform.OS === "web"
      ? {
          tabIndex: 0 as const,
          onKeyDown: (event: KeyDownEvent) => {
            const next = KEYS.get(event.nativeEvent.key);
            if (!next) return;
            event.preventDefault();
            onChange(clamp(next(p)));
          }
        }
      : null;

  // Positions: set at once when the bar is first measured, animated afterwards. A drag sets them
  // itself, frame by frame (place): the effect leaves them alone meanwhile.
  const geometry = splitGeometry(bitcoinPercent, width);
  const bitcoinWidth = useSharedValue(0);
  const handle = useSharedValue(0);
  const bitcoinLineLeft = useSharedValue(0);
  const fiatLineLeft = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (width === 0 || dragging.current) return;
    const to = (value: number) => (placed.current ? withTiming(value, MOVE) : value);
    bitcoinWidth.set(to(geometry.bitcoinWidth));
    handle.set(to(geometry.handle));
    bitcoinLineLeft.set(to(geometry.bitcoinLine));
    fiatLineLeft.set(to(geometry.fiatLine));
    placed.current = true;
  }, [
    width,
    geometry.bitcoinWidth,
    geometry.handle,
    geometry.bitcoinLine,
    geometry.fiatLine,
    bitcoinWidth,
    handle,
    bitcoinLineLeft,
    fiatLineLeft
  ]);

  /**
   * Puts the blocks, the handle and the lines at a share, unrounded: the bar follows the finger
   * between the whole %. The ends are whole: 99.6 % is drawn (and saved) as 100 %, with no band.
   */
  const place = (share: number, animate: boolean) => {
    const whole = Math.round(share);
    const at = splitGeometry(whole === 0 || whole === 100 ? whole : share, width);
    const to = (value: number) => (animate ? withTiming(value, MOVE) : value);
    bitcoinWidth.set(to(at.bitcoinWidth));
    handle.set(to(at.handle));
    bitcoinLineLeft.set(to(at.bitcoinLine));
    fiatLineLeft.set(to(at.fiatLine));
  };

  /** The finger at this page x: under it at once (animated when it lands), the figures by the %. */
  const drag = (pageX: number, landing: boolean) => {
    if (width === 0) return;
    const share = Math.min(100, Math.max(0, ((pageX - origin.current) / width) * 100));
    place(share, landing);
    const value = Math.round(share);
    if (value === lastDragged.current) return;
    lastDragged.current = value;
    setDragged(value);
    if (value < 100 !== handedOver.current < 100) {
      handedOver.current = value;
      onChange(value);
    }
  };

  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const value = lastDragged.current;
    setDragged(null);
    // Settles on the whole %.
    place(value, true);
    if (value !== handedOver.current) onChange(value);
  };

  // Figures: out of their block or in it, and their colours.
  const bitcoinFigure = useSharedValue(bitcoinOut ? 1 : 0);
  const fiatFigure = useSharedValue(fiatOut ? 1 : 0);
  // The line appears once the figure is out, and goes before it comes back.
  const bitcoinLine = useSharedValue(bitcoinOut && p > 0 ? 1 : 0);
  const fiatLine = useSharedValue(fiatOut && q > 0 ? 1 : 0);
  useEffect(() => {
    bitcoinFigure.set(withTiming(bitcoinOut ? 1 : 0, FIGURE));
    fiatFigure.set(withTiming(fiatOut ? 1 : 0, FIGURE));
    const line = (shown: boolean) =>
      shown ? withDelay(motion.splitLineDelay, withTiming(1, LINE)) : withTiming(0, LINE);
    bitcoinLine.set(line(bitcoinOut && p > 0));
    fiatLine.set(line(fiatOut && q > 0));
  }, [bitcoinOut, fiatOut, p, q, bitcoinFigure, fiatFigure, bitcoinLine, fiatLine]);

  const bitcoinInk = bitcoinOut
    ? p === 0
      ? colors.text.secondary
      : colors.text.primary
    : palette.white;
  const fiatInk = fiatOut ? (q === 0 ? colors.text.secondary : colors.text.primary) : palette.white;
  const tag = fiatOut ? fill : TAG_ON_BLOCK;
  const bitcoinColor = useSharedValue<string>(bitcoinInk);
  const fiatColor = useSharedValue<string>(fiatInk);
  const blockColor = useSharedValue<string>(fill);
  const tagColor = useSharedValue<string>(tag);
  // The bitcoin glyph: white on its block, orange out of it (two glyphs, cross-faded).
  const glyphOut = useSharedValue(bitcoinOut ? 1 : 0);
  useEffect(() => {
    bitcoinColor.set(withTiming(bitcoinInk, FADE));
    fiatColor.set(withTiming(fiatInk, FADE));
    blockColor.set(withTiming(fill, FADE));
    tagColor.set(withTiming(tag, FADE));
    glyphOut.set(withTiming(bitcoinOut ? 1 : 0, FADE));
  }, [
    bitcoinInk,
    fiatInk,
    fill,
    tag,
    bitcoinOut,
    bitcoinColor,
    fiatColor,
    blockColor,
    tagColor,
    glyphOut
  ]);

  const bitcoinBlockStyle = useAnimatedStyle(() => ({ width: bitcoinWidth.get() }));
  const fiatBlockStyle = useAnimatedStyle(() => ({ backgroundColor: blockColor.get() }));
  const handleStyle = useAnimatedStyle(() => ({ left: handle.get() - HANDLE_WIDTH / 2 }));
  const bitcoinLineStyle = useAnimatedStyle(() => ({
    left: bitcoinLineLeft.get(),
    transform: [{ scaleY: bitcoinLine.get() }]
  }));
  const fiatLineStyle = useAnimatedStyle(() => ({
    left: fiatLineLeft.get(),
    transform: [{ scaleY: fiatLine.get() }]
  }));
  const bitcoinFigureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: OUT_SHIFT * bitcoinFigure.get() },
      { scale: 1 - (1 - OUT_SCALE) * bitcoinFigure.get() }
    ]
  }));
  const fiatFigureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: OUT_SHIFT * fiatFigure.get() },
      { scale: 1 - (1 - OUT_SCALE) * fiatFigure.get() }
    ]
  }));
  const bitcoinTextStyle = useAnimatedStyle(() => ({ color: bitcoinColor.get() }));
  const tagStyle = useAnimatedStyle(() => ({ backgroundColor: tagColor.get() }));
  const whiteGlyphStyle = useAnimatedStyle(() => ({ opacity: 1 - glyphOut.get() }));
  const orangeGlyphStyle = useAnimatedStyle(() => ({ opacity: glyphOut.get() }));

  // Square ends between the blocks, rounded at the bar's ends.
  const bitcoinEnd = q === 0 ? radius.lg : 10;
  const fiatStart = p === 0 ? radius.lg : 10;

  return (
    // Hidden until measured: the bitcoin block has no width before, the fiat block would fill the bar.
    <View style={[styles.root, width === 0 && styles.unmeasured]}>
      <View
        {...webKeyboard}
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: 100, now: p, text: accessibilityValueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") onChange(clamp(p + 1));
          if (event.nativeEvent.actionName === "decrement") onChange(clamp(p - 1));
        }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // Keep the gesture when the finger drifts vertically (inside a ScrollView).
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event: GestureResponderEvent) => {
          // Children ignore touches, so locationX is relative to the bar itself.
          origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
          dragging.current = true;
          lastDragged.current = bitcoinPercent;
          handedOver.current = bitcoinPercent;
          drag(event.nativeEvent.pageX, true);
        }}
        onResponderMove={(event: GestureResponderEvent) => drag(event.nativeEvent.pageX, false)}
        onResponderRelease={release}
        onResponderTerminate={release}
        style={[styles.bar, RESIZE_CURSOR]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bitcoinBlock,
            { borderTopRightRadius: bitcoinEnd, borderBottomRightRadius: bitcoinEnd },
            bitcoinBlockStyle
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fiatBlock,
            {
              marginLeft: p > 0 && q > 0 ? GAP : 0,
              borderTopLeftRadius: fiatStart,
              borderBottomLeftRadius: fiatStart
            },
            fiatBlockStyle
          ]}
        />
        <Animated.View pointerEvents="none" style={[styles.handle, handleStyle]}>
          <Icon name="grip-lines-vertical" size={10} color={colors.text.tertiary} />
        </Animated.View>
      </View>

      <Animated.View pointerEvents="none" style={[styles.line, bitcoinLineStyle]} />
      <Animated.View pointerEvents="none" style={[styles.line, fiatLineStyle]} />

      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="split-bitcoin-figure"
        style={[styles.figure, styles.bitcoinFigure, bitcoinFigureStyle]}
      >
        <View style={styles.label}>
          <View>
            <Animated.View style={whiteGlyphStyle}>
              <Icon name="bitcoin" size={13} color={palette.white} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, orangeGlyphStyle]}>
              <Icon name="bitcoin" size={13} color={palette.orange} />
            </Animated.View>
          </View>
          <Animated.Text style={[styles.labelText, bitcoinTextStyle]}>{bitcoinLabel}</Animated.Text>
        </View>
        <Share points={p} languageTag={languageTag} color={bitcoinColor} />
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        testID="split-fiat-figure"
        style={[styles.figure, styles.fiatFigure, fiatFigureStyle]}
      >
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={currencyLabel}
          onPress={onPickCurrency}
          // The 44 px floor, also once the tag is out of its block and drawn at 68 %.
          hitSlop={fiatOut ? { top: 18, bottom: 18, left: 12, right: 12 } : TAG_SLOP}
          testID="split-currency"
          style={[styles.tag, tagStyle]}
        >
          <Icon name="landmark" size={12} color={palette.white} />
          <Text style={styles.tagText}>{currency}</Text>
          <Icon name="chevron-down" size={10} color={palette.white} />
        </AnimatedPressable>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Share points={q} languageTag={languageTag} color={fiatColor} />
        </View>
      </Animated.View>
    </View>
  );
}

const TAG_HEIGHT = 30;
const TAG_SLOP = {
  top: (44 - TAG_HEIGHT) / 2,
  bottom: (44 - TAG_HEIGHT) / 2,
  left: 4,
  right: 4
};

/** A share: the figure large, the percent sign (and the locale's spacing) smaller. */
function Share({
  points,
  languageTag,
  color
}: {
  points: number;
  languageTag: string;
  color: SharedValue<string>;
}) {
  const styles = useStyles();
  const colorStyle = useAnimatedStyle(() => ({ color: color.get() }));
  return (
    <View style={styles.share}>
      {formatPercentParts(points, languageTag).map((part, index) => (
        <Animated.Text
          key={index}
          style={[part.number ? styles.shareNumber : styles.shareSign, colorStyle]}
        >
          {part.text}
        </Animated.Text>
      ))}
    </View>
  );
}

const SHARE_SIZE = 44;

const useStyles = makeStyles(({ colors, shadow }) => ({
  root: { height: HEIGHT, marginTop: 18 },
  unmeasured: { opacity: 0 },
  bar: {
    position: "absolute",
    top: BAR_TOP,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    flexDirection: "row"
  },
  bitcoinBlock: {
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    backgroundColor: palette.orange
  },
  fiatBlock: {
    flex: 1,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg
  },
  handle: {
    position: "absolute",
    top: (BAR_HEIGHT - HANDLE_HEIGHT) / 2,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    boxShadow: shadow.raised,
    alignItems: "center",
    justifyContent: "center"
  },
  line: {
    position: "absolute",
    top: LINE_TOP,
    width: LINE_WIDTH,
    height: LINE_HEIGHT,
    backgroundColor: colors.text.tertiary,
    transformOrigin: "bottom"
  },
  figure: { position: "absolute", bottom: 14, gap: 8 },
  bitcoinFigure: { left: 16, transformOrigin: "left bottom" },
  fiatFigure: { right: 14, alignItems: "flex-end", transformOrigin: "right bottom" },
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelText: { ...sans(700), fontSize: type.caption },
  share: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  shareNumber: {
    ...sans(700),
    fontVariant: ["tabular-nums"],
    fontSize: SHARE_SIZE,
    lineHeight: Math.round(SHARE_SIZE * 0.9)
  },
  // A 0.9 line height covers the sign too: the row stays as tall as the figure.
  shareSign: { ...sans(600), fontSize: 20, lineHeight: 18 },
  tag: {
    height: TAG_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 11,
    paddingRight: 10,
    marginTop: -4,
    marginRight: -6,
    borderRadius: radius.sm
  },
  tagText: { ...sans(700), fontSize: type.caption, color: palette.white }
}));
