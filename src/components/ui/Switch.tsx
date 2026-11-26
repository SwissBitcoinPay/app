import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { control, makeStyles, motion, palette, useTheme } from "@/theme";

import { Spinner } from "./Spinner";
import { useWaitFade } from "./wait-fade";

const TRACK = { width: 52, height: 32, padding: 3 } as const;
const KNOB = TRACK.height - TRACK.padding * 2;
const TRAVEL = TRACK.width - TRACK.padding * 2 - KNOB;
/** The spinner in the knob: its ring 12 wide, 7 of white around it. */
const KNOB_SPINNER = 14;

type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Accessible name: what the switch turns on and off. */
  label: string;
  /**
   * Cannot be used (till mode, a device without the feature): the sand track, its knob flat in
   * grey (the strong ring's colour, without its white nor its shadow), as the segmented control's
   * thumb leaves its white (disabled = sand and no relief, never opacity): a
   * white knob on sand would not say it cannot be used.
   */
  disabled?: boolean;
  /**
   * Waiting for its value to be read or saved: the app's `Spinner` turns in the knob, the track
   * keeps its colour (the sand says "cannot be used", not "wait"), presses do nothing and
   * screen readers hear it busy.
   */
  loading?: boolean;
  testID?: string;
};

/**
 * On/off ("Settings", "On-chain payments"): the design system has none, this one is made
 * from its colours, like the buttons: an orange track when on, the hairline's colour when off, a
 * white knob with the raised shadow, in a 44 pt touch target. The knob slides in `motion.fast`; with Reduce
 * Motion it moves at once, the track's colour still fading (a fade, kept). The
 * fade runs whatever the system's setting (`ReduceMotion.Never`): by default Reanimated would skip
 * it too, and the colour would jump with the knob.
 */
export function Switch({
  value,
  onValueChange,
  label,
  disabled = false,
  loading = false,
  testID
}: SwitchProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  // The spinner fades in and out as a button's (useWaitFade), until it has faded out.
  const { waiting, waited } = useWaitFade(loading);
  const spinnerFade = useAnimatedStyle(() => ({ opacity: waited.get() }));
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(value ? 1 : 0, { duration: motion.fast, reduceMotion: ReduceMotion.Never }));
  }, [value, on]);
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: disabled
      ? colors.background.subtle
      : interpolateColor(on.get(), [0, 1], [colors.border.subtle, palette.orange])
  }));
  const knobStyle = useAnimatedStyle(
    () => ({
      // With Reduce Motion, at its new place at once, while the colour fades.
      transform: [{ translateX: (reduceMotion ? (value ? 1 : 0) : on.get()) * TRAVEL }]
    }),
    [reduceMotion, value]
  );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: disabled || loading, busy: loading }}
      aria-checked={value}
      // react-native-web reads no accessibilityState: its busy as aria, as its checked.
      aria-busy={loading}
      disabled={disabled || loading}
      onPress={() => onValueChange(!value)}
      style={styles.target}
      testID={testID}
    >
      <Animated.View style={[styles.track, trackStyle]} testID={testID && `${testID}-track`}>
        <Animated.View
          style={[styles.knob, disabled ? styles.knobDisabled : styles.knobEnabled, knobStyle]}
          testID={testID && `${testID}-knob`}
        >
          {waiting ? (
            // Over the whole knob, centred in it: it turns about its own centre (Spinner).
            <Animated.View style={[styles.spinnerLayer, spinnerFade]}>
              <Spinner size={KNOB_SPINNER} testID={testID && `${testID}-spinner`} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  target: { width: TRACK.width, height: control.min, justifyContent: "center" },
  track: {
    width: TRACK.width,
    height: TRACK.height,
    borderRadius: TRACK.height / 2,
    padding: TRACK.padding
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2
  },
  knobEnabled: { backgroundColor: palette.white, boxShadow: shadow.raised },
  // Always a fill, enabled or not: Fabric never flattens the knob either way (UI, AGENTS.md).
  knobDisabled: { backgroundColor: colors.border.strong },
  spinnerLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" }
}));
