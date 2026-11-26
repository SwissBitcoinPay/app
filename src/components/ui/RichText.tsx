import { Fragment } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { palette, sans, useTheme } from "@/theme";

type RichTextProps = {
  /** Translated string with `<accent>…</accent>`, `<strong>…</strong>`, `<link>…</link>`. */
  children: string;
  style?: StyleProp<TextStyle>;
  /** Orange by default: user-chosen values and brand names in titles (bold, 19 px or more). */
  accentStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onLinkPress?: () => void;
  accessibilityRole?: "header" | "text";
};

// `s`: a span holds any character (a card's name read from the relays may carry U+2028).
const TAG = /<(accent|strong|link)>(.*?)<\/\1>/gs;

// After a value's every "<" (escapeRichText): invisible, it keeps the value's text from being read
// as a span; removed again when shown.
const ESCAPED = "<\u2060";

/**
 * A value interpolated into RichText's markup (a card's name, typed by a user, read from the
 * relays): shown as it is, never as spans of its own.
 */
export function escapeRichText(value: string): string {
  return value.replaceAll("<", ESCAPED);
}

function unescaped(text: string): string {
  return text.replaceAll(ESCAPED, "<");
}

/** Renders the markup used in translations as nested Text, without HTML. */
export function RichText({
  children,
  style,
  accentStyle,
  linkStyle,
  onLinkPress,
  accessibilityRole
}: RichTextProps) {
  const { colors } = useTheme();
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of children.matchAll(TAG)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(unescaped(children.slice(last, index)));
    const [, tag, marked] = match;
    const content = unescaped(marked);
    parts.push(
      tag === "accent" ? (
        <Text key={index} style={[{ color: palette.orange }, accentStyle]}>
          {content}
        </Text>
      ) : tag === "strong" ? (
        <Text key={index} style={styles.strong}>
          {content}
        </Text>
      ) : (
        <Text
          key={index}
          accessibilityRole="link"
          onPress={onLinkPress}
          style={[{ color: colors.text.accent }, linkStyle]}
        >
          {content}
        </Text>
      )
    );
    last = index + match[0].length;
  }
  if (last < children.length) parts.push(unescaped(children.slice(last)));

  return (
    <Text style={style} accessibilityRole={accessibilityRole}>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </Text>
  );
}

// Bold in the paragraph's own colour ("Empty Daily first"'s amounts).
const styles = StyleSheet.create({ strong: sans(700) });
