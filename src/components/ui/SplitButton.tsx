import type { RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewInstance,
  type ViewStyle
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { control, makeStyles, radius, sans, space, stroke, tracked, type, useTheme } from "@/theme";

import { BUTTON_HEIGHTS, buttonLook, buttonTextShadow, type ButtonSize } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";
import { useHover } from "./useHover";
import { useWaitFade } from "./wait-fade";

/** The line between the two parts: shorter than the button, centred in it. */
const DIVIDER_HEIGHTS: Record<ButtonSize, number> = { lg: 28, md: 24, sm: 20 };

/** The part at the button's end: a choice that goes with its action, opening a menu. */
export type SplitButtonSide = {
  /** What it shows, in the label's type, before a chevron ("FR", "DE-CH"). */
  label: string;
  /** Its name for screen readers: what it is and what it holds ("Email language: English. Change"). */
  accessibilityLabel: string;
  onPress: () => void;
  /** Its menu shows: the part drawn pressed, and said expanded. */
  expanded?: boolean;
  testID?: string;
};

type SplitButtonProps = {
  /** The action's label. */
  children: string;
  onPress?: () => void;
  icon?: IconName;
  /** As Button's: lg 64 · md 56 · sm 44, lg by default. */
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Both parts: neither its action nor its choice can be pressed (the sand of a disabled button). */
  disabled?: boolean;
  /**
   * Waiting for what its action started, as Button's `loading`: both parts disabled, a spinner in
   * place of the action's label, which keeps its room.
   */
  loading?: boolean;
  side: SplitButtonSide;
  /** The side's part, the button's full height: where its menu drops from (Popover's `anchor`). */
  sideAnchor?: RefObject<ViewInstance | null>;
  accessibilityHint?: string;
  /** The action's part (its Pressable), as a Button's testID. */
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The screen's primary action and, at its end, a choice that goes with it, in one filled button
 * split by a thin line (for a document's language beside what makes it: DocumentLanguageButton). Two buttons for screen
 * readers and the keyboard, each pressed on its own, each at least 44 px wide; the button's own
 * look (Button's primary, its ring, its highlight), each part drawing its hover and its press over
 * the button's fill, in the button's shape at its end. Primary only: the one filled action of a
 * screen.
 */
export function SplitButton({
  children,
  onPress,
  icon,
  size = "lg",
  fullWidth = true,
  disabled: disabledProp = false,
  loading = false,
  side,
  sideAnchor,
  accessibilityHint,
  testID,
  style
}: SplitButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();
  const action = useHover();
  const choice = useHover();
  const disabled = disabledProp || loading;
  // As Button's: the label and the spinner cross-fade as a wait starts and ends; faded, the label
  // is no longer the part's name on Android (TalkBack skips a text of opacity 0): it gets it as its
  // label until it is all back.
  const { waiting, waited } = useWaitFade(loading);
  const labelFade = useAnimatedStyle(() => ({ opacity: 1 - waited.get() }));
  const spinnerFade = useAnimatedStyle(() => ({ opacity: waited.get() }));

  const rest = buttonLook(theme, "primary", false, false);
  const color = disabled ? colors.text.disabled : rest.label;
  const textShadow = disabled ? null : buttonTextShadow(rest.labelShadow);
  // A part hovered or pressed draws its own fill (and its press's inset) over the button's.
  const part = (hovered: boolean, pressed: boolean): ViewStyle | null => {
    if (disabled || (!hovered && !pressed)) return null;
    const l = buttonLook(theme, "primary", hovered, pressed);
    return { backgroundColor: l.bg, boxShadow: l.boxShadow };
  };
  // The action's label centred in its part; the spinner centred where the label is.
  const actionPadding = fullWidth
    ? styles.actionFull
    : size === "sm"
      ? styles.actionFitSmall
      : styles.actionFit;

  return (
    <View
      // Its fill changes while it shows, in a sheet too: never flattened (AGENTS.md).
      collapsable={false}
      style={[
        styles.frame,
        {
          height: BUTTON_HEIGHTS[size],
          width: fullWidth ? "100%" : undefined,
          maxWidth: fullWidth ? undefined : "100%",
          alignSelf: fullWidth ? "stretch" : "flex-start"
        },
        disabled
          ? styles.disabled
          : { backgroundColor: rest.bg, borderColor: rest.ring, boxShadow: rest.boxShadow },
        style
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: loading }}
        accessibilityLabel={waiting ? children : undefined}
        accessibilityHint={accessibilityHint}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        {...action.hoverProps}
        style={({ pressed }) => [
          styles.action,
          fullWidth && styles.actionGrow,
          actionPadding,
          part(action.hovered, pressed)
        ]}
      >
        <Animated.View style={[styles.content, labelFade]}>
          {icon ? <Icon name={icon} size={size === "lg" ? 15 : 14} color={color} /> : null}
          <Text numberOfLines={1} style={[styles.label, { color }, textShadow]}>
            {children}
          </Text>
        </Animated.View>
        {waiting ? (
          <Animated.View style={[styles.spinnerLayer, actionPadding, spinnerFade]}>
            <Spinner size={size === "lg" ? 18 : 16} testID={testID && `${testID}-spinner`} />
          </Animated.View>
        ) : null}
      </Pressable>
      <View
        collapsable={false}
        style={[
          styles.divider,
          {
            height: DIVIDER_HEIGHTS[size],
            backgroundColor: disabled ? colors.border.subtle : colors.button.primary.divider
          }
        ]}
      />
      <View ref={sideAnchor} collapsable={false} style={styles.sideHolder}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={side.accessibilityLabel}
          accessibilityState={{ disabled, expanded: side.expanded ?? false }}
          disabled={disabled}
          onPress={side.onPress}
          testID={side.testID}
          {...choice.hoverProps}
          style={({ pressed }) => [
            styles.side,
            size === "lg" ? styles.sideLarge : styles.sideSmall,
            part(choice.hovered, pressed || (side.expanded ?? false))
          ]}
        >
          <Text numberOfLines={1} style={[styles.label, styles.sideLabel, { color }, textShadow]}>
            {side.label}
          </Text>
          <Icon name="chevron-down" size={10} color={color} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radius.pill,
    borderWidth: stroke.control,
    borderColor: "transparent"
  },
  disabled: {
    backgroundColor: colors.background.subtle,
    borderColor: "transparent"
  },
  // The action's part: the button's start, its shape at that end.
  action: {
    flexShrink: 1,
    minWidth: control.min,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: radius.pill,
    borderBottomLeftRadius: radius.pill
  },
  actionGrow: { flexGrow: 1 },
  actionFull: { paddingLeft: space[7], paddingRight: space[4] },
  actionFit: { paddingLeft: space[9], paddingRight: space[7] },
  actionFitSmall: { paddingLeft: space[6], paddingRight: space[5] },
  // As Button's: never wider than its part, a label too long for it ends in "…".
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    maxWidth: "100%"
  },
  label: {
    ...sans(700),
    fontSize: type.action,
    letterSpacing: tracked.action,
    flexShrink: 1
  },
  spinnerLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  divider: { width: stroke.hairline, alignSelf: "center" },
  // Holds the choice's part, the full height of the button: what its menu drops from.
  sideHolder: { flexShrink: 0 },
  side: {
    flex: 1,
    minWidth: control.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill
  },
  sideLarge: { paddingLeft: space[6], paddingRight: space[7] },
  sideSmall: { paddingLeft: space[5], paddingRight: space[6] },
  // A language's code ("DE-CH") is never cut.
  sideLabel: { flexShrink: 0 }
}));
