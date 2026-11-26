import { Pressable, Text } from "react-native";

import { makeStyles, sans, useTheme } from "@/theme";

import { Icon } from "./Icon";

/**
 * An amount field's unit at its right end (its `trailing`), which switches the amount between the
 * account's currency and sats ("Send"; "Top up", a card's withdrawal and "Lightning invoice" on
 * a desktop): the unit, then the switch's sign while it may switch.
 */
export function UnitSwitch({
  unit,
  label,
  enabled,
  onPress,
  testID
}: {
  unit: string;
  /** What screen readers name it: what it switches to ("Enter in sats"). */
  label: string;
  enabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.unit}
      testID={testID}
    >
      <Text style={styles.unitText}>{unit}</Text>
      {enabled ? <Icon name="arrow-right-arrow-left" size={11} color={colors.text.accent} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  unit: {
    minHeight: 44,
    minWidth: 44,
    marginRight: -8,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  unitText: { ...sans(600), fontSize: 15, color: colors.text.secondary }
}));
