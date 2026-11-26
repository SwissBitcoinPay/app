import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { Callout } from "@/components/ui/Callout";
import { getAccountWalletId } from "@/features/account/session";
import { formatSats } from "@/features/wallet/send/amount";
import { defaultCardColor, type CardState } from "@/lib/card/card-record";
import { getDeviceLocale } from "@/lib/locale/device";

import { activationNotice } from "./activation-notice";
import {
  activationTitles,
  activationWarning,
  heldTitles,
  OFF_STEPS,
  stepFailureOf,
  useFixAction
} from "./AddCardSteps";
import { cardLabel } from "./card-label";
import { CardStepsView, type CardStep, type CardStepState, type StepTitles } from "./CardStepsView";
import { useVisualPreview } from "./issuer-visual";
import type { MigrationStep } from "./migration";
import type { PairingFailure } from "./pairing";
import type { ChannelSync } from "./relay-sync";
import { knownCardState, subscribeCardStates } from "./states";
import type { MigrationShown } from "./useCardPairing";

/*
 * A v2 card's migration, its steps ("Finish the migration" for one left half-done): its balance
 * transferred to its new wallet, the card held to the phone a second time, erased and programmed
 * for this wallet, then activated on its relay. Done: "Done". "Cancel" while nothing is written to
 * the card: during the transfer (its request, once sent, goes on: "Cards" shows the card and its
 * wallet, the migration to finish) and while the card is awaited, never during the programming,
 * which an interruption would leave half done. Its failures are said at their step as "Add a card"
 * says them, then "Try again", which starts again from the card held (a v2 card's balance is read
 * again before anything erases it); the activation not done yet too. The card on its stage is drawn
 * as it is known: its record's look (its issuer's visual, the look and name its holder chose) as
 * soon as this session knows it, "Cards" having read it or its migration written it; until a record
 * holds a visual, the one its server gave, as "Swiss Bitcoin Pay card detected" showed it (the very
 * image, the CDN not asked again); its colour without either.
 */

/** The steps, in their order. */
type Step = "transfer" | "held" | "programmed" | "activated";
const ORDER: readonly Step[] = ["transfer", "held", "programmed", "activated"];

/** Where each step of migration.ts shows. */
function stepOf(step: MigrationStep): Step {
  switch (step) {
    case "transferring":
      return "transfer";
    case "notifications":
    case "relay":
    case "card":
      return "held";
    case "programming":
      return "programmed";
    case "activating":
      return "activated";
  }
}

/** Failures said at the card's step, whatever step ran: what the card held is (nothing written). */
const AT_CARD: readonly PairingFailure[] = ["notThisCard", "notBoltCard", "nfcUnavailable"];

/** Failures after which "Try again" goes on from where the migration stopped (migration.ts). */
const GOES_ON: readonly PairingFailure[] = [
  "cardLost",
  "verifyFailed",
  "failed",
  "cancelled",
  "migrationMasterKey",
  "migrationNotWiped"
];

export type MigrationRun =
  | { phase: "migrating"; step: MigrationStep }
  | { phase: "failed"; step: MigrationStep | null; reason: PairingFailure; touched: boolean }
  | { phase: "paired"; card: CardState; activation: ChannelSync | null };

export function MigrationSteps({
  migration,
  run,
  onRetry,
  onCancel,
  onFinish,
  finishing = false,
  extra = null
}: {
  migration: MigrationShown;
  run: MigrationRun;
  onRetry: () => void;
  /** "Cancel": offered only while nothing is written to the card. */
  onCancel: () => void;
  onFinish: (card: CardState) => void;
  /** "Done" under way (the sign-up saves before it goes on): it waits. */
  finishing?: boolean;
  /** Under the steps, after what they leave to know: what the screen adds (a failure to save). */
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  // The device's own (as the point of sale's), read here: the sign-up has no point of sale yet.
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const ios = Platform.OS === "ios";
  const migrating = run.phase === "migrating" ? run : null;
  const failed = run.phase === "failed" ? run : null;
  const paired = run.phase === "paired" ? run : null;
  const { cardId, resume } = migration;
  // The card's record as this session knows it, its look with it. Of a deleted card's, only its
  // issuer's visual is what its migration records (keptSettings): its name and look are not.
  const known = useSyncExternalStore(subscribeCardStates, () => {
    const walletId = getAccountWalletId();
    return walletId ? knownCardState(walletId, cardId) : null;
  });
  const record = paired
    ? paired.card
    : known?.status === "deleted"
      ? { ...known, name: "", look: null }
      : known;
  // Its server's visual until its record holds one (keepIssuerVisual): once paired, the record
  // says what was kept.
  const visual = paired || record?.issuer ? null : migration.visual;
  const preview = useVisualPreview(visual);
  const shownCard: Pick<CardState, "cardId" | "name" | "look" | "issuer"> = record ?? {
    cardId,
    name: "",
    look: { kind: "color", color: defaultCardColor(cardId) },
    issuer: null
  };
  // Nothing to transfer: recognized, its balance moved before (a migration left half-done) or none.
  const transfer = !resume && migration.amountSats !== 0n;

  // Where the migration got: the steps before it are done; a failure is said at its own step.
  const reachedAt = paired
    ? ORDER.length
    : ORDER.indexOf(
        failed
          ? failed.step === null
            ? "transfer"
            : stepOf(failed.step)
          : stepOf(run.phase === "migrating" ? run.step : "transferring")
      );
  // Null for a failure of no step (the session closed), said under the steps.
  const failedAt: Step | null = failed
    ? OFF_STEPS.includes(failed.reason)
      ? null
      : AT_CARD.includes(failed.reason) && reachedAt >= ORDER.indexOf("held")
        ? "held"
        : ORDER[reachedAt]
    : null;
  const doneBefore = failedAt === null ? reachedAt : Math.min(reachedAt, ORDER.indexOf(failedAt));
  const failure = failed ? stepFailureOf(failed.reason, t, true) : null;
  const fix = useFixAction(failure?.fix ?? null, t);
  const notice = paired ? activationNotice(paired.activation) : null;

  const stateOf = (step: Step): CardStepState => {
    const index = ORDER.indexOf(step);
    // Nothing to transfer: the card recognized at once.
    if (step === "transfer" && !transfer && !(failed && failedAt === "transfer")) return "done";
    if (failed) {
      if (step === failedAt) return "failed";
      return index < doneBefore ? "done" : "todo";
    }
    if (paired) return step === "activated" && notice ? "warning" : "done";
    if (index < reachedAt) return "done";
    if (index > reachedAt) return "todo";
    if (step !== "held") return "running";
    return run.phase === "migrating" && run.step === "card" ? "card" : "running";
  };

  const amount =
    migration.amountSats === null ? null : formatSats(migration.amountSats, languageTag);
  const transferCaption = (): string | null => {
    if (resume) return t("cards.adding.migration.recognizedCaption");
    if (!transfer) return t("cards.adding.migration.nothingCaption");
    if (migration.receivedSats !== null) {
      return t("cards.adding.migration.receivedCaption", {
        amount: formatSats(migration.receivedSats, languageTag)
      });
    }
    return amount === null ? null : t("cards.adding.migration.sendingCaption", { amount });
  };
  // Done not as it should, its `warning` title when it has one.
  const step = (
    key: Step,
    titles: StepTitles,
    caption: string | null,
    warning: string | null = null
  ): CardStep => {
    const state = stateOf(key);
    if (state === "failed" && failure) {
      return { key, titles, title: failure.title, caption: failure.caption, state, fix };
    }
    return {
      key,
      titles,
      title: state === "warning" ? warning : null,
      caption: failed && state === "todo" ? null : caption,
      state
    };
  };
  const steps: CardStep[] = [
    step(
      "transfer",
      transfer
        ? {
            todo: t("cards.adding.migration.transferTodo"),
            running: t("cards.adding.migration.transferRunning"),
            done: t("cards.adding.migration.transferred"),
            failed: t("cards.adding.migration.notTransferred")
          }
        : {
            todo: t("cards.adding.migration.recognizedTodo"),
            running: t("cards.adding.migration.recognizedRunning"),
            done: t("cards.adding.migration.recognized"),
            failed: t("cards.adding.migration.recognizedFailed")
          },
      transferCaption()
    ),
    step(
      "held",
      resume
        ? heldTitles(
            t,
            t("cards.adding.migration.heldAgainTodo"),
            t("cards.adding.migration.heldAgain")
          )
        : heldTitles(
            t,
            t("cards.adding.migration.heldSecondTodo"),
            t("cards.adding.migration.heldSecond")
          ),
      null
    ),
    step(
      "programmed",
      {
        todo: t("cards.adding.migration.programmedTodo"),
        running: t("cards.adding.migration.programmedRunning"),
        done: t("cards.adding.migration.programmed"),
        failed: t("cards.adding.steps.programmingFailed")
      },
      null
    ),
    step(
      "activated",
      activationTitles(t, t("cards.adding.migration.activated")),
      null,
      activationWarning(notice, t)
    )
  ];

  let title: string;
  let subtitle: string;
  if (paired) {
    title = t("cards.adding.migration.doneTitle");
    subtitle = t(
      paired.card.issuer
        ? "cards.adding.migration.doneSubtitleVisual"
        : "cards.adding.migration.doneSubtitle"
    );
  } else if (failed) {
    title = t("cards.adding.migration.failedTitle");
    // Nothing written only when no attempt of this screen had the card in the field, nor one
    // before it (a migration left half-done was).
    subtitle =
      !failed.touched &&
      !resume &&
      (failedAt === null || failedAt === "transfer" || failedAt === "held")
        ? t("cards.adding.steps.failedNothing")
        : failed.touched && GOES_ON.includes(failed.reason)
          ? t("cards.adding.migration.failedGoesOn")
          : "";
  } else if (migrating?.step === "transferring") {
    title = t("cards.adding.migration.transferTitle");
    subtitle = amount === null ? "" : t("cards.adding.migration.transferSubtitle", { amount });
  } else if (migrating?.step === "programming") {
    title = t("cards.adding.migration.keepTitle");
    subtitle = t("cards.adding.migration.keepSubtitle");
  } else if (migrating?.step === "activating") {
    title = t("cards.adding.migration.almostTitle");
    subtitle = t("cards.adding.migration.almostSubtitle");
  } else {
    // Its checks then its wait: the card asked for once they are done (pairing.ts).
    title = t(resume ? "cards.adding.migration.holdAgain" : "cards.adding.migration.holdSecond");
    subtitle = t(
      ios ? "cards.adding.migration.holdSubtitleIos" : "cards.adding.migration.holdSubtitleAndroid"
    );
  }

  // "Cancel" while nothing is written to the card: its transfer, its checks, its wait, a failure.
  const cancellable =
    failed !== null ||
    (run.phase === "migrating" && run.step !== "programming" && run.step !== "activating");
  return (
    <CardStepsView
      centered
      stage={{
        card: shownCard,
        label: cardLabel(record ?? { name: "", cardId }, t),
        // Not downloaded: the card's own face, never its number written over its colour.
        legacy:
          visual && preview.status !== "none"
            ? { number: visual.number, white: visual.white, image: preview }
            : null,
        waves: run.phase === "migrating" && (run.step === "card" || run.step === "programming"),
        badge: paired ? "ok" : failed ? "fail" : null
      }}
      title={title}
      subtitle={subtitle}
      steps={steps}
      stepsLabel={t("cards.adding.migration.label")}
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
          {notice ? (
            <Callout tone="warning" testID={notice.testID}>
              {t(notice.message)}
            </Callout>
          ) : failed && failedAt === null ? (
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
              label: t("cards.adding.migration.finish"),
              onPress: () => onFinish(paired.card),
              loading: finishing
            }
          : failed
            ? { label: t("card.retry"), icon: "arrows-rotate", onPress: onRetry }
            : null
      }
      cancel={cancellable ? { label: t("cards.adding.steps.cancel"), onPress: onCancel } : null}
    />
  );
}
