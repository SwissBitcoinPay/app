import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { makeStyles, palette, radius, sans, stroke, type, useTheme } from "@/theme";

import { Icon } from "./Icon";

type OptionCardProps = {
  title: string;
  /** A word after the title, on a green pill ("Change mode": "Recommended"). */
  tag?: string;
  description: string;
  /** Content of the 48 px round badge on the left (icon or image). */
  leading: ReactNode;
  selected: boolean;
  onPress: () => void;
  /** While what it chooses is being saved: it does not change. */
  disabled?: boolean;
  /**
   * Ringed rather than raised, a little tighter ("Change mode" on a desktop): one of a dialog's choices, not a card on a screen.
   */
  outlined?: boolean;
  testID?: string;
};

/** A selectable card of a single-choice list (radio semantics). */
export function OptionCard({
  title,
  tag,
  description,
  leading,
  selected,
  onPress,
  disabled = false,
  outlined = false,
  testID
}: OptionCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${tag ? `${title}, ${tag}` : title}. ${description}`}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[
        styles.card,
        outlined && styles.cardOutlined,
        {
          borderColor: selected ? palette.orange : outlined ? colors.border.subtle : "transparent"
        }
      ]}
    >
      <View style={[styles.badge, outlined && styles.badgeOutlined]}>{leading}</View>
      <View style={styles.texts}>
        {tag ? (
          <View style={styles.titleLine}>
            <Text style={[styles.title, outlined && styles.titleOutlined]}>{title}</Text>
            <Text style={styles.tag}>{tag}</Text>
          </View>
        ) : (
          <Text style={[styles.title, outlined && styles.titleOutlined]}>{title}</Text>
        )}
        <Text style={styles.description}>{description}</Text>
      </View>
      {selected ? (
        <View style={[styles.radio, styles.radioOn]}>
          <Icon name="check" size={11} color={palette.white} />
        </View>
      ) : (
        <View style={[styles.radio, styles.radioOff]} />
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    borderWidth: stroke.control,
    paddingVertical: 16,
    paddingHorizontal: 18
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background.app,
    alignItems: "center",
    justifyContent: "center"
  },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  title: {
    ...sans(700),
    fontSize: 16,
    color: colors.text.primary
  },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: 4,
    columnGap: 8
  },
  tag: {
    ...sans(600),
    overflow: "hidden",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.success.bg,
    fontSize: 11,
    color: colors.success.fg
  },
  description: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.45,
    color: colors.text.secondary
  },
  // "Payments without confirmation" on the web: its modes in a dialog.
  cardOutlined: {
    alignItems: "flex-start",
    boxShadow: "none",
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  badgeOutlined: { width: 40, height: 40, borderRadius: 20 },
  titleOutlined: { ...sans(600), fontSize: 15 },
  radio: { width: 24, height: 24, borderRadius: 12 },
  radioOff: { borderWidth: 2, borderColor: colors.border.subtle },
  radioOn: { backgroundColor: palette.orange, alignItems: "center", justifyContent: "center" }
}));
