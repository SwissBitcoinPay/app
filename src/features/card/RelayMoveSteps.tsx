import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, Vibration } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { OverlayModal } from "@/components/ui/overlay";
import { PosFrame } from "@/features/terminal/PosFrame";
import type { CardState } from "@/lib/card/card-record";
import { makeStyles, sans, TITLE_EM, tracking } from "@/theme";

import { cardLabel } from "./card-label";
import { CardStepsView, type CardStep, type CardStepState } from "./CardStepsView";
import type { PairingFailure } from "./pairing";
import type { RelayMove, RelayMoveStep } from "./useRelayMove";

/*
 * "Change relay", its steps, over the card's panel once the new relay answered (the form asked it):
 * the card held to the phone, programmed for the new relay, then the former one told to forget it.
 * Done, "Done" goes back to "Cards", which says where the card now goes; failed, what to do, then
 * "Try again" (an interrupted move goes on from where it stopped, its checks shown as the first
 * step again). It can be left ("Cancel", back) while nothing is written to the card, never while
 * the card is programmed, which would leave it reset (useRelayMove.ts). Done, the way back finishes
 * as "Done" does.
 */

/** The steps, in their order: the new relay, the card's wait, its programming, its activation. */
const ORDER: readonly RelayMoveStep[] = ["relay", "card", "programming", "activating"];

/** Failures that tell the card held is not this one: said at the card's step, nothing written. */
const NOT_THIS_CARD: readonly PairingFailure[] = [
  "notThisCard",
  "notBlank",
  "notBoltCard",
  "ownCard"
];

/** Failures after which "Try again" goes on from where the move stopped (manage.ts). */
const GOES_ON: readonly PairingFailure[] = [
  "cardLost",
  "verifyFailed",
  "failed",
  "cancelled",
  "relayUnreachable",
  "recordsUnreachable"
];

/**
 * What the last step says of the former relay's channel, as its deletion ended: deleted, its
 * caption under the step's title; otherwise a title of its own too.
 */
const FORMER_KEPT = {
  deleted: { caption: "cards.relay.steps.formerCaption" },
  unreachable: {
    title: "cards.relay.steps.formerDown",
    caption: "cards.relay.steps.formerDownCaption"
  },
  refused: {
    title: "cards.relay.steps.formerRefused",
    caption: "cards.relay.steps.formerRefusedCaption"
  },
  unknown: {
    title: "cards.relay.steps.formerUnknown",
    caption: "cards.relay.steps.formerUnknownCaption"
  }
} as const;

type MoveFailure =
  | "cards.relay.steps.relayUnreachable"
  | "cards.relay.steps.relayIncompatible"
  | "cards.relay.steps.recordsUnreachable"
  | "cards.relay.steps.cancelled"
  | "cards.relay.steps.failed";

/**
 * The move's own words for the failures whose shared text (card.failure) would say more than is
 * proven here: "Your card was not changed" after an attempt that reset it, "the pairing".
 */
const MOVE_FAILURES: Partial<Record<PairingFailure, MoveFailure>> = {
  relayUnreachable: "cards.relay.steps.relayUnreachable",
  relayIncompatible: "cards.relay.steps.relayIncompatible",
  recordsUnreachable: "cards.relay.steps.recordsUnreachable",
  cancelled: "cards.relay.steps.cancelled",
  failed: "cards.relay.steps.failed"
};

/** The failures named at their step as "Add a card" names them (its titles). */
const MOVE_FAILURE_TITLES: Partial<
  Record<
    PairingFailure,
    | "cards.adding.steps.relayUnreachable"
    | "cards.adding.steps.relayIncompatible"
    | "cards.adding.steps.recordsUnreachable"
  >
> = {
  relayUnreachable: "cards.adding.steps.relayUnreachable",
  relayIncompatible: "cards.adding.steps.relayIncompatible",
  recordsUnreachable: "cards.adding.steps.recordsUnreachable"
};

export function RelayMoveSteps({
  card,
  move,
  onRetry,
  onLeave,
  onFinish
}: {
  card: CardState;
  move: Extract<RelayMove, { phase: "running" | "done" | "failed" }>;
  onRetry: () => void;
  /** "Cancel", back: offered only while nothing is written to the card. */
  onLeave: () => void;
  onFinish: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const ios = Platform.OS === "ios";
  const label = cardLabel(card, t);
  const { host, former } = move;

  // Android: the card may leave the phone once programmed ("until it vibrates"), each time an
  // attempt gets there.
  const programmed =
    move.phase === "done" || (move.phase === "running" && move.step === "activating");
  const wasProgrammed = useRef(false);
  useEffect(() => {
    if (programmed && !wasProgrammed.current && Platform.OS === "android") Vibration.vibrate(200);
    wasProgrammed.current = programmed;
  }, [programmed]);

  const failed = move.phase === "failed" ? move : null;
  const lost = failed?.reason === "cardLost";
  // The step a failure is said at: the card's own when the card held was another.
  const failedAt: RelayMoveStep | null = failed
    ? NOT_THIS_CARD.includes(failed.reason)
      ? "card"
      : failed.step
    : null;
  // Where each step stands: before the one running (or failed), done; it, running; after, to come.
  const at = move.phase === "done" ? ORDER.length : ORDER.indexOf(failedAt ?? move.step);
  const stateOf = (step: RelayMoveStep): CardStepState => {
    const index = ORDER.indexOf(step);
    if (index < at) return "done";
    if (index > at) return "todo";
    if (failed) return "failed";
    return step === "card" ? "card" : "running";
  };
  const failureText = (reason: PairingFailure): string => {
    if (reason === "cardLost") {
      return t(ios ? "cards.relay.steps.lostIos" : "cards.relay.steps.lostAndroid");
    }
    const own = MOVE_FAILURES[reason];
    return own ? t(own, { host }) : t(`card.failure.${reason}`);
  };
  // A failure: its step says what to do; the steps not reached keep their title only.
  const captionOf = (step: RelayMoveStep, caption: string): string | null => {
    if (!failed) return caption;
    if (step !== failedAt) return ORDER.indexOf(step) < at ? caption : null;
    return failureText(failed.reason);
  };
  // A failure's own title, where it says more than the step's: the card taken away too early, a
  // relay that answered wrong (never "not checked" for a relay checked and found incompatible).
  const titleOf = (step: RelayMoveStep): string | null => {
    if (!failed || step !== failedAt) return null;
    if (lost) return t("cards.relay.steps.lost");
    const own = MOVE_FAILURE_TITLES[failed.reason];
    return own ? t(own) : null;
  };
  const formerKept = move.phase === "done" ? move.formerKept : null;

  const steps: CardStep[] = [
    {
      key: "relay",
      titles: {
        todo: t("cards.relay.steps.relayTodo"),
        running: t("cards.relay.steps.relayRunning"),
        done: t("cards.relay.steps.relay"),
        failed: t("cards.relay.steps.relayFailed")
      },
      title: titleOf("relay"),
      caption: captionOf("relay", t("cards.relay.steps.relayCaption", { host })),
      state: stateOf("relay")
    },
    {
      key: "card",
      titles: {
        todo: t("cards.relay.steps.cardTodo"),
        running: t("cards.relay.steps.cardRunning"),
        done: t("cards.relay.steps.card"),
        failed: t("cards.relay.steps.cardFailed")
      },
      title: titleOf("card"),
      caption: captionOf(
        "card",
        t(ios ? "cards.relay.steps.cardIos" : "cards.relay.steps.cardAndroid")
      ),
      state: stateOf("card")
    },
    {
      key: "programming",
      titles: {
        todo: t("cards.relay.steps.programmingTodo"),
        running: t("cards.relay.steps.programmingRunning"),
        done: t("cards.relay.steps.programming"),
        failed: t("cards.relay.steps.programmingFailed")
      },
      title: titleOf("programming"),
      caption: captionOf("programming", t("cards.relay.steps.programmingCaption")),
      state: stateOf("programming")
    },
    {
      key: "former",
      // The former relay that did not answer, kept the card's channel, or gave an answer that
      // proves neither (it stays there, or may, without effect: the card no longer calls it).
      titles: {
        todo: t("cards.relay.steps.formerTodo"),
        running: t("cards.relay.steps.formerRunning"),
        done: t("cards.relay.steps.former"),
        failed: t("cards.relay.steps.formerFailed")
      },
      title: formerKept ? t(FORMER_KEPT[formerKept].title) : titleOf("activating"),
      // What became of the former relay, once the move ended; before, nothing is known of it.
      caption:
        move.phase === "done" || failedAt === "activating"
          ? captionOf(
              "activating",
              t(FORMER_KEPT[formerKept ?? "deleted"].caption, { relay: former })
            )
          : null,
      state: formerKept ? "warning" : stateOf("activating")
    }
  ];

  let title: string;
  let subtitle: string;
  if (move.phase === "done") {
    title = t("cards.relay.steps.doneTitle", { host });
    subtitle = t("cards.relay.steps.doneSubtitle");
  } else if (failed) {
    title = t("cards.relay.steps.failedTitle");
    // What is known of the card, and of "Try again"; the failed step says the rest. Nothing was
    // written only when no attempt of this move had the card in the field.
    subtitle =
      !failed.touched && (failedAt === "relay" || failedAt === "card")
        ? t("cards.relay.steps.failedNothing")
        : failed.touched && GOES_ON.includes(failed.reason)
          ? t("cards.relay.steps.failedGoesOn")
          : "";
  } else if (move.step === "relay") {
    title = t("cards.relay.steps.checkingTitle");
    subtitle = t("cards.relay.steps.holdSubtitle", { host });
  } else if (move.step === "card") {
    title = t(ios ? "cards.relay.steps.holdIos" : "cards.relay.steps.holdAndroid", {
      name: label
    });
    subtitle = t("cards.relay.steps.holdSubtitle", { host });
  } else if (move.step === "programming") {
    title = t("cards.relay.steps.keepTitle");
    subtitle = t("cards.relay.steps.keepSubtitle");
  } else {
    title = t("cards.relay.steps.almostTitle");
    subtitle = t("cards.relay.steps.almostSubtitle");
  }

  // Leaving is offered while nothing is written to the card: its wait, a retry's checks, a failure.
  const leavable =
    failed !== null ||
    (move.phase === "running" && (move.step === "relay" || move.step === "card"));
  // The way back: leaving, or once done, finishing.
  const back = move.phase === "done" ? onFinish : leavable ? onLeave : null;
  // The channel's state at the end (activation-notice.ts, as "Add a card" says it), and a card left
  // reset by an interruption, out of "Cards" until the move ends or the card is added again
  // (pairing.ts keeps its settings; its wallet is its id's).
  const notice =
    move.phase === "done" && move.notice ? (
      <Callout tone="warning" testID={move.notice.testID}>
        {t(move.notice.message)}
      </Callout>
    ) : failed && card.status === "reset" ? (
      <Callout tone="warning" testID="relay-move-reset">
        {t("cards.relay.steps.resetNotice")}
      </Callout>
    ) : null;
  return (
    // Over the card's panel, in a Modal nested in its own (Sheet's `over`). The system's back
    // finishes, or leaves as "Cancel" does; never while the card is written to.
    <OverlayModal mounted visible onRequestClose={back ?? (() => undefined)}>
      <PosFrame
        title={
          <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
            {t("cards.relay.change")}
          </Text>
        }
        leading={
          back
            ? {
                icon: "arrow-left",
                label: t("common.back"),
                onPress: back,
                testID: "relay-move-back"
              }
            : undefined
        }
        // Over the whole window on a tablet or a computer: its title, and its own way back.
        desktopTitle={t("cards.relay.change")}
        desktopAside={
          back ? (
            <Button
              variant="secondary"
              size="sm"
              icon="arrow-left"
              fullWidth={false}
              onPress={back}
              testID="relay-move-back-desktop"
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
            waves:
              move.phase === "running" && (move.step === "card" || move.step === "programming"),
            badge: move.phase === "done" ? "ok" : failed ? "fail" : null
          }}
          title={title}
          subtitle={subtitle}
          steps={steps}
          stepsLabel={t("cards.relay.steps.label")}
          stateWords={{
            todo: t("cards.relay.steps.stateTodo"),
            running: t("cards.relay.steps.stateRunning"),
            card: t("cards.relay.steps.stateRunning"),
            done: t("cards.relay.steps.stateDone"),
            failed: t("cards.relay.steps.stateFailed"),
            warning: t("cards.relay.steps.stateWarning")
          }}
          notice={notice}
          primary={
            move.phase === "done"
              ? { label: t("cards.relay.steps.finish"), onPress: onFinish }
              : failed
                ? { label: t("card.retry"), icon: "arrows-rotate", onPress: onRetry }
                : null
          }
          cancel={leavable ? { label: t("cards.relay.steps.cancel"), onPress: onLeave } : null}
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
