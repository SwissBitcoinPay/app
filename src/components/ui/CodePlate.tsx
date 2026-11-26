import { useEffect, useState, type ReactNode, type Ref } from "react";
import { StyleSheet, View, type ViewInstance } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { lightTheme, makeStyles, motion, qr, radius, ThemeContext } from "@/theme";

import { BlurredQr } from "./BlurredQr";
import { QrPlate } from "./QrPlate";
import { Spinner } from "./Spinner";

/**
 * Fades of the code's arrival, and of its blur once its payment is seen, kept with Reduce Motion
 * (only movement is dropped).
 */
const CODE_IN = {
  duration: motion.sheet,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never
};
const SPINNER_OUT = { duration: motion.fast, reduceMotion: ReduceMotion.Never };

/**
 * The place of a payment code's plate (the point of sale's invoice screen, the payer's page of a
 * payment link). Without a code (an invoice being created), a plate of the same size with a
 * spinner, shown at once (no delay); nothing jumps when the
 * code comes. The code's plate then fades in under it, as the spinner fades out (drawn after the
 * code, so that it stays over a blurred one). `blurred`, while a payment seen is being checked: the
 * code stays, a blurred copy fades in over it and the spinner over both; they fade out again if the
 * payment does not count. A code that arrives blurred (shown again once the next invoice was being
 * asked) comes with its blurred copy already over it: never seen sharp. `ended`, without a code:
 * drawn instead of the spinner, nothing being awaited in the plate itself (the point of sale's
 * request ended: charge.tsx). `notice`, with a code: drawn over its blurred
 * copy, without the spinner (a card refused: charge.tsx); `blurred`
 * prevails, a payment seen being what matters then.
 */
export function CodePlate({
  value,
  size,
  blurred = false,
  faded = false,
  ended,
  notice,
  testID,
  plateRef
}: {
  value: string | null;
  size: number;
  blurred?: boolean;
  /** Its code's modules faded, its plate as it is (QrPlate's `faded`). */
  faded?: boolean;
  /** What the plate says without a code, in place of the spinner. */
  ended?: ReactNode;
  /** What the plate says over its code, blurred, while it is not `blurred` (its own blur). */
  notice?: ReactNode;
  /** The plate's, with or without its code. */
  testID?: string;
  /** The plate itself, to measure where it is (the point of sale's paid arrival, PaidArrival.tsx). */
  plateRef?: Ref<ViewInstance>;
}) {
  const styles = useStyles();
  const shown = value !== null;
  const veiled = shown && blurred;
  const noticed = shown && !blurred && notice !== undefined;
  // Under the spinner, or under the notice.
  const covered = veiled || noticed;
  const closed = !shown && ended !== undefined;
  const waiting = (!shown && !closed) || veiled;
  // The spinner and the blurred copy outlive what they show by their fade.
  const [spinning, setSpinning] = useState(waiting);
  if (waiting && !spinning) setSpinning(true);
  // No code, and nothing to wait for: `ended` in its place at once, as the code left.
  if (closed && spinning) setSpinning(false);
  const [blurring, setBlurring] = useState(covered);
  if (covered && !blurring) setBlurring(true);
  // No code, nothing to blur.
  if (!shown && blurring) setBlurring(false);
  // Mounted with the code already there (the layout switched between mobile and desktop): shown
  // as it was, without fading in again.
  const spinnerOpacity = useSharedValue(waiting ? 1 : 0);
  const codeOpacity = useSharedValue(shown ? 1 : 0);
  const blurOpacity = useSharedValue(covered ? 1 : 0);

  useEffect(() => {
    if (!shown) {
      spinnerOpacity.set(1);
      codeOpacity.set(0);
      blurOpacity.set(0);
      return;
    }
    // Not fully shown yet: its blurred copy, inside it, would fade in with it and leave the sharp
    // code seen (and scannable) through it meanwhile.
    const arriving = codeOpacity.get() < 1;
    codeOpacity.set(withTiming(1, CODE_IN));
    if (covered) {
      blurOpacity.set(arriving ? 1 : withTiming(1, CODE_IN));
    } else {
      blurOpacity.set(
        withTiming(0, SPINNER_OUT, (finished) => {
          if (finished) scheduleOnRN(setBlurring, false);
        })
      );
    }
    if (veiled) {
      spinnerOpacity.set(withTiming(1, CODE_IN));
    } else {
      spinnerOpacity.set(
        withTiming(0, SPINNER_OUT, (finished) => {
          if (finished) scheduleOnRN(setSpinning, false);
        })
      );
    }
    return () => {
      cancelAnimation(codeOpacity);
      cancelAnimation(spinnerOpacity);
      cancelAnimation(blurOpacity);
    };
  }, [shown, veiled, covered, codeOpacity, spinnerOpacity, blurOpacity]);

  const spinnerStyle = useAnimatedStyle(() => ({ opacity: spinnerOpacity.get() }));
  const codeStyle = useAnimatedStyle(() => ({ opacity: codeOpacity.get() }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: blurOpacity.get() }));
  const plate = size + qr.quietZone * 2;
  return (
    <View ref={plateRef} style={[styles.plate, { width: plate, height: plate }]} testID={testID}>
      {shown ? (
        // Blurred, the code is no longer offered: screen readers hear what the screen waits for, or
        // the notice.
        <Animated.View
          testID="qr-code"
          aria-hidden={covered}
          style={[StyleSheet.absoluteFill, codeStyle]}
        >
          <QrPlate value={value} size={size} faded={faded} />
          {blurring ? (
            <Animated.View testID="qr-blurred" style={[StyleSheet.absoluteFill, blurStyle]}>
              <BlurredQr value={value} size={size} />
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
      {closed ? ended : null}
      {/* Over the code's white plate (QrPlate, the same in both themes): in the light theme. */}
      <ThemeContext value={lightTheme}>
        {noticed ? notice : null}
        {/* After the code: drawn over it while it is blurred. */}
        {spinning ? (
          <Animated.View style={spinnerStyle}>
            <Spinner testID="qr-spinner" />
          </Animated.View>
        ) : null}
      </ThemeContext>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  plate: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    alignItems: "center",
    justifyContent: "center"
  }
}));
