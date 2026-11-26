import type { SendDestinationKind, WalletPayment } from "@/lib/breez/types";
import { MAX_SATS, isSatsNumber } from "@/lib/sats";

import { cleanDescription } from "./card-invoice";
import { isWalletGeneration, type CardWalletOf } from "./keys";
import { parseMovementValue, type MovementValue } from "./movement-value";

/*
 * What came to a card's wallet or left it besides its payments at a point of sale (the history
 * shows every movement of the card): its recharges, in four ways, its returns to the main
 * balance, and its withdrawals to any other wallet ("Withdraw" of a card pays anyone, as
 * "Wallet"'s "Send", and its
 * history says each). Read from the card's own wallet (src/features/card/
 * card-wallet.ts), the same on every device (the SDK gives a wallet's whole history back after its
 * first sync, spark-sdk 0.28.4), then kept with its value on the account's relays
 * (history-records.ts), for every device and the copies of each month. Pure.
 *
 * How each came, from what the wallet tells of it (spark-sdk 0.28.4, as 0.26.1 already):
 * - a Spark transfer received: "From my main balance" (prepareRecharge). The card's Spark
 *   address is shown nowhere: only the account's wallet sends it one (and an invoice is never
 *   settled as a Spark transfer in this app: `preferSpark` off on both sides);
 * - a Lightning payment received with a description: an invoice of "Top up" (cardInvoice,
 *   which always gives one); without: its Lightning address (the invoices of breez.tips commit to
 *   the address's metadata, LUD-06, of which the SDK keeps no description);
 * - an on-chain deposit claimed: "Bitcoin address", its claim's fee deducted (the payment's
 *   `fees`), with its transaction;
 * - a Bitcoin withdrawal sent: a withdrawal to a Bitcoin address, with its transaction (no payment at
 *   a point of sale nor return goes on-chain);
 * - a Spark transfer or a Lightning payment sent with a withdrawal's note (CardWithdrawalNote): a
 *   withdrawal, to where the note says. The note is written on a majority of the account's relays
 *   before the withdrawal leaves (card-wallet.ts, cardSendSource), at the payment's own id (the
 *   SDK names a payment by its idempotency key: send/mod.rs of spark-sdk 0.28.4);
 * - a Spark transfer sent without one: "Withdraw to my main balance" (prepareReturn), once
 *   the notes were read on a majority of the relays (any two majorities share a relay: a note there
 *   would have been read). Before, it is not known yet: an UnidentifiedMovement, `undecided`.
 * A Lightning payment sent without a note is a payment at a point of sale: the phone that paid it
 * keeps it with its tap (payment-log.ts), never here (a withdrawal of an older app neither: it
 * wrote no note). A payment not completed is not a movement yet. A transfer the SDK
 * cannot tell (WalletPayment.network `unknown`) is none of these: an UnidentifiedMovement.
 *
 * IRREVERSIBLE: the shape, part of the history's records (MOVEMENT_FORMAT_VERSION).
 */

/** How a recharge came: the main balance, an invoice, the Lightning address, the Bitcoin address. */
export type CardRechargeWay = "main" | "invoice" | "address" | "onchain";

/**
 * Where a withdrawal went: a Lightning invoice, a Lightning address, an LNURL, a Bitcoin address, a
 * Spark address (what "Send" read: withdrawalWayOf).
 */
export type CardWithdrawalWay = "invoice" | "address" | "lnurl" | "onchain" | "spark";

/** A recharge's way or a withdrawal's (the same word, the same means: an invoice, an address…). */
export type CardMovementWay = CardRechargeWay | CardWithdrawalWay;

const WITHDRAWAL_WAYS: Record<SendDestinationKind, CardWithdrawalWay> = {
  bolt11: "invoice",
  lightningAddress: "address",
  lnurlPay: "lnurl",
  bitcoinAddress: "onchain",
  sparkAddress: "spark"
};

/** Where a withdrawal to what "Send" read (its kind) goes. */
export function withdrawalWayOf(kind: SendDestinationKind): CardWithdrawalWay {
  return WITHDRAWAL_WAYS[kind];
}

export type CardMovement = {
  /**
   * The wallet's id of the payment (a Spark transfer's is the same for both wallets): each of a
   * card's wallets has payments of its own, never the same id.
   */
  id: string;
  cardId: string;
  /** The generation of the card's wallet it moved (keys.ts, CardWalletOf). */
  walletGeneration: number;
  kind: "recharge" | "return" | "withdrawal";
  /** How a recharge came (CardRechargeWay), where a withdrawal went (CardWithdrawalWay); null for a return. */
  way: CardMovementWay | null;
  /** When the wallet made it (ms). */
  at: number;
  /** What came to the card's balance (a deposit: its fee deducted) or left it. */
  amountSats: bigint;
  /**
   * What the wallet tells it cost (the SDK's `fees`): a deposit's claim, deducted; a return's
   * transfer and a withdrawal, on top; none otherwise so far (spark-sdk 0.28.4).
   */
  feeSats: bigint;
  /** A deposit, a withdrawal to a Bitcoin address: its transaction id (lowercase hex). */
  txid: string | null;
  /** An invoice of "Top up": its description. */
  description: string | null;
  /** What it was worth then (movement-value.ts), once known. */
  value: MovementValue | null;
};

const WAYS: readonly CardRechargeWay[] = ["main", "invoice", "address", "onchain"];
const OUT_WAYS: readonly CardWithdrawalWay[] = Object.values(WITHDRAWAL_WAYS);
/** As the SDK gives its ids (a Spark transfer's: a UUID): visible ASCII, bounded. */
const PAYMENT_ID = /^[\x21-\x7e]{1,128}$/;
const CARD_ID = /^[0-9a-f]{32}$/;
const TXID = /^[0-9a-f]{64}$/;
/** As a point of sale's description is bounded (card-invoice.ts) and an invoice's (BOLT11). */
const MAX_DESCRIPTION_LENGTH = 639;

function isFee(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SATS
  );
}

/**
 * A withdrawal of a card's wallet, as noted before it left (see above): the payment's id, and
 * where it went. IRREVERSIBLE: its shape, a record of the history (history-records.ts,
 * WITHDRAWAL_FORMAT_VERSION).
 */
export type CardWithdrawalNote = {
  cardId: string;
  walletGeneration: number;
  /** The payment's id: its idempotency key (a UUID, lowercase, as the SDK writes it). */
  id: string;
  way: CardWithdrawalWay;
};

/**
 * The withdrawals' notes read (by movementKey: their card and payment), and whether a majority of
 * the account's relays answered whole (a note a majority took is among them then).
 */
export type WithdrawalNotes = {
  ways: ReadonlyMap<string, CardWithdrawalWay>;
  conclusive: boolean;
};

/** No note read: a Spark transfer sent is not known yet (see above). */
export const NO_NOTES: WithdrawalNotes = { ways: new Map(), conclusive: false };

/** A note as written, its version alongside (history-records.ts). */
export function cardWithdrawalNoteValue(note: CardWithdrawalNote): Record<string, unknown> {
  return {
    cardId: note.cardId,
    walletGeneration: note.walletGeneration,
    id: note.id,
    way: note.way
  };
}

/** A note as written (cardWithdrawalNoteValue), checked whole; null when out of shape. */
export function parseCardWithdrawalNote(value: unknown): CardWithdrawalNote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.cardId !== "string" ||
    !CARD_ID.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    typeof v.id !== "string" ||
    !PAYMENT_ID.test(v.id) ||
    !OUT_WAYS.includes(v.way as CardWithdrawalWay)
  ) {
    return null;
  }
  return {
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    id: v.id,
    way: v.way as CardWithdrawalWay
  };
}

/** The key of a payment of a card's wallet: as movementKey (history-records.ts). */
function paymentKey(cardId: string, id: string): string {
  return `${cardId}/${id}`;
}

/**
 * The movement of the card's wallet `card` that `payment` of it is, without its value yet; null
 * when it is none (see above): a payment at a point of sale, one not completed, one out of shape,
 * or a Spark transfer sent not known yet (`notes` not conclusive: unidentifiedOf tells it).
 */
export function movementOf(
  { cardId, walletGeneration }: CardWalletOf,
  payment: WalletPayment,
  notes: WithdrawalNotes
): CardMovement | null {
  if (payment.status !== "completed" || !PAYMENT_ID.test(payment.id)) return null;
  if (payment.amountSats <= 0n || payment.feeSats < 0n) return null;
  const base = {
    id: payment.id,
    cardId,
    walletGeneration,
    at: payment.timestamp * 1000,
    amountSats: payment.amountSats,
    feeSats: payment.feeSats,
    txid: null,
    description: null,
    value: null
  };
  if (payment.direction === "send") {
    const noted = notes.ways.get(paymentKey(cardId, payment.id)) ?? null;
    switch (payment.network) {
      case "bitcoin":
        // Its transaction, as a deposit's: given once the SDK has it.
        return payment.txId && TXID.test(payment.txId)
          ? { ...base, kind: "withdrawal", way: "onchain", txid: payment.txId }
          : null;
      case "spark":
        if (noted !== null) return { ...base, kind: "withdrawal", way: noted };
        return notes.conclusive ? { ...base, kind: "return", way: null } : null;
      case "lightning":
        return noted !== null ? { ...base, kind: "withdrawal", way: noted } : null;
      case "unknown":
        return null;
    }
  }
  switch (payment.network) {
    case "spark":
      return { ...base, kind: "recharge", way: "main" };
    case "lightning": {
      const description = payment.description?.slice(0, MAX_DESCRIPTION_LENGTH) || null;
      return description
        ? { ...base, kind: "recharge", way: "invoice", description }
        : { ...base, kind: "recharge", way: "address" };
    }
    case "bitcoin":
      // Its transaction comes with the provider's record of the claim (spark-sdk 0.28.4): until
      // then the SDK gives it pending, without one.
      return payment.txId && TXID.test(payment.txId)
        ? { ...base, kind: "recharge", way: "onchain", txid: payment.txId }
        : null;
    case "unknown":
      return null;
  }
}

/**
 * What the payer of a recharge at the card's Lightning address wrote with it (LUD-12), fit for
 * display (cleanDescription); null for none, and for any other payment. Shown
 * from the card's wallet, which every device reads (its SDK syncs it from the LNURL server), never
 * recorded on the relays: the history's format has no such field (MOVEMENT_FORMAT_VERSION).
 */
export function senderNoteOf(payment: WalletPayment): string | null {
  if (
    payment.status !== "completed" ||
    payment.direction !== "receive" ||
    payment.network !== "lightning" ||
    !payment.senderComment
  ) {
    return null;
  }
  return cleanDescription(payment.senderComment);
}

/**
 * A completed transfer of a card's wallet that the SDK cannot tell (WalletPayment.network
 * `unknown`): "Deposit" received, "Withdrawal" sent in "History", never a recharge, a return nor
 * a payment. So too a Spark transfer sent while the
 * withdrawals' notes are not read on a majority of the relays (`undecided`): a return or a
 * withdrawal, not known yet; a record of it, if any, tells it in its place (history-view.ts). Shown from the card's wallet, its ledger,
 * which every device reads; never recorded on the relays: the history's format has no such
 * movement (MOVEMENT_FORMAT_VERSION). So it has no value, and no fee is said: what it cost is not
 * known either.
 */
export type UnidentifiedMovement = {
  kind: "unidentified";
  /** The wallet's id of the payment. */
  id: string;
  cardId: string;
  walletGeneration: number;
  direction: "receive" | "send";
  /** When the wallet made it (ms). */
  at: number;
  amountSats: bigint;
  /** A Spark transfer sent, return or withdrawal not known yet (see above). */
  undecided?: true;
};

/** What "History" reads of a card's wallet's payments: movementOf's, or unidentifiedOf's. */
export type WalletMovement = CardMovement | UnidentifiedMovement;

/** The unidentified movement `payment` of the card's wallet `card` is; null for any other. */
export function unidentifiedOf(
  { cardId, walletGeneration }: CardWalletOf,
  payment: WalletPayment,
  notes: WithdrawalNotes
): UnidentifiedMovement | null {
  if (payment.status !== "completed") return null;
  if (!PAYMENT_ID.test(payment.id) || payment.amountSats <= 0n) return null;
  const undecided =
    payment.network === "spark" &&
    payment.direction === "send" &&
    !notes.conclusive &&
    !notes.ways.has(paymentKey(cardId, payment.id));
  if (payment.network !== "unknown" && !undecided) return null;
  return {
    kind: "unidentified",
    id: payment.id,
    cardId,
    walletGeneration,
    direction: payment.direction,
    at: payment.timestamp * 1000,
    amountSats: payment.amountSats,
    ...(undecided ? { undecided } : {})
  };
}

/** The movements of the card's wallet `card` among its `payments` (movementOf, unidentifiedOf). */
export function walletMovementsOf(
  card: CardWalletOf,
  payments: readonly WalletPayment[],
  notes: WithdrawalNotes
): WalletMovement[] {
  return payments.flatMap(
    (payment): WalletMovement | [] =>
      movementOf(card, payment, notes) ?? unidentifiedOf(card, payment, notes) ?? []
  );
}

/** A movement's value as written: its amounts as JSON numbers (src/lib/sats.ts). */
export function cardMovementValue(movement: CardMovement): Record<string, unknown> {
  return {
    ...movement,
    amountSats: Number(movement.amountSats),
    feeSats: Number(movement.feeSats)
  };
}

/**
 * A movement as written (cardMovementValue), checked whole; null when out of shape. A withdrawal
 * only with `withdrawals` (a format that has them: MOVEMENT_FORMAT_VERSION, history-records.ts).
 */
export function parseCardMovement(value: unknown, withdrawals: boolean): CardMovement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const worth = parseMovementValue(v.value);
  if (
    worth === undefined ||
    typeof v.id !== "string" ||
    !PAYMENT_ID.test(v.id) ||
    typeof v.cardId !== "string" ||
    !CARD_ID.test(v.cardId) ||
    !isWalletGeneration(v.walletGeneration) ||
    !(
      (v.kind === "recharge" && WAYS.includes(v.way as CardRechargeWay)) ||
      (v.kind === "return" && v.way === null) ||
      (withdrawals && v.kind === "withdrawal" && OUT_WAYS.includes(v.way as CardWithdrawalWay))
    ) ||
    typeof v.at !== "number" ||
    !Number.isSafeInteger(v.at) ||
    v.at < 0 ||
    !isSatsNumber(v.amountSats) ||
    !isFee(v.feeSats) ||
    !(v.txid === null || (typeof v.txid === "string" && TXID.test(v.txid))) ||
    // A transaction is an on-chain movement's (a deposit, a withdrawal), which always names its own.
    (v.way === "onchain") !== (v.txid !== null) ||
    !(
      v.description === null ||
      (typeof v.description === "string" &&
        v.description.length > 0 &&
        v.description.length <= MAX_DESCRIPTION_LENGTH &&
        v.kind === "recharge" &&
        v.way === "invoice")
    ) ||
    // A recharge's invoice is "Top up"'s, which always describes it.
    (v.kind === "recharge" && v.way === "invoice" && v.description === null)
  ) {
    return null;
  }
  return {
    id: v.id,
    cardId: v.cardId,
    walletGeneration: v.walletGeneration,
    kind: v.kind,
    way: v.way as CardMovementWay | null,
    at: v.at,
    amountSats: BigInt(v.amountSats),
    feeSats: BigInt(v.feeSats),
    txid: v.txid,
    description: v.description,
    value: worth
  };
}
