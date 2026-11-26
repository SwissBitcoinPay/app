import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import { control, makeStyles, sans, tracked, type } from "@/theme";

import type { SendPhase } from "./useSend";

/**
 * In the place of the send button ("Send", "Empty the card") while the passkey is asked and the
 * payment goes: centred and as tall as the button, so the panel keeps its height.
 */
export function SendWaiting({
  phase,
  testID
}: {
  phase: Extract<SendPhase, "confirming" | "sending">;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.waiting} accessibilityLiveRegion="polite" testID={testID}>
      <Spinner size={22} />
      <Text style={styles.text}>
        {t(phase === "confirming" ? "wallet.sendSheet.confirming" : "wallet.sendSheet.sending")}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  waiting: {
    minHeight: control.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  text: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  }
}));
