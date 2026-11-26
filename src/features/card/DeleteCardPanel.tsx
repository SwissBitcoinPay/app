import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CheckBox } from "@/components/ui/CheckBox";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, palette, radius, sans, space, useTheme } from "@/theme";

import { cardLabel } from "./card-label";
import { OnPhoneSteps } from "./OnPhoneSteps";
import type { CardDeletion } from "./useCardDeletion";

/*
 * "Delete the card", for an empty card (one holding sats is to be emptied first, CardsScreen.tsx):
 * what goes for good, then the card in hand or not. Held to the phone, its steps show over the
 * panel (DeleteCardSteps.tsx); without it, its dialog first, then the deletion here, its wait and
 * its failure without the card said as the card's other panels say them. The web app reads no card:
 * the phone's "I have the card with me" as a choice, the card in hand by default: in hand, the way
 * there on the phone; without it, what that means said in place, and the deletion here at once.
 */

/** What goes for good, in order. */
const GONE = [
  "cards.delete.goneSettings",
  "cards.delete.goneHistory",
  "cards.delete.goneAddress"
] as const;

export function DeleteCardPanel({
  run,
  card,
  canHold,
  inHand,
  onInHand,
  onDelete,
  onRetry,
  onClose
}: {
  run: CardDeletion;
  card: CardState;
  /**
   * This device reads the card (useReadsCards.ts): its "I have the card with me"; else the web
   * app's choice, an iPad's too.
   */
  canHold: boolean;
  inHand: boolean;
  onInHand: (inHand: boolean) => void;
  /**
   * "Delete the card": its steps held to the phone, else the dialog without it; in the web app,
   * the deletion without it.
   */
  onDelete: () => void;
  /** After a failure without the card. */
  onRetry: () => void;
  /** The web app's "Got it" and "Cancel". */
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  if (run.phase === "deleting" || (run.phase === "done" && !run.inHand)) {
    return (
      <View style={styles.waiting} testID="card-delete-waiting">
        <Spinner size={18} />
        <Text style={styles.waitingText}>{t("cards.delete.deleting")}</Text>
      </View>
    );
  }
  if (run.phase === "failed" && !run.inHand) {
    return (
      <View style={styles.content}>
        <Callout tone="error" title={t("cards.delete.failedTitle")} testID="card-delete-failed">
          {/* The shared text of a failure the app did not foresee tells a pairing. */}
          {run.reason === "failed" ? t("cards.delete.failedBody") : t(`card.failure.${run.reason}`)}
        </Callout>
        <Button icon="arrows-rotate" onPress={onRetry} testID="card-delete-retry">
          {t("card.retry")}
        </Button>
      </View>
    );
  }
  // The web app's list is a little smaller.
  const web = !canHold;
  const gone = (
    <View style={styles.gone}>
      <Text style={[styles.label, web && styles.labelWeb]}>{t("cards.delete.gone")}</Text>
      <View accessibilityRole="list" style={styles.list}>
        {GONE.map((key) => (
          <View key={key} style={[styles.item, web && styles.itemWeb]}>
            <View style={[styles.mark, web && styles.markWeb]}>
              <Icon name="xmark" size={web ? 10 : 12} color={colors.danger.fg} />
            </View>
            <Text style={styles.itemText}>{t(key)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
  if (!canHold) {
    return (
      <View style={styles.webContent} testID="card-delete-web">
        {gone}
        <View style={styles.gone}>
          <Text style={[styles.label, styles.labelWeb]}>{t("cards.delete.cardLabel")}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t("cards.delete.cardLabel")}
            style={[styles.choices, desktop && styles.choicesBeside]}
            testID="card-delete-choice"
          >
            <CardChoice
              title={t("cards.delete.withCard")}
              caption={t("cards.delete.withCardCaption")}
              selected={inHand}
              onPress={() => onInHand(true)}
              testID="card-delete-with-card"
            />
            <CardChoice
              title={t("cards.delete.withoutCard")}
              caption={t("cards.delete.withoutCardCaption")}
              selected={!inHand}
              onPress={() => onInHand(false)}
              testID="card-delete-without-card"
            />
          </View>
        </View>
        {inHand ? (
          <View style={styles.withCard}>
            <OnPhoneSteps
              path={`${cardLabel(card, t)} › ${t("cards.home.delete")}`}
              pathCaption={t("cards.delete.webUnder", { inHand: t("cards.delete.inHand") })}
              holdCaption={t("cards.delete.webHoldCaption")}
            />
            <View style={styles.webActions}>
              <Button
                size="sm"
                fullWidth={false}
                style={styles.understood}
                onPress={onClose}
                testID="card-delete-understood"
              >
                {t("cards.delete.understood")}
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.withoutCard}>
            <View style={styles.note}>
              <Icon name="credit-card" size={15} color={colors.text.secondary} />
              <Text style={styles.noteText}>{t("cards.delete.withoutNote")}</Text>
            </View>
            <View style={styles.webActions}>
              <Button
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={styles.cancel}
                onPress={onClose}
                testID="card-delete-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructiveSolid"
                icon="trash-can"
                size="sm"
                fullWidth={false}
                style={styles.deleteHere}
                onPress={onDelete}
                testID="card-delete-confirm"
              >
                {t("cards.delete.confirm")}
              </Button>
            </View>
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.content}>
      {gone}
      <View style={styles.choice}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: inHand }}
          accessibilityLabel={`${t("cards.delete.inHand")}, ${t("cards.delete.inHandCaption")}`}
          onPress={() => onInHand(!inHand)}
          style={styles.checkbox}
          testID="card-delete-in-hand"
        >
          <CheckBox checked={inHand} size="lg" />
          <View style={styles.choiceTexts}>
            <Text style={styles.choiceTitle}>{t("cards.delete.inHand")}</Text>
            <Text style={styles.choiceCaption}>{t("cards.delete.inHandCaption")}</Text>
          </View>
        </Pressable>
      </View>
      <Button
        variant="destructiveSolid"
        icon="trash-can"
        onPress={onDelete}
        testID="card-delete-confirm"
      >
        {t("cards.delete.confirm")}
      </Button>
    </View>
  );
}

/** One way of the web app's choice: its dot, then what it means. */
function CardChoice({
  title,
  caption,
  selected,
  onPress,
  testID
}: {
  title: string;
  caption: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}
      testID={testID}
    >
      <View style={[styles.dot, selected ? styles.dotOn : styles.dotOff]} />
      <View style={styles.radioTexts}>
        <Text style={styles.radioTitle}>{title}</Text>
        <Text style={styles.radioCaption}>{caption}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { gap: space[5] },
  waiting: { alignItems: "center", gap: space[3], paddingVertical: space[6] },
  waitingText: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  gone: { gap: 10 },
  label: {
    ...sans(600),
    fontSize: 12.5,
    paddingHorizontal: 4,
    color: colors.text.secondary
  },
  list: { gap: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger.bg
  },
  itemText: { ...sans(500), flex: 1, fontSize: 14, lineHeight: 21, color: colors.text.primary },
  choice: {
    borderRadius: radius.lg,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: colors.background.app
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingVertical: 4
  },
  choiceTexts: { flex: 1, gap: 1 },
  choiceTitle: { ...sans(600), fontSize: 14.5, color: colors.text.primary },
  choiceCaption: { ...sans(500), fontSize: 12.5, lineHeight: 17, color: colors.text.secondary },
  // The web app's.
  labelWeb: { paddingHorizontal: 0 },
  itemWeb: { alignItems: "flex-start" },
  markWeb: { width: 24, height: 24, borderRadius: 12, marginTop: 1 },
  webContent: { gap: 18 },
  choices: { gap: 10 },
  choicesBeside: { flexDirection: "row" },
  radio: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.surface
  },
  radioOn: { boxShadow: `inset 0 0 0 2px ${palette.orange}` },
  radioOff: { boxShadow: `inset 0 0 0 1.5px ${colors.border.subtle}` },
  dot: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface
  },
  dotOn: { boxShadow: `inset 0 0 0 6px ${palette.orange}` },
  // A ring of 30 % ink: the nearest token's 35 %.
  dotOff: { boxShadow: `inset 0 0 0 2px ${colors.border.strong}` },
  radioTexts: { flex: 1, minWidth: 0, gap: 2 },
  radioTitle: { ...sans(600), fontSize: 14.5, color: colors.text.primary },
  radioCaption: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
  withCard: { gap: 14 },
  withoutCard: { gap: 18 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.app
  },
  noteText: { ...sans(500), flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.text.note },
  webActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  understood: { minWidth: 180 },
  cancel: { minWidth: 112 },
  deleteHere: { minWidth: 200 }
}));
