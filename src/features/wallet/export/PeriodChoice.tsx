import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { useHover } from "@/components/ui/useHover";
import { control, makeStyles, palette, radius, sans, space, stroke, type, useTheme } from "@/theme";

/*
 * The period of "Export" (made from the design system's colours as its segmented control and option
 * cards): each preset a tile with a calendar page, one page for a month (its short name), a stack
 * of pages for a year (its number); the tile chosen white in an orange ring, its page's head
 * orange. Two days chosen are "Specific dates", a text radio beside the period's days. Disabled
 * while the file is made: sand, the choice in bold (disabled = sand, never opacity).
 */

/** The page's text when it fits (up to 4 characters: a year, most months' short names). */
const GLYPH_SIZE = { month: 10.5, year: 11.5 } as const;

/**
 * The size of the text on a page: its own up to 4 characters, smaller beyond, so that the widest of
 * the app's languages fits the page's 37 pt (Finnish "MARRAS", "TOUKO": 45.7 and 39 pt at 10.5 in
 * Plus Jakarta Sans ExtraBold, measured from the app's font file). A year too: the device's locale
 * may write it longer ("2026年" in Japanese or Chinese). Text is also kept to one line: an engine's
 * longer name is cut, never wrapped.
 */
export function glyphSize(glyph: string, year: boolean): number {
  const size = year ? GLYPH_SIZE.year : GLYPH_SIZE.month;
  return Math.min(size, (size * 4.6) / Math.max(glyph.length, 1));
}

/**
 * The fill of a choice of "Export" (a period's tile, a column's pill): white in an orange ring once
 * chosen, apricot hovered or pressed, else sand; disabled, sand whatever its choice. In the theme
 * drawn: `const choiceFill = useChoiceFill()` in the component.
 */
export function useChoiceFill() {
  const fills = useFills();
  return (chosen: boolean, disabled: boolean, active: boolean) => {
    if (chosen && !disabled) return fills.chosen;
    return !disabled && active ? fills.active : fills.idle;
  };
}

const useFills = makeStyles(({ colors }) => ({
  idle: { backgroundColor: colors.background.subtle, borderColor: "transparent" },
  active: { backgroundColor: colors.background.accentSubtle, borderColor: "transparent" },
  chosen: { backgroundColor: colors.background.surface, borderColor: palette.orange }
}));

type PeriodTileProps = {
  label: string;
  /** What its page says: its month's short name, or its year (periodGlyph). */
  glyph: string;
  year: boolean;
  chosen: boolean;
  disabled: boolean;
  /** Its label and its days, for screen readers. */
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
};

/** A preset of the period: a radio of the period's group. */
export function PeriodTile({
  label,
  glyph,
  year,
  chosen,
  disabled,
  accessibilityLabel,
  onPress,
  testID
}: PeriodTileProps) {
  const styles = useStyles();
  const choiceFill = useChoiceFill();
  const { hovered, hoverProps } = useHover();
  const ringed = chosen && !disabled;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      // Never flattened (its fill and ring change while the sheet shows, AGENTS.md).
      collapsable={false}
      style={({ pressed }) => [styles.tile, choiceFill(chosen, disabled, hovered || pressed)]}
    >
      <CalendarPage glyph={glyph} year={year} lit={ringed} />
      <Text style={[styles.label, chosen && styles.labelChosen]}>{label}</Text>
    </Pressable>
  );
}

/** A calendar page (a stack of three for a year), its rings on top. Drawn only. */
function CalendarPage({ glyph, year, lit }: { glyph: string; year: boolean; lit: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ink = lit ? colors.text.accent : colors.border.strong;
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.page}
    >
      {year ? (
        <>
          <View style={[styles.sheet, styles.behindFar]} />
          <View style={[styles.sheet, styles.behind]} />
        </>
      ) : null}
      <View style={[styles.sheet, styles.face]}>
        <View
          collapsable={false}
          style={[styles.head, { backgroundColor: lit ? palette.orange : colors.border.subtle }]}
        />
        <Text numberOfLines={1} style={[styles.glyph, { fontSize: glyphSize(glyph, year) }]}>
          {glyph}
        </Text>
      </View>
      <View collapsable={false} style={[styles.ring, styles.ringLeft, { backgroundColor: ink }]} />
      <View collapsable={false} style={[styles.ring, styles.ringRight, { backgroundColor: ink }]} />
    </View>
  );
}

type ExactDaysProps = {
  label: string;
  chosen: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
};

/**
 * "Specific dates": the period's last radio, as the design system's text button (umber, a pen), a
 * check once chosen.
 */
export function ExactDaysToggle({ label, chosen, disabled, onPress, testID }: ExactDaysProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      style={styles.exact}
    >
      {({ pressed }) => {
        const color = disabled
          ? colors.text.disabled
          : pressed
            ? colors.button.text.labelActive
            : hovered
              ? colors.button.text.labelHover
              : colors.button.text.label;
        return (
          <>
            <Icon name={chosen ? "check" : "pen"} size={12} color={color} />
            <Text numberOfLines={1} style={[styles.exactLabel, { color }]}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/** The page's size: its face, and the room the pages behind a year's take, up and to the right. */
const FACE = { width: 44, height: 42 } as const;
const BEHIND = 3;

const useStyles = makeStyles(({ colors }) => ({
  tile: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: control.min,
    alignItems: "center",
    gap: space[4],
    paddingTop: space[5],
    paddingBottom: space[4],
    paddingHorizontal: space[2],
    borderRadius: radius.md,
    borderWidth: stroke.control
  },
  label: {
    ...sans(600),
    fontSize: type.caption,
    lineHeight: type.caption * 1.3,
    textAlign: "center",
    color: colors.text.secondary
  },
  labelChosen: { ...sans(700), color: colors.text.primary },
  page: { width: FACE.width + 2 * BEHIND, height: FACE.height + 2 * BEHIND },
  sheet: {
    position: "absolute",
    left: BEHIND,
    bottom: 0,
    width: FACE.width,
    height: FACE.height,
    borderRadius: 8,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface
  },
  behind: { transform: [{ translateX: BEHIND }, { translateY: -BEHIND }] },
  behindFar: { transform: [{ translateX: 2 * BEHIND }, { translateY: -2 * BEHIND }] },
  face: { overflow: "hidden" },
  head: { height: 10 },
  glyph: {
    ...sans(700),
    flex: 1,
    paddingHorizontal: space[1],
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: FACE.height - 10 - 2 * stroke.control,
    letterSpacing: 0.2,
    color: colors.text.primary
  },
  ring: { position: "absolute", top: 2, width: 3, height: 8, borderRadius: 2 },
  ringLeft: { left: BEHIND + 12 },
  ringRight: { left: BEHIND + FACE.width - 12 - 3 },
  exact: {
    minHeight: control.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    flexShrink: 0
  },
  exactLabel: { ...sans(700), fontSize: type.body }
}));
