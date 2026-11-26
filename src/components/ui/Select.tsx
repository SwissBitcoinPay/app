import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { control, makeStyles, radius, sans, space, type, useTheme } from "@/theme";

import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { useHover } from "./useHover";

type SelectProps = {
  label?: string;
  value?: string | null;
  description?: string;
  placeholder?: string;
  onPress?: () => void;
  /** Not choosable: grey value, no press ("Settings": a check runs). */
  disabled?: boolean;
  /**
   * Its choice being saved ("Settings"): disabled, `Spinner` in
   * place of the chevron.
   */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A recessed (sand) field that opens a list. The list itself is the caller's. */
export function Select({
  label,
  value,
  description,
  placeholder,
  onPress,
  disabled: disabledProp = false,
  busy = false,
  style,
  testID
}: SelectProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const disabled = disabledProp || busy;
  const filled = !!value;
  return (
    <View style={[styles.root, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}, ${value ?? placeholder ?? ""}` : undefined}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        {...hoverProps}
        style={({ pressed }) => [
          styles.frame,
          {
            backgroundColor:
              !disabled && (hovered || pressed)
                ? colors.background.accentSubtle
                : colors.background.subtle
          }
        ]}
      >
        <View style={styles.values}>
          <Text
            numberOfLines={1}
            style={[
              styles.value,
              filled ? sans(700) : sans(500),
              { color: filled && !disabled ? colors.text.primary : colors.text.secondary }
            ]}
          >
            {filled ? value : placeholder}
          </Text>
          {filled && description ? (
            <Text numberOfLines={1} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
        {busy ? (
          <Spinner size={16} testID={testID && `${testID}-saving`} />
        ) : (
          <Icon name="chevron-down" size={13} color={colors.text.secondary} />
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: space[4] },
  label: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  frame: {
    height: control.md,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    gap: space[3]
  },
  values: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space[3]
  },
  value: { fontSize: type.body, flexShrink: 1 },
  description: {
    ...sans(500),
    fontSize: 12,
    color: colors.text.secondary,
    flexShrink: 1
  }
}));
