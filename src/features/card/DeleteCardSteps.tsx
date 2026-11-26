import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, Vibration } from "react-native";

import { Button } from "@/components/ui/Button";
import { OverlayModal } from "@/components/ui/overlay";
import { PosFrame } from "@/features/terminal/PosFrame";
import { makeStyles, sans, TITLE_EM, tracking } from "@/theme";

import { cardLabel } from "./card-label";
import { CardStepsView, type CardStep, type CardStepState } from "./CardStepsView";
import type { DeletionStep } from "./manage";
import type { PairingFailure } from "./pairing";
import type { CardDeletion } from "./useCardDeletion";

/*
 * "Delete the card", its steps with the card held to the phone, over the card's panel: its wallet
 * checked empty, the card shown to be this one and made blank, then its data erased. Done, "Done"
 * goes back to "Cards", which says it is deleted; failed, what to do, then "Try again" (a deletion
 * stopped once the card was recorded deleted goes on). "I don't have the card" and "Cancel" (back)
 * while nothing is written to the card, never while it is made blank, which an interruption would
 * leave half done (manage.ts: recorded deleted first, "Try again" finishes it).
 */

/** The steps, in their order, as deleteCard tells them (manage.ts). */
const ORDER: readonly DeletionStep[] = ["checking", "card", "resetting", "erasing"];

/** Failures that tell the card held is not this one: said at the card's step, nothing written. */
const NOT_THIS_CARD: readonly PairingFailure[] = ["notThisCard", "notBoltCard"];

/** The deletion's own words for the failures whose shared text (card.failure) tells a pairing. */
const DELETION_FAILURES: Partial<
  Record<PairingFailure, "cards.delete.steps.cancelled" | "cards.delete.steps.failed">
> = {
  cancelled: "cards.delete.steps.cancelled",
  failed: "cards.delete.steps.failed"
};

type Failed = Extract<CardDeletion, { phase: "failed" }>;

/** The step a failure is said at: the card's own when it is about the card, else where it stopped. */
function failedStep(failed: Failed): DeletionStep {
  if (NOT_THIS_CARD.includes(failed.reason) || failed.reason === "nfcUnavailable") return "card";
  return failed.step ?? "checking";
}

export function DeleteCardSteps({
  run,
  onRetry,
  onLeave,
  onNoCard,
  onFinish
}: {
  run: Extract<CardDeletion, { phase: "running" | "done" | "failed" }>;
  onRetry: () => void;
  /** "Cancel", back: offered only while nothing is written to the card. */
  onLeave: () => void;
  /** "I don't have the card": deleted without it (its dialog). */
  onNoCard: () => void;
  onFinish: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const ios = Platform.OS === "ios";
  // As the deletion found it: its record loses its name meanwhile.
  const { card } = run;
  const label = cardLabel(card, t);

  // Android: the card may leave the phone once blank ("until it vibrates").
  const blank = run.phase === "done" || (run.phase === "running" && run.step === "erasing");
  const wasBlank = useRef(false);
  useEffect(() => {
    if (blank && !wasBlank.current && Platform.OS === "android") Vibration.vibrate(200);
    wasBlank.current = blank;
  }, [blank]);

  const failed = run.phase === "failed" ? run : null;
  const notThis = failed !== null && NOT_THIS_CARD.includes(failed.reason);
  const lost = failed?.reason === "cardLost";
  const failedAt = failed ? failedStep(failed) : null;
  // Its data not proven erased on a majority of the relays (sync.ts goes on).
  const erasedLater = run.phase === "done" && !run.outcome.erased;
  // Where each step stands: before the one running (or failed), done once passed; it, running;
  // after, to come.
  const current = failedAt ?? (run.phase === "running" ? run.step : null);
  const at = current === null ? ORDER.length : ORDER.indexOf(current);
  // The steps passed: before the last one the deletion reached. A failure before any (no NFC,
  // checked first) passed none: its wallet was not read.
  const passed = failed ? (failed.step === null ? -1 : ORDER.indexOf(failed.step)) : at;
  // Passed without its wallet read (its deletion recorded already, here or elsewhere: manage.ts):
  // nothing said of what it holds.
  const unchecked = !run.emptied && ORDER.indexOf("checking") < passed;
  const stateOf = (step: DeletionStep): CardStepState => {
    const index = ORDER.indexOf(step);
    if (step === "erasing" && erasedLater) return "warning";
    if (step === "checking" && unchecked) return "warning";
    if (index < at) return index < passed ? "done" : "todo";
    if (index > at) return "todo";
    if (failed) return "failed";
    return step === "card" ? "card" : "running";
  };
  const failureText = (reason: PairingFailure): string => {
    if (NOT_THIS_CARD.includes(reason)) return t("cards.delete.steps.notThisCaption");
    if (reason === "cardLost") {
      return t(ios ? "cards.delete.steps.lostIos" : "cards.delete.steps.lostAndroid");
    }
    const own = DELETION_FAILURES[reason];
    return own ? t(own) : t(`card.failure.${reason}`);
  };
  // A failure: its step says what to do; the steps not passed keep their title only.
  const captionOf = (step: DeletionStep, caption: string): string | null => {
    if (!failed) return caption;
    if (step !== failedAt) return stateOf(step) === "done" ? caption : null;
    return failureText(failed.reason);
  };
  // A failure's own title, where it says more than the step's ("This is not …").
  const titleOf = (step: DeletionStep): string | null =>
    step === failedAt && notThis
      ? t("cards.delete.steps.notThisTitle", { name: label })
      : step === failedAt && lost
        ? t("cards.delete.steps.lost")
        : null;

  const steps: CardStep[] = [
    {
      key: "emptied",
      titles: {
        todo: t("cards.delete.steps.emptiedTodo"),
        running: t("cards.delete.steps.emptiedRunning"),
        done: t("cards.delete.steps.emptied"),
        failed: t("cards.delete.steps.emptiedFailed")
      },
      title: unchecked ? t("cards.delete.steps.unchecked") : titleOf("checking"),
      // "The card is empty" once its wallet is found so only (never from the start, with
      // "Preparing…", before anything is read).
      // Read empty by an earlier attempt: said once this one passed the step, never while it reads
      // the wallet again.
      caption: unchecked
        ? t("cards.delete.steps.uncheckedCaption")
        : (run.emptied && stateOf("checking") === "done") || failedAt === "checking"
          ? captionOf("checking", t("cards.delete.steps.emptiedCaption"))
          : null,
      state: stateOf("checking")
    },
    {
      key: "held",
      titles: {
        todo: t("cards.delete.steps.heldTodo"),
        running: t("cards.delete.steps.heldRunning"),
        done: t("cards.delete.steps.held"),
        failed: t("cards.delete.steps.heldFailed")
      },
      title: titleOf("card"),
      caption: captionOf(
        "card",
        t(ios ? "cards.delete.steps.heldIos" : "cards.delete.steps.heldAndroid")
      ),
      state: stateOf("card")
    },
    {
      key: "blank",
      titles: {
        todo: t("cards.delete.steps.blankTodo"),
        running: t("cards.delete.steps.blankRunning"),
        done: t("cards.delete.steps.blank"),
        failed: t("cards.delete.steps.blankFailed")
      },
      title: titleOf("resetting"),
      caption: captionOf("resetting", t("cards.delete.steps.blankCaption")),
      state: stateOf("resetting")
    },
    {
      key: "erased",
      titles: {
        todo: t("cards.delete.steps.erasedTodo"),
        running: t("cards.delete.steps.erasedRunning"),
        done: t("cards.delete.steps.erased"),
        failed: t("cards.delete.steps.erasedFailed")
      },
      title: erasedLater ? t("cards.delete.steps.erasedLater") : null,
      caption: erasedLater
        ? t("cards.delete.steps.erasedLaterCaption")
        : captionOf("erasing", t("cards.delete.steps.erasedCaption")),
      state: stateOf("erasing")
    }
  ];

  let title: string;
  let subtitle: string;
  if (run.phase === "done") {
    title = t("cards.delete.done", { name: label });
    subtitle = t("cards.delete.steps.doneSubtitle");
  } else if (failed) {
    title = notThis
      ? t("cards.delete.steps.notThisTitle", { name: label })
      : t("cards.delete.failedTitle");
    // Nothing was changed before the card was shown to be this one; after, it is deleted already,
    // the relays' majority taken or not (kept on this phone then, manage.ts: "deletionPending").
    subtitle = notThis
      ? t("cards.delete.steps.notThisSubtitle")
      : failedAt === "checking" || failedAt === "card"
        ? t("cards.delete.steps.failedNothing")
        : t("cards.delete.steps.failedGoesOn");
  } else if (run.step === "checking") {
    // Not "The card is empty": nothing proves it before its wallet is read.
    title = t("cards.delete.steps.prepTitle");
    subtitle = t("cards.delete.steps.prepSubtitle");
  } else if (run.step === "card") {
    title = t(ios ? "cards.delete.steps.holdIos" : "cards.delete.steps.holdAndroid", {
      name: label
    });
    subtitle = t("cards.delete.steps.holdSubtitle");
  } else if (run.step === "resetting") {
    title = t("cards.delete.steps.keepTitle");
    subtitle = t("cards.delete.steps.keepSubtitle");
  } else {
    title = t("cards.delete.steps.almostTitle");
    subtitle = t("cards.delete.steps.almostSubtitle");
  }

  // Leaving is offered while nothing is written to the card: its checks, its wait, a failure.
  const waiting = run.phase === "running" && (run.step === "checking" || run.step === "card");
  const leavable = failed !== null || waiting;
  // "I don't have the card" while it is awaited; also on a phone that reads no card (NFC missing or
  // off), which would otherwise have to leave and start again without it.
  const noCard = waiting || failed?.reason === "nfcUnavailable";
  // The way back: leaving, or once done, finishing.
  const back = run.phase === "done" ? onFinish : leavable ? onLeave : null;
  return (
    // Over the card's panel, in a Modal nested in its own (Sheet's `over`). The system's back
    // finishes, or leaves as "Cancel" does; never while the card is written to.
    <OverlayModal mounted visible onRequestClose={back ?? (() => undefined)}>
      <PosFrame
        title={
          <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
            {t("cards.delete.steps.screen")}
          </Text>
        }
        leading={
          back
            ? {
                icon: "arrow-left",
                label: t("common.back"),
                onPress: back,
                testID: "delete-steps-back"
              }
            : undefined
        }
        // Over the whole window on a tablet or a computer: its title, and its own way back.
        desktopTitle={t("cards.delete.steps.screen")}
        desktopAside={
          back ? (
            <Button
              variant="secondary"
              size="sm"
              icon="arrow-left"
              fullWidth={false}
              onPress={back}
              testID="delete-steps-back-desktop"
            >
              {t("common.back")}
            </Button>
          ) : null
        }
        // The steps draw their own gutter.
        flush="always"
      >
        <CardStepsView
          stage={{
            card,
            label,
            waves: run.phase === "running" && (run.step === "card" || run.step === "resetting"),
            badge: run.phase === "done" ? "ok" : failed ? "fail" : null,
            blank: run.phase === "done" || (run.phase === "running" && run.step === "erasing")
          }}
          title={title}
          subtitle={subtitle}
          steps={steps}
          stepsLabel={t("cards.delete.steps.label")}
          stateWords={{
            todo: t("cards.delete.steps.stateTodo"),
            running: t("cards.delete.steps.stateRunning"),
            card: t("cards.delete.steps.stateRunning"),
            done: t("cards.delete.steps.stateDone"),
            failed: t("cards.delete.steps.stateFailed"),
            warning: t("cards.delete.steps.stateWarning")
          }}
          primary={
            run.phase === "done"
              ? { label: t("cards.delete.steps.finish"), onPress: onFinish }
              : failed
                ? { label: t("card.retry"), icon: "arrows-rotate", onPress: onRetry }
                : null
          }
          secondary={noCard ? { label: t("cards.delete.steps.noCard"), onPress: onNoCard } : null}
          cancel={leavable ? { label: t("cards.delete.steps.cancel"), onPress: onLeave } : null}
        />
      </PosFrame>
    </OverlayModal>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  heading: {
    ...sans(700),
    fontSize: 19,
    letterSpacing: tracking(TITLE_EM, 19),
    color: colors.text.primary
  }
}));
