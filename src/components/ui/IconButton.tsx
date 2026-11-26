import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { control, type ThemeColors, useTheme } from "@/theme";

import { Icon, type IconName } from "./Icon";
import { useHover } from "./useHover";

type Tone = "plain" | "filled" | "accent" | "onDark" | "outline";

type ToneLook = { rest: string; hover: string; color: string; ring?: string; ringWidth?: number };

function tones(colors: ThemeColors): Record<Tone, ToneLook> {
  return {
    plain: { rest: "transparent", hover: colors.background.subtle, color: colors.text.secondary },
    filled: {
      rest: colors.background.subtle,
      hover: colors.background.accentSubtle,
      color: colors.text.primary
    },
    accent: {
      rest: colors.background.accent,
      hover: colors.background.accentPressed,
      color: colors.text.onAccent
    },
    // Over a screen of ink ("Frame the image": "Zoom in", "Zoom out"): a pale disc in a ring.
    onDark: {
      rest: colors.onDark.fill,
      hover: colors.onDark.fillPressed,
      color: colors.onDark.text,
      ring: colors.onDark.ring
    },
    // A white disc ringed as a secondary button ("Frame the image" on a desktop).
    outline: {
      rest: colors.background.surface,
      hover: colors.background.subtle,
      color: colors.text.primary,
      ring: colors.border.subtle,
      ringWidth: 1.5
    }
  };
}

type IconButtonProps = {
  icon: IconName;
  /** Accessible name: the button has no visible label. */
  label: string;
  onPress?: () => void;
  tone?: Tone;
  size?: number;
  color?: string;
  /**
   * The disc drawn, when smaller than the 44 px target (a tile's "−" of the point of sale's
   * articles): the tone fills it, the rest of the target stays transparent.
   */
  disc?: number;
  /**
   * Header edge buttons are pulled 12 px outward: the 44 px target overhangs
   * the gutter while the glyph stays aligned on the content.
   */
  overhang?: "left" | "right";
  /** No action: a grey glyph, no hover ("Settings": the last relay cannot be removed). */
  disabled?: boolean;
  /** A button that turns a mode on and off ("Discreet"): a switch for screen readers, on or off. */
  checked?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  label,
  onPress,
  tone = "plain",
  size = 18,
  color,
  disc,
  overhang,
  disabled = false,
  checked,
  testID,
  style
}: IconButtonProps) {
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const t = tones(colors)[tone];
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "switch"}
      accessibilityLabel={label}
      accessibilityState={checked === undefined ? { disabled } : { disabled, checked }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={0}
      {...hoverProps}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:
            disc !== undefined ? "transparent" : fill(t, disabled, hovered || pressed),
          boxShadow:
            t.ring && disc === undefined
              ? `inset 0 0 0 ${t.ringWidth ?? 1}px ${t.ring}`
              : undefined,
          marginLeft: overhang === "left" ? -12 : undefined,
          marginRight: overhang === "right" ? -12 : undefined
        },
        style
      ]}
    >
      {({ pressed }) => {
        const glyph = (
          <Icon
            name={icon}
            size={size}
            color={disabled ? colors.text.tertiary : (color ?? t.color)}
          />
        );
        return disc === undefined ? (
          glyph
        ) : (
          <View
            style={[
              styles.disc,
              {
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: fill(t, disabled, hovered || pressed)
              }
            ]}
          >
            {glyph}
          </View>
        );
      }}
    </Pressable>
  );
}

function fill(tone: { rest: string; hover: string }, disabled: boolean, active: boolean): string {
  return !disabled && active ? tone.hover : tone.rest;
}

const styles = StyleSheet.create({
  base: {
    width: control.min,
    height: control.min,
    borderRadius: control.min / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  disc: { alignItems: "center", justifyContent: "center" }
});
