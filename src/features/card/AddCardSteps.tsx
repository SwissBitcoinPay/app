import type { TFunction } from "i18next";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { Callout } from "@/components/ui/Callout";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import type { CardState } from "@/lib/card/card-record";
import { hasNfc, openNfcSettings } from "@/lib/card/nfc-session";
import { openSystemSettings } from "@/lib/system-ui";

import { activationNotice, type ActivationNotice } from "./activation-notice";
import { cardLabel } from "./card-label";
import { CardShop } from "./CardShop";
import {
  CardStepsView,
  type CardStep,
  type CardStepsAction,
  type CardStepState,
  type StepTitles
} from "./CardStepsView";
import type { PairingFailure, PairingStep } from "./pairing";
import type { PairingView } from "./useCardPairing";

/*
 * "Add a card", its steps: the notifications and the card's relay checked, the card held to the
 * phone, programmed for this wallet, then activated on its relay. Before "Start" (phase "guide"),
 * the same screen: "Before you start", which card to hold, and every step to come, each saying what
 * it asks: the steps on the first screen, the card programmed from it, and where to order cards
 * (CardShop.tsx). Nothing is asked of the phone (its notifications, its NFC) before "Start". Done:
 * "Top up the card" or "Later"; failed: the step where it stopped says what to do, with its fix
 * when there is one ("Open settings"), then "Try again". "Cancel" while nothing is written to the
 * card, never during the programming, which would leave the card half-programmed (its next pairing
 * would resume it, as after the card taken away). Also: the failures of every step, and the
 * activation not done yet (activation-notice.ts).
 */

/** The steps, in their order. */
const ORDER: readonly PairingStep[] = [
  "notifications",
  "relay",
  "card",
  "programming",
  "activating"
];

/**
 * Where a failure is said when it is not where the attempt was: the NFC, before any check, at the
 * card's step; what the card held is, at the card's step too (its reading began the programming).
 */
const SAID_AT: Partial<Record<PairingFailure, PairingStep>> = {
  nfcUnavailable: "card",
  notBlank: "card",
  notBoltCard: "card",
  ownCard: "card",
  notThisCard: "card",
  versionsExhausted: "card"
};

/** Failures of no step (the account's session closed): said under the steps. */
export const OFF_STEPS: readonly PairingFailure[] = ["noAccount"];

/** Failures after which "Try again" goes on from where the attempt stopped (pairing.ts). */
const GOES_ON: readonly PairingFailure[] = [
  "cardLost",
  "verifyFailed",
  "failed",
  "cancelled",
  "relayUnreachable",
  "recordsUnreachable"
];

/** What fixes a failure: the app's settings (its notifications), or Android's NFC settings. */
export type StepFix = "settings" | "nfcSettings";

export type StepFailure = { title: string | null; caption: string; fix: StepFix | null };

/**
 * The button under a failed step that opens the settings fixing it, once it is of use: Android's
 * NFC settings only on a phone that has NFC (one without has no such screen).
 */
export function useFixAction(fix: StepFix | null, t: TFunction): CardStepsAction | null {
  const [nfc, setNfc] = useState<boolean | null>(null);
  useEffect(() => {
    if (fix !== "nfcSettings") return;
    let current = true;
    void hasNfc().then((present) => {
      if (current) setNfc(present);
    });
    return () => {
      current = false;
    };
  }, [fix]);
  if (fix === null || (fix === "nfcSettings" && nfc !== true)) return null;
  return {
    label: t("card.openSettings"),
    icon: "gear",
    onPress: () => void (fix === "nfcSettings" ? openNfcSettings() : openSystemSettings())
  };
}

/**
 * What a failed step of an addition (or, `migration`, of a v2 card's migration) says: its own
 * title for the failures the screen names (null: the step's), then what to do. Its own words where
 * the shared ones (card.failure) would say more than is proven here ("Your card was not changed"
 * after an attempt that had it in the field), or speak of "the pairing".
 */
export function stepFailureOf(
  reason: PairingFailure,
  t: TFunction,
  migration = false
): StepFailure {
  const ios = Platform.OS === "ios";
  const host = DEFAULT_CARD_RELAY_HOST;
  switch (reason) {
    case "notificationsDenied":
      return {
        title: t("cards.adding.steps.notificationsDenied"),
        caption: t("cards.adding.steps.notificationsDeniedCaption"),
        fix: "settings"
      };
    case "nfcUnavailable":
      // iOS has no NFC setting: an iPhone always reads cards, an iPad never.
      return {
        title: t("cards.adding.steps.nfcUnavailable"),
        caption: t("card.failure.nfcUnavailable"),
        fix: ios ? null : "nfcSettings"
      };
    case "cardLost":
      return {
        title: t("cards.adding.steps.lost"),
        caption: migration
          ? t(ios ? "cards.adding.migration.lostIos" : "cards.adding.migration.lostAndroid")
          : t(ios ? "cards.adding.steps.lostIos" : "cards.adding.steps.lostAndroid"),
        fix: null
      };
    case "migrationDrainFailed":
      return {
        title: t("cards.adding.migration.notTransferred"),
        caption: t("card.failure.migrationDrainFailed"),
        fix: null
      };
    case "migrationOverDailyLimit":
      return {
        title: t("cards.adding.migration.notTransferred"),
        caption: t("card.failure.migrationOverDailyLimit"),
        fix: null
      };
    case "migrationReceiptPending":
      return {
        title: t("cards.adding.migration.transferUnconfirmed"),
        caption: t("card.failure.migrationReceiptPending"),
        fix: null
      };
    case "relayUnreachable":
      return {
        title: t("cards.adding.steps.relayUnreachable"),
        caption: t("cards.adding.steps.relayUnreachableCaption", { host }),
        fix: null
      };
    case "relayIncompatible":
      return {
        title: t("cards.adding.steps.relayIncompatible"),
        caption: t("cards.adding.steps.relayIncompatibleCaption", { host }),
        fix: null
      };
    case "recordsUnreachable":
      return {
        title: t("cards.adding.steps.recordsUnreachable"),
        caption: t("cards.adding.steps.recordsUnreachableCaption"),
        fix: null
      };
    case "notBlank":
      return {
        title: t("cards.adding.steps.notBlank"),
        caption: t("card.failure.notBlank"),
        fix: null
      };
    case "notBoltCard":
      return {
        title: t("cards.adding.steps.notBoltCard"),
        caption: t("cards.adding.steps.notBoltCardCaption"),
        fix: null
      };
    case "ownCard":
      return {
        title: t("cards.adding.steps.ownCard"),
        caption: t("card.failure.ownCard"),
        fix: null
      };
    case "verifyFailed":
      return {
        title: t("cards.adding.steps.verifyFailed"),
        caption: t("card.failure.verifyFailed"),
        fix: null
      };
    case "cancelled":
      return { title: null, caption: t("cards.adding.steps.cancelled"), fix: null };
    case "failed":
      return {
        title: null,
        caption: t(migration ? "cards.adding.migration.failed" : "cards.adding.steps.failed"),
        fix: null
      };
    default:
      return { title: null, caption: t(`card.failure.${reason}`), fix: null };
  }
}

/** The card's step, held to the phone: what the phone waits for, then whether it took it. */
export function heldTitles(t: TFunction, todo: string, done: string): StepTitles {
  return {
    todo,
    running: t("cards.adding.steps.cardRunning"),
    done,
    failed: t("cards.adding.steps.cardFailed")
  };
}

/** The activation on the card's relay, its last step (an addition's, a migration's). */
export function activationTitles(t: TFunction, done: string): StepTitles {
  return {
    todo: t("cards.adding.steps.activatingTodo"),
    running: t("cards.adding.steps.activatingRunning"),
    done,
    failed: t("cards.adding.steps.activatingFailed")
  };
}

/**
 * The activation's title once done but not as it should (activation-notice.ts): activated without
 * push (it pays while the app shows), or not yet (its relay did not take it: it does not pay).
 */
export function activationWarning(notice: ActivationNotice | null, t: TFunction): string | null {
  return notice?.message === "card.activationPending"
    ? t("cards.adding.steps.activatingPending")
    : null;
}

export type AddCardActions = {
  /** "Start", before any attempt (phase "guide"). */
  onStart: () => void;
  onRetry: () => void;
  /** "Cancel": null when it is not offered (the sign-up offers it from the guide's start). */
  onCancel: (() => void) | null;
  onRecharge: (card: CardState) => void;
  onLater: (card: CardState) => void;
  /** Which of the two is under way (the sign-up saves before it goes on): it waits, the other too. */
  finishing?: "recharge" | "later" | null;
};

export function AddCardSteps({
  view,
  actions,
  extra = null
}: {
  view: Extract<PairingView, { phase: "guide" | "running" | "failed" | "paired" }>;
  actions: AddCardActions;
  /** Under the steps, after what they leave to know: what the screen adds (a failure to save). */
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const ios = Platform.OS === "ios";
  const host = DEFAULT_CARD_RELAY_HOST;
  const guide = view.phase === "guide";
  const running = view.phase === "running" ? view : null;
  const failed = view.phase === "failed" ? view : null;
  const paired = view.phase === "paired" ? view : null;

  // Where the attempt got: the steps before it are done. A failure is said at its own step when it
  // has one (the NFC, the card held), never later than where the attempt was. Before "Start",
  // or an attempt waiting for the one before it to stop: all its steps to come.
  const reachedAt = guide
    ? -1
    : running
      ? running.step === null
        ? -1
        : ORDER.indexOf(running.step)
      : failed
        ? failed.step === null || failed.step === "transferring"
          ? 0
          : ORDER.indexOf(failed.step)
        : ORDER.length;
  const saidAt = failed
    ? OFF_STEPS.includes(failed.reason)
      ? null
      : (SAID_AT[failed.reason] ?? (failed.step === null ? null : ORDER[reachedAt]))
    : null;
  const doneBefore = saidAt === null ? reachedAt : Math.min(reachedAt, ORDER.indexOf(saidAt));
  const failure = failed ? stepFailureOf(failed.reason, t) : null;
  const fix = useFixAction(failure?.fix ?? null, t);
  const notice = paired ? activationNotice(paired.activation) : null;

  const stateOf = (step: PairingStep): CardStepState => {
    const index = ORDER.indexOf(step);
    if (failed) return step === saidAt ? "failed" : index < doneBefore ? "done" : "todo";
    if (paired) return step === "activating" && notice ? "warning" : "done";
    if (index < reachedAt) return "done";
    if (index > reachedAt) return "todo";
    return step === "card" ? "card" : "running";
  };
  // A failure: its step says what to do; the steps not reached keep their title only. Done not as
  // it should, its `warning` title when it has one.
  const stepOf = (
    step: PairingStep,
    titles: StepTitles,
    caption: string,
    warning: string | null = null
  ): CardStep => {
    const state = stateOf(step);
    if (state === "failed" && failure) {
      return { key: step, titles, title: failure.title, caption: failure.caption, state, fix };
    }
    return {
      key: step,
      titles,
      title: state === "warning" ? warning : null,
      caption: failed && state === "todo" ? null : caption,
      state
    };
  };
  // A card paired before this screen (the sign-up resumed): its steps are not this screen's.
  const steps: CardStep[] =
    paired && paired.activation === null
      ? []
      : [
          stepOf(
            "notifications",
            {
              todo: t("cards.adding.steps.notificationsTodo"),
              running: t("cards.adding.steps.notificationsRunning"),
              done: t("cards.adding.steps.notifications"),
              failed: t("cards.adding.steps.notificationsFailed")
            },
            // To come or under way: what the phone will ask, and why; once allowed, why.
            stateOf("notifications") === "done"
              ? t("cards.adding.steps.notificationsCaption")
              : t("cards.adding.guide.notificationsBody")
          ),
          stepOf(
            "relay",
            {
              todo: t("cards.adding.steps.relayTodo"),
              running: t("cards.adding.steps.relayRunning"),
              done: t("cards.adding.steps.relay"),
              failed: t("cards.adding.steps.relayFailed")
            },
            host
          ),
          stepOf(
            "card",
            heldTitles(t, t("cards.adding.steps.cardTodo"), t("cards.adding.steps.card")),
            t(ios ? "cards.adding.steps.cardIos" : "cards.adding.steps.cardAndroid")
          ),
          stepOf(
            "programming",
            {
              todo: t("cards.adding.steps.programmingTodo"),
              running: t("cards.adding.steps.programmingRunning"),
              done: t("cards.adding.steps.programming"),
              failed: t("cards.adding.steps.programmingFailed")
            },
            t("cards.adding.steps.programmingCaption")
          ),
          stepOf(
            "activating",
            activationTitles(t, t("cards.adding.steps.activating")),
            t("cards.adding.steps.activatingCaption"),
            activationWarning(notice, t)
          )
        ];

  let title: string;
  let subtitle: string;
  if (guide) {
    title = t("cards.adding.guide.title");
    subtitle = t("cards.adding.guide.subtitle");
  } else if (paired) {
    title = t("cards.adding.steps.doneTitle");
    subtitle = t("cards.adding.steps.doneSubtitle");
  } else if (failed) {
    title = t("cards.adding.steps.failedTitle");
    // What is known of the card, and of "Try again"; the failed step says the rest. Nothing was
    // written only when no attempt of this screen had a card in the field.
    subtitle =
      !failed.touched && (saidAt === null || ORDER.indexOf(saidAt) <= ORDER.indexOf("card"))
        ? t("cards.adding.steps.failedNothing")
        : failed.touched && GOES_ON.includes(failed.reason)
          ? t("cards.adding.steps.failedGoesOn")
          : "";
  } else if (
    running?.step === null ||
    running?.step === "notifications" ||
    running?.step === "relay"
  ) {
    title = t("cards.adding.steps.prepTitle");
    subtitle = t("cards.adding.steps.prepSubtitle");
  } else if (running?.step === "card") {
    title = t(ios ? "cards.adding.steps.holdIos" : "cards.adding.steps.holdAndroid");
    subtitle = t("cards.adding.steps.holdSubtitle");
  } else if (running?.step === "programming") {
    title = t("cards.adding.steps.keepTitle");
    subtitle = t("cards.adding.steps.keepSubtitle");
  } else {
    title = t("cards.adding.steps.almostTitle");
    subtitle = t("cards.adding.steps.almostSubtitle");
  }

  // "Cancel" while nothing is written to the card: its checks, its wait, a failure.
  const cancellable = failed !== null || (running !== null && reachedAt <= ORDER.indexOf("card"));
  return (
    <CardStepsView
      stage={
        paired
          ? { card: paired.card, label: cardLabel(paired.card, t), waves: false, badge: "ok" }
          : {
              card: BLANK,
              label: "",
              waves: running?.step === "card" || running?.step === "programming",
              badge: failed ? "fail" : null,
              blank: true
            }
      }
      title={title}
      subtitle={subtitle}
      steps={steps}
      stepsLabel={t("cards.adding.steps.label")}
      stateWords={{
        todo: t("cards.adding.steps.stateTodo"),
        running: t("cards.adding.steps.stateRunning"),
        card: t("cards.adding.steps.stateRunning"),
        done: t("cards.adding.steps.stateDone"),
        failed: t("cards.adding.steps.stateFailed"),
        warning: t("cards.adding.steps.stateWarning")
      }}
      notice={
        <>
          {/* Before "Start", which card to hold (its subtitle), and where to order one. */}
          {guide ? <CardShop /> : null}
          {notice ? (
            <Callout tone="warning" testID={notice.testID}>
              {t(notice.message)}
            </Callout>
          ) : failed && saidAt === null ? (
            // Stopped before any step, or by what is no step's (the session closed): said under
            // the steps.
            <Callout tone="error" testID="add-card-failure">
              {failure?.caption}
            </Callout>
          ) : null}
          {extra}
        </>
      }
      primary={
        paired
          ? {
              label: t("cards.adding.steps.recharge"),
              icon: "plus",
              onPress: () => actions.onRecharge(paired.card),
              loading: actions.finishing === "recharge",
              disabled: actions.finishing === "later"
            }
          : failed
            ? { label: t("card.retry"), icon: "arrows-rotate", onPress: actions.onRetry }
            : guide
              ? {
                  label: t("cards.adding.guide.start"),
                  onPress: actions.onStart,
                  testID: "add-card-start"
                }
              : null
      }
      secondary={null}
      cancel={
        paired
          ? {
              label: t("cards.adding.steps.later"),
              onPress: () => actions.onLater(paired.card),
              loading: actions.finishing === "later",
              disabled: actions.finishing === "recharge"
            }
          : cancellable && actions.onCancel
            ? { label: t("cards.adding.steps.cancel"), onPress: actions.onCancel }
            : null
      }
    />
  );
}

/** A blank card: no record yet, nothing written on its face. */
const BLANK = {
  cardId: "",
  name: "",
  look: { kind: "color", color: "ink" },
  issuer: null
} as const;
