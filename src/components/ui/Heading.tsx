import { Text, type StyleProp, type TextStyle } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { makeStyles, proseLineHeight, sans, TITLE_EM, tracking, type } from "@/theme";

import { RichText } from "./RichText";

/** Screen title: 26 px on mobile, 28 px on desktop, left-aligned unless `style` says otherwise. */
export function ScreenTitle({
  children,
  size,
  style
}: {
  /** May contain `<accent>` spans. */
  children: string;
  /** Overrides the default size (e.g. 24 for the long bank title on mobile). */
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  const styles = useStyles();
  const desktop = useIsDesktop();
  const fontSize = size ?? (desktop ? 28 : 26);
  return (
    <RichText
      accessibilityRole="header"
      style={[
        styles.title,
        {
          fontSize,
          lineHeight: fontSize * 1.15,
          letterSpacing: tracking(TITLE_EM, fontSize),
          marginTop: desktop ? 0 : 12
        },
        style
      ]}
    >
      {children}
    </RichText>
  );
}

/** Supporting paragraph under a title. */
export function Lead({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  return <Text style={[styles.lead, style]}>{children}</Text>;
}

const useStyles = makeStyles(({ colors }) => ({
  title: { ...sans(700), color: colors.text.primary },
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    marginTop: 10
  }
}));
