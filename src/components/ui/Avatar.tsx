import { Image, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { makeStyles, palette, sans, useTheme } from "@/theme";

import { Icon } from "./Icon";

/** Up to two initials of a name ("Alice Smith" → "AS", "Corner Bakery" → "CB"). */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

type AvatarProps = {
  /** Whose: its initials show without an image. */
  name: string;
  /** The image (a data URI, src/features/media/images.ts), null for the initials. */
  image: string | null;
  size: number;
  /**
   * The initials' circle: `accent` the orange of the business and of the user's own photo
   * ("Settings"), `subtle` sand (an employee in "Employees"), `pending` dashed (an
   * invitation not used yet).
   */
  tone?: "accent" | "subtle" | "pending";
  /** The camera badge at the bottom right: the avatar changes the image when pressed. */
  badge?: boolean;
  onPress?: () => void;
  /** Pressing it does nothing for now (its image being saved, or synced). */
  disabled?: boolean;
  /** Read by screen readers: what the avatar shows, or what pressing it does. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A round avatar ("Settings" and "Employees"): an image, else the initials in a circle.
 * With a camera badge, pressing it picks another image.
 */
export function Avatar({
  name,
  image,
  size,
  tone = "accent",
  badge = false,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
  style
}: AvatarProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const round = { width: size, height: size, borderRadius: size / 2 };
  const fontSize = Math.round(size * 0.34 * 10) / 10;
  const body = image ? (
    <Image
      source={{ uri: image }}
      style={[round, styles.image]}
      accessibilityIgnoresInvertColors
      testID={testID && `${testID}-image`}
    />
  ) : (
    <View
      style={[
        round,
        styles.initialsCircle,
        tone === "accent" ? styles.accent : tone === "subtle" ? styles.subtle : styles.pending
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize },
          {
            color:
              tone === "accent"
                ? colors.text.onAccent
                : tone === "subtle"
                  ? colors.text.primary
                  : colors.text.secondary
          }
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
  const badgeSize = size >= 60 ? 26 : 24;
  const content = (
    <>
      {body}
      {badge ? (
        <View
          style={[
            styles.badge,
            { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }
          ]}
        >
          <Icon name="camera" size={11} color={colors.text.primary} />
        </View>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        accessibilityRole={accessibilityLabel ? "image" : undefined}
        accessibilityLabel={accessibilityLabel}
        style={[{ width: size, height: size }, style]}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // The 44 pt touch floor around a smaller avatar.
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={[{ width: size, height: size }, style]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  image: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface
  },
  initialsCircle: { alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  accent: { backgroundColor: palette.orange, borderColor: palette.orange },
  subtle: { backgroundColor: colors.background.subtle, borderColor: colors.background.subtle },
  pending: {
    backgroundColor: "transparent",
    borderColor: colors.text.tertiary,
    borderStyle: "dashed"
  },
  initials: { ...sans(700) },
  badge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface,
    alignItems: "center",
    justifyContent: "center"
  }
}));
