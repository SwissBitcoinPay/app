import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { motion } from "@/theme";

/**
 * What takes a loading scene's place: with `fade` (the screen waited on it, useLoadingScene), it comes in
 * fading from nothing (motion.loadingArrival), from its first frame; without, it shows at once
 * (what the device had at hand). A fade: kept with Reduce Motion. `style` is its box's, as the
 * view it wraps would have had.
 */
export function Arrival({
  fade,
  style,
  testID,
  children
}: {
  fade: boolean;
  style?: ComponentProps<typeof Animated.View>["style"];
  testID?: string;
  children: ReactNode;
}) {
  // Read once: the content arrives once, when it mounts.
  const [arriving] = useState(fade);
  const shown = useSharedValue(arriving ? 0 : 1);
  useEffect(() => {
    if (!arriving) return;
    shown.set(
      withTiming(1, {
        duration: motion.loadingArrival,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never
      })
    );
    return () => cancelAnimation(shown);
  }, [arriving, shown]);
  const opacity = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View style={[style, opacity]} testID={testID}>
      {children}
    </Animated.View>
  );
}
