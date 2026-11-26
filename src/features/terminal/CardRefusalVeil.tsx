import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { makeStyles, sans, space, tracked, type, useTheme } from "@/theme";

import { AutoReturnRing } from "./AutoReturnRing";
import type { CardRefusal } from "./card-refusal";

/** How long a card's refusal covers the code before the code comes back on its own. */
export const REFUSAL_SHOWN_MS = 8_000;

/**
 * Over the invoice's code, blurred (`CodePlate`'s `notice`): why the card did not pay, as a veil
 * over the code. The code comes back
 * after REFUSAL_SHOWN_MS, its ring emptying in "Show the code", or at once when pressed: the
 * payer may still scan it. Mounted anew (its `key`) for each refusal, which starts its time again.
 */
export function CardRefusalVeil({
  refusal,
  desktop,
  onDone
}: {
  refusal: CardRefusal;
  desktop: boolean;
  onDone: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(REFUSAL_SHOWN_MS / 1000);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((REFUSAL_SHOWN_MS - (Date.now() - started)) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        onDone();
      }
    }, 250);
    return () => clearInterval(timer);
    // Started once per refusal (the veil is mounted anew for each).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[styles.veil, desktop && styles.veilDesktop]} testID="card-refusal">
      <View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={styles.head}>
          <Icon name="circle-exclamation" size={desktop ? 20 : 16} color={colors.danger.fg} />
          <Text style={[styles.title, desktop && styles.titleDesktop]}>{refusal.title}</Text>
        </View>
        <Text
          style={[styles.message, desktop && styles.messageDesktop]}
          testID="card-refusal-message"
        >
          {refusal.message}
        </Text>
      </View>
      <Button
        variant="text"
        size="sm"
        onPress={onDone}
        accessory={(color) => (
          <AutoReturnRing durationMs={REFUSAL_SHOWN_MS} secondsLeft={secondsLeft} color={color} />
        )}
        testID="card-refusal-show-code"
      >
        {t("pos.boltcard.refusal.showCode")}
      </Button>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // Over the blurred code, inside the plate: the plate's white shows through the code's blur.
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: space[5],
    paddingVertical: space[3]
  },
  veilDesktop: { gap: space[5], paddingHorizontal: space[9] },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    marginBottom: space[2]
  },
  title: {
    ...sans(700),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.danger.fg,
    textAlign: "center"
  },
  titleDesktop: { fontSize: type.title, letterSpacing: tracked.title },
  // Up to 200 characters (MAX_REFUSAL_LENGTH): about eight lines in the phone's plate.
  message: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 17,
    color: colors.text.primary,
    textAlign: "center"
  },
  messageDesktop: { fontSize: type.body, lineHeight: 22 }
}));
