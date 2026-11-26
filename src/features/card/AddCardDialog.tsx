import { useTranslation } from "react-i18next";
import { Platform, Text, View, useWindowDimensions } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { QrPlate } from "@/components/ui/QrPlate";
import { Sheet } from "@/components/ui/Sheet";
import { CARD_ADDING_PATH, getCardAddingOrigin } from "@/config/card";
import { browserDevice } from "@/lib/browser-device";
import { makeStyles, radius, sans, tracked, type, useTheme } from "@/theme";

import { AppStoreLink, storePhoneOf } from "./AppStoreLink";
import { CardShop } from "./CardShop";
import { ComputerNote } from "./ComputerNote";
import type { CardStatesRefresh } from "./states";
import { useCardsReadAgain } from "./useCardsReadAgain";

/** The dialog's width. */
const DIALOG_WIDTH = 640;

/**
 * From this window's width, the code beside the guide; under it on a narrower
 * one (a phone without NFC, an iPad's Split View), where the guide would keep less than its half.
 */
const BESIDE_MIN_WIDTH = 600;

/*
 * "Add a card" on a computer, and in the app on a device that reads no card (an iPad,
 * useReadsCards.ts): neither reads an NFC card, the phone adds it, the card held to it. What to
 * have before starting (the phone's steps say it too, AddCardSteps.tsx), a code that opens "Add a
 * card" in the app on the phone, and where to order cards (CardShop.tsx). While it shows, the
 * account's cards are read again from its relays: the card added on the phone then shows on
 * "Cards", which closes this on it once in service. Each read is told to `onRead`. On a phone's
 * browser (browser-device.ts), the app's store in place of the code, which the phone cannot scan on
 * its own screen; on an iPad's, the words of a device that reads no card.
 */
export function AddCardDialog({
  visible,
  onClose,
  onRead
}: {
  visible: boolean;
  onClose: () => void;
  onRead?: (read: CardStatesRefresh) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const beside = useWindowDimensions().width >= BESIDE_MIN_WIDTH;
  useCardsReadAgain(visible, onRead);
  const browser = browserDevice();
  const phone = storePhoneOf(browser);
  // Without a web app (a build without RP ID: local, CI), no address the phone's app opens: the
  // note alone.
  const origin = phone ? null : getCardAddingOrigin();
  return (
    <Sheet
      title={t("cards.add")}
      closeLabel={t("cards.sheet.close")}
      visible={visible}
      onClose={onClose}
      dialogWidth={DIALOG_WIDTH}
      testID="add-card-dialog"
    >
      <View style={styles.body}>
        <ComputerNote>
          {t(
            phone === "android"
              ? "cards.adding.web.noteAndroid"
              : phone === "iphone"
                ? "cards.adding.web.noteIphone"
                : Platform.OS === "web" && browser !== "ipad"
                  ? "cards.adding.web.note"
                  : "cards.adding.web.noteDevice"
          )}
        </ComputerNote>
        {phone ? <AppStoreLink phone={phone} /> : null}
        <View style={beside ? styles.row : styles.column}>
          <View style={[styles.guide, beside && styles.guideBeside]}>
            <Text accessibilityRole="header" style={styles.title}>
              {t("cards.adding.guide.title")}
            </Text>
            <GuideItem
              icon="credit-card"
              title={t("cards.adding.guide.card")}
              body={t("cards.adding.guide.cardBody")}
            />
            <GuideItem
              icon="bell"
              title={t("cards.adding.guide.notifications")}
              body={t("cards.adding.guide.notificationsBody")}
            />
            <GuideItem
              icon="hand"
              title={t("cards.adding.web.where")}
              body={t("cards.adding.web.whereBody")}
            />
          </View>
          {origin ? (
            <View style={[styles.code, !beside && styles.codeUnder]} testID="add-card-code">
              {/* Centred by its row: the plate aligns itself to the start (QrPlate). */}
              <View style={styles.plateRow}>
                <QrPlate
                  value={`${origin}${CARD_ADDING_PATH}`}
                  size={150}
                  accessibilityLabel={t("cards.adding.web.code")}
                />
              </View>
              <Text style={styles.caption}>{t("cards.adding.web.scan")}</Text>
            </View>
          ) : null}
        </View>
        <CardShop />
      </View>
    </Sheet>
  );
}

/** One thing to have before starting: its icon in its disc, its title, what it means. */
function GuideItem({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel={`${title}, ${body}`} style={styles.item}>
      <View style={styles.badge}>
        <Icon name={icon} size={15} color={colors.text.accent} />
      </View>
      <View style={styles.words}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemBody}>{body}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { gap: 16 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  column: { gap: 20 },
  guide: { gap: 14 },
  guideBeside: { flex: 1, minWidth: 0 },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  code: {
    width: 200,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.app,
    alignItems: "center",
    gap: 10
  },
  // Under the guide, its plate across the sheet: its code in the middle.
  codeUnder: { width: "100%" },
  plateRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "center" },
  caption: {
    ...sans(500),
    maxWidth: 190,
    textAlign: "center",
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  words: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  itemBody: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary }
}));
