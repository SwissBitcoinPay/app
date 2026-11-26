import { useEffect, useState } from "react";
import {
  cancelAnimation,
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
  type WithTimingConfig
} from "react-native-reanimated";

import { NAV_EASING } from "@/components/ui/easing";
import { motion } from "@/theme";

import type { Place } from "./dock-layout";

/**
 * A shared value easing to `target` whenever it changes (`delay` before it starts; NAV_EASING
 * unless `easing` is given), starting at `target` without animating. Never dropped by Reduce
 * Motion: callers drop the movement they draw from it and keep the fades, or pass `animate: false`
 * to jump to the target (a size or a place: Reduce Motion, a first placement).
 */
export function useEased(
  target: number,
  {
    duration = motion.navIndicator,
    delay = 0,
    animate = true,
    easing = NAV_EASING
  }: {
    duration?: number;
    delay?: number;
    animate?: boolean;
    easing?: WithTimingConfig["easing"];
  } = {}
): SharedValue<number> {
  const value = useSharedValue(target);
  useEffect(() => {
    if (!animate) {
      value.set(target);
      return;
    }
    const timing = withTiming(target, { duration, easing, reduceMotion: ReduceMotion.Never });
    value.set(delay > 0 ? withDelay(delay, timing, ReduceMotion.Never) : timing);
    return () => cancelAnimation(value);
  }, [target, duration, delay, animate, easing, value]);
  return value;
}

/** How long the side bar's pill slides over `distance` pt (either way): motion.navMark*. */
export function markDuration(distance: number): number {
  const duration = motion.navMarkMin + Math.abs(distance) * motion.navMarkPerPx;
  return Math.round(Math.min(motion.navMarkMax, duration));
}

/**
 * `value` while `shown`; once hidden, the last value shown, for `duration` (the fade-out of what
 * holds it), then null. What a layer fading out shows stays as it was: nothing appears in it, nor
 * leaves it, before the fade ends.
 */
export function useHeldThroughFade<T>(value: T | null, shown: boolean, duration: number): T | null {
  const [held, setHeld] = useState(shown ? value : null);
  // While shown, the value to hold once hidden (adjusted while rendering).
  if (shown && held !== value) setHeld(value);
  useEffect(() => {
    if (shown) return;
    const timer = setTimeout(() => setHeld(null), duration);
    return () => clearTimeout(timer);
  }, [shown, duration]);
  return shown ? value : held;
}

/**
 * The mark under the slot of the screen shown (`active` among `slots`, -1 for none): its place
 * and whether it shows. It fades out where it is when that screen leaves the dock, and comes back
 * under its slot without sliding (adjusted while rendering). Only that return jumps: later moves
 * of its slot (a swap, a language, a slot widening for its name) slide it with the slot. With
 * Reduce Motion, it never slides.
 */
export function useSlotMark(
  active: number,
  slots: readonly Place[]
): {
  markLeft: SharedValue<number>;
  markWidth: SharedValue<number>;
  markShown: SharedValue<number>;
} {
  const reduceMotion = useReducedMotion();
  const target = active === -1 ? null : slots[active]!;
  const [markAt, setMarkAt] = useState(target ?? slots[0]!);
  if (target && (target.left !== markAt.left || target.width !== markAt.width)) setMarkAt(target);
  const [visited, setVisited] = useState(active);
  const [jumpedTo, setJumpedTo] = useState<Place | null>(null);
  if (visited !== active) {
    setVisited(active);
    setJumpedTo(visited === -1 ? target : null);
  }
  const jumping =
    jumpedTo !== null && jumpedTo.left === markAt.left && jumpedTo.width === markAt.width;
  const markMoves = !reduceMotion && !jumping;
  const markLeft = useEased(markAt.left, { animate: markMoves });
  const markWidth = useEased(markAt.width, { animate: markMoves });
  const markShown = useEased(active >= 0 ? 1 : 0, { duration: motion.fast });
  return { markLeft, markWidth, markShown };
}
