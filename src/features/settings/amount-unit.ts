import { useSyncExternalStore } from "react";

import { DEFAULT_AMOUNT_UNIT, type AmountUnit } from "./amount-unit-format";
import { readAmountUnit, writeAmountUnit } from "./amount-unit-store";

/*
 * "Currency shown first" in "Settings" (fiat by default, with a choice of fiat or sats): what the
 * lists of movements write first, "Wallet"
 * and the history of a card, the other value under it. This device's choice, as "Discreet": each
 * device of the business picks its own, nothing goes to the account. Read as the first screen that
 * follows it shows; until then, and without a choice, the display currency.
 */

/** This device's choice; null until read. */
let unit: AmountUnit | null = null;
/** Each read, and each reset, counts: a read started before a reset never applies after it. */
let generation = 0;
let reading = false;
const listeners = new Set<() => void>();

function tell(): void {
  for (const listener of listeners) listener();
}

function startRead(): void {
  if (reading) return;
  reading = true;
  const started = generation;
  void readAmountUnit().then((saved) => {
    if (started !== generation) return;
    reading = false;
    // A choice saved meanwhile stands over the one read before it.
    if (unit === null) {
      unit = saved ?? DEFAULT_AMOUNT_UNIT;
      tell();
    }
  });
}

/** Calls `listener` at each change of the choice; the first follower reads it. Returns how to stop. */
export function followAmountUnit(listener: () => void): () => void {
  listeners.add(listener);
  if (unit === null) startRead();
  return () => {
    listeners.delete(listener);
  };
}

/** This device's choice; null until read (the default applies meanwhile). */
export function amountUnitChoice(): AmountUnit | null {
  return unit;
}

/** Saves this device's choice, then tells the screens. Rejects when it was not saved: nothing changes. */
export async function saveAmountUnit(next: AmountUnit): Promise<void> {
  await writeAmountUnit(next);
  unit = next;
  tell();
}

/**
 * Forgets the choice read ("Log out", device-wipe.ts, once its key is removed): read again by
 * the screens that follow it, the default then.
 */
export function resetAmountUnit(): void {
  generation += 1;
  reading = false;
  unit = null;
  if (listeners.size > 0) startRead();
  tell();
}

/** The choice as "Settings" shows it: null until read. */
export function useAmountUnitChoice(): AmountUnit | null {
  return useSyncExternalStore(followAmountUnit, amountUnitChoice);
}

/** What the lists of movements write first, followed: the default until the choice is read. */
export function useAmountUnit(): AmountUnit {
  return useAmountUnitChoice() ?? DEFAULT_AMOUNT_UNIT;
}
