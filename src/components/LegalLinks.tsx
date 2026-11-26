import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { externalLinkProps } from "@/components/ui/external-link";
import { useHover } from "@/components/ui/useHover";
import { LEGAL_URLS, type LegalDocument } from "@/config/legal";
import { control, makeStyles, sans, space, type } from "@/theme";

const ALL_DOCUMENTS: readonly LegalDocument[] = ["terms", "privacy"];

const LABELS = {
  terms: "legal.terms",
  privacy: "legal.privacy"
} as const satisfies Record<LegalDocument, string>;

/**
 * Links to sattle.me's legal documents (src/config/legal.ts): centred right above the version
 * chip on a phone's "Settings" (MobileFooter, every kind of account, till mode included) and the
 * welcome screen (the privacy policy alone: its line above links the terms); at the start, above
 * the business card, in the desktop side bar (`align`). Pages outside the app (external-link.ts:
 * the browser in the apps, a real anchor in a new tab on the web).
 *
 * No separator between the links: on a narrow width (the side bar, German) they wrap one under the
 * other, never leaving a dot at a line's end. Each is as high as the 44 px touch floor
 * (react-native-web ignores `hitSlop`). `onDark`: over ink (the side bar), dimmed as its group
 * titles, white when pointed at.
 */
export function LegalLinks({
  documents = ALL_DOCUMENTS,
  onDark = false,
  align = "center",
  style,
  testID
}: {
  documents?: readonly LegalDocument[];
  onDark?: boolean;
  align?: "center" | "start";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, align === "start" && styles.rowStart, style]} testID={testID}>
      {documents.map((document) => (
        <LegalLink
          key={document}
          document={document}
          onDark={onDark}
          start={align === "start"}
          testID={testID && `${testID}-${document}`}
        />
      ))}
    </View>
  );
}

function LegalLink({
  document,
  onDark,
  start,
  testID
}: {
  document: LegalDocument;
  onDark: boolean;
  start: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      {...externalLinkProps(LEGAL_URLS[document])}
      {...hoverProps}
      accessibilityRole="link"
      style={styles.link}
      testID={testID}
    >
      {({ pressed }) => (
        <Text
          style={[
            styles.label,
            start && styles.labelStart,
            onDark && styles.labelOnDark,
            (hovered || pressed) && (onDark ? styles.activeOnDark : styles.active)
          ]}
        >
          {t(LABELS[document])}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: space[7]
  },
  rowStart: { justifyContent: "flex-start", columnGap: space[6] },
  link: { minHeight: control.min, justifyContent: "center" },
  // As the welcome screen's terms and their link (RichText's): its caption, in the accent's text
  // colour; over ink, white (the light theme's accent text is dark).
  label: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.accent,
    textAlign: "center"
  },
  labelStart: { textAlign: "left" },
  // The side bar's group titles' dimmed white (5.2:1 over ink).
  labelOnDark: { color: colors.onDark.muted },
  // Underlined while pointed at or pressed.
  active: { textDecorationLine: "underline" },
  activeOnDark: { color: colors.onDark.text, textDecorationLine: "underline" }
}));
