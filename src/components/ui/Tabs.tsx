import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { control, makeStyles, sans, space, useTheme } from "@/theme";

import { Icon, type IconName } from "./Icon";
import { useHover } from "./useHover";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon: IconName;
  /**
   * Till mode: what needs the account (LockedSettings.tsx). A padlock after its label, as the side
   * bar's locked rows (Sidebar.tsx): a press reaches `onChange`, which asks the passkey.
   */
  locked?: boolean;
  /** Shown but not chosen: its label in stone, no press (a locked tab while the SDK loads). */
  disabled?: boolean;
  testID?: string;
};

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the list. */
  label: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A row of tabs over a page ("Settings" on a computer): each its
 * icon then its label, the chosen one in bold ink over a 3 px ink line, the others in slate on the
 * row's hairline, a locked one's padlock after its label. Wider than its parent, the row scrolls
 * sideways.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  style,
  testID
}: TabsProps<T>) {
  const styles = useStyles();
  return (
    <View style={[styles.root, style]}>
      {/* The row's hairline, under the tabs, which the chosen tab's line covers. Not the row's
          border: outside the scroll view, which clips what overhangs its content, the line at
          `bottom: -1` would show only 2 of its 3 px. The content keeps 1 px for it below the
          tabs (`row`), within which the line ends. */}
      <View style={styles.hairline} testID={testID && `${testID}-hairline`} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        testID={testID}
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            item={item}
            selected={item.value === value}
            // The chosen tab stays enabled (focusable, not read as dimmed): a press changes nothing.
            onPress={() => {
              if (item.value !== value) onChange(item.value);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Tab<T extends string>({
  item,
  selected,
  onPress
}: {
  item: TabItem<T>;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const locked = item.locked ?? false;
  const disabled = item.disabled ?? false;
  const color = disabled
    ? colors.text.disabled
    : selected || hovered
      ? colors.text.primary
      : colors.text.note;
  // As the side bar's locked rows: their icon in the tertiary grey, their label as the others'.
  const iconColor = locked && !disabled ? colors.text.tertiary : color;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={
        locked ? t("navigation.lock.lockedLabel", { name: item.label }) : undefined
      }
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      {...hoverProps}
      style={styles.tab}
      testID={item.testID}
    >
      <Icon name={item.icon} size={14} color={iconColor} />
      <Text style={[styles.label, selected ? sans(700) : sans(600), { color }]}>{item.label}</Text>
      {locked ? (
        <View testID={item.testID && `${item.testID}-padlock`}>
          <Icon name="lock" size={10} color={colors.text.tertiary} />
        </View>
      ) : null}
      {selected ? <View style={styles.line} testID={item.testID && `${item.testID}-line`} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { position: "relative" },
  hairline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border.subtle
  },
  row: { flexDirection: "row", gap: space[2], paddingBottom: 1 },
  tab: {
    height: control.md - 8,
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    paddingHorizontal: space[6]
  },
  label: { fontSize: 15 },
  line: {
    position: "absolute",
    left: space[5],
    right: space[5],
    bottom: -1,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.text.primary
  }
}));
