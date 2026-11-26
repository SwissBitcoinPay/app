import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { motion, palette, useTheme } from "@/theme";

import { withPulse } from "./pulse";

/** Length of the turning arc, as a share of the ring. */
const ARC = 0.28;

/**
 * Waiting on a service: an orange arc turning on an ink rail, one turn a second. With Reduce
 * Motion it no longer turns: the whole ring pulses instead. Decorative, hidden from screen
 * readers: the screen says in words what it waits for.
 */
export function Spinner({
  size = 36,
  color = palette.orange,
  rail,
  thickness,
  testID
}: {
  size?: number;
  /** The arc's colour: orange, but in a state's pill, the state's (StatusPill). */
  color?: string;
  /**
   * The ring the arc turns on: the theme's faint rule (ink at 10 % in the light theme), but over
   * ink (the side bar), white at 25 %: ink on ink could not be seen.
   */
  rail?: string;
  /**
   * The ring's stroke: 3 px at the full size by default, never under 2 px on a small ring. A ring
   * drawn around a disc sets its own ("Send"'s outcome, SendSheet).
   */
  thickness?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const stroke = thickness ?? Math.max(2, size / 12);
  // 1 px inside the box: the ring's antialiased edge is never cut off.
  const radius = size / 2 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const turn = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      turn.set(0);
      opacity.set(withPulse());
      return () => cancelAnimation(opacity);
    }
    opacity.set(1);
    // Restarts at each turn from the value it starts from: 0, even when the effect runs again
    // mid-turn (Fast Refresh).
    turn.set(0);
    turn.set(withRepeat(withTiming(1, { duration: motion.spin, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ rotate: `${turn.get() * 360}deg` }]
  }));

  return (
    <Animated.View
      testID={testID}
      // iOS, Android and the web (react-native-web ignores accessibilityElementsHidden and
      // importantForAccessibility).
      aria-hidden
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={rail ?? colors.border.faint}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          // Reduce Motion: the whole ring.
          strokeDasharray={reduceMotion ? undefined : [circumference * ARC, circumference]}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
