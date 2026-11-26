import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import {
  getAccountSettings,
  getAccountWalletId,
  subscribeAccount
} from "@/features/account/session";
import { cardStatesOnDeviceOf, knownCardStates, subscribeCardStates } from "@/features/card/states";
import { planRecoveryReminders } from "@/features/recovery-check/reminders";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import { isCardShown, type CardState } from "@/lib/card/card-record";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { makeStyles, sans, type, useTheme } from "@/theme";

import { askNotifications, markNotificationsOffered, shouldOfferNotifications } from "./offer";

/**
 * "Stay informed": once the app is set up, the first time the
 * owner's app opens on this device (a sign-up done, an account opened on a new device, an app
 * updated), a panel says what the phone's notifications are for, the important information only:
 * the check of the 12 words before payments are blocked (src/features/recovery-check/), the card
 * payments that ask for an answer (an account with a card only: cardsShown); never advertising.
 * "Allow notifications" asks the system, "Not now" (the scrim, the system's back too) leaves it:
 * either way never offered again on this device (offer.ts), "Log out" aside (device-wipe.ts). Not
 * offered where the system can no longer ask, or notifications are allowed already ("Cards" asked).
 * The apps only
 * (the web plans no notification), never in till mode nor on an employee's device (AppShell.tsx).
 * Built as "Add a card"'s guide (AddCardDialog.tsx).
 */
export function NotificationsOffer({
  open,
  onShownChange
}: {
  open: boolean;
  /** Told when the panel shows and when it leaves: another one waits meanwhile (AppShell.tsx). */
  onShownChange?: (shown: boolean) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const settings = useAccountSettings();
  const ready = open && settings !== null && settings.signUp === "done";
  const [offered, setOffered] = useState(false);
  const [asking, setAsking] = useState(false);
  // The account whose device copy keeps a card (keepsCards): another one opened since keeps none.
  const [cardsKeptOf, setCardsKeptOf] = useState<string | null>(null);
  const walletId = useSyncExternalStore(subscribeAccount, getAccountWalletId);
  const known = useSyncExternalStore(subscribeCardStates, () => knownCardStates(walletId));
  const cards = cardsShown(known, walletId !== null && cardsKeptOf === walletId);
  // Read once per launch: a read the account's closing interrupted is read again at its opening.
  const read = useRef(false);

  useEffect(() => {
    if (!ready || read.current) return;
    read.current = true;
    let live = true;
    const reading = getAccountWalletId();
    void Promise.all([shouldOfferNotifications(), keepsCards(reading)]).then(([offer, kept]) => {
      if (!live) {
        read.current = false;
        return;
      }
      setCardsKeptOf(kept ? reading : null);
      if (offer) setOffered(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);

  const shown = ready && offered;
  useEffect(() => {
    onShownChange?.(shown);
  }, [shown, onShownChange]);

  const answer = async (allow: boolean) => {
    if (asking) return;
    setAsking(true);
    // Answered as soon as tapped: the system's prompt, if the app ends meanwhile, answers it.
    await markNotificationsOffered(nowUnix());
    if (allow && (await askNotifications(t))) {
      // The check's notifications, planned only where they are allowed (reminders.ts).
      const check = getAccountSettings()?.recoveryCheck;
      if (check) await planRecoveryReminders(check, nowUnix(), t);
    }
    setAsking(false);
    setOffered(false);
  };

  return (
    <Sheet
      title={t("notificationsOffer.title")}
      closeLabel={t("navigation.close")}
      visible={shown}
      onClose={() => void answer(false)}
      dismissible={!asking}
      testID="notifications-offer"
    >
      <Text style={styles.lead}>{t("notificationsOffer.lead")}</Text>
      <View style={styles.items}>
        <OfferItem
          icon="key"
          title={t("notificationsOffer.words")}
          body={t("notificationsOffer.wordsBody")}
        />
        {cards ? (
          <OfferItem
            icon="credit-card"
            title={t("notificationsOffer.cards")}
            body={t("notificationsOffer.cardsBody")}
          />
        ) : null}
      </View>
      <Text style={styles.note}>{t("notificationsOffer.note")}</Text>
      <View style={styles.actions}>
        <Button
          icon="bell"
          loading={asking}
          onPress={() => void answer(true)}
          testID="notifications-offer-allow"
        >
          {t("notificationsOffer.allow")}
        </Button>
        <Button
          variant="secondary"
          disabled={asking}
          onPress={() => void answer(false)}
          testID="notifications-offer-later"
        >
          {t("notificationsOffer.later")}
        </Button>
      </View>
    </Sheet>
  );
}

/**
 * Whether the panel tells the card payments: only for an account with a card "Cards" shows (in
 * service or being migrated: isCardShown). What this session read of the cards decides once it read
 * them (the account's sync at its opening, states.ts), else what the device keeps of them (`kept`,
 * read with the offer). Without a card, the line is left out: a card paired later asks the system
 * itself (pairing.ts).
 */
function cardsShown(known: readonly CardState[], kept: boolean): boolean {
  // The session's states hold the device's copy merged with the relays': they decide once read.
  return known.length > 0 ? known.some(isCardShown) : kept;
}

/** Whether this device keeps a card of `walletId`'s account shown (cardsShown). Never rejects. */
async function keepsCards(walletId: string | null): Promise<boolean> {
  if (!walletId) return false;
  try {
    return (await cardStatesOnDeviceOf(walletId)).some(isCardShown);
  } catch (error) {
    // The line left out: the session's sync tells, once it read the cards.
    logFailure("Reading the cards kept for the notifications offer failed", error);
    return false;
  }
}

/** What the notifications tell: its icon in its disc, its title, what it means. */
function OfferItem({ icon, title, body }: { icon: IconName; title: string; body: string }) {
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
  lead: { ...sans(500), fontSize: 15, lineHeight: 22, color: colors.text.secondary },
  items: { gap: 14 },
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
  itemBody: { ...sans(500), fontSize: 12.5, lineHeight: 18, color: colors.text.secondary },
  note: { ...sans(500), fontSize: type.caption, lineHeight: 18, color: colors.text.secondary },
  actions: { gap: 10 }
}));
