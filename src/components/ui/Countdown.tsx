import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { makeStyles, mono, radius, sans, type, useTheme } from "@/theme";

import { Icon } from "./Icon";

type CountdownProps = {
  label: string;
  /** Seconds left. */
  seconds: number;
  /** Share of the time left, 0 to 1. */
  progress: number;
  /** Kept in place, unseen and out of screen readers' reach: nothing moves when it shows again. */
  hidden?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** "mm:ss" of a number of seconds, never negative. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Time left before an invoice expires, or before the checks of an ended one end: label and mono
 * timer, an orange bar that empties.
 */
export function Countdown({ label, seconds, progress, hidden = false, style }: CountdownProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const clock = formatClock(seconds);
  return (
    <View
      style={[styles.root, hidden && styles.hidden, style]}
      aria-hidden={hidden}
      accessible={!hidden}
      accessibilityRole="timer"
      accessibilityLabel={`${label} ${clock}`}
    >
      <View style={styles.row}>
        <View style={styles.labelRow}>
          <Icon name="clock-regular" size={13} color={colors.text.secondary} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.time}>{clock}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: 11, width: "100%" },
  hidden: { opacity: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  time: { ...mono(700), fontSize: type.timer, color: colors.text.primary },
  track: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.border.faint,
    overflow: "hidden"
  },
  fill: { height: 3, borderRadius: radius.pill, backgroundColor: colors.background.accent }
}));
