import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { makeStyles, sans, tracked, type, useTheme } from "@/theme";

import { Icon } from "./Icon";

type ErrorMessageProps = {
  /** What went wrong and what to do: a message-instruction. */
  children: string;
  /**
   * Under a centred title: the icon above the text, both centred. Beside it, the icon would stay at
   * the row's start once the text wraps (RN cannot shrink wrapped text to its longest line).
   */
  centred?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A failure shown above the action that caused it, announced to screen readers. */
export function ErrorMessage({ children, centred = false, style, testID }: ErrorMessageProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[centred ? styles.column : styles.row, style]} testID={testID}>
      <Icon
        name="circle-exclamation"
        size={15}
        color={colors.danger.fg}
        style={centred ? undefined : styles.icon}
      />
      <Text
        accessibilityRole="alert"
        style={[styles.text, centred ? styles.textCentred : styles.textFill]}
      >
        {children}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", gap: 9 },
  column: { alignItems: "center", gap: 6 },
  // Centres the glyph (15 px, line height 1.15, see Icon) on the first line of text.
  icon: { marginTop: (type.label * 1.45 - 15 * 1.15) / 2 },
  text: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.45,
    color: colors.danger.fg
  },
  textCentred: { textAlign: "center" },
  textFill: { flex: 1 }
}));
