import { Text, View } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { makeStyles, radius, sans, useTheme } from "@/theme";

/**
 * What a computer leaves to the phone: a computer reads no NFC card, nor does an iPad
 * (useReadsCards.ts).
 */
export function ComputerNote({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.note}>
      <Icon name="mobile-screen-button" size={15} color={colors.text.secondary} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.app
  },
  text: { ...sans(500), flex: 1, fontSize: 13, lineHeight: 20, color: colors.text.note }
}));
