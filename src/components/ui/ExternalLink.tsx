import { Pressable, Text } from "react-native";

import { control, makeStyles, sans, space, tracked, type, useTheme } from "@/theme";

import { externalLinkProps } from "./external-link";
import { Icon, type IconName } from "./Icon";

type ExternalLinkProps = {
  label: string;
  url: string;
  /** By default the arrow out of a box: a page outside the app. */
  icon?: IconName;
  testID?: string;
};

/**
 * A page outside the app (a repository, a plugin's download), in the browser: its label in the
 * accent's text colour, then its icon (external-link.ts: the browser in the apps, a new tab on the
 * web).
 */
export function ExternalLink({
  label,
  url,
  icon = "arrow-up-right-from-square",
  testID
}: ExternalLinkProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      {...externalLinkProps(url)}
      accessibilityRole="link"
      // Its name is its label: the icon is a glyph of the icon font, not a word.
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.label}>{label}</Text>
      <Icon name={icon} size={12} color={colors.text.accent} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // The 44 px touch floor is its own height (react-native-web ignores `hitSlop`).
  link: {
    minHeight: control.min,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space[3]
  },
  label: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.accent
  },
  pressed: { backgroundColor: colors.hoverOverlay }
}));
