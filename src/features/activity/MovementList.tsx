import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Masked, spokenAmount, useDiscreet } from "@/components/ui/Discreet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { makeStyles, radius, sans, type, useTheme } from "@/theme";

/*
 * A list of movements on a phone, as "Wallet" and the history of a card draw it (with each day's
 * net): a day's title, its net at its right, then its rows in a white card; each row its round icon
 * (its kind, tinted by its way or its state), its name, its line under it (its time, then what it
 * is, in its state's colour), its amount at its right, the other value under it. One look for both
 * screens: each says what goes in it.
 */

/** A row's round icon: its glyph, on its fill. */
export type MovementIcon = { name: IconName; bg: string; fg: string };

/**
 * A day of the list: its title, its net at its right (dayNetText; null: none told), then its rows
 * in a card. The net is masked in a discreet mode, as the amounts.
 */
export function MovementDay({
  label,
  net,
  children,
  testID
}: {
  label: string;
  net: string | null;
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const discreet = useDiscreet();
  return (
    <View style={styles.day} testID={testID}>
      <View style={styles.dayHead}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.dayLabel}>
          {label}
        </Text>
        {net !== null ? (
          <View
            accessible
            accessibilityLabel={t("activity.dayNet", { amount: spokenAmount(discreet, net) })}
            style={styles.netBox}
            testID={testID ? `${testID}-net` : undefined}
          >
            <Masked color={colors.text.secondary}>
              <Text numberOfLines={1} style={styles.net}>
                {net}
              </Text>
            </Masked>
          </View>
        ) : null}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * A row of a day's card: pressed as a whole when it opens something (`onPress`), else read as one.
 * `separated`: a line under it, when another row of the card shows below it.
 */
export function MovementRow({
  icon,
  title,
  caption,
  captionColor,
  amounts,
  separated,
  onPress,
  accessibilityLabel,
  testID
}: {
  icon: MovementIcon;
  title: string;
  caption: string;
  captionColor: string;
  amounts: ReactNode;
  separated: boolean;
  onPress?: () => void;
  /** Without one, its texts are read in order (their masked amounts too). */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: icon.bg }]}>
        <Icon name={icon.name} size={14} color={icon.fg} />
      </View>
      <View style={styles.texts}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {/* One line always: a long name ends in "…", the time first. */}
        <Text numberOfLines={1} style={[styles.caption, { color: captionColor }]}>
          {caption}
        </Text>
      </View>
      <View style={styles.amounts}>{amounts}</View>
    </>
  );
  const style = [styles.row, separated && styles.separated];
  if (!onPress) {
    return (
      <View
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
        style={style}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <ListRow
      inset={0}
      cornerRadius={radius.lg}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      {content}
    </ListRow>
  );
}

/**
 * A row's amounts: the one written first (`primary`, in `color`; struck through when nothing moved;
 * after a clock while it waits to be credited), the other under it (`secondary`, a text in the
 * caption's grey, or what stands in its place). Both masked in a discreet mode.
 */
export function MovementAmounts({
  primary,
  color,
  struck = false,
  waiting = false,
  secondary,
  testID
}: {
  primary: string;
  color: string;
  struck?: boolean;
  waiting?: boolean;
  secondary?: string | ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <>
      <View style={styles.primaryLine} testID={testID}>
        {waiting ? (
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="clock-regular" size={13} color={colors.warning.fg} />
          </View>
        ) : null}
        <Masked style={styles.shrink} color={color}>
          <Text numberOfLines={1} style={[styles.primary, { color }, struck && styles.struck]}>
            {primary}
          </Text>
        </Masked>
      </View>
      {typeof secondary === "string" ? (
        <Masked color={colors.text.secondary}>
          <Text numberOfLines={1} style={styles.secondary}>
            {secondary}
          </Text>
        </Masked>
      ) : (
        (secondary ?? null)
      )}
    </>
  );
}

/** What stands under an amount waiting to be credited: "not in balance yet", in ochre. */
export function WaitingCaption({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text numberOfLines={1} style={styles.waiting}>
      {children}
    </Text>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  day: { gap: 9 },
  dayHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4
  },
  dayLabel: {
    ...sans(600),
    flexShrink: 1,
    minWidth: 0,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  netBox: { flexShrink: 0 },
  net: {
    ...sans(600),
    fontSize: type.caption,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...sans(600), fontSize: type.body, color: colors.text.primary },
  caption: { ...sans(500), fontSize: type.caption, lineHeight: 17 },
  amounts: { flexShrink: 0, maxWidth: "50%", alignItems: "flex-end", gap: 1 },
  primaryLine: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  primary: {
    ...sans(600),
    fontSize: type.body,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  struck: { textDecorationLine: "line-through" },
  secondary: {
    ...sans(500),
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  waiting: { ...sans(600), fontSize: type.tabLabel, color: colors.warning.fg }
}));
