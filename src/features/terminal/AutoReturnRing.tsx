import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { sans } from "@/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 26;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE * 2) / 2 + 0.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A ring that empties over the auto-return delay, with the seconds left in its
 * middle, drawn inside the button that it triggers. Its progress is information, not decoration:
 * it keeps running with Reduce Motion.
 */
export function AutoReturnRing({
  durationMs,
  secondsLeft,
  color
}: {
  durationMs: number;
  secondsLeft: number;
  color: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withTiming(1, {
        duration: durationMs,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.Never
      })
    );
  }, [progress, durationMs]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * progress.get()
  }));

  return (
    <View style={styles.root} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeOpacity={0.32}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      <Text style={[styles.seconds, { color }]}>{secondsLeft}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  // Starts at 12 o'clock and empties clockwise.
  svg: { position: "absolute", transform: [{ rotate: "-90deg" }] },
  seconds: { ...sans(700), fontSize: 11, lineHeight: 13, fontVariant: ["tabular-nums"] }
});
