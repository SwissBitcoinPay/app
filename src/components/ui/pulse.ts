import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from "react-native-reanimated";

import { motion } from "@/theme";

/**
 * The pulse, for an opacity starting at 1: 1 -> 0.25 -> 1 over 1.6 s, ease-in-out, forever. It
 * only fades, so it keeps pulsing with Reduce Motion.
 */
export function withPulse(): number {
  const fade = withTiming(0.25, {
    duration: motion.pulseDuration / 2,
    easing: Easing.inOut(Easing.ease),
    reduceMotion: ReduceMotion.Never
  });
  // Infinite, reversed every other time: 1 -> 0.25 -> 1.
  return withRepeat(fade, -1, true, undefined, ReduceMotion.Never);
}

/**
 * An opacity pulsing with withPulse while `active` (a dot waiting on someone else, a padlock
 * while the passkey is asked), easing back to 1 once it stops. A fade only: it stays with Reduce
 * Motion.
 */
export function usePulse(active: boolean): SharedValue<number> {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      opacity.set(withTiming(1, { duration: motion.fast, reduceMotion: ReduceMotion.Never }));
      return;
    }
    opacity.set(withPulse());
    return () => cancelAnimation(opacity);
  }, [active, opacity]);
  return opacity;
}
