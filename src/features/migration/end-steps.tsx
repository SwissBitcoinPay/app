import type { TFunction } from "i18next";

import { Button } from "@/components/ui/Button";
import { SUPPORT_EMAIL } from "@/config/support";
import { formatInteger } from "@/lib/locale/format";

import type { LegacyFreeze } from "./freeze";
import type { HistoryImportStatus } from "./history-import";
import type { TimelineStep } from "./MigrationTimeline";
import type { HistoryCopy } from "./useLegacyFreeze";
import type { LegacyTransferPhase } from "./useLegacyTransfer";
import type { WordsNeeded } from "./words-needed";

/*
 * The steps of "Your account is up to date" (done.tsx), each as MigrationTimeline draws it: what
 * the account, the v2 account's freeze, the copy of its history and the v2 wallet's transfer say,
 * never more than what each proved (a step not ended is never "done"). Their buttons are given only
 * once every step ended (`settled`): nothing to press while one runs. The test IDs are the ones the
 * screen's Callouts had: what each outcome is.
 */

/** The account: created, its point of sale ready (the screen opens only then). */
export function accountStep(t: TFunction, business: string): TimelineStep {
  return {
    key: "account",
    state: "done",
    title: t("migration.done.steps.account"),
    caption: t("migration.done.steps.accountCaption", { business }),
    testID: "migration-done-business"
  };
}

/** The v2 account's freeze (useLegacyFreeze): "frozen" only once the v2 server said so. */
export function freezeStep(
  t: TFunction,
  freeze: LegacyFreeze,
  onRetry: (() => void) | undefined
): TimelineStep {
  const key = "freeze";
  switch (freeze.phase) {
    case "running":
      return { key, state: "running", title: t("migration.freeze.running") };
    case "done":
      return {
        key,
        state: "done",
        title: t("migration.done.steps.frozen"),
        caption: t(
          freeze.payout === "sent"
            ? "migration.done.steps.frozenSent"
            : freeze.payout === "none"
              ? "migration.done.steps.frozenNone"
              : "migration.done.steps.frozenPending"
        ),
        testID: "migration-freeze-done"
      };
    case "conflict":
      return {
        key,
        state: "warning",
        title: t("migration.done.steps.migratedElsewhere"),
        caption: t("migration.freeze.conflict", { email: SUPPORT_EMAIL }),
        testID: "migration-freeze-conflict"
      };
    case "rejected":
      return {
        key,
        state: "error",
        title: t("migration.done.steps.notFrozen"),
        caption: t("migration.freeze.rejected", { email: SUPPORT_EMAIL }),
        testID: "migration-freeze-rejected"
      };
    case "failed":
      return {
        key,
        state: "error",
        title: t("migration.done.steps.notFrozen"),
        caption: freeze.retry
          ? t("migration.freeze.failed")
          : t("migration.freeze.lost", { email: SUPPORT_EMAIL }),
        actions:
          freeze.retry && onRetry ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon="arrows-rotate"
              onPress={onRetry}
              testID="migration-freeze-retry"
            >
              {t("migration.transfer.retry")}
            </Button>
          ) : undefined,
        testID: "migration-freeze-failed"
      };
  }
}

/**
 * The copy of the v2 account's history (history-import.ts), handed the session once the freeze
 * ended (useLegacyFreeze's `copy`): waiting for the freeze before, running from then on, even
 * before the copy's own status says so. Ended without a status of its own: there was no session to
 * copy with, not copied here ("Settings" offers it, startMigratedHistory).
 */
export function historyStep(
  t: TFunction,
  status: HistoryImportStatus,
  { copy, languageTag }: { copy: HistoryCopy; languageTag: string }
): TimelineStep {
  const key = "history";
  const number = (value: number) => formatInteger(value, languageTag);
  if (status.phase === "idle" && copy === "running") {
    return { key, state: "running", title: t("migration.done.steps.historyRunning") };
  }
  switch (status.phase) {
    case "running":
      if (status.step === "reading") {
        return {
          key,
          state: "running",
          title: t("migration.done.steps.historyRunning"),
          caption:
            status.rows === 0
              ? undefined
              : t("migration.done.steps.historyRead", {
                  count: status.rows,
                  formatted: number(status.rows)
                })
        };
      }
      return {
        key,
        state: "running",
        title: t("migration.done.steps.historyRunning"),
        caption:
          status.total === 0
            ? undefined
            : t("migration.done.steps.historyWritten", {
                count: status.total,
                copied: number(status.copied),
                total: number(status.total)
              }),
        progress: status.total === 0 ? undefined : { now: status.copied, max: status.total }
      };
    case "done":
      return {
        key,
        state: "done",
        title: t("migration.done.steps.historyCopied"),
        caption:
          status.rows === 0
            ? t("migration.done.steps.historyEmpty")
            : t("migration.done.steps.historyCopiedCaption", {
                count: status.rows,
                formatted: number(status.rows)
              }),
        testID: "migration-history-done"
      };
    case "failed":
      return {
        key,
        state: "warning",
        title: t("migration.done.steps.historyNotCopied"),
        caption: t("migration.history.failed"),
        testID: "migration-history-failed"
      };
    case "idle":
      return copy === "waiting"
        ? {
            key,
            state: "pending",
            title: t("migration.done.steps.history"),
            caption: t("migration.done.steps.historyWaiting")
          }
        : {
            key,
            state: "warning",
            title: t("migration.done.steps.historyNotCopied"),
            caption: t("migration.history.failed"),
            testID: "migration-history-failed"
          };
  }
}

/**
 * What "I have the 12 words, erase without moving" did (LegacyTransferSheet.tsx): erasing the
 * words, erased, or not (the keychain kept them: tried again).
 */
export type LegacyWordsSkip = "erasing" | "erased" | "failed";

/**
 * The v2 wallet (useLegacyTransfer, words-needed.ts): its transfer when this device holds its
 * words (or they were typed), or their erasure without one (`skipped`), else whether its words are
 * needed. None when there is nothing to say of it: no wallet of the v2 app, or words typed that
 * were not its ("Type my 12 words" says so, its field stays). Words erased after a transfer
 * (`erased`) are said with it.
 */
export function walletStep(
  t: TFunction,
  {
    state,
    wordsNeeded,
    showTransfer,
    skipped = null,
    amount
  }: {
    state: LegacyTransferPhase;
    wordsNeeded: WordsNeeded | null;
    /** The device holds the words, or a transfer ran (the words typed). */
    showTransfer: boolean;
    skipped?: LegacyWordsSkip | null;
    amount: (sats: bigint) => string;
  },
  actions: { retry?: () => void; typeWords?: () => void; eraseAgain?: () => void }
): TimelineStep | null {
  const key = "wallet";
  const title = t("migration.done.steps.wallet");
  const typeWords = actions.typeWords ? (
    <Button
      variant="secondary"
      size="sm"
      fullWidth={false}
      icon="keyboard"
      onPress={actions.typeWords}
      testID={showTransfer ? "migration-transfer-type-words" : "migration-done-type-words"}
    >
      {t("migration.words.open")}
    </Button>
  ) : null;
  const retry = actions.retry ? (
    <Button
      variant="secondary"
      size="sm"
      fullWidth={false}
      icon="arrows-rotate"
      onPress={actions.retry}
      testID="migration-transfer-retry"
    >
      {t("migration.transfer.retry")}
    </Button>
  ) : null;

  if (!showTransfer) {
    if (wordsNeeded === null) {
      return { key, state: "running", title: t("migration.done.checking") };
    }
    if (wordsNeeded.status === "none") return null;
    return {
      key,
      state: "warning",
      title,
      caption:
        wordsNeeded.status === "funds"
          ? t("migration.done.words", { amount: amount(wordsNeeded.sats) })
          : t("migration.done.wordsUnknown"),
      actions: typeWords ?? undefined,
      testID: "migration-done-words"
    };
  }

  if (state.phase === "idle" && skipped !== null) {
    switch (skipped) {
      case "erasing":
        return { key, state: "running", title };
      case "erased":
        return {
          key,
          state: "done",
          title,
          caption: t("migration.transfer.skipped"),
          actions: typeWords ?? undefined,
          testID: "migration-transfer-skipped"
        };
      case "failed":
        return {
          key,
          state: "error",
          title,
          caption: t("migration.transfer.eraseFailed"),
          actions: actions.eraseAgain ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              icon="arrows-rotate"
              onPress={actions.eraseAgain}
              testID="migration-transfer-erase-retry"
            >
              {t("migration.transfer.retry")}
            </Button>
          ) : undefined,
          testID: "migration-transfer-erase-failed"
        };
    }
  }
  switch (state.phase) {
    // The offer shows over the screen (LegacyTransferSheet.tsx): its answer awaited.
    case "idle":
      return { key, state: "running", title };
    case "running":
      return { key, state: "running", title: t("migration.transfer.running") };
    case "invalid":
      return null;
  }
  const { outcome } = state;
  // The words the v2 app left on this device, erased after the transfer (transfer.ts).
  const erased = (text: string) =>
    "erased" in outcome && outcome.erased ? `${text} ${t("migration.transfer.erased")}` : text;
  switch (outcome.status) {
    case "sent": {
      const sent = erased(t("migration.transfer.sent", { fee: amount(outcome.feeSats) }));
      return {
        key,
        state: outcome.waitingSats > 0n ? "warning" : "done",
        title: t("migration.transfer.sentTitle", { amount: amount(outcome.outputSats) }),
        caption:
          outcome.waitingSats > 0n
            ? `${sent} ${t("migration.transfer.more", { amount: amount(outcome.waitingSats) })}`
            : sent,
        testID: "migration-transfer-sent"
      };
    }
    case "empty":
      return {
        key,
        state: "done",
        title,
        caption: erased(t("migration.transfer.empty")),
        testID: "migration-transfer-empty"
      };
    case "waiting":
      return {
        key,
        state: "warning",
        title,
        caption: t("migration.transfer.waiting", { amount: amount(outcome.waitingSats) }),
        testID: "migration-transfer-waiting"
      };
    case "tooSmall":
      return {
        key,
        state: "warning",
        title,
        caption: outcome.erased
          ? erased(t("migration.transfer.tooSmallErased", { amount: amount(outcome.sats) }))
          : t("migration.transfer.tooSmall", { amount: amount(outcome.sats) }),
        testID: "migration-transfer-small"
      };
    case "absent":
    case "unused":
    case "mismatch":
      return null;
    case "unreadable":
      return {
        key,
        state: "error",
        title,
        caption: t("migration.transfer.unreadable"),
        actions:
          retry || typeWords ? (
            <>
              {retry}
              {typeWords}
            </>
          ) : undefined,
        testID: "migration-transfer-unreadable"
      };
    case "failed":
      return {
        key,
        state: "error",
        title,
        caption: t("migration.transfer.failed"),
        actions: retry ?? undefined,
        testID: "migration-transfer-failed"
      };
  }
}
