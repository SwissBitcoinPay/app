import { decodeSignedBolt11 } from "@/lib/lightning/bolt11";
import { isSatsNumber } from "@/lib/sats";

import { isWalletGeneration } from "./keys";
import { parseMovementValue, type MovementValue } from "./movement-value";
import { provenAddress } from "./payee-proof";

/*
 * A card payment as the phone logs it (payment-log.ts) and as the account's relays keep it
 * (history-records.ts): one shape, checked the same way wherever it is read. Pure.
 */

/**
 * Entries older than this are dropped from the log, and the relays drop their records then
 * (NIP-40): past every limit, and enough for the holder's review.
 */
export const CARD_PAYMENTS_KEPT_MS = 90 * 24 * 3600 * 1000;

/**
 * Thrown when a newer app wrote the phone's log of card payments (payment-log.ts): it is never
 * written over, and no card pays.
 */
export class NewerCardPaymentsError extends Error {}

export type CardPaymentOutcome =
  /** Being sent: counts as paid for the limits until told otherwise. */
  | "sending"
  | "sent"
  /** The wallet's answer was lost: may have left, counts as paid. */
  | "uncertain"
  /** Refused by the phone (a limit, the card suspended, an invoice already paid…). */
  | "declined"
  /** The wallet did not pay it: nothing left. */
  | "failed";

/**
 * Who a payment paid, as the phone saw it (payee-proof.ts): kept for the holder, and as the proof
 * in a dispute. The address is in the metadata, never shown. A payee identified by its node keeps
 * the point of sale's proof too, the one that did not hold (its own proof is the invoice's
 * signature, `pr`): identifiedPayeeOf tells them apart by checking the proof again.
 */
export type CardPaymentPayee = {
  /**
   * `approved`, `new`: identified, then approved or not; `unidentified`: not identified;
   * `unchecked`: "Automatic", whoever it is.
   */
  status: "approved" | "new" | "unidentified" | "unchecked";
  /**
   * The name it declared (`text/plain`; a node's: its alias), null when not identified or none was
   * read.
   */
  name: string | null;
  /** The point of sale's proof and the verify URL's answer, as received; null when absent. */
  metadata: string | null;
  verify: string | null;
  verifyAnswer: string | null;
};

export type CardPaymentEntry = {
  /**
   * One entry per tap: 16 random bytes the phone drew for it (payment.ts), never the relay's
   * session (older entries have the session: the same shape).
   */
  id: string;
  cardId: string;
  /** The generation of the card's wallet that paid it (keys.ts, CardWalletOf). */
  walletGeneration: number;
  /** When the point of sale's invoice came (ms). */
  at: number;
  amountSats: bigint;
  /** The invoice's payment hash (hex). */
  paymentHash: string;
  /** What the point of sale wrote, cleaned (card-invoice.ts). */
  description: string | null;
  outcome: CardPaymentOutcome;
  /** For `declined` and `failed`: the short reason the point of sale was given. */
  reason: string | null;
  /** The invoice as received. */
  pr: string;
  /** Who it paid; null when not known yet. */
  payee: CardPaymentPayee | null;
  /** Once paid: its preimage (hex), whose SHA-256 is `paymentHash`. */
  preimage: string | null;
  /**
   * What it was worth when its invoice came (movement-value.ts), once known: for a payment that
   * left (`sent`, `uncertain`) only; null until worked out.
   */
  value: MovementValue | null;
};

const PAYEE_STATUSES: readonly CardPaymentPayee["status"][] = [
  "approved",
  "new",
  "unidentified",
  "unchecked"
];
/** As the relay forwards them (relay-session.ts) and payee-proof.ts reads them. */
const MAX_INVOICE_LENGTH = 2048;
const MAX_NAME_LENGTH = 255;
const MAX_METADATA_LENGTH = 1024;
const MAX_VERIFY_LENGTH = 512;
const MAX_VERIFY_ANSWER_LENGTH = 4096;

const OUTCOMES: readonly CardPaymentOutcome[] = [
  "sending",
  "sent",
  "uncertain",
  "declined",
  "failed"
];

function stringOrNull(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= max);
}

function parsePayee(value: unknown): CardPaymentPayee | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (
    !PAYEE_STATUSES.includes(v.status as CardPaymentPayee["status"]) ||
    !stringOrNull(v.name, MAX_NAME_LENGTH) ||
    !stringOrNull(v.metadata, MAX_METADATA_LENGTH) ||
    !stringOrNull(v.verify, MAX_VERIFY_LENGTH) ||
    !stringOrNull(v.verifyAnswer, MAX_VERIFY_ANSWER_LENGTH)
  ) {
    return undefined;
  }
  return {
    status: v.status as CardPaymentPayee["status"],
    name: v.name,
    metadata: v.metadata,
    verify: v.verify,
    verifyAnswer: v.verifyAnswer
  };
}

/**
 * An entry (of the log's format 4, payment-log.ts, and the history's records, history-records.ts),
 * checked whole; null when out of shape.
 */
export function parseCardPaymentEntry(value: unknown): CardPaymentEntry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const payee = parsePayee(v.payee);
  const worth = parseMovementValue(v.value);
  if (
    payee === undefined ||
    worth === undefined ||
    !isWalletGeneration(v.walletGeneration) ||
    typeof v.pr !== "string" ||
    v.pr.length > MAX_INVOICE_LENGTH ||
    (v.preimage !== null && (typeof v.preimage !== "string" || !/^[0-9a-f]{64}$/.test(v.preimage)))
  ) {
    return null;
  }
  if (
    typeof v.id !== "string" ||
    !/^[0-9a-f]{1,64}$/.test(v.id) ||
    typeof v.cardId !== "string" ||
    !/^[0-9a-f]{32}$/.test(v.cardId) ||
    typeof v.at !== "number" ||
    !Number.isSafeInteger(v.at) ||
    !isSatsNumber(v.amountSats) ||
    typeof v.paymentHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(v.paymentHash) ||
    (v.description !== null && typeof v.description !== "string") ||
    !OUTCOMES.includes(v.outcome as CardPaymentOutcome) ||
    (v.reason !== null && typeof v.reason !== "string")
  ) {
    return null;
  }
  return {
    id: v.id,
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    at: v.at,
    amountSats: BigInt(v.amountSats),
    paymentHash: v.paymentHash,
    description: v.description as string | null,
    outcome: v.outcome as CardPaymentOutcome,
    reason: v.reason as string | null,
    pr: v.pr,
    payee,
    preimage: v.preimage as string | null,
    value: worth
  };
}

/** An entry's value: its amount as a JSON number (a safe integer, src/lib/sats.ts). */
export function cardPaymentEntryValue(entry: CardPaymentEntry): Record<string, unknown> {
  return { ...entry, amountSats: Number(entry.amountSats) };
}

/** What counts against a card's limits: its payments sent, being sent, or maybe sent. */
export function isSpent(entry: CardPaymentEntry): boolean {
  return entry.outcome === "sending" || entry.outcome === "sent" || entry.outcome === "uncertain";
}

/**
 * Whether its value is worth keeping: a payment that left, or may have (a refused one has no
 * value, nothing moved). Never one still being sent: it may fail.
 */
export function isValued(entry: CardPaymentEntry): boolean {
  return entry.outcome === "sent" || entry.outcome === "uncertain";
}

/**
 * Who a payment's record says it went to, when its payee was identified (`approved`, `new`): its
 * address, when the proof it keeps proves it (checked again as at the payment, provenAddress),
 * else the node that signed its invoice (with the alias it announced then, if read). Null
 * otherwise.
 */
export function identifiedPayeeOf(
  entry: CardPaymentEntry
): { by: "address" | "node"; id: string; name: string | null } | null {
  const { payee, pr } = entry;
  if (payee?.status !== "approved" && payee?.status !== "new") return null;
  // Read once: its description hash (the proof's), its signer (the node's) only when needed.
  const signed = decodeSignedBolt11(pr);
  if (signed === null) return null;
  if (payee.metadata !== null) {
    const { descriptionHash } = signed.invoice;
    const proven = provenAddress({ pr, descriptionHash }, payee);
    if (proven) return { by: "address", id: proven.address, name: proven.name };
  }
  const node = signed.signer();
  // Its name: the alias it announced then, null for none read.
  return node === null ? null : { by: "node", id: node, name: payee.name };
}
