import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CardState } from "@/lib/card/card-record";
import { cancelCardSession } from "@/lib/card/nfc-session";
import { logFailure } from "@/lib/log/log";

import { deleteCard, type DeletionStep } from "./manage";
import { PairingError, type PairingFailure } from "./pairing";

/*
 * "Delete the card", as deleteCard runs it (manage.ts): held to the phone, its steps over the
 * card's panel (DeleteCardSteps.tsx) until it is done or left; without the card, in the panel, once
 * its dialog confirmed it. Kept by the card's panel (CardSheet.tsx).
 */

/**
 * `card`: the card as the deletion found it, which says it while its record loses its name and
 * look (card-erasure.ts). `emptied`: its wallet was read empty by an attempt of this deletion (not
 * when its deletion was recorded already, here or elsewhere: nothing reads it then, manage.ts).
 */
export type CardDeletion =
  | { phase: "idle" }
  /** Without the card: recorded deleted, its data erased. */
  | { phase: "deleting"; card: CardState }
  /** Held to the phone: the steps screen. */
  | { phase: "running"; card: CardState; step: DeletionStep; emptied: boolean }
  /** Deleted: `outcome` says whether it is all done (DeletionOutcome). */
  | { phase: "done"; card: CardState; inHand: boolean; emptied: boolean; outcome: DeletionOutcome }
  /** `step`: where it stopped (held to the phone), null before any. */
  | {
      phase: "failed";
      card: CardState;
      inHand: boolean;
      emptied: boolean;
      step: DeletionStep | null;
      reason: PairingFailure;
    };

/**
 * `erased`: all its data proven erased (else the next syncs go on with it, card-erasure.ts).
 * `pending`: without the card, its deletion kept on this phone but not taken by a majority of the
 * relays yet (manage.ts, "deletionPending"): the next syncs publish it, then erase its data.
 */
export type DeletionOutcome = { erased: boolean; pending: boolean };

const IDLE: CardDeletion = { phase: "idle" };

/** Told once the card is deleted (CardDeletion's `outcome`). */
type Deleted = (card: CardState, outcome: DeletionOutcome) => void;

/**
 * The deletion of a card of the panel's opening `round`: `start(card, inHand, onDone)` runs it
 * (`onDone` once it is deleted, unless it was left, with whether all its data are proven erased),
 * `retry(onDone)` runs it again after a failure
 * (an interrupted one goes on: the card recorded deleted is reset if held, its erasure finished),
 * `leave()` lets one held to the phone go unless the card is being reset or its data erased.
 * Another opening of the panel starts idle; an attempt left behind shows nothing more, and opens no
 * NFC session nor sends any card a command.
 */
export function useCardDeletion(round: number) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ round: number; run: CardDeletion }>({ round, run: IDLE });
  const run = state.round === round ? state.run : IDLE;
  // The attempt shown: a later one, another opening or the panel going leave its answers unshown.
  const attempt = useRef(0);
  // Where the attempt shown is now, as deleteCard tells it (never a render behind it), null once
  // it ended: it can be left before the card is changed.
  const live = useRef<DeletionStep | null>(null);
  // One deletion at a time, one left included until it stopped.
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    attempt.current += 1;
    live.current = null;
  }, [round]);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    []
  );

  const start = (card: CardState, inHand: boolean, onDone?: Deleted, emptiedBefore = false) => {
    const of = ++attempt.current;
    let step: DeletionStep | null = null;
    // Read empty by an earlier attempt of this deletion: still said (a retry reads it no more once
    // the card is recorded deleted).
    let emptied = emptiedBefore;
    const show = (next: CardDeletion) => {
      if (attempt.current === of) setState({ round, run: next });
    };
    live.current = inHand ? "checking" : null;
    show(
      inHand ? { phase: "running", card, step: "checking", emptied } : { phase: "deleting", card }
    );
    const deleting = queue.current.then(() => {
      // Left while the attempt before it was stopping: nothing asked of anyone.
      if (attempt.current !== of) throw new PairingError("cancelled");
      return deleteCard(card.cardId, {
        inHand: inHand
          ? {
              messages: {
                alert: t("card.nfcAlert"),
                success: t("cards.sheet.nfcSuccess"),
                failure: t("cards.sheet.nfcFailure")
              },
              onStep: (next) => {
                step = next;
                if (attempt.current === of) live.current = next;
                show({ phase: "running", card, step: next, emptied });
              },
              onEmptied: () => {
                emptied = true;
                if (step !== null) show({ phase: "running", card, step, emptied });
              },
              stopped: () => attempt.current !== of
            }
          : undefined
      });
    });
    queue.current = deleting.then(
      () => undefined,
      () => undefined
    );
    const deleted = (outcome: DeletionOutcome) => {
      show({ phase: "done", card, inHand, emptied, outcome });
      if (attempt.current === of) onDone?.(card, outcome);
    };
    void deleting
      .then(
        ({ erased }) => deleted({ erased, pending: false }),
        (error: unknown) => {
          const reason = error instanceof PairingError ? error.reason : "failed";
          // Left ("Cancel", "I don't have the card", the panel closed): nothing to show.
          if (attempt.current !== of) return;
          // Without the card, nothing more to do here: the next syncs finish it (manage.ts).
          if (reason === "deletionPending" && !inHand) {
            logFailure("A card's deletion waits for the relays", error);
            deleted({ erased: false, pending: true });
            return;
          }
          // The holder closed the system's sheet (iOS): theirs, not a failure of the app's.
          if (reason !== "cancelled") logFailure("Deleting a card failed", error);
          show({ phase: "failed", card, inHand, emptied, step, reason });
        }
      )
      .finally(() => {
        if (attempt.current === of) live.current = null;
      });
  };

  const retry = (onDone?: Deleted): void => {
    if (run.phase === "failed") start(run.card, run.inHand, onDone, run.emptied);
  };

  /**
   * Whether the deletion held to the phone could be left: never once the card is being reset or its
   * data erased (an interruption then leaves it deleted, which "Try again" finishes). An attempt
   * left is let go: no session opens, nothing is sent to a card held after, the wait for it ends.
   */
  const leave = (): boolean => {
    const at = live.current;
    if (at === "resetting" || at === "erasing") return false;
    attempt.current += 1;
    live.current = null;
    if (at === "card") cancelCardSession();
    setState({ round, run: IDLE });
    return true;
  };

  /** Back to the panel after a failure without the card (its retry is the panel's button). */
  const clear = (): void => {
    if (run.phase === "failed") setState({ round, run: IDLE });
  };

  return { run, start, retry, leave, clear };
}
