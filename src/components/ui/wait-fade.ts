import { useEffect, useState } from "react";
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { motion } from "@/theme";

/**
 * A wait's spinner fades in and out: quick to answer the tap, kept with Reduce Motion (a fade, no
 * movement).
 */
const WAIT_FADE = {
  duration: motion.fast,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never
};

/**
 * A control's wait (Button's, Switch's `loading`): `waiting` until its spinner has faded out (it
 * outlives the wait by its fade), `waited` the spinner's share, 0 to 1. Mounted waiting, the
 * spinner shows at once, without a fade.
 */
export function useWaitFade(loading: boolean): { waiting: boolean; waited: SharedValue<number> } {
  const [waiting, setWaiting] = useState(loading);
  if (loading && !waiting) setWaiting(true);
  const waited = useSharedValue(loading ? 1 : 0);
  useEffect(() => {
    if (!waiting) return;
    waited.set(
      withTiming(loading ? 1 : 0, WAIT_FADE, (finished) => {
        if (finished && !loading) scheduleOnRN(setWaiting, false);
      })
    );
    return () => cancelAnimation(waited);
  }, [waiting, loading, waited]);
  return { waiting, waited };
}
