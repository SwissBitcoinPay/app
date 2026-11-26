import { Text, View } from "react-native";

import { makeStyles, type PaymentState, sans, space, tracked, type } from "@/theme";

import { StateDot } from "./StateDot";

type WaitingIndicatorProps = {
  label: string;
  state?: PaymentState;
  /** How far the wait is, when it is counted: told to screen readers too. */
  progress?: { now: number; max: number };
};

/**
 * The pending dot (`StateDot`) and its label: the dot pulses while waiting on someone else,
 * Reduce Motion included.
 */
export function WaitingIndicator({ label, state = "open", progress }: WaitingIndicatorProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={progress ? { min: 0, max: progress.max, now: progress.now } : undefined}
    >
      <StateDot state={state} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flexDirection: "row", alignItems: "center", gap: space[4] },
  label: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  }
}));
