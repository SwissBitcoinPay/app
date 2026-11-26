import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StepScreen } from "@/components/layout/StepScreen";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Icon } from "@/components/ui/Icon";
import { QrPlate } from "@/components/ui/QrPlate";
import { Spinner } from "@/components/ui/Spinner";
import { getCardAddingOrigin } from "@/config/card";
import { AppStoreLink, storePhoneOf } from "@/features/card/AppStoreLink";
import { AddCardFlow, writingCard } from "@/features/card/AddCardFlow";
import { cardLabel } from "@/features/card/card-label";
import { CardFaceView } from "@/features/card/CardFaceView";
import { useCardAdded } from "@/features/card/useCardsReadAgain";
import { useCardPairing } from "@/features/card/useCardPairing";
import { useReadsCards } from "@/features/card/useReadsCards";
import { useOnboarding } from "@/features/onboarding/state";
import { useBack } from "@/features/onboarding/useBack";
import { useSaveStep } from "@/features/onboarding/useSaveStep";
import { browserDevice, type BrowserDevice } from "@/lib/browser-device";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, palette, sans, space } from "@/theme";

/**
 * The sign-up's card step (the steps of "Add a card", AddCardFlow.tsx, under the sign-up's header;
 * or, when the account has its card already, the card added). Once added, "Top up the card" or
 * "Later" ends the sign-up: the card holder gets the
 * app, through the setup screen that prepares this device's point of sale, which then opens
 * "Cards" (useAccountSetup), its "Top up" open for the card when asked. "Cancel" goes
 * back to the steps to come ("Start"); the header's back to the previous step, never while
 * the card is written to. Only the app on a phone programs a card: the web app
 * shows how to continue there, a code on a computer, as does the app on a device that reads no
 * card (an iPad, useReadsCards.ts), and follows the phone: the card added there shows here ("Your
 * card is added"), which ends the sign-up the same way.
 */
export default function CardScreen() {
  const { t } = useTranslation();
  const styles = useStyles();
  const router = useRouter();
  const desktop = useIsDesktop();
  const back = useBack("/");
  const native = Platform.OS !== "web";
  // Not known yet: the pairing's wait shows (AddCardFlow), nothing asked of the device meanwhile.
  const reads = useReadsCards();
  const pairing = useCardPairing({ enabled: native && reads === true });
  const finishing = useSaveStep();
  // Which way the sign-up ends: its button waits while the account saves (up to its sync).
  const [ending, setEnding] = useState<"recharge" | "later">("later");
  const { setBackBlocked } = useOnboarding();
  const writing = writingCard(pairing.view);
  // The steps' frame: the bottom safe area below their actions (PosFrame's, in "Cards").
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setBackBlocked(writing);
    return () => setBackBlocked(false);
  }, [writing, setBackBlocked]);

  const finish = (card: CardState, recharge: boolean) => {
    // A second tap while it saves: ignored by the save, the first way kept.
    if (finishing.saving) return;
    setEnding(recharge ? "recharge" : "later");
    finishing.save(
      { signUp: "done" },
      () => {
        if (!finishing.mounted.current) return;
        router.push(
          recharge
            ? { pathname: "/onboarding/setup", params: { recharge: card.cardId } }
            : "/onboarding/setup"
        );
      },
      { always: true }
    );
  };

  if (reads === false) {
    return (
      <CardOnWeb
        desktop={desktop}
        device={native}
        browser={browserDevice()}
        onBack={back}
        onRecharge={(card) => finish(card, true)}
        onLater={(card) => finish(card, false)}
        finishing={finishing.saving ? ending : null}
        failure={finishing.failed ? t(finishing.errorKey) : null}
      />
    );
  }

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]} testID="onboarding-card">
      {/* iOS's swipe goes back to the previous step: never while the card is written to. */}
      <Stack.Screen options={{ gestureEnabled: !writing }} />
      <AddCardFlow
        pairing={pairing}
        onLeave={null}
        onRecharge={(card) => finish(card, true)}
        onLater={(card) => finish(card, false)}
        finishing={finishing.saving ? ending : null}
        extra={
          finishing.failed ? (
            <ErrorMessage testID="card-finish-failed">{t(finishing.errorKey)}</ErrorMessage>
          ) : null
        }
      />
    </View>
  );
}

/**
 * The card step in the web app, which reads no card: on a computer, a code that opens this step in
 * the app on the phone (the address of the build's web app, all of whose pages the installed app
 * opens; the sign-up resumes there once logged in with the same passkey), and the
 * wait for it; on a phone's browser, what to do in the app. In the app on a device that reads no
 * card (`device`), the computer's at any width, and so in an iPad's browser. A phone's browser is
 * told by its device, not its width (browser-device.ts): an Android phone or an iPhone is told to
 * use its own app, with the app's store. The account's cards are
 * read meanwhile: once the phone added one, it shows here, with what ends the sign-up.
 */
function CardOnWeb({
  desktop,
  device,
  browser,
  onBack,
  onRecharge,
  onLater,
  finishing,
  failure
}: {
  desktop: boolean;
  /** The app on a device that reads no card (an iPad), not the web app. */
  device: boolean;
  /** The web app's device (browser-device.ts): null in the app. */
  browser: BrowserDevice | null;
  onBack: () => void;
  onRecharge: (card: CardState) => void;
  onLater: (card: CardState) => void;
  /** Which way the sign-up ends, while it saves. */
  finishing: "recharge" | "later" | null;
  failure: string | null;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const beside = useWindowDimensions().width >= BESIDE_MIN_WIDTH;
  const added = useCardAdded();
  if (added) {
    return (
      <StepScreen
        footer={
          // "Later" right under "Top up the card", no gap between them.
          <View>
            <Button
              icon="plus"
              onPress={() => onRecharge(added)}
              loading={finishing === "recharge"}
              disabled={finishing === "later"}
              testID="card-added-recharge"
            >
              {t("cards.adding.steps.recharge")}
            </Button>
            <Button
              variant="text"
              size="md"
              onPress={() => onLater(added)}
              loading={finishing === "later"}
              disabled={finishing === "recharge"}
              testID="card-added-later"
            >
              {t("cards.adding.steps.later")}
            </Button>
          </View>
        }
        testID="onboarding-card-added"
      >
        <View style={styles.added}>
          <View>
            <ScreenTitle>{t("card.addedTitle")}</ScreenTitle>
            <Lead style={styles.addedLead}>{t("card.addedDescription")}</Lead>
          </View>
          {/* Its face says it (its name in the title's words): drawn only. */}
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.addedFace}
          >
            <CardFaceView card={added} label={cardLabel(added, t)} width={ADDED_FACE_WIDTH} />
            <View style={styles.addedBadge}>
              <Icon name="check" size={15} color={palette.white} />
            </View>
          </View>
          {/* Under the card, as the phone says it under its steps (AddCardFlow's `extra`). */}
          {failure ? <ErrorMessage testID="card-finish-failed">{failure}</ErrorMessage> : null}
        </View>
      </StepScreen>
    );
  }
  const phone = storePhoneOf(browser);
  if (phone || (!desktop && !device && browser !== "ipad")) {
    return (
      <StepScreen
        footer={
          <Button variant="text" size="md" onPress={onBack}>
            {t("common.back")}
          </Button>
        }
      >
        <ScreenTitle>{t("card.webTitle")}</ScreenTitle>
        <Lead>
          {t(
            phone === "android"
              ? "card.webDescriptionAndroid"
              : phone === "iphone"
                ? "card.webDescriptionIphone"
                : "card.webDescription"
          )}
        </Lead>
        {phone ? (
          <View style={styles.store}>
            <AppStoreLink phone={phone} />
          </View>
        ) : null}
      </StepScreen>
    );
  }
  // Without a web app (no RP ID: local, CI), no address the phone's app opens: no code.
  const origin = getCardAddingOrigin();
  // The app's own words: "this device", "this screen", and no code to speak of without one. An
  // iPad's browser says "this device" too: an iPad is no computer.
  const description =
    device || browser === "ipad"
      ? origin
        ? t("card.deviceDescription")
        : t("card.deviceDescriptionNoCode")
      : t("card.computerDescription");
  // The title at the top, as every step's; the code in the middle of what is left; the wait at the
  // bottom, as far from it as the title is from the top.
  return (
    <StepScreen fill testID="onboarding-card-computer">
      <View style={styles.computer}>
        <ScreenTitle>{t("card.computerTitle")}</ScreenTitle>
        <View style={beside ? styles.computerRow : styles.computerColumn} testID="card-code-row">
          <Lead style={[styles.computerLead, beside && styles.computerLeadBeside]}>
            {description}
          </Lead>
          {origin ? (
            <QrPlate
              value={`${origin}/onboarding/card`}
              size={200}
              accessibilityLabel={t("card.computerCode")}
            />
          ) : null}
        </View>
        <View style={styles.waiting} accessibilityLiveRegion="polite" testID="card-waiting">
          <Spinner size={18} />
          <Text style={styles.waitingText}>
            {t(device ? "card.deviceWaiting" : "card.computerWaiting")}
          </Text>
        </View>
      </View>
    </StepScreen>
  );
}

/** The card added's face. */
const ADDED_FACE_WIDTH = 220;

/**
 * From this window's width, the code beside the text; under it on a narrower one
 * (a phone without NFC, an iPad's Split View), where the text would keep less than its half.
 */
const BESIDE_MIN_WIDTH = 600;

const useStyles = makeStyles(({ colors, shadow }) => ({
  flex: { flex: 1, minWidth: 0 },
  // The store's link under the description.
  store: { marginTop: space[3] },
  // The wait 108 px from the bottom, as the title is from the
  // top (the step's 24 px under the header's 84).
  computer: { flex: 1, justifyContent: "space-between", gap: 22, paddingBottom: 84 },
  computerRow: { flexDirection: "row", alignItems: "center", gap: 40 },
  computerColumn: { alignItems: "center", gap: 24 },
  computerLead: { alignSelf: "stretch", marginTop: 0, fontSize: 15, lineHeight: 15 * 1.5 },
  computerLeadBeside: { flex: 1, minWidth: 0 },
  waiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.background.subtle
  },
  waitingText: { ...sans(500), flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.text.note },
  added: { gap: 28 },
  addedLead: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  // Lifted off the page, its check over its corner.
  addedFace: { alignSelf: "flex-start", borderRadius: 12, boxShadow: shadow.held },
  addedBadge: {
    position: "absolute",
    right: -10,
    bottom: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success.solid,
    boxShadow: `0 0 0 4px ${colors.background.app}`
  }
}));
