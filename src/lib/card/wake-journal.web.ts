import type { TapCheckedWith } from "./tap";
import type { CardWakeEntry, WakeStep } from "./wake-entry";

/*
 * Same API as wake-journal.ts. Cards are paid by the app on a phone only, and woken by the card
 * socket on Android only: the web app has no card wakes to journal.
 */

export type { CardWakeEntry, WakeStep } from "./wake-entry";
export { MAX_WAKES, MAX_WAKE_STEPS, isWakeCode } from "./wake-entry";

export const CARD_WAKES_DIR_NAME = "card-wakes";

export class NewerCardWakesError extends Error {}

export async function loadCardWakes(): Promise<CardWakeEntry[]> {
  return [];
}

export async function beginCardWake(
  _wake: Omit<CardWakeEntry, "steps" | "tapCheck" | "endedAtMs">
): Promise<void> {}

export async function addCardWakeStep(_id: string, _step: WakeStep): Promise<void> {}

export async function endCardWake(
  _id: string,
  _endedAtMs: number,
  _tapCheck: TapCheckedWith | null
): Promise<void> {}

export async function clearCardWakes(): Promise<void> {}
