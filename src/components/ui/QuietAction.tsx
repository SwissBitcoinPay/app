import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";

import { control, makeStyles, sans, space, type } from "@/theme";

import { useHover } from "./useHover";

type QuietActionProps = {
  label: string;
  onPress: () => void;
  testID?: string;
  /** Where it stands (its margins, its alignment), never how it looks. */
  style?: StyleProp<ViewStyle>;
};

/**
 * A secondary action that should barely show: the caption's grey text, darker when hovered or
 * pressed, never underlined ("Show expired" under the mobile list). Not in the design system's
 * buttons: its "text" button is umber, at the action's
 * size. Its 44 px touch floor is its own height (react-native-web ignores `hitSlop`); one line,
 * ending in "…" when too long.
 */
export function QuietAction({ label, onPress, testID, style }: QuietActionProps) {
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      style={[styles.root, style]}
    >
      {({ pressed }) => (
        <Text numberOfLines={1} style={[styles.label, (hovered || pressed) && styles.active]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    minHeight: control.min,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: space[5]
  },
  label: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  active: { color: colors.text.primary }
}));
