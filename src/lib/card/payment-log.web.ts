/*
 * Same API as payment-log.ts. Cards are paid by the app on a phone only: the web app logs no card
 * payment, it reads them on the account's relays (src/features/card/history-sync.ts).
 */
import type { MovementValue } from "./movement-value";
import type { CardPaymentEntry } from "./payment-entry";

export type { CardPaymentEntry, CardPaymentOutcome, CardPaymentPayee } from "./payment-entry";
export { CARD_PAYMENTS_KEPT_MS, isSpent } from "./payment-entry";

export const CARD_PAYMENTS_DIR_NAME = "card-payments";

export { NewerCardPaymentsError } from "./payment-entry";

export type CardPaymentCopy = { entry: CardPaymentEntry; revision: number };

export async function loadCardPayments(): Promise<CardPaymentEntry[]> {
  return [];
}

export function logCardPayment(_entry: CardPaymentEntry): Promise<void> {
  return Promise.reject(new Error("Card payments are made by the app on a phone"));
}

/** No iOS extension on the web: nothing to take in. */
export async function takeExtensionPayments(): Promise<number> {
  return 0;
}

export async function loadCardPaymentsToPublish(
  _relays: readonly string[],
  _now: number
): Promise<CardPaymentCopy[]> {
  return [];
}

export async function loadCardPaymentsToValue(_since: number): Promise<CardPaymentEntry[]> {
  return [];
}

export async function setCardPaymentValues(
  _values: ReadonlyMap<string, MovementValue>
): Promise<void> {}

export async function forgetCardPayments(_erased: ReadonlyMap<string, number>): Promise<number> {
  return 0;
}

export async function markCardPaymentsPublished(
  _relays: readonly string[],
  _published: ReadonlyMap<string, number>
): Promise<void> {}
