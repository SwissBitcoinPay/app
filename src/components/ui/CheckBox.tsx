import { View } from "react-native";

import { makeStyles, palette, stroke, useTheme } from "@/theme";

import { Icon } from "./Icon";

/** Checked, not, or partly ("Select all" while some values only are shown). */
export type CheckState = boolean | "mixed";

/** `sm`: a row's (a column's filter); `lg`: a card's of its own ("I have the card with me"). */
const SIZES = {
  sm: { side: 18, radius: 5, icon: 11 },
  lg: { side: 26, radius: 8, icon: 12 }
} as const;

/**
 * The box of a row that checks something (a column's filter): the design system has none, this one
 * is made from its colours, as the switch: an orange fill with a white check (a dash when mixed),
 * else white in an ink 35 % ring. Drawn only: the row it sits in is the checkbox for screen
 * readers, and its 44 pt target.
 */
export function CheckBox({
  checked,
  size = "sm"
}: {
  checked: CheckState;
  size?: keyof typeof SIZES;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const on = checked !== false;
  const { side, radius, icon } = SIZES[size];
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.box,
        { width: side, height: side, borderRadius: radius },
        on ? styles.on : styles.off
      ]}
    >
      {on ? (
        <Icon
          name={checked === "mixed" ? "minus" : "check"}
          size={icon}
          color={colors.text.onAccent}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  box: {
    flexShrink: 0,
    borderWidth: stroke.control,
    alignItems: "center",
    justifyContent: "center"
  },
  on: { backgroundColor: palette.orange, borderColor: palette.orange },
  off: { backgroundColor: colors.background.surface, borderColor: colors.border.strong }
}));
