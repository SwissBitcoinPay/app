import { Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { makeStyles, radius, sans, tracked, type, useTheme } from "@/theme";

/** The note's line, fixed: the pen keeps to the middle of its first line whatever the platform. */
const LINE = 18;
const PEN = 12;

/**
 * A sale's note, under its amount: on the payer's page and on the point of
 * sale's screens of the sale, where it takes the header's place, a pen before
 * it so that it reads as a note (as "Add a note" under the keypad's amount, NoteCaption).
 * Three lines at most: a note is 100 characters (NOTE_MAX_LENGTH), it may hold line breaks. Nothing
 * without one. The payer page's pill, shared.
 */
export function SaleNote({
  note,
  align = "center",
  testID
}: {
  note: string | undefined;
  /** Under an amount aligned to the left (the point of sale's desktop column), or centred. */
  align?: "center" | "left";
  /** Of the note's text. */
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!note) return null;
  return (
    <View style={[styles.note, align === "left" ? styles.left : styles.center]}>
      <Icon name="pen" size={PEN} color={colors.text.secondary} style={styles.pen} />
      <Text
        style={[styles.text, align === "left" ? styles.textLeft : styles.textCenter]}
        numberOfLines={3}
        testID={testID}
      >
        {note}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  note: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  center: { alignSelf: "center" },
  left: { alignSelf: "flex-start" },
  pen: { marginTop: (LINE - PEN * 1.15) / 2 },
  text: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.label,
    lineHeight: LINE,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  textCenter: { textAlign: "center" },
  textLeft: { textAlign: "left" }
}));
