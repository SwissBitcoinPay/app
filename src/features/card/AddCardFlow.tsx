import { useEffect, useRef, type ReactNode } from "react";
import { BackHandler, Platform, StyleSheet, Vibration, View } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import type { CardState } from "@/lib/card/card-record";

import { AddCardSteps } from "./AddCardSteps";
import { LegacyCardFound } from "./LegacyCardFound";
import { MigrationSteps } from "./MigrationSteps";
import type { PairingView, useCardPairing } from "./useCardPairing";

/*
 * "Add a card", in "Cards" (PairCardScreen.tsx) and in the sign-up (src/app/onboarding/card.tsx,
 * the same steps): one screen, its steps to come until "Start" (no screen of its own for the guide
 * before them), then under way; a v2 card held, the card detected, then its migration's steps. The
 * screen around it draws the header: its way back (`addCardBack`) leads out, "Cancel" out
 * (`onLeave`, "Cards") or back to the steps to come (the sign-up).
 */

type Pairing = ReturnType<typeof useCardPairing>;

/**
 * The card is being written to, or the card programmed is being activated: nothing leads away. An
 * interruption of its writing leaves it to resume; once programmed, its addition completes whatever
 * the screen does (as the migration, whose "Cancel" stops before "Card activated").
 */
export function writingCard(view: PairingView): boolean {
  if (view.phase !== "running" && view.phase !== "migrating") return false;
  return view.step === "programming" || view.step === "activating";
}

/**
 * What the screen's way back does: out (`leave`, which stops an attempt), the steps under way or
 * not, a failure, the detected card or the account's cards being read included: the steps to come
 * are this same screen, a way back to them would not seem to lead anywhere. Once added, as
 * "Later" (`finish`); nothing while the card is written to.
 */
export function addCardBack(
  view: PairingView,
  ways: { leave: () => void; finish: (card: CardState) => void }
): (() => void) | null {
  if (view.phase === "paired") return () => ways.finish(view.card);
  return writingCard(view) ? null : ways.leave;
}

export function AddCardFlow({
  pairing,
  onLeave,
  onRecharge,
  onLater,
  finishing = null,
  extra = null
}: {
  pairing: Pairing;
  /** "Cancel" leaves the screen ("Cards"); null: back to the guide (the sign-up). */
  onLeave: (() => void) | null;
  onRecharge: (card: CardState) => void;
  /** "Later", "Done" once migrated. */
  onLater: (card: CardState) => void;
  /** Which of `onRecharge` and `onLater` is under way, when the screen waits on it (the sign-up). */
  finishing?: "recharge" | "later" | null;
  /** Under the steps once the card is added: what the screen adds (a failure to save). */
  extra?: ReactNode;
}) {
  const { view } = pairing;

  // Android: the card may leave the phone once programmed ("until it vibrates"), each time an
  // attempt gets there; iOS's NFC sheet gives its own confirmation.
  const programmed =
    ((view.phase === "running" || view.phase === "migrating") && view.step === "activating") ||
    (view.phase === "paired" && view.activation !== null);
  const wasProgrammed = useRef(false);
  useEffect(() => {
    if (programmed && !wasProgrammed.current && Platform.OS === "android") Vibration.vibrate(200);
    wasProgrammed.current = programmed;
  }, [programmed]);

  // Android's back button: never while the card is written to.
  const writing = writingCard(view);
  useEffect(() => {
    if (!writing) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [writing]);

  const cancel = () => {
    if (pairing.cancel(onLeave !== null)) onLeave?.();
  };

  switch (view.phase) {
    case "loading":
      return (
        <View style={styles.center} testID="add-card-loading">
          <Spinner size={22} />
        </View>
      );
    case "legacy":
      return (
        <LegacyCardFound
          card={view.card}
          amountSats={view.amountSats}
          visual={view.visual}
          onConfirm={pairing.confirmMigration}
          onCancel={cancel}
        />
      );
    case "migrating":
      return (
        <MigrationSteps
          migration={view.migration}
          run={{ phase: "migrating", step: view.step }}
          onRetry={pairing.retry}
          onCancel={cancel}
          onFinish={onLater}
        />
      );
    case "failed":
      return view.migration ? (
        <MigrationSteps
          migration={view.migration}
          run={view}
          onRetry={pairing.retry}
          onCancel={cancel}
          onFinish={onLater}
        />
      ) : (
        <AddCardSteps
          view={view}
          actions={{
            onStart: pairing.start,
            onRetry: pairing.retry,
            onCancel: cancel,
            onRecharge,
            onLater
          }}
        />
      );
    case "paired":
      return view.migrated ? (
        <MigrationSteps
          migration={view.migrated}
          run={{ phase: "paired", card: view.card, activation: view.activation }}
          onRetry={pairing.retry}
          onCancel={cancel}
          onFinish={onLater}
          finishing={finishing === "later"}
          extra={extra}
        />
      ) : (
        <AddCardSteps
          view={view}
          actions={{
            onStart: pairing.start,
            onRetry: pairing.retry,
            onCancel: cancel,
            onRecharge,
            onLater,
            finishing
          }}
          extra={extra}
        />
      );
    case "guide":
    case "running":
      return (
        <AddCardSteps
          view={view}
          actions={{
            onStart: pairing.start,
            onRetry: pairing.retry,
            onCancel: cancel,
            onRecharge,
            onLater
          }}
        />
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
