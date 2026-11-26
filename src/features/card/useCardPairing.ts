import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { holdActivity } from "@/lib/activity";
import type { CardState } from "@/lib/card/card-record";
import type { LegacyCard } from "@/lib/card/legacy-card";
import type { LegacyVisual } from "@/lib/card/legacy-visual";
import { cancelCardSession, type SessionMessages } from "@/lib/card/nfc-session";
import { logFailure } from "@/lib/log/log";

import {
  drainLegacyCard,
  finishLegacyMigration,
  MigrationEndedError,
  readLegacyBalance,
  reprogramLegacyCard,
  type MigrationStep
} from "./migration";
import {
  LegacyCardError,
  PairingError,
  pairCard,
  type PairingFailure,
  type PairingStep
} from "./pairing";
import { startMigratedCardHistory } from "./legacy-history";
import type { ChannelSync } from "./relay-sync";
import { NoAccountError, refreshCardStates, withCardAccess } from "./states";

/** A v2 card's migration, as its steps say it. */
export type MigrationShown = {
  /** The card's id: its new wallet's, the v3 card's. */
  cardId: string;
  /** What it held when the holder confirmed: 0 with nothing to transfer, null while unread. */
  amountSats: bigint | null;
  /** What its new wallet received: null until its transfer ended, or without one. */
  receivedSats: bigint | null;
  /** A migration left half-done, recognized: only the card's erase and programming remain. */
  resume: boolean;
  /**
   * What its server said of its printed visual (readLegacyBalance), when it did: shown on the
   * card's stage until its record holds it (MigrationSteps.tsx). Null for a migration left
   * half-done: its record holds it already, when there was one.
   */
  visual: LegacyVisual | null;
};

export type PairingView =
  /** Reading the account's cards: one may be paired already. */
  | { phase: "loading" }
  /**
   * Nothing asked of the phone yet (its notifications, its NFC): "Before you start", the steps to
   * come (AddCardSteps.tsx); "Start" starts.
   */
  | { phase: "guide" }
  /**
   * `step` null: the attempt waits for the one before it to stop (one left during its transfer, up
   * to CARD_MIGRATION_RECEIVE_MS), nothing asked of the phone yet.
   */
  | { phase: "running"; step: PairingStep | null }
  /**
   * A v2 card was presented for pairing: its balance read (`amountSats` null
   * meanwhile), then, when it holds one, migrated once the holder confirms (`confirmMigration`),
   * its balance transferred to its new wallet before it is re-encoded. A v2 card with no balance is
   * migrated at once, without asking. `visual`: what its server said of its printed visual (its
   * number), when it did.
   */
  | {
      phase: "legacy";
      card: LegacyCard;
      amountSats: bigint | null;
      visual: LegacyVisual | null;
    }
  /** A v2 card is migrating: its balance transferred, then the card erased and re-encoded. */
  | { phase: "migrating"; step: MigrationStep; migration: MigrationShown }
  /**
   * A card of the account is paired: `activation` is its channel's sync when this screen paired it
   * (null for a card paired before, whose channel the app start keeps in step). `migrated`: a v2
   * card this screen migrated, as its steps said it.
   */
  | {
      phase: "paired";
      card: CardState;
      activation: ChannelSync | null;
      migrated: MigrationShown | null;
    }
  /**
   * `step`: where it stopped, null before any. `touched`: an attempt of this screen had a card in
   * the field once its programming began (its next attempt goes on from there): nothing on a card
   * is said untouched then. `migration`: a v2 card's migration stopped.
   */
  | {
      phase: "failed";
      reason: PairingFailure;
      step: MigrationStep | null;
      touched: boolean;
      migration: MigrationShown | null;
    };

/** The migration of `cardId` before its transfer: `amountSats` null while unread (where it stopped). */
function shownOf(
  cardId: string,
  amountSats: bigint | null,
  { resume = false, visual = null }: { resume?: boolean; visual?: LegacyVisual | null } = {}
): MigrationShown {
  return { cardId, amountSats, receivedSats: null, resume, visual };
}

/**
 * The pairing screen's state, its pairing started with `start` ("Start", once its guide, the steps
 * to come, showed: nothing is asked of the phone before), again after a failure ("Try again"): in
 * the sign-up (src/app/onboarding/card.tsx), the account's paired card when it has one, else the
 * guide; in "Cards" (`another`), the guide, the account's other cards kept (several per account).
 * `cancel` stops it, back to the guide, unless the card is
 * it (`enabled` false).
 *
 * `finish`: "Finish the migration" of that card, from "Cards": its migration's steps at once,
 * without the guide, from where it was left (only its
 * erase and programming remain), that card only (migration.ts, finishLegacyMigration).
 *
 * A v2 card presented at the pairing is offered for migration instead of the
 * usual "not blank" (src/features/card/migration.ts): with a balance, the screen asks the holder to
 * confirm (`confirmMigration`) before transferring it; with none, the card is migrated at once.
 * "Try again" always starts from the card held again: whatever a v2 card holds is read again
 * before anything erases it.
 *
 * One attempt at a time, one cancelled or left included until it stopped (as "Change relay",
 * useRelayMove.ts): the next waits for it, and an attempt no longer shown shows nothing,
 * opens no NFC session nor sends any card a command.
 */
export function useCardPairing({
  enabled,
  another = false,
  finish = null
}: {
  enabled: boolean;
  another?: boolean;
  finish?: string | null;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState((): PairingView =>
    finish !== null
      ? {
          phase: "migrating",
          step: "notifications",
          migration: shownOf(finish, 0n, { resume: true })
        }
      : { phase: another ? "guide" : "loading" }
  );
  /** The attempt shown: one cancelled, left or followed by another shows nothing more. */
  const attempt = useRef(0);
  /**
   * Where the attempt shown is, as its operation tells it ("queued": waiting for the one before it
   * to stop); null once it ended.
   */
  const live = useRef<MigrationStep | "queued" | null>(null);
  /** Operations begun and not stopped yet, shown or not (one left during its transfer goes on). */
  const going = useRef(0);
  /** An attempt of this screen had a card in the field once its programming began. */
  const touched = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** The v2 card awaiting the holder's confirmation (phase "legacy"), its visual and number. */
  const pending = useRef<{
    card: LegacyCard;
    amountSats: bigint;
    visual: LegacyVisual | null;
    number: string | null;
  } | null>(null);

  useEffect(
    () => () => {
      // Left: what runs shows nothing more and opens no session; the wait for the card ends. Not
      // once the card is in the field: its programming goes on (an interruption is resumed). Shown
      // again (its effects run again), a new attempt starts after it.
      attempt.current += 1;
      if (live.current === "card") cancelCardSession();
      live.current = null;
    },
    []
  );

  const messages = (): SessionMessages => ({
    alert: t("card.nfcAlert"),
    success: t("card.nfcSuccess"),
    failure: t("card.nfcFailure")
  });

  /** Runs `operation` as the attempt shown, once the attempt before it stopped. */
  const run = (operation: (of: number) => Promise<void>): number => {
    const of = ++attempt.current;
    const next = queue.current.then(async () => {
      if (attempt.current !== of) return;
      going.current += 1;
      try {
        await operation(of);
      } finally {
        going.current -= 1;
      }
    });
    queue.current = next.catch(() => undefined);
    return of;
  };

  /** The attempt `of` reached `step`: shown, unless another is shown now. */
  const follow = (of: number, step: MigrationStep | "queued", next: PairingView) => {
    if (step === "programming") touched.current = true;
    if (attempt.current !== of) return;
    live.current = step;
    setView(next);
  };

  const end = (of: number, next: PairingView) => {
    if (attempt.current !== of) return;
    live.current = null;
    setView(next);
  };

  /**
   * A failure, shown where the attempt stopped unless it was left. Journaled either way: a v2
   * card's transfer requested, then left, may fail unconfirmed with no screen to say it (support
   * reads it). `event`: the journal's words, by default those of the pairing or of the migration.
   */
  const fail = (of: number, error: unknown, migration: MigrationShown | null, event?: string) => {
    const reason = error instanceof PairingError ? error.reason : "failed";
    // The holder closed the system's sheet (iOS), or left: theirs, not a failure of the app's (as
    // the relay change and the deletion journal it).
    if (reason !== "cancelled") {
      logFailure(event ?? (migration ? "Card migration failed" : "Card pairing failed"), error);
    }
    if (attempt.current !== of) return;
    const at = live.current;
    const step = at === "queued" ? null : at;
    end(of, { phase: "failed", reason, step, touched: touched.current, migration });
  };

  /**
   * Transfers a v2 card's balance (when any), then erases and re-encodes it; its visual, when its
   * server gave one (`shown.visual`), kept with its record. `card`: the v2 card read, null for a
   * migration left half-done (`shown.resume`), whose record says the rest. Migrated, its v2
   * history is copied in the background (legacy-history.ts), by the number printed on it: `number`,
   * as its server said it, else its record's (its issuer's visual).
   */
  const migrate = async (
    of: number,
    shown: MigrationShown,
    card: LegacyCard | null,
    number: string | null = null
  ) => {
    const { visual } = shown;
    let migration = shown;
    const step = (next: MigrationStep) =>
      follow(of, next, { phase: "migrating", step: next, migration });
    try {
      if (card && migration.amountSats !== null && migration.amountSats > 0n) {
        step("transferring");
        migration = { ...migration, receivedSats: await drainLegacyCard(card, { visual }) };
      }
      // Cancelled or left while the balance moved (up to CARD_MIGRATION_RECEIVE_MS, no NFC
      // session open yet, so nothing for cancelCardSession to end): no session is opened without a
      // screen to show it, else the next card held to the phone, whichever it is, would be taken
      // for this one. The card is untouched (a v2 card, or a half-erased one its "migrating"
      // record still names): a later pairing goes on from there.
      if (attempt.current !== of) throw new PairingError("cancelled");
      step("notifications");
      const options = {
        channelName: t("card.notificationChannel"),
        messages: messages(),
        onStep: step,
        stopped: () => attempt.current !== of
      };
      const paired = card
        ? await reprogramLegacyCard(card, { ...options, visual })
        : await finishLegacyMigration(migration.cardId, options);
      const printed = number ?? paired.state.issuer?.number ?? null;
      if (printed !== null) {
        const { cardId, walletGeneration } = paired.state;
        void startMigratedCardHistory({ cardId, walletGeneration }, printed);
      }
      end(of, {
        phase: "paired",
        card: paired.state,
        activation: paired.activation,
        migrated: migration
      });
    } catch (error) {
      if (error instanceof MigrationEndedError) {
        // Finished meanwhile, on another device: migrated, as a majority of the relays tell it.
        end(of, { phase: "paired", card: error.state, activation: null, migrated: migration });
        return;
      }
      if (error instanceof LegacyCardError && card === null) {
        // A migration to finish whose card still pays as a v2 card (its transfer failed, or was
        // left): never erased so; its balance read again, then migrated afresh.
        await beginMigration(of, error.card);
        return;
      }
      fail(of, error, migration);
    }
  };

  /** A v2 card was recognized: read what it can transfer, then confirm or migrate at once. */
  const beginMigration = async (of: number, card: LegacyCard) => {
    // Its transfer's step: a failure to read is said there, and it can be cancelled meanwhile.
    follow(of, "transferring", { phase: "legacy", card, amountSats: null, visual: null });
    try {
      const balance = await readLegacyBalance(card);
      if (!balance.drain) {
        // No balance to move: re-encoded without asking.
        await migrate(
          of,
          shownOf(card.cardId, 0n, { visual: balance.visual }),
          card,
          balance.number
        );
        return;
      }
      if (attempt.current !== of) return;
      pending.current = {
        card,
        amountSats: balance.sats,
        visual: balance.visual,
        number: balance.number
      };
      end(of, { phase: "legacy", card, amountSats: balance.sats, visual: balance.visual });
    } catch (error) {
      fail(of, error, shownOf(card.cardId, null), "Reading a v2 card's balance failed");
    }
  };

  const pair = async (of: number) => {
    const step = (next: PairingStep) => follow(of, next, { phase: "running", step: next });
    try {
      const paired = await pairCard({
        relayHost: DEFAULT_CARD_RELAY_HOST,
        channelName: t("card.notificationChannel"),
        messages: messages(),
        onStep: step,
        stopped: () => attempt.current !== of
      });
      end(of, {
        phase: "paired",
        card: paired.state,
        activation: paired.activation,
        migrated: null
      });
    } catch (error) {
      if (error instanceof LegacyCardError) {
        // A migration left half-done, here or on another device (its erase interrupted): the
        // balance is already moved, so only finish erasing and re-encoding — no transfer, no
        // confirmation. Its visual, if its server gave one, is with its record already.
        if (error.resume) await migrate(of, shownOf(error.card.cardId, 0n, { resume: true }), null);
        else await beginMigration(of, error.card);
        return;
      }
      fail(of, error, null);
    }
  };

  /** "Start", "Try again": shown at once, run once an attempt cancelled before stopped. */
  const start = () => {
    // A second tap: the attempt it would start runs already.
    if (live.current !== null) return;
    pending.current = null;
    if (finish !== null) {
      const migration = shownOf(finish, 0n, { resume: true });
      const of = run((current) => migrate(current, migration, null));
      follow(of, "notifications", { phase: "migrating", step: "notifications", migration });
      return;
    }
    // An attempt left still stopping: this one shows its steps to come meanwhile (pairCard shows
    // its first once it begins).
    const waits = going.current > 0;
    const of = run(pair);
    follow(
      of,
      waits ? "queued" : "notifications",
      waits ? { phase: "running", step: null } : { phase: "running", step: "notifications" }
    );
  };

  // "Finish the migration": started as the screen shows, the holder having asked for it.
  const startFinishing = useEffectEvent(start);
  useEffect(() => {
    if (enabled && finish !== null) startFinishing();
  }, [enabled, finish]);

  // The auto-lock never closes the account while an attempt runs (its checks, the card asked for
  // and programmed, a v2 card's balance read or transferred), as for a relay change or a deletion
  // (CardSheet.tsx): it would end the session, and the card wallets a transfer waits on.
  const busy =
    enabled &&
    (view.phase === "running" ||
      view.phase === "migrating" ||
      (view.phase === "legacy" && view.amountSats === null));
  useEffect(() => (busy ? holdActivity() : undefined), [busy]);

  /** The holder confirmed the transfer on the "legacy" screen: migrate the card. */
  const confirmMigration = () => {
    const target = pending.current;
    if (!target || live.current !== null) return;
    pending.current = null;
    const migration = shownOf(target.card.cardId, target.amountSats, {
      visual: target.visual
    });
    const of = run((current) => migrate(current, migration, target.card, target.number));
    follow(of, "transferring", { phase: "migrating", step: "transferring", migration });
  };

  useEffect(() => {
    if (!enabled || another) return;
    let cancelled = false;
    void (async () => {
      try {
        const { states } = await withCardAccess(refreshCardStates);
        const active = states.find((state) => state.status === "active");
        if (cancelled) return;
        setView(
          active
            ? { phase: "paired", card: active, activation: null, migrated: null }
            : { phase: "guide" }
        );
      } catch (error) {
        if (cancelled) return;
        setView(
          error instanceof NoAccountError
            ? { phase: "failed", reason: "noAccount", step: null, touched: false, migration: null }
            : // The relays may be down: the pairing tells it, with its own reason.
              { phase: "guide" }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, another]);

  /**
   * Stops what runs, back to the guide: the card awaited is let go, a migration under way stops
   * before it asks for the card again (its transfer, once asked, goes on). Never while the card is
   * written to: false then, and nothing changes (an interruption would leave it to resume).
   * `leaving`: the screen goes, its view kept as it is meanwhile (no guide shown on the way out).
   */
  const cancel = (leaving = false): boolean => {
    const at = live.current;
    if (at === "programming" || at === "activating") return false;
    attempt.current += 1;
    live.current = null;
    pending.current = null;
    if (at === "card") cancelCardSession();
    if (!leaving) setView({ phase: "guide" });
    return true;
  };

  return { view, start, retry: start, cancel, confirmMigration };
}
