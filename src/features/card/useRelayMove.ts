import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CardState } from "@/lib/card/card-record";
import { cancelCardSession } from "@/lib/card/nfc-session";
import { logFailure } from "@/lib/log/log";

import { activationNotice, type ActivationNotice } from "./activation-notice";
import { reprogramCard } from "./manage";
import { PairingError, type PairingFailure } from "./pairing";
import { keepChannelSync } from "./sync";

/*
 * A card moved to another relay ("Change relay"), as
 * reprogramCard runs it (manage.ts): what comes before the card (notifications, the new relay asked,
 * the account's relays, the new relay's channel) while the form shows, its refusals said there (the
 * address's in its field, the others above its button); from the card on, the steps screen over the
 * panel (RelayMoveSteps.tsx), which stays until the move is done or left: "Try again" runs it
 * again from there, its checks shown as its first step. Kept by the card's panel (CardSheet.tsx).
 */

/**
 * The steps of the steps screen: `relay`, the checks of a move tried again (nothing asked of the
 * card yet); `card`, its wait; `programming`; `activating`, once the card may leave the phone.
 */
export type RelayMoveStep = "relay" | "card" | "programming" | "activating";

export type RelayMove =
  | { phase: "idle" }
  /** Before the card: the form shows it is being checked. */
  | { phase: "checking"; host: string }
  /** Refused before the card: nothing was written to it. */
  | { phase: "refused"; host: string; reason: PairingFailure }
  /** The steps screen. `touched`: an attempt of this move had the card in the field. */
  | { phase: "running"; host: string; former: string; step: RelayMoveStep; touched: boolean }
  | {
      phase: "done";
      host: string;
      former: string;
      /**
       * The former relay did not answer (`unreachable`), kept the card's channel (`refused`), or
       * answered without proving either (`unknown`): it stays there, or may, without effect. Null
       * once it is gone.
       */
      formerKept: "unreachable" | "refused" | "unknown" | null;
      /** The new channel is not ready yet, or wakes this phone with no notification. */
      notice: ActivationNotice | null;
    }
  | {
      phase: "failed";
      host: string;
      former: string;
      step: RelayMoveStep;
      reason: PairingFailure;
      touched: boolean;
    };

const IDLE: RelayMove = { phase: "idle" };

/**
 * The move to another relay of a card of the panel's opening `round`: `start(card, host)` runs it,
 * `retry(card)` runs it again after a failure (an interrupted one goes on from where it stopped),
 * `leave()` lets it go unless the card is being written to, `clear()` forgets a refusal once the
 * address changes. Another opening of the panel starts idle; an attempt left behind (left, the
 * panel closed or opened again) shows nothing more, and opens no NFC session nor sends any card a
 * command.
 */
export function useRelayMove(round: number) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ round: number; move: RelayMove }>({ round, move: IDLE });
  const move = state.round === round ? state.move : IDLE;
  // The attempt shown: a later one, another opening or the panel going leave its answers unshown.
  const attempt = useRef(0);
  // Where the attempt shown is now, as reprogramCard tells it (never a render behind it), null
  // once it ended: it can be left unless the card is being written to.
  const live = useRef<RelayMoveStep | null>(null);
  // One move at a time, one left included until it stopped: two would make the new relay's channel
  // at once. A move asked meanwhile runs after it, if it is still the one shown.
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

  const run = (
    card: CardState,
    host: string,
    again: { former: string; touched: boolean } | null
  ) => {
    const of = ++attempt.current;
    // A move tried again keeps the relay it leaves: the card's record may name the new one already.
    const former = again?.former ?? card.relayHost;
    let touched = again?.touched ?? false;
    // Before the card: the form's checks, or the first step of a move tried again.
    let step: RelayMoveStep | null = again ? "relay" : null;
    live.current = step;
    const show = (next: RelayMove) => {
      if (attempt.current === of) setState({ round, move: next });
    };
    show(
      again
        ? { phase: "running", host, former, step: "relay", touched }
        : { phase: "checking", host }
    );
    const moving = queue.current.then(() => {
      // Left while the move before it was stopping: nothing asked of anyone.
      if (attempt.current !== of) throw new PairingError("cancelled");
      return reprogramCard(card.cardId, {
        relayHost: host,
        formerRelayHost: former,
        messages: {
          alert: t("card.nfcAlert"),
          success: t("cards.sheet.nfcSuccess"),
          failure: t("cards.sheet.nfcFailure")
        },
        channelName: t("card.notificationChannel"),
        onStep: (next) => {
          // Before the card: the form shows the check, the steps open with the card.
          if (next === "notifications" || next === "relay") return;
          step = next;
          if (next === "programming") touched = true;
          if (attempt.current === of) live.current = next;
          show({ phase: "running", host, former, step: next, touched });
        },
        stopped: () => attempt.current !== of
      });
    });
    queue.current = moving.then(
      () => undefined,
      () => undefined
    );
    void moving
      .then(
        (result) => {
          // "Cards" says how the new channel is, as its sync at the end of the move found it.
          keepChannelSync(result.state, result.activation);
          show({
            phase: "done",
            host,
            former,
            formerKept:
              result.previousChannel === "unreachable" ||
              result.previousChannel === "refused" ||
              result.previousChannel === "unknown"
                ? result.previousChannel
                : null,
            notice: activationNotice(result.activation)
          });
        },
        (error: unknown) => {
          const reason = error instanceof PairingError ? error.reason : "failed";
          // Left ("Cancel", the panel closed): nothing to show nor to journal.
          if (attempt.current !== of) return;
          // The holder closed the system's sheet (iOS): theirs, not a failure of the app's.
          if (reason !== "cancelled") logFailure("Moving a card to another relay failed", error);
          show(
            step === null
              ? { phase: "refused", host, reason }
              : { phase: "failed", host, former, step, reason, touched }
          );
        }
      )
      .finally(() => {
        if (attempt.current === of) live.current = null;
      });
  };

  const start = (card: CardState, host: string): void => run(card, host, null);

  const retry = (card: CardState): void => {
    if (move.phase === "failed") run(card, move.host, move);
  };

  /**
   * Whether the move could be left: never while the card is written to (an interruption then leaves
   * it reset, manage.ts). An attempt left is let go: no session opens, nothing is sent to a card
   * held after, the wait for the card ends.
   */
  const leave = (): boolean => {
    const at = live.current;
    if (at === "programming" || at === "activating") return false;
    attempt.current += 1;
    live.current = null;
    if (at === "card") cancelCardSession();
    setState({ round, move: IDLE });
    return true;
  };

  const clear = (): void => {
    if (move.phase === "refused") setState({ round, move: IDLE });
  };

  return { move, start, retry, leave, clear };
}
