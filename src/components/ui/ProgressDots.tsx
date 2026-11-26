import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { makeStyles, motion, palette } from "@/theme";

export type ProgressDotsProps = {
  /** Number of steps in the current path. */
  count: number;
  /** Zero-based index of the current step. */
  current: number;
};

const DOT = 7;
const CURRENT = 24;
const GAP = 7;

// Sizes are movement: they change at once with Reduce Motion (withTiming's default follows the
// system setting). Colours and opacity are fades: they are kept.
const RESIZE = { duration: motion.dots, easing: Easing.out(Easing.ease) };
const FADE = { ...RESIZE, reduceMotion: ReduceMotion.Never };

type DotState = "done" | "current" | "todo";

/**
 * Step dots: passed steps stay orange, the current one stretches into a
 * capsule, upcoming ones are ink 10 %. The header that shows them stays in
 * place from one step to the next, so changes are animated (motion.dots): the
 * capsule shrinks back into a dot while the new current one stretches and
 * fills with orange, and a dot added to or removed from the path (bank
 * details, from 1 % in fiat) grows or shrinks in place. With Reduce Motion,
 * sizes change at once and only the colours fade.
 */
export function ProgressDots({ count, current }: ProgressDotsProps) {
  const styles = useStyles();
  // Dots added after the first render grow from nothing; removed ones stay, empty and zero-wide,
  // so that they can shrink out of sight first.
  const [initialCount] = useState(count);
  const [slots, setSlots] = useState(count);
  if (count > slots) setSlots(count);

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: count, now: current + 1 }}
    >
      {Array.from({ length: slots }, (_, index) => (
        <Dot
          key={index}
          state={index < current ? "done" : index === current ? "current" : "todo"}
          shown={index < count}
          first={index === 0}
          added={index >= initialCount}
        />
      ))}
    </View>
  );
}

type DotProps = {
  state: DotState;
  /** False once the dot has left the path. */
  shown: boolean;
  first: boolean;
  /** Not in the first render: starts from nothing. */
  added: boolean;
};

function Dot({ state, shown, first, added }: DotProps) {
  const styles = useStyles();
  const targetWidth = shown ? (state === "current" ? CURRENT : DOT) : 0;
  const targetMargin = shown && !first ? GAP : 0;
  const targetFill = state === "todo" ? 0 : 1;
  const targetOpacity = shown ? 1 : 0;

  const width = useSharedValue(added ? 0 : targetWidth);
  const margin = useSharedValue(added ? 0 : targetMargin);
  const fill = useSharedValue(targetFill);
  const opacity = useSharedValue(added ? 0 : targetOpacity);

  useEffect(() => {
    width.set(withTiming(targetWidth, RESIZE));
    margin.set(withTiming(targetMargin, RESIZE));
  }, [targetWidth, targetMargin, width, margin]);

  useEffect(() => {
    fill.set(withTiming(targetFill, FADE));
    opacity.set(withTiming(targetOpacity, FADE));
  }, [targetFill, targetOpacity, fill, opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    width: width.get(),
    marginLeft: margin.get(),
    opacity: opacity.get()
  }));
  // Orange over the faint track: the dot fades from one colour to the other.
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.get() }));

  return (
    <Animated.View style={[styles.dot, dotStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.fill, fillStyle]} />
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "center" },
  dot: { height: DOT, borderRadius: DOT / 2, backgroundColor: colors.border.faint },
  fill: { borderRadius: DOT / 2, backgroundColor: palette.orange }
}));
