import { MAX_CARD_PAYMENT_SATS } from "@/config/card";

import type { CardState } from "./card-record";
import { sameCardWallet } from "./keys";
import { isSpent, type CardPaymentEntry } from "./payment-entry";

/*
 * A card's limits (relay contract v2): the card pays without its holder confirming, and a dishonest
 * or compromised relay could hand the phone an invoice of its own for a genuine tap, or keep a tap
 * and use it later; the phone cannot tell. The limits bound what that can cost: per payment, over
 * 24 sliding hours, payments per hour, and the holder's switch that suspends the card. Counted from
 * this phone's log of card payments (payment-log.ts), those being sent and those that may have left
 * included: the card's current wallet's (a card added again after its deletion is a new card), but
 * an invoice is never paid twice from this phone, whatever card or wallet paid it.
 */

export type CardLimitBreach =
  /** The holder suspended the card. */
  | "suspended"
  /** Above the card's ceiling per payment. */
  | "aboveLimit"
  /** This invoice was paid already (or may have been). */
  | "alreadyPaid"
  /** With this one, the card would pay more than its limit over 24 sliding hours. */
  | "dayLimit"
  /** The card made its most payments of the last hour. */
  | "hourLimit";

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Whether the card may pay `amountSats` for the invoice of `paymentHash` at `now` (ms), given the
 * phone's log; `ignore` leaves out the entry of this very tap (when checked again before sending).
 * Null when it may; else the first limit it breaks.
 */
export function cardLimitBreach(
  card: Pick<
    CardState,
    | "cardId"
    | "walletGeneration"
    | "suspended"
    | "maxPaymentSats"
    | "maxDaySats"
    | "maxPaymentsPerHour"
  >,
  invoice: { amountSats: bigint; paymentHash: string },
  log: readonly CardPaymentEntry[],
  now: number,
  ignore: string | null = null
): CardLimitBreach | null {
  if (card.suspended) return "suspended";
  const ceiling =
    card.maxPaymentSats < MAX_CARD_PAYMENT_SATS ? card.maxPaymentSats : MAX_CARD_PAYMENT_SATS;
  if (invoice.amountSats > ceiling) return "aboveLimit";
  const spent = log.filter((entry) => entry.id !== ignore && isSpent(entry));
  // Any card's: the same invoice is never paid twice from this phone.
  if (spent.some((entry) => entry.paymentHash === invoice.paymentHash)) return "alreadyPaid";
  const mine = spent.filter((entry) => sameCardWallet(entry, card));
  const day = mine
    .filter((entry) => entry.at > now - DAY_MS)
    .reduce((sum, entry) => sum + entry.amountSats, 0n);
  if (day + invoice.amountSats > card.maxDaySats) return "dayLimit";
  const hour = mine.filter((entry) => entry.at > now - HOUR_MS).length;
  if (hour + 1 > card.maxPaymentsPerHour) return "hourLimit";
  return null;
}

/** What a card's limits leave at `now` (ms), counted as cardLimitBreach counts them. */
export type CardLimitUsage = {
  /** The sats the card spent over the last 24 sliding hours. */
  daySats: bigint;
  /** The first of those payments to leave the 24 hours: when (ms), and the sats that leave then. */
  dayRelease: { at: number; sats: bigint } | null;
  /**
   * The 24 hours full (their limit reached, or passed once it was lowered): when enough of their
   * sats have left for a payment of one sat (ms).
   */
  dayFreeAt: number | null;
  /** The card's payments of the last sliding hour. */
  hourCount: number;
  /** The first of them to leave the hour: when it was made, and when it leaves (ms). */
  hourRelease: { paidAt: number; at: number } | null;
  /** The hour full (its most payments made, or more): when the card may pay again (ms). */
  hourFreeAt: number | null;
};

/**
 * The card's limits as used at `now` (ms), from a log of card payments (this phone's, or what the
 * relays hold of the card's: the web app): its payments sent, being sent or maybe sent (isSpent),
 * those dated after now included, as cardLimitBreach counts them. A payment leaves a window 24 h
 * (or 1 h) after it was made.
 */
export function cardLimitUsage(
  card: Pick<CardState, "cardId" | "walletGeneration" | "maxDaySats" | "maxPaymentsPerHour">,
  log: readonly CardPaymentEntry[],
  now: number
): CardLimitUsage {
  const mine = log.filter((entry) => sameCardWallet(entry, card) && isSpent(entry));
  const day = mine.filter((entry) => entry.at > now - DAY_MS).sort((a, b) => a.at - b.at);
  const first = day[0];
  const daySats = day.reduce((sum, entry) => sum + entry.amountSats, 0n);
  // The day full: its oldest payments leave one after the other until one sat more fits (those of
  // the same time leave together).
  let dayFreeAt: number | null = null;
  let left = daySats;
  for (const entry of daySats >= card.maxDaySats ? day : []) {
    left -= entry.amountSats;
    if (left < card.maxDaySats) {
      dayFreeAt = entry.at + DAY_MS;
      break;
    }
  }
  const hour = mine
    .filter((entry) => entry.at > now - HOUR_MS)
    .map((entry) => entry.at)
    .sort((a, b) => a - b);
  // The hour full: the payment whose leaving makes room for one more.
  const blocking =
    hour.length >= card.maxPaymentsPerHour
      ? hour[hour.length - card.maxPaymentsPerHour]
      : undefined;
  return {
    daySats,
    dayRelease: first
      ? {
          at: first.at + DAY_MS,
          sats: day
            .filter((entry) => entry.at === first.at)
            .reduce((sum, entry) => sum + entry.amountSats, 0n)
        }
      : null,
    dayFreeAt,
    hourCount: hour.length,
    hourRelease: hour.length > 0 ? { paidAt: hour[0]!, at: hour[0]! + HOUR_MS } : null,
    hourFreeAt: blocking === undefined ? null : blocking + HOUR_MS
  };
}
