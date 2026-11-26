import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import {
  control,
  makeStyles,
  radius,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme,
  type Theme
} from "@/theme";

import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";
import { useHover } from "./useHover";
import { useWaitFade } from "./wait-fade";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "text"
  /** A text button over a screen of ink ("Frame the image": "Cancel"), white. */
  | "textOnDark"
  | "destructive"
  | "destructiveSolid"
  /** A white label on an ink fill ("Migrate my Swiss Bitcoin Pay account"). */
  | "ink";
export type ButtonSize = "lg" | "md" | "sm";

type ButtonProps = {
  children: string;
  onPress?: () => void;
  /** Three levels and one danger. One filled primary per screen. */
  variant?: ButtonVariant;
  /** lg 64 · md 56 · sm 44. Primary defaults to lg, the others to sm. */
  size?: ButtonSize;
  icon?: IconName;
  /**
   * An amount under the label (the keypad's "Charge"): the label shrinks to a caption over the
   * figure, in tabular figures.
   */
  amount?: string;
  /** Drawn after the label, in the label's colour (e.g. the auto-return ring). */
  accessory?: (color: string) => ReactNode;
  /**
   * A small line under the label, in its colour: where the button leads (the payer's page of a
   * checkout link: "Redirecting to shop.example").
   */
  caption?: string;
  disabled?: boolean;
  /**
   * Where the button leads, as a link: on the web, the button is an `<a href>` the browser
   * follows itself, and `onPress` is not called (the apps call `onPress`). Browser wallets (Alby)
   * open a payment link from the page's click on it, heard on the window: react-native-web's
   * Pressable stops the click before it gets there. A disabled button
   * leads nowhere: no link.
   */
  href?: string;
  /**
   * Waiting for what it started: disabled (sand), a `Spinner` in place of its label, which keeps
   * its room (unseen, still its name for screen readers): the button keeps its exact width, its
   * label never changes (a label saying what is waited for, "Creating the integration…", would not
   * fit its button). The label fades out as the spinner fades in, and back.
   */
  loading?: boolean;
  /**
   * The label in the body's weight (500), not bold: a quiet action beside the screen's main one
   * ("Save as draft").
   */
  quiet?: boolean;
  /**
   * A label on as many lines as it takes, the button growing with it ("Move your online shop's
   * integration" on a phone): its size's height as the least. Not with `amount` nor `caption`.
   */
  wrap?: boolean;
  fullWidth?: boolean;
  /**
   * What screen readers name it when its label alone does not say what it does ("Change" →
   * "Change the confirmation mode of Daily"): its label first (WCAG 2.5.3).
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** A button's height for its size (SplitButton draws its own at the same heights). */
export const BUTTON_HEIGHTS: Record<ButtonSize, number> = {
  lg: control.lg,
  md: control.md,
  sm: control.min
};

export type ButtonLook = {
  bg: string;
  ring: string;
  label: string;
  labelShadow: string | null;
  boxShadow?: string;
};

/**
 * The "Contour" treatment: a fill inside a ring of its own darker tone, in the theme drawn. Also
 * SplitButton's, for each of its two parts.
 */
export function buttonLook(
  { colors, shadow }: Theme,
  variant: ButtonVariant,
  hovered: boolean,
  pressed: boolean
): ButtonLook {
  switch (variant) {
    case "primary": {
      const c = colors.button.primary;
      return {
        bg: pressed ? c.bgActive : hovered ? c.bgHover : c.bg,
        ring: c.ring,
        label: c.label,
        labelShadow: c.labelShadow,
        boxShadow: pressed ? shadow.buttonPressInset : shadow.buttonInnerHighlight
      };
    }
    case "secondary": {
      const c = colors.button.secondary;
      return {
        bg: pressed ? c.bgActive : hovered ? c.bgHover : c.bg,
        ring: hovered ? c.ringHover : c.ring,
        label: c.label,
        labelShadow: c.labelShadow,
        boxShadow: pressed
          ? shadow.buttonPressInsetLight
          : `${shadow.buttonInnerHighlightLight}, ${shadow.buttonLift}`
      };
    }
    case "text": {
      const c = colors.button.text;
      return {
        bg: "transparent",
        ring: "transparent",
        label: pressed ? c.labelActive : hovered ? c.labelHover : c.label,
        labelShadow: colors.button.secondary.labelShadow
      };
    }
    case "textOnDark": {
      const c = colors.onDark;
      return {
        bg: "transparent",
        ring: "transparent",
        label: pressed ? c.pressed : hovered ? c.secondary : c.text,
        labelShadow: null
      };
    }
    case "destructive": {
      const c = colors.button.danger;
      return {
        bg: hovered || pressed ? colors.danger.bg : c.bg,
        ring: c.ring,
        label: c.label,
        labelShadow: colors.button.secondary.labelShadow,
        boxShadow: pressed
          ? shadow.buttonPressInsetLight
          : `${shadow.buttonInnerHighlightLight}, ${shadow.buttonLift}`
      };
    }
    case "destructiveSolid": {
      const c = colors.button.dangerSolid;
      return {
        bg: hovered || pressed ? c.bgHover : c.bg,
        ring: c.ring,
        label: c.label,
        labelShadow: c.labelShadow,
        boxShadow: pressed ? shadow.buttonPressInset : shadow.buttonInnerHighlight
      };
    }
    case "ink": {
      const c = colors.button.ink;
      return {
        bg: pressed ? c.bgActive : hovered ? c.bgHover : c.bg,
        ring: c.ring,
        label: c.label,
        labelShadow: c.labelShadow,
        boxShadow: pressed ? shadow.buttonPressInsetInk : shadow.buttonInnerHighlight
      };
    }
  }
}

export function Button({
  children,
  onPress,
  variant = "primary",
  size,
  icon,
  amount,
  accessory,
  caption,
  disabled: disabledProp = false,
  href,
  loading = false,
  quiet = false,
  wrap = false,
  fullWidth = true,
  accessibilityLabel: label,
  accessibilityHint,
  testID,
  style
}: ButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  const s: ButtonSize = size ?? (variant === "primary" ? "lg" : "sm");
  const disabled = disabledProp || loading;
  // The label and the spinner cross-fade as a wait starts and ends; until its label is all back.
  const { waiting, waited } = useWaitFade(loading);
  // An opacity, never a "transparent" colour: Android drew such a label and its icon in black
  // (Fabric reads a colour of 0 as none, TextAttributes.cpp). Animated views are never flattened
  // (Reanimated): nothing is inserted when the fade starts, in a sheet (AGENTS.md).
  const labelFade = useAnimatedStyle(() => ({ opacity: 1 - waited.get() }));
  const spinnerFade = useAnimatedStyle(() => ({ opacity: waited.get() }));
  // Faded, the label is no longer the button's name on Android (TalkBack skips a text in a view of
  // opacity 0: View.isVisibleToUser): it gets it as its label.
  const accessibilityLabel =
    label ??
    (amount
      ? `${children} ${amount}`
      : caption
        ? `${children}, ${caption}`
        : waiting
          ? children
          : undefined);

  const frame = (pressed: boolean): StyleProp<ViewStyle> => {
    const l = buttonLook(theme, variant, hovered && !disabled, pressed && !disabled);
    return [
      styles.base,
      {
        ...(wrap
          ? { minHeight: BUTTON_HEIGHTS[s], paddingVertical: space[4] }
          : { height: BUTTON_HEIGHTS[s] }),
        width: fullWidth ? "100%" : undefined,
        // As wide as its label, never wider than its parent: a label too long ends in "…"
        // (alone on a wrapped line of ConfirmDialog, larger text sizes).
        maxWidth: fullWidth ? undefined : "100%",
        alignSelf: fullWidth ? "stretch" : "flex-start",
        paddingHorizontal: fullWidth && !wrap ? 0 : s === "sm" ? space[6] : space[9]
      },
      disabled
        ? styles.disabled
        : { backgroundColor: l.bg, borderColor: l.ring, boxShadow: l.boxShadow },
      style
    ];
  };

  const content = (pressed: boolean): ReactNode => {
    const l = buttonLook(theme, variant, hovered && !disabled, pressed && !disabled);
    // Loading: the label (and its icon) keeps its room, faded out (labelFade).
    const color = disabled ? theme.colors.text.disabled : l.label;
    const textShadow = disabled ? null : buttonTextShadow(l.labelShadow);
    // Over the label, centred in the whole button (its padding is the same on both sides).
    const spinner = waiting ? (
      <Animated.View style={[styles.spinnerLayer, spinnerFade]}>
        <Spinner size={s === "lg" ? 18 : 16} testID={testID && `${testID}-spinner`} />
      </Animated.View>
    ) : null;
    if (amount) {
      return (
        <>
          <Animated.View style={[styles.amountContent, labelFade]}>
            <Text numberOfLines={1} style={[styles.amountCaption, { color }, textShadow]}>
              {children}
            </Text>
            <Text numberOfLines={1} style={[styles.amountFigure, { color }, textShadow]}>
              {amount}
            </Text>
          </Animated.View>
          {spinner}
        </>
      );
    }
    const row = (
      <>
        {icon ? <Icon name={icon} size={s === "lg" ? 15 : 14} color={color} /> : null}
        <Text
          numberOfLines={wrap ? undefined : 1}
          style={[
            styles.label,
            quiet && styles.quietLabel,
            wrap && styles.wrappedLabel,
            { color },
            textShadow
          ]}
        >
          {children}
        </Text>
        {accessory ? accessory(color) : null}
      </>
    );
    // The fade on the outermost view of the label, which keeps its layout as it was.
    return (
      <>
        {caption ? (
          <Animated.View style={[styles.captioned, labelFade]}>
            <View style={styles.content}>{row}</View>
            <Text numberOfLines={1} style={[styles.caption, { color }, textShadow]}>
              {caption}
            </Text>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.content, labelFade]}>{row}</Animated.View>
        )}
        {spinner}
      </>
    );
  };

  if (href !== undefined && !disabled && Platform.OS === "web") {
    return (
      <WebLink
        href={href}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        onHoverChange={(hover) => (hover ? hoverProps.onHoverIn() : hoverProps.onHoverOut())}
        frame={frame}
      >
        {content}
      </WebLink>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      style={({ pressed }) => frame(pressed)}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** A label's engraved shadow, one point under it, in its look's colour (none without one). */
export function buttonTextShadow(color: string | null): TextStyle | null {
  if (!color) return null;
  return {
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 1 },
    // Android draws no shadow with a zero radius.
    textShadowRadius: Platform.OS === "android" ? 0.1 : 0
  };
}

/**
 * A button that is a link, on the web (`Button`'s `href`): a View with `href`, which
 * react-native-web renders as an `<a>` (focusable, opened with Enter, a middle click, "Copy link
 * address"), without a Pressable's click handler, which stops the click from reaching the window.
 * Hovered and pressed from the pointer, as a Pressable's: hovered by a mouse or a pen, never a
 * finger.
 *
 * Clicked or tapped, it lets go of the focus: the payer's wallet opens in
 * another app, and a browser may draw the focus ring around the link when they come back, as if
 * it had been focused from the keyboard. From the keyboard (Enter: a click whose `detail` is 0), it
 * keeps it and its ring. The click goes on as before: to the window (browser wallets), then the
 * browser follows the link.
 */
function WebLink({
  href,
  accessibilityLabel,
  accessibilityHint,
  testID,
  onHoverChange,
  frame,
  children
}: {
  href: string;
  accessibilityLabel: string | undefined;
  accessibilityHint: string | undefined;
  testID: string | undefined;
  onHoverChange: (hovered: boolean) => void;
  frame: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);
  // Its `<a>` goes without a pointerleave when the button is disabled (a Pressable then, which hears
  // no hover while disabled): not hovered any more, or it would come back hovered, the mouse away.
  const unhover = useEffectEvent(() => onHoverChange(false));
  useEffect(() => () => unhover(), []);
  // `href` is react-native-web's, not in React Native's types (as in external-link.web.ts), and its
  // `onClick` gets the browser's click (its `detail`, 0 from the keyboard), not the pointer event
  // React Native's types give it.
  const anchor = {
    href,
    onClick: (event: { detail: number; currentTarget: { blur: () => void } }) => {
      if (event.detail > 0) event.currentTarget.blur();
    }
  } as unknown as ViewProps;
  return (
    <View
      {...anchor}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      onPointerEnter={(event) => {
        if (event.nativeEvent.pointerType !== "touch") onHoverChange(true);
      }}
      onPointerLeave={() => {
        onHoverChange(false);
        release();
      }}
      // The main button only, as a Pressable: a right click's pointerup goes to its context menu.
      onPointerDown={(event) => {
        if (event.nativeEvent.button === 0) setPressed(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      style={frame(pressed)}
    >
      {children(pressed)}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  base: {
    borderRadius: radius.pill,
    borderWidth: stroke.control,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center"
  },
  disabled: {
    backgroundColor: colors.background.subtle,
    borderColor: "transparent"
  },
  // Never wider than the button: a label too long for it ends in "…" instead of running out of
  // it (on the web, a centred row is as wide as its unwrapped label, beyond a button whose width is
  // set).
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
  captioned: { alignItems: "center", maxWidth: "100%", paddingHorizontal: space[6] },
  caption: { ...sans(500), fontSize: 12, lineHeight: 12 * 1.25 },
  quietLabel: { ...sans(500) },
  wrappedLabel: { textAlign: "center" },
  amountContent: { alignItems: "center", maxWidth: "100%" },
  spinnerLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  amountCaption: { ...sans(600), fontSize: 12, lineHeight: 12 * 1.2 },
  amountFigure: {
    ...sans(700),
    fontSize: 18,
    lineHeight: 18 * 1.25,
    fontVariant: ["tabular-nums"]
  }
}));
