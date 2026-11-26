import type { TFunction } from "i18next";

import type { CardPaymentFailure } from "./payment-core";

/**
 * Why the phone does not pay a point of sale's invoice: a failure of the payment, or the holder's
 * own answer. `refused`: "Decline" pressed; `closed`: the panel closed before any answer;
 * `superseded`: a newer tap of the card replaced this one.
 */
export type CardDeclineCause = CardPaymentFailure | "refused" | "closed" | "superseded";

/** The most the card relay forwards to the point of sale, in UTF-16 code units (sattleme/relay). */
export const MAX_DECLINE_MESSAGE_LENGTH = 200;

type MessageKey =
  | "newPayee"
  | "unidentifiedPayee"
  | "unconfirmed"
  | "notConfirmed"
  | "refused"
  | "insufficientBalance"
  | "aboveLimit"
  | "dayLimit"
  | "hourLimit"
  | "suspended"
  | "invalidInvoice"
  | "expired"
  | "noAmount"
  | "outOfBounds"
  | "alreadyPaid"
  | "invalidTap"
  | "sendFailed"
  | "uncertain"
  | "updateApp"
  | "superseded"
  | "other";

const MESSAGES: Record<CardDeclineCause, MessageKey> = {
  newPayee: "newPayee",
  unidentifiedPayee: "unidentifiedPayee",
  unconfirmed: "unconfirmed",
  unlock: "notConfirmed",
  closed: "notConfirmed",
  refused: "refused",
  insufficientBalance: "insufficientBalance",
  aboveLimit: "aboveLimit",
  dayLimit: "dayLimit",
  hourLimit: "hourLimit",
  suspended: "suspended",
  invalidInvoice: "invalidInvoice",
  otherNetwork: "invalidInvoice",
  otherInvoice: "invalidInvoice",
  expired: "expired",
  noAmount: "noAmount",
  outOfBounds: "outOfBounds",
  alreadyPaid: "alreadyPaid",
  settled: "alreadyPaid",
  notYourCard: "invalidTap",
  replayed: "invalidTap",
  sendFailed: "sendFailed",
  // The payment may have left: paying the same invoice twice is impossible (one payment hash).
  uncertain: "uncertain",
  newerApp: "updateApp",
  superseded: "superseded",
  // The point of sale is gone (unreachable, ended): the answer, if sent, reaches nobody.
  unreachable: "other",
  ended: "other",
  late: "other",
  failed: "other"
};

/**
 * The sentence the point of sale shows as it receives it (the card relay forwards it unchanged):
 * written by the holder's app, in the language of the holder's phone, for whoever stands at the
 * till. Every sentence, in every language, fits in
 * MAX_DECLINE_MESSAGE_LENGTH (decline-message.test.ts). The phone's log keeps the reason's code,
 * never this sentence (CardDeclineReason, relay-session.ts).
 */
export function declineMessage(cause: CardDeclineCause, t: TFunction): string {
  return t(`card.decline.${MESSAGES[cause]}`);
}
