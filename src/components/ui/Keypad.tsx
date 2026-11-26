import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { KeypadKey } from "@/lib/terminal/amount";
import { control, makeStyles, radius, sans, space, type, useTheme } from "@/theme";

import { Icon } from "./Icon";
import { useHover } from "./useHover";

const ROWS: KeypadKey[][] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  ["00", "0", "del"]
];

/** Design system key height (tokens/spacing.css `--keypad-key-height`). */
export const KEY_HEIGHT = 72;

/** The keypad at its design height: four rows of KEY_HEIGHT and the gaps between them. */
export const KEYPAD_HEIGHT = ROWS.length * KEY_HEIGHT + (ROWS.length - 1) * space[2];

/** The least a fitted keypad (`fit`) takes: its keys at the touch floor (control.min). */
export const KEYPAD_MIN_HEIGHT = ROWS.length * control.min + (ROWS.length - 1) * space[2];

type KeypadProps = {
  onPress: (key: KeypadKey) => void;
  /** Accessible name of the delete key. */
  deleteLabel: string;
  /**
   * The keypad takes the height its parent gives it, its four rows sharing it, instead of keys of
   * KEY_HEIGHT: the parent keeps it between KEYPAD_MIN_HEIGHT and KEYPAD_HEIGHT.
   */
  fit?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The numeric pad of the point of sale: four rows of three keys, sand while pressed. */
export function Keypad({ onPress, deleteLabel, fit = false, style }: KeypadProps) {
  const styles = useStyles();
  return (
    <View style={[styles.grid, fit && styles.fill, style]}>
      {ROWS.map((row) => (
        <View key={row.join("")} style={[styles.row, fit ? styles.fill : styles.rowFixed]}>
          {row.map((key) => (
            <Key key={key} value={key} onPress={onPress} deleteLabel={deleteLabel} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Key({
  value,
  onPress,
  deleteLabel
}: {
  value: KeypadKey;
  onPress: (key: KeypadKey) => void;
  deleteLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const isDelete = value === "del";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDelete ? deleteLabel : value}
      onPress={() => onPress(value)}
      testID={`key-${value}`}
      {...hoverProps}
      style={({ pressed }) => [
        styles.key,
        pressed ? styles.pressed : hovered ? { backgroundColor: colors.hoverOverlay } : undefined
      ]}
    >
      {isDelete ? (
        <Icon name="delete-left" size={22} color={colors.text.secondary} />
      ) : (
        <Text style={styles.digit}>{value}</Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  grid: { gap: space[2] },
  fill: { flex: 1 },
  row: { flexDirection: "row", gap: space[2] },
  // The keys take their row's height (stretched): KEY_HEIGHT, or their share of a fitted keypad.
  rowFixed: { height: KEY_HEIGHT },
  key: {
    flex: 1,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: { backgroundColor: colors.background.subtle },
  // SemiBold, heavier than Medium (as the Bold amount).
  digit: {
    ...sans(600),
    fontSize: type.keypad,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  }
}));
