import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { type PaymentState, useTheme } from "@/theme";

import { usePulse } from "./pulse";

type StateDotProps = {
  state?: PaymentState;
  /** Pulses (`usePulse`); by default only the open state's, waiting on someone else. */
  pulsing?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A payment state's dot, in its colour. The open state's pulses (`usePulse`) while waiting on
 * someone else, Reduce Motion included (a fade only); another state's when asked (`pulsing`).
 * Decorative: the text beside it, or the label of its control, says what it means.
 */
export function StateDot({
  state = "open",
  pulsing = state === "open",
  style,
  testID
}: StateDotProps) {
  const { colors } = useTheme();
  const opacity = usePulse(pulsing);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: colors.state[state].dot }, pulseStyle, style]}
      // aria-hidden for the web, where the two others are ignored.
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 3.5 }
});
