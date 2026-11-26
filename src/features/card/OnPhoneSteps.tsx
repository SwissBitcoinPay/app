import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { QrPlate } from "@/components/ui/QrPlate";
import { CARDS_PATH, getCardAddingOrigin } from "@/config/card";
import { makeStyles, radius, sans } from "@/theme";

import { useReadsCards } from "./useReadsCards";

/** The code's size: a plate of 148 px, its quiet zone of 18 kept. */
const CODE_SIZE = 112;

/**
 * What the web app leaves to the phone, the card in hand: open the app, the way to the task in it,
 * the card held to the phone; on a computer, beside them, a code that opens "Cards" in the app on
 * the phone, as in the app on a device that reads no card (an iPad, useReadsCards.ts). None without
 * a web app (no RP ID: local, CI), nor on a phone's browser, which cannot scan its own screen: the
 * first step then says nothing of it.
 */
export function OnPhoneSteps({
  path,
  pathCaption,
  holdCaption
}: {
  /** The way to the task in the app ("Daily › Delete the card"). */
  path: string;
  /** Under the way there: where in the task, if anything more is to be found (null: nothing). */
  pathCaption: string | null;
  holdCaption: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const reads = useReadsCards();
  const origin =
    desktop || (Platform.OS !== "web" && reads === false) ? getCardAddingOrigin() : null;
  return (
    <View style={styles.row}>
      <View
        accessibilityRole="list"
        accessibilityLabel={t("cards.onPhone.label")}
        style={styles.steps}
        testID="card-on-phone-steps"
      >
        <Step
          number={1}
          title={t("cards.onPhone.openApp")}
          caption={origin ? t("cards.onPhone.openAppScan") : null}
        />
        <Step number={2} title={path} caption={pathCaption} separated />
        <Step number={3} title={t("cards.onPhone.hold")} caption={holdCaption} separated />
      </View>
      {origin ? (
        <View testID="card-on-phone-code">
          <QrPlate
            // "Cards", which every page of the web app opens in the app.
            value={`${origin}${CARDS_PATH}`}
            size={CODE_SIZE}
            accessibilityLabel={t("cards.onPhone.code")}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A step on the phone, after its number. */
function Step({
  number,
  title,
  caption,
  separated = false
}: {
  number: number;
  title: string;
  caption: string | null;
  separated?: boolean;
}) {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={caption ? `${number}. ${title}, ${caption}` : `${number}. ${title}`}
      style={[styles.step, separated && styles.separated]}
    >
      <View style={styles.number}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
  steps: { flex: 1, minWidth: 0 },
  step: { flexDirection: "row", gap: 12, paddingVertical: 10 },
  separated: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  number: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle,
    alignItems: "center",
    justifyContent: "center"
  },
  numberText: { ...sans(700), fontSize: 13, color: colors.text.primary },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...sans(600), fontSize: 14, color: colors.text.primary },
  caption: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary }
}));
