import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Lead } from "@/components/ui/Heading";
import { Spinner } from "@/components/ui/Spinner";
import { PosFrame } from "@/features/terminal/PosFrame";
import { browserDevice } from "@/lib/browser-device";
import type { CardState } from "@/lib/card/card-record";
import { isCardId } from "@/lib/card/payee-book";
import { gutter, space } from "@/theme";

import { AddCardFlow, addCardBack } from "./AddCardFlow";
import { AppStoreLink, pairOnPhoneKey, storePhoneOf } from "./AppStoreLink";
import { useCardPairing } from "./useCardPairing";
import { useReadsCards } from "./useReadsCards";

/**
 * "Add a card" from "Cards" (AddCardFlow.tsx): another card paired with the account (several per
 * account), then back to "Cards" on it: "Top up the card" opens its "Top up" there
 * (CardsScreen.tsx). "Finish the migration" of a v2 card left half-done (`finish`, its id): its
 * migration's steps at once, no guide to go back to. The app on a device that reads cards only
 * (useReadsCards.ts): the web app,
 * or the app on an iPad, opened at this screen's address, says to do it on the phone; a phone's
 * browser, in its own app, with the app's store (AppStoreLink.tsx).
 */
export function PairCardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const reads = useReadsCards();
  // Nothing asked of the device before its NFC is known: "Finish the migration" starts at once.
  const programs = Platform.OS !== "web" && reads === true;
  const phone = storePhoneOf(browserDevice());
  const params = useLocalSearchParams<{ finish?: string }>();
  const finish = isCardId(params.finish) ? params.finish : null;
  const pairing = useCardPairing({ enabled: programs, another: true, finish });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  const leave = () => {
    if (pairing.cancel(true)) back();
  };
  /** Back on "Cards", the card added chosen there; `recharge`, its "Top up" open. */
  const toCards = (card: CardState, recharge: boolean) =>
    router.dismissTo({
      pathname: "/cards",
      params: {
        added: card.cardId,
        ...(recharge ? { open: "recharge" } : {}),
        // Each addition its own (its record's time): the same card deleted and added again shows.
        at: String(card.updatedAt)
      }
    });
  // A v2 card's migration has its own title ("Card migration"; "Finish the migration" for one left
  // half-done).
  const { view } = pairing;
  const migration =
    view.phase === "migrating" || view.phase === "failed"
      ? view.migration
      : view.phase === "paired"
        ? view.migrated
        : null;
  // "Finish the migration" keeps its title whatever the card turns out to need.
  const title =
    finish !== null
      ? t("cards.home.finishMigration")
      : migration
        ? t(migration.resume ? "cards.home.finishMigration" : "cards.adding.migration.heading")
        : t("cards.add");
  const goBack = programs
    ? addCardBack(pairing.view, { leave, finish: (card) => toCards(card, false) })
    : back;
  return (
    <PosFrame
      title={title}
      desktopTitle={title}
      leading={
        goBack
          ? {
              icon: "arrow-left",
              label: t("common.back"),
              onPress: goBack,
              testID: "pair-card-back"
            }
          : undefined
      }
      // Over the whole window, without the side bar: its own way back (as advanced.tsx).
      desktopAside={
        goBack ? (
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-left"
            fullWidth={false}
            onPress={goBack}
            testID="pair-card-back-desktop"
          >
            {t("common.back")}
          </Button>
        ) : null
      }
      // The steps draw their own gutter.
      flush="always"
    >
      {/* iOS's swipe leaves the screen: only where its way back does. */}
      <Stack.Screen options={{ gestureEnabled: goBack === leave || !programs }} />
      {programs ? (
        <AddCardFlow
          pairing={pairing}
          onLeave={back}
          onRecharge={(card) => toCards(card, true)}
          onLater={(card) => toCards(card, false)}
        />
      ) : reads === null ? (
        <View style={styles.waiting} testID="pair-card-waiting">
          <Spinner size={22} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.web} testID="pair-card">
          <Lead>{t(pairOnPhoneKey(phone))}</Lead>
          {phone ? <AppStoreLink phone={phone} /> : null}
        </ScrollView>
      )}
    </PosFrame>
  );
}

const styles = StyleSheet.create({
  web: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[6] },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center" }
});
