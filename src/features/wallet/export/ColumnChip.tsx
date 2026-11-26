import { Pressable, Text } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { useHover } from "@/components/ui/useHover";
import { control, makeStyles, radius, sans, space, stroke, type, useTheme } from "@/theme";

import { useChoiceFill } from "./PeriodChoice";

type ColumnChipProps = {
  label: string;
  ticked: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * A column of "Detailed (CSV)": a checkbox drawn as a pill, sand, white in an orange ring with a
 * check once ticked, as the period's tiles. Its 44 pt touch floor is its own height
 * (react-native-web ignores `hitSlop`). Disabled: sand, a ticked one in bold.
 */
export function ColumnChip({ label, ticked, disabled, onPress, testID }: ColumnChipProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const choiceFill = useChoiceFill();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      // Never flattened (its fill and ring change while the sheet shows, AGENTS.md).
      collapsable={false}
      style={({ pressed }) => [styles.chip, choiceFill(ticked, disabled, hovered || pressed)]}
    >
      {ticked ? (
        <Icon name="check" size={10} color={disabled ? colors.text.disabled : colors.text.accent} />
      ) : null}
      <Text numberOfLines={1} style={[styles.label, ticked && styles.labelTicked]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  chip: {
    minHeight: control.min,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[6],
    borderRadius: radius.pill,
    borderWidth: stroke.control
  },
  label: { ...sans(600), flexShrink: 1, fontSize: type.caption, color: colors.text.secondary },
  labelTicked: { ...sans(700), color: colors.text.primary }
}));
