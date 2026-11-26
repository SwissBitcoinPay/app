import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle
} from "react-native";
import Animated, {
  clamp,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { motion } from "@/theme";

/** Between the figure and the currency code, as in AmountBlock's figure row. */
export const FIGURE_GAP = 8;
/** How far a glyph rises into place, or sinks out, in ems of the figure. */
const RISE = 0.2;
/**
 * A glyph is drawn in a box this much wider than its advance (in ems), overhanging it by half of it
 * on each side: a text box narrower than its glyph could wrap or be cut.
 */
const PAD = 0.5;

// Everything decelerates. Movement (slides, rises, the figure's width and scale) is dropped with
// Reduce Motion: withTiming's default follows the system setting, and the rise is 0. Fades are kept.
const EASING = Easing.out(Easing.cubic);
const SLIDE = { duration: motion.amountSlide, easing: EASING };
const ENTER = { duration: motion.amountEnter, easing: EASING };
const FADE = { reduceMotion: ReduceMotion.Never };

/** A decimal digit of any numbering system (Arabic-Indic digits included), where supported. */
const DIGIT = (() => {
  try {
    return new RegExp("^\\p{Nd}$", "u");
  } catch {
    return /^[0-9]$/;
  }
})();

/** -1: up, 1: down, 0: in place. */
type Lift = -1 | 0 | 1;

type Glyph = {
  /** "d<id>": a digit, which keeps its id as it slides; "s<n>": the separator with n digits on its right. */
  key: string;
  char: string;
  /** Where its right edge goes, from the figure's right edge (points). */
  right: number;
  /** When it appeared: where it started (points), its lift, and whether it was there at once. */
  from: number;
  enter: Lift;
  shown: boolean;
  /** Before it comes in (ms): its neighbour moves away first. 0 when it comes back. */
  delay: number;
  /** Null while it is part of the amount; then how it goes. */
  leave: { lift: Lift; duration: number; token: number } | null;
};

type Figure = {
  minor: number;
  amount: string;
  widths: Readonly<Record<string, number>>;
  /** Ids of the digits shown, left to right (the waiting zeros of 0,0x included). */
  sequence: number[];
  nextId: number;
  nextToken: number;
  /** Shown and going, in render order. */
  glyphs: Glyph[];
  /** The figure's width once settled. */
  width: number;
};

/**
 * The figure after a change. A key appends one digit (two with "00") and a delete removes the last
 * one, which the digits typed tell (`minor`); every digit then keeps its identity and slides one
 * place (two). What the key brings in rises into place once its neighbour moved away, from the
 * right to the left, one glyph a little after the other; under 1,00, the leading zero slides out at
 * the left. A deleted digit sinks out, a zero coming back slides in from the left, and the decimals
 * of a bare "0" fold into it. Any other change (a new sale) replaces the figure. Separators stay in
 * their places; a digit slides over one.
 */
export function nextFigure(
  previous: Figure | null,
  minor: number,
  amount: string,
  widths: Readonly<Record<string, number>>,
  fallbackWidth: number
): Figure {
  const chars = Array.from(amount);
  const count = chars.filter((char) => DIGIT.test(char)).length;
  const before = previous === null || previous.minor === 0 ? "" : String(previous.minor);
  const after = minor === 0 ? "" : String(minor);
  let mode: "init" | "same" | "type" | "delete" | "replace" = "replace";
  if (previous === null) mode = "init";
  else if (after === before) mode = "same";
  else if (
    after.length > before.length &&
    after.length - before.length <= 2 &&
    after.startsWith(before)
  )
    mode = "type";
  else if (before.length - after.length === 1 && before.startsWith(after)) mode = "delete";
  const direction = previous === null || minor >= previous.minor ? 1 : -1;

  let nextId = previous?.nextId ?? 0;
  let sequence = previous ? [...previous.sequence] : [];
  const dropped = new Set<number>(); // waiting zeros pushed out at the left
  const added = new Set<number>(); // waiting zeros coming back at the left
  let deleted: number | undefined;
  if (mode === "type") {
    for (let i = before.length; i < after.length; i++) sequence.push(nextId++);
    while (sequence.length > count) dropped.add(sequence.shift()!);
    // From a bare 0: the decimals' zeros come between it and the new digit (0 → 0,01).
    while (sequence.length < count) {
      sequence.splice(sequence.length - (after.length - before.length), 0, nextId++);
    }
  } else if (mode === "delete") {
    deleted = sequence.pop();
    while (sequence.length < count) {
      added.add(nextId);
      sequence.unshift(nextId++);
    }
    // Back to a bare 0: the decimals' zeros go, the units' 0 stays (0,01 → 0).
    while (sequence.length > count) sequence.splice(sequence.length - after.length - 1, 1);
  }
  if (mode === "init" || mode === "replace" || sequence.length !== count) {
    sequence = Array.from({ length: count }, () => nextId++);
  }

  // Places from the right.
  const places = new Map<string, { char: string; right: number }>();
  let right = 0;
  let digit = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i];
    let key: string;
    if (DIGIT.test(char)) {
      key = `d${sequence[count - 1 - digit]}`;
      digit++;
    } else {
      key = `s${digit}`;
    }
    places.set(key, { char, right });
    right += widths[char] ?? fallbackWidth;
  }

  const old = new Map((previous?.glyphs ?? []).map((glyph) => [glyph.key, glyph]));
  // How far the digits move: what goes out or comes in at the left moves as much.
  let shift: number | null = null;
  for (const id of sequence) {
    const glyph = old.get(`d${id}`);
    if (glyph && glyph.leave === null) {
      shift = places.get(`d${id}`)!.right - glyph.right;
      break;
    }
  }
  // No digit stays (a currency without decimals: 0 → 5, 5 → 0): the zero moves by the width of
  // what replaces it, out at the left or back from the left, instead of fading under it.
  if (shift === null && mode === "type") {
    const first = sequence[sequence.length - (after.length - before.length)];
    const place = places.get(`d${first}`)!;
    shift = place.right + (widths[place.char] ?? fallbackWidth);
  } else if (shift === null && mode === "delete" && deleted !== undefined) {
    const glyph = old.get(`d${deleted}`);
    if (glyph) shift = -(glyph.right + (widths[glyph.char] ?? fallbackWidth));
  }
  shift ??= 0;

  let token = previous?.nextToken ?? 0;
  const glyphs: Glyph[] = [];
  for (const glyph of previous?.glyphs ?? []) {
    const place = places.get(glyph.key);
    if (place) {
      // Stays, or comes back from where it is (without waiting).
      glyphs.push({
        ...glyph,
        char: place.char,
        right: place.right,
        delay: glyph.leave === null ? glyph.delay : 0,
        leave: null
      });
      continue;
    }
    if (glyph.leave !== null) {
      glyphs.push(glyph);
      continue;
    }
    const id = glyph.key.startsWith("d") ? Number(glyph.key.slice(1)) : null;
    let lift: Lift = 0;
    let duration: number = motion.amountOut;
    let to = glyph.right;
    if (mode === "delete") {
      // The deleted digit sinks, with the decimals of a bare 0: gone before a digit slides over.
      lift = 1;
      duration = motion.amountDeleted;
    } else if (id !== null && dropped.has(id)) {
      to = glyph.right + shift; // out at the left
    } else if (mode === "replace") {
      lift = direction === 1 ? -1 : 1;
    }
    glyphs.push({ ...glyph, right: to, leave: { lift, duration, token: token++ } });
  }
  let order = 0; // of what a key brings in, from the right
  for (const [key, place] of places) {
    if (old.has(key)) continue;
    const id = key.startsWith("d") ? Number(key.slice(1)) : null;
    let enter: Lift = 0;
    let from = place.right;
    let delay = 0;
    if (mode === "type") {
      enter = 1;
      delay = motion.amountEnterDelay + motion.amountStagger * order++;
    } else if (id !== null && added.has(id)) {
      from = place.right - shift; // in from the left
    } else if (mode === "replace") {
      enter = direction === 1 ? 1 : -1;
    }
    glyphs.push({
      key,
      char: place.char,
      right: place.right,
      from,
      enter,
      shown: mode === "init",
      delay,
      leave: null
    });
  }
  return { minor, amount, widths, sequence, nextId, nextToken: token, glyphs, width: right };
}

type AnimatedAmountProps = {
  /** Formatted figure: "24,50", or "0" while nothing is typed. */
  amount: string;
  /** The same amount in minor units: tells what a key did. */
  minor: number;
  currency: string;
  fontSize: number;
  figureStyle: StyleProp<TextStyle>;
  currencyStyle: StyleProp<TextStyle>;
  /**
   * Every character the figure can show (formatFiat of 1234567890: the ten digits and both
   * separators): measured before they are needed.
   */
  glyphs?: string;
  align?: "center" | "left";
};

/**
 * AmountBlock's figure and currency code for an amount typed in place (the keypad), as on a cash
 * register: each key slides the digits one place to the left and the new one rises into place on
 * the right (nextFigure). The comma stays where it is, a digit passes over it. The figure widens
 * or narrows smoothly, so that it recentres.
 *
 * Glyph widths are measured from hidden texts in the figure's style; until they are (and in Jest,
 * which has no layout), the figure is a plain text. The glyphs are placed from the measured widths:
 * an invisible "0" in the flow gives the figure its baseline. The row is scaled down, as a whole,
 * when it is wider than its space: the web has no adjustsFontSizeToFit. Screen readers get the
 * whole amount: the row's label, and a hidden text on the web.
 */
export function AnimatedAmount({
  amount,
  minor,
  currency,
  fontSize,
  figureStyle,
  currencyStyle,
  glyphs: sample = "",
  align = "center"
}: AnimatedAmountProps) {
  const reduceMotion = useReducedMotion();
  const rise = reduceMotion ? 0 : RISE * fontSize;
  const chars = Array.from(amount);

  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const measured = chars.every((char) => widths[char] !== undefined);
  // From the first measured render on. A glyph not measured yet takes an approximate width, put
  // right once it is measured; a glyph measured that the figure does not show changes nothing.
  const [figure, setFigure] = useState<Figure | null>(null);
  if (
    figure === null
      ? measured
      : figure.minor !== minor ||
        figure.amount !== amount ||
        chars.some((char) => figure.widths[char] !== widths[char])
  ) {
    // An updater: a glyph gone (onGone) while this render was pending is not brought back.
    setFigure((current) => nextFigure(current, minor, amount, widths, fontSize * 0.6));
  }
  const gone = useCallback(
    (key: string, token: number) =>
      setFigure(
        (current) =>
          current && {
            ...current,
            glyphs: current.glyphs.filter(
              (glyph) => glyph.key !== key || glyph.leave?.token !== token
            )
          }
      ),
    []
  );

  const [rowWidth, setRowWidth] = useState(0);
  const [currencyWidth, setCurrencyWidth] = useState(0);
  const natural = (figure?.width ?? 0) + FIGURE_GAP + currencyWidth;
  const known = figure !== null && rowWidth > 0 && currencyWidth > 0;
  const scale = useSharedValue(1);
  // Placed at once the first time (a figure mounted too wide does not shrink in), then animated.
  const placed = useRef(false);
  useEffect(() => {
    if (!known) return;
    const target = Math.min(1, rowWidth / natural);
    scale.set(placed.current ? withTiming(target, SLIDE) : target);
    placed.current = true;
  }, [known, rowWidth, natural, scale]);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const pad = PAD * fontSize;
  return (
    <Animated.View
      style={[styles.row, align === "left" ? styles.left : styles.center, rowStyle]}
      onLayout={(event) => keepSize(event, setRowWidth)}
      accessible
      accessibilityLabel={`${amount} ${currency}`}
    >
      {figure ? (
        <>
          {/* First: screen readers on the web read it before the currency code. */}
          <Text numberOfLines={1} style={[figureStyle, styles.hidden, styles.spoken]}>
            {amount}
          </Text>
          <FigureView width={figure.width}>
            <Text aria-hidden selectable={false} style={[figureStyle, styles.strut]}>
              0
            </Text>
            {figure.glyphs.map((glyph) => (
              <GlyphView
                key={glyph.key}
                glyph={glyph}
                boxWidth={(widths[glyph.char] ?? fontSize * 0.6) + pad}
                overhang={pad / 2}
                textStyle={figureStyle}
                rise={rise}
                onGone={gone}
              />
            ))}
          </FigureView>
        </>
      ) : (
        <Text adjustsFontSizeToFit numberOfLines={1} style={figureStyle}>
          {amount}
        </Text>
      )}
      <Text style={currencyStyle} onLayout={(event) => keepSize(event, setCurrencyWidth)}>
        {currency}
      </Text>
      {/* Kept for every glyph seen: a web font that loads late measures them again. */}
      {Array.from(new Set([...Object.keys(widths), ...Array.from(sample), ...chars]), (char) => (
        <Text
          key={char}
          aria-hidden
          selectable={false}
          style={[figureStyle, styles.hidden]}
          onLayout={(event) =>
            keepSize(event, (width) =>
              setWidths((known) => (known[char] === width ? known : { ...known, [char]: width }))
            )
          }
        >
          {char}
        </Text>
      ))}
    </Animated.View>
  );
}

/**
 * A measured width, unless it is 0: on the web, the keypad under the invoice is `display: none`,
 * which reports every size as 0. Taken as is, the glyphs would pile up at the right, then slide
 * apart when the keypad shows again.
 */
function keepSize(event: LayoutChangeEvent, set: (width: number) => void) {
  const width = event.nativeEvent.layout.width;
  if (width > 0) set(width);
}

/** The figure: its width follows the glyphs, so that the row recentres smoothly. */
function FigureView({ width, children }: { width: number; children: ReactNode }) {
  const animated = useSharedValue(width);
  useEffect(() => {
    animated.set(withTiming(width, SLIDE));
  }, [width, animated]);
  const style = useAnimatedStyle(() => ({ width: animated.get() }));
  return <Animated.View style={[styles.figure, style]}>{children}</Animated.View>;
}

type GlyphViewProps = {
  glyph: Glyph;
  boxWidth: number;
  overhang: number;
  textStyle: StyleProp<TextStyle>;
  /** Of a glyph coming in or going out (points); 0 with Reduce Motion. */
  rise: number;
  onGone: (key: string, token: number) => void;
};

function GlyphView({ glyph, boxWidth, overhang, textStyle, rise, onGone }: GlyphViewProps) {
  const { key, right, delay, leave } = glyph;
  // Its first frame already has these values: a new glyph starts where it comes from, transparent.
  const offset = useSharedValue(glyph.from);
  const lift = useSharedValue<number>(glyph.shown ? 0 : glyph.enter);
  const opacity = useSharedValue(glyph.shown ? 1 : 0);

  useEffect(() => {
    offset.set(withTiming(right, SLIDE));
  }, [right, offset]);

  const leaveLift = leave?.lift ?? 0;
  const leaveDuration = leave?.duration ?? 0;
  const leaveToken = leave?.token ?? null;
  useEffect(() => {
    // From wherever it is: a glyph brought back on its way out turns back smoothly.
    if (leaveToken === null) {
      const config = delay ? ENTER : SLIDE;
      lift.set(withDelay(delay, withTiming(0, config)));
      opacity.set(withDelay(delay, withTiming(1, { ...config, ...FADE }), ReduceMotion.Never));
      return;
    }
    lift.set(withTiming(leaveLift, SLIDE));
    opacity.set(
      withTiming(0, { duration: leaveDuration, easing: EASING, ...FADE }, (finished) => {
        if (finished) scheduleOnRN(onGone, key, leaveToken);
      })
    );
  }, [leaveToken, leaveLift, leaveDuration, delay, key, onGone, lift, opacity]);

  // Clamped: on the web, the first frame of an animation can come out slightly below 0.
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: clamp(opacity.get(), 0, 1),
      transform: [{ translateX: -offset.get() }, { translateY: lift.get() * rise }]
    }),
    [rise]
  );

  return (
    <Animated.Text
      aria-hidden
      selectable={false}
      style={[textStyle, styles.glyph, { width: boxWidth, marginRight: -overhang }, animatedStyle]}
    >
      {glyph.char}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  // As wide as its space whatever the figure's width: the figure overflows it evenly, then the
  // scale brings it back in.
  row: { alignSelf: "stretch", flexDirection: "row", alignItems: "baseline", gap: FIGURE_GAP },
  center: { justifyContent: "center", transformOrigin: "center" },
  left: { justifyContent: "flex-start", transformOrigin: "left" },
  figure: { flexDirection: "row", flexShrink: 0 },
  // In the flow, invisible: the figure's baseline (the glyphs are placed freely over it).
  strut: { opacity: 0, flexShrink: 0 },
  glyph: { position: "absolute", top: 0, right: 0, flexShrink: 0, textAlign: "center" },
  hidden: { position: "absolute", top: 0, left: 0, opacity: 0 },
  spoken: { right: 0 }
});
