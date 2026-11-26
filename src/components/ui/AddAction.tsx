import { Pressable, StyleSheet, Text } from "react-native";

import { control, sans, tracked, type, useTheme } from "@/theme";

import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";
import { useHover } from "./useHover";

type AddActionProps = {
  label: string;
  onPress: () => void;
  height?: number;
  /** The glyph before the label: "+" by default. */
  icon?: IconName;
  /** Drawn in the disabled text colour, not pressable. */
  disabled?: boolean;
  /** Waiting for what it started: a `Spinner` in place of the glyph, not pressable. */
  busy?: boolean;
  /** The spinner's, while `busy`. */
  busyTestID?: string;
  testID?: string;
};

/**
 * An optional field, collapsed: a ghost action in umber with a "+", never an
 * empty form row. Also a quiet action of the same look with its own
 * glyph ("Save to my items": a bookmark), disabled or busy.
 */
export function AddAction({
  label,
  onPress,
  height = 40,
  icon = "plus",
  disabled = false,
  busy = false,
  busyTestID,
  testID
}: AddActionProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  // A row drawn shorter than 44 px still gets the 44 px touch floor.
  const slop = Math.max(0, (control.min - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      // Pressable adds `disabled` itself.
      accessibilityState={busy ? { busy } : undefined}
      onPress={onPress}
      disabled={disabled || busy}
      testID={testID}
      hitSlop={{ top: slop, bottom: slop }}
      {...hoverProps}
      style={[styles.row, { height }]}
    >
      {({ pressed }) => {
        const color = busy
          ? colors.text.accent
          : disabled
            ? colors.text.disabled
            : hovered || pressed
              ? colors.text.primary
              : colors.text.accent;
        return (
          <>
            {busy ? (
              <Spinner size={12} testID={busyTestID} />
            ) : (
              <Icon name={icon} size={12} color={color} />
            )}
            <Text style={[styles.label, { color }]}>{label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9, alignSelf: "flex-start" },
  label: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label
  }
});
