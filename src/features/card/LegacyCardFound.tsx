import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useOptionalPos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { defaultCardColor } from "@/lib/card/card-record";
import type { LegacyCard } from "@/lib/card/legacy-card";
import type { LegacyVisual } from "@/lib/card/legacy-visual";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { AMOUNT_EM, gutter, makeStyles, radius, sans, TITLE_EM, tracking } from "@/theme";

import { cardLabel } from "./card-label";
import { CardFaceView, CardUnderFace } from "./CardFaceView";
import { ACTIONS_BOTTOM } from "./CardStepsView";
import { useVisualPreview } from "./issuer-visual";

/*
 * "Swiss Bitcoin Pay card detected": a v2 card held for the pairing that holds a balance, read from
 * its server first; what will happen, then "Transfer and migrate" or "Cancel". The card's face is
 * its printed visual when its server gave it, downloaded as the screen shows (issuer-visual.ts: the
 * same image its migration keeps, the CDN asked once), the sand meanwhile, its printed number small
 * under it as in "Cards" (CardUnderFace), nothing written over it once it shows (`bare`, as
 * HoldStage); its colour, its label and the number written on it, when there is none or it could
 * not be downloaded. The third line ("It keeps its visual and its number") only when its server
 * gave them; the transfer never said free of fees, which nothing here proves (the card's wallet may
 * pay a fee to receive it, the server one to send it); in the sign-up, the balance in sats only:
 * its point of sale, and so its currency's rate, comes once the sign-up is done.
 */

/** The face's width: 232 px. */
const FACE_WIDTH = 232;

export function LegacyCardFound({
  card,
  amountSats,
  visual,
  onConfirm,
  onCancel
}: {
  card: LegacyCard;
  /** Null while its balance is read. */
  amountSats: bigint | null;
  visual: LegacyVisual | null;
  onConfirm: () => void;
  /** "Cancel": back to "Cards", or to the guide in the sign-up. */
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // The device's own (as the point of sale's), read here: the sign-up has no point of sale yet.
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const pos = useOptionalPos();
  const label = cardLabel({ name: "", cardId: card.cardId }, t);
  const preview = useVisualPreview(visual);
  const steps = [
    t("cards.adding.migration.whatTransfer"),
    t("cards.adding.migration.whatErase"),
    ...(visual ? [t("cards.adding.migration.whatVisual")] : [])
  ];
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.body} testID="legacy-card-found">
        <Text accessibilityRole="header" style={styles.title}>
          {t("cards.adding.migration.foundTitle")}
        </Text>
        <View
          accessible
          accessibilityLabel={visual ? `${label}, ${visual.number}` : label}
          testID="legacy-card-face"
        >
          <CardFaceView
            card={{
              cardId: card.cardId,
              name: "",
              look: { kind: "color", color: defaultCardColor(card.cardId) },
              issuer: null
            }}
            label={label}
            legacy={visual ? { number: visual.number, white: visual.white, image: preview } : null}
            width={FACE_WIDTH}
            bare
            testID="legacy-card-visual"
          />
          <CardUnderFace
            number={visual && preview.status !== "none" ? visual.number : null}
            width={FACE_WIDTH}
          />
        </View>
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>{t("cards.adding.migration.toTransfer")}</Text>
          {amountSats === null ? (
            <View style={styles.reading} testID="legacy-card-reading">
              <Spinner size={18} />
              <Text style={styles.readingText}>{t("cards.adding.migration.reading")}</Text>
            </View>
          ) : (
            <>
              <Text
                accessibilityLabel={t("cards.adding.migration.amountA11y", {
                  amount: formatInteger(amountSats, languageTag)
                })}
                style={styles.amount}
                testID="legacy-card-amount"
              >
                {formatInteger(amountSats, languageTag)}
                <Text style={styles.unit}> sats</Text>
              </Text>
              {pos ? <FiatLine amountSats={amountSats} /> : null}
            </>
          )}
        </View>
        <View
          accessibilityRole="list"
          accessibilityLabel={t("cards.adding.migration.whatLabel")}
          style={styles.list}
        >
          {steps.map((text, index) => (
            <View key={text} style={[styles.item, index < steps.length - 1 && styles.separated]}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.itemText}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button
          loading={amountSats === null}
          disabled={amountSats === null}
          onPress={onConfirm}
          testID="card-migrate"
        >
          {t("cards.adding.migration.confirm")}
        </Button>
        <Button variant="text" onPress={onCancel} testID="card-migrate-cancel">
          {t("cards.adding.steps.cancel")}
        </Button>
      </View>
    </View>
  );
}

/** The balance in the point of sale's currency, at its rate: nothing without one. */
function FiatLine({ amountSats }: { amountSats: bigint }) {
  const styles = useStyles();
  const fiat = useWalletFormat().fiat(amountSats);
  return fiat ? (
    <Text style={styles.fiat} testID="legacy-card-fiat">
      {fiat}
    </Text>
  ) : null;
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  screen: { flex: 1 },
  body: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: gutter,
    paddingTop: 4,
    paddingBottom: 20
  },
  title: {
    ...sans(700),
    fontSize: 22,
    letterSpacing: tracking(TITLE_EM, 22),
    textAlign: "center",
    color: colors.text.primary
  },
  balance: { alignItems: "center", gap: 2 },
  balanceLabel: { ...sans(600), fontSize: 12.5, color: colors.text.secondary },
  reading: { flexDirection: "row", alignItems: "center", gap: 8, height: 46 },
  readingText: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  amount: {
    ...sans(600),
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    lineHeight: 46,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  unit: { ...sans(600), fontSize: 16, color: colors.text.secondary },
  fiat: {
    ...sans(500),
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  list: {
    alignSelf: "stretch",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  separated: { borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: { ...sans(700), fontSize: 12, color: colors.text.accent },
  itemText: {
    flex: 1,
    minWidth: 0,
    ...sans(500),
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text.primary
  },
  // As CardStepsView's: the frame keeps the bottom safe area.
  actions: { paddingHorizontal: gutter, paddingBottom: ACTIONS_BOTTOM, gap: 6 }
}));
