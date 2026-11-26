import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { ExternalLink } from "@/components/ui/ExternalLink";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { CARD_RELAY_SOURCE_URL } from "@/config/card";
import { browserDevice } from "@/lib/browser-device";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, radius, sans, useTheme } from "@/theme";

import { AppStoreLink, storePhoneOf } from "./AppStoreLink";
import { cardLabel } from "./card-label";
import { ComputerNote } from "./ComputerNote";
import { OnPhoneSteps } from "./OnPhoneSteps";

/*
 * "Relay and programming" in the web app: a computer reads no NFC card, the card is programmed from
 * the app on a phone. The card's relay, what it does and its source's link (to host one: a
 * computer is where a server is set up), then "Change relay" (the panel is reached from "Advanced
 * settings"), which leads to the phone's steps. Its state is checked on the phone it
 * wakes (RelayPanel.tsx): nothing of it is said here, where no phone is woken. What the note says
 * follows the browser's device (browser-device.ts): on a phone, that its app programs the card, and
 * the app's store; on an iPad, the words of a device that reads no card.
 */

/** The card's relay, what a computer cannot do, and "Change relay" (on the phone). */
export function RelayOnComputer({ card, onChange }: { card: CardState; onChange: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const browser = browserDevice();
  const phone = storePhoneOf(browser);
  return (
    <View style={styles.content} testID="card-relay-web">
      <View style={styles.relay}>
        <View style={styles.relayIcon}>
          <Icon name="circle-nodes" size={16} color={colors.text.accent} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.host} testID="card-relay-host">
            {card.relayHost}
          </Text>
          <Text style={styles.caption}>{t("cards.relay.webCaption")}</Text>
          <ExternalLink
            label={t("cards.relay.sourceLink")}
            url={CARD_RELAY_SOURCE_URL}
            testID="card-relay-source"
          />
        </View>
      </View>
      <View style={styles.note}>
        <ComputerNote>
          {t(
            phone === "android"
              ? "cards.relay.webNoteAndroid"
              : phone === "iphone"
                ? "cards.relay.webNoteIphone"
                : browser === "ipad"
                  ? "cards.relay.deviceNote"
                  : "cards.relay.webNote"
          )}
        </ComputerNote>
        {phone ? <AppStoreLink phone={phone} /> : null}
      </View>
      <View style={styles.options}>
        <ListRow
          inset={16}
          cornerRadius={radius.lg}
          accessibilityRole="button"
          accessibilityLabel={[
            t("cards.relay.change"),
            t("cards.relay.changeCaption"),
            t("cards.relay.webOnPhone")
          ].join(", ")}
          onPress={onChange}
          style={styles.option}
          testID="card-relay-change"
        >
          <View style={styles.optionIcon}>
            <Icon name="circle-nodes" size={15} color={colors.text.accent} />
          </View>
          <View style={styles.texts}>
            <Text style={styles.optionTitle}>{t("cards.relay.change")}</Text>
            <Text style={styles.optionCaption}>{t("cards.relay.changeCaption")}</Text>
          </View>
          <View style={styles.chip}>
            <Icon name="mobile-screen-button" size={11} color={colors.text.note} />
            <Text style={styles.chipText}>{t("cards.relay.webOnPhone")}</Text>
          </View>
          <Icon name="chevron-right" size={12} color={colors.text.tertiary} />
        </ListRow>
      </View>
    </View>
  );
}

/**
 * "Change relay" in the web app, or the app on a device that reads no card (`note`, why):
 * on the phone, the card in hand.
 */
export function RelayChangeOnPhone({ card, note }: { card: CardState; note?: string }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.steps} testID="card-relay-on-phone">
      {note ? (
        <View style={styles.stepsNote}>
          <ComputerNote>{note}</ComputerNote>
        </View>
      ) : null}
      <Text accessibilityRole="header" style={styles.stepsTitle}>
        {t("cards.relay.webStepsTitle")}
      </Text>
      <OnPhoneSteps
        path={[
          cardLabel(card, t),
          t("cards.home.advanced"),
          t("cards.home.relay"),
          t("cards.relay.change")
        ].join(" › ")}
        pathCaption={null}
        holdCaption={t("cards.relay.webHoldCaption")}
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // The gaps: 16 between the relay's parts, 12 under the steps' title.
  content: { gap: 16 },
  // The store's link under the note, as close as its own height allows.
  note: { gap: 4 },
  steps: { gap: 12 },
  // As far from the steps' title as the computer's note from what follows it (`content`'s gap).
  stepsNote: { marginBottom: 4 },
  relay: { flexDirection: "row", alignItems: "center", gap: 14 },
  relayIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  host: { ...sans(600), fontSize: 15, color: colors.text.primary },
  caption: { ...sans(500), fontSize: 13, lineHeight: 19, color: colors.text.secondary },
  options: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.background.surface,
    boxShadow: `${shadow.card}, inset 0 0 0 1px ${colors.border.faint}`
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 72,
    paddingVertical: 12
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  optionTitle: { ...sans(600), fontSize: 15, color: colors.text.primary },
  optionCaption: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  chipText: { ...sans(600), fontSize: 12, color: colors.text.note },
  stepsTitle: { ...sans(700), fontSize: 17, color: colors.text.primary }
}));
