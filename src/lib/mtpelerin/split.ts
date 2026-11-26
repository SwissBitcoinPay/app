import { LEGACY_PAYOUT_COMMENT } from "@/config/legacy-v2";
import type { WalletPayment } from "@/lib/breez/types";

import { deferredSellFunded, salePayments } from "./sale";
import type { MtpOrder } from "./types";

/*
 * The split's sale (a semi-automatic sale): no sale is made without the merchant, so the fiat
 * share of the split ("Split", 100 − `bitcoinPercent`) is proposed for sale when the account
 * opens: that share of the sats the account's wallet received since the last such sale, in one
 * gesture and the passkey. This file is what that proposal counts. Pure.
 *
 * What counts (by exclusion): everything the wallet received, a deposit of the owner's
 * included, but a card's return and the funds migrated from the v2 app, which are no takings.
 *
 * Where the last sale stands is kept by the sale itself: its order at Mt Pelerin carries, as its
 * `oid` (the integrator's own internal reference), the time up to which the wallet's receipts were
 * counted (its checkpoint). Mt Pelerin gives it back with the order's payment hash on every
 * device of the owner's (`GET /orders/status`: `options.oid`, `hash`, as dev/test answers), and
 * the wallet tells, on every device too, whether that hash was paid. Nothing
 * else is stored: no copy that a device could hold out of date.
 *
 * What a proposal could not sell (the balance spent meanwhile, the limits without an identity
 * verification) is not carried over: its sale's checkpoint covers the receipts it was counted
 * from, and the next proposal counts those after it.
 */

/**
 * The `oid` of a split's sale: this prefix, then its checkpoint in Unix seconds. **Never change**
 * it once released: the orders made before would no longer be read as split's sales, and their
 * receipts would be proposed for sale again. A new format gets a new prefix, this one still read.
 */
const SPLIT_OID_PREFIX = "sattle-split-1:";

/** A checkpoint as an `oid` writes it: Unix seconds of this century's, ten digits. */
const SPLIT_OID = /^sattle-split-1:([1-9][0-9]{9})$/;

/** The `oid` of the split's sale that counted the wallet's receipts up to `checkpoint`. */
export function splitOid(checkpoint: number): string {
  const oid = `${SPLIT_OID_PREFIX}${checkpoint}`;
  if (!Number.isSafeInteger(checkpoint) || !SPLIT_OID.test(oid)) {
    throw new RangeError("A split's checkpoint out of range");
  }
  return oid;
}

/** The checkpoint an order's `oid` carries; null for any other order (a sale of "Sell"). */
export function splitCheckpointOf(oid: string | null): number | null {
  const match = oid === null ? null : SPLIT_OID.exec(oid);
  return match ? Number(match[1]) : null;
}

/** What tells the receipts the split never counts. */
export type SplitExclusions = {
  /**
   * The transactions that moved the v2 wallet's coins to the account's wallet (lowercase hex,
   * src/features/migration/transfer.ts), as the account's settings keep them.
   */
  legacyTransfers: ReadonlySet<string>;
};

/**
 * What the split makes of `payment`:
 * - "counted": a receipt over Lightning or on-chain, completed;
 * - "excluded": not a receipt, or one the split never counts. A Spark transfer: a card's return
 *   (src/features/card/card-wallet.ts): the account's Spark address is given to its cards' wallets
 *   only, never shown to a payer, and a sale is paid over Lightning or on-chain. A transfer the SDK
 *   cannot tell (WalletPayment.network "unknown"): it may be a return. A transfer of the v2
 *   wallet's coins (`legacyTransfers`). A payout of the v2 server to the account's Lightning
 *   address, which it marks with LEGACY_PAYOUT_COMMENT (LUD-12; the SDK reads the comment from the
 *   LNURL server at a sync, the payment's or a later one);
 * - "unsettled": a receipt that may count but cannot be told yet: still pending, or on-chain
 *   without its transaction (the SDK gives it with the provider's record of the claim), which
 *   alone tells a transfer of the v2 wallet's coins.
 */
function splitPart(
  payment: WalletPayment,
  exclusions: SplitExclusions
): "counted" | "excluded" | "unsettled" {
  if (payment.direction !== "receive" || payment.status === "failed") return "excluded";
  if (payment.amountSats <= 0n) return "excluded";
  if (payment.network !== "lightning" && payment.network !== "bitcoin") return "excluded";
  if (payment.network === "lightning" && payment.senderComment === LEGACY_PAYOUT_COMMENT) {
    return "excluded";
  }
  if (payment.network === "bitcoin") {
    if (payment.txId === undefined) return "unsettled";
    // The settings keep the ids in lowercase hex: the SDK's spelling is not relied on.
    if (exclusions.legacyTransfers.has(payment.txId.toLowerCase())) return "excluded";
  }
  return payment.status === "completed" ? "counted" : "unsettled";
}

/** What a proposal counts: the receipts, and the share of them to sell. */
export type SplitDue = {
  /** The receipts counted, in sats. */
  receivedSats: bigint;
  /** How many receipts. */
  receipts: number;
  /** The fiat share of `receivedSats`, rounded down: never more than the share. */
  dueSats: bigint;
  /**
   * The time (Unix seconds) up to which the receipts are counted: the latest counted. A sale of
   * `dueSats` carries it (splitOid); the next proposal counts the receipts after it.
   */
  checkpoint: number;
};

/**
 * The split's share of what the wallet received after `since` (Unix seconds: the last split
 * sale's checkpoint, else when the split was set), from `payments`: every payment of the wallet
 * since `since`, in any order. Null when no receipt counts yet.
 *
 * Only what is settled before `nowSeconds` is counted, so that a checkpoint never passes a
 * receipt it did not count:
 * - a receipt that cannot be told yet (splitPart "unsettled") stops the count before it: settled
 *   later, it is counted then (its time is its creation's, WalletPayment.timestamp);
 * - a receipt of the current second waits: another one may still come in that second.
 */
export function splitDue({
  payments,
  since,
  nowSeconds,
  fiatPercent,
  exclusions
}: {
  payments: readonly WalletPayment[];
  since: number;
  nowSeconds: number;
  /** The fiat share, an integer from 0 to 100 (100 − `bitcoinPercent`). */
  fiatPercent: number;
  exclusions: SplitExclusions;
}): SplitDue | null {
  if (!Number.isInteger(fiatPercent) || fiatPercent < 0 || fiatPercent > 100) {
    throw new RangeError("A split's fiat share out of range");
  }
  let before = nowSeconds;
  for (const payment of payments) {
    if (payment.timestamp > since && splitPart(payment, exclusions) === "unsettled") {
      before = Math.min(before, payment.timestamp);
    }
  }
  let receivedSats = 0n;
  let receipts = 0;
  let checkpoint = since;
  // One payment listed twice (two pages read while one arrived) is one receipt.
  const seen = new Set<string>();
  for (const payment of payments) {
    if (
      payment.timestamp <= since ||
      payment.timestamp >= before ||
      seen.has(payment.id) ||
      splitPart(payment, exclusions) !== "counted"
    ) {
      continue;
    }
    seen.add(payment.id);
    receivedSats += payment.amountSats;
    receipts += 1;
    checkpoint = Math.max(checkpoint, payment.timestamp);
  }
  if (receipts === 0) return null;
  return {
    receivedSats,
    receipts,
    dueSats: (receivedSats * BigInt(fiatPercent)) / 100n,
    checkpoint
  };
}

/**
 * How much earlier than an order's creation (Mt Pelerin's clock) the wallet's payments are read for
 * its invoice's payment (the device's clock): the gap the two clocks may have.
 */
export const SPLIT_CLOCK_GAP_SECONDS = 3600;

/**
 * Whether Mt Pelerin received `order`'s funds: a transaction of its own, the order finished, or a
 * deferred sell validated (sale.ts deferredSellFunded: the split's sales are deferred sells).
 */
export function orderFunded(
  order: Pick<MtpOrder, "transactionStatus" | "status" | "type">
): boolean {
  return (
    order.transactionStatus !== null || order.status === "finished" || deferredSellFunded(order)
  );
}

/**
 * Whether `order` is a split's sale Mt Pelerin received nothing for (yet): whether it sold anything
 * is then the wallet's to tell (paidHashes), its invoice paid or being paid.
 */
export function unfundedSplitOrder(
  order: Pick<MtpOrder, "oid" | "transactionStatus" | "status" | "type">
): boolean {
  return splitCheckpointOf(order.oid) !== null && !orderFunded(order);
}

/** What a split's sale needs of an order of the profile. */
export type SplitOrder = {
  /** `options.oid`. */
  oid: string | null;
  /** `hash`: the payment hash of the order's invoice (lowercase hex). */
  paymentHash: string | null;
  /** Whether Mt Pelerin received its funds (a transaction of its own exists). */
  funded: boolean;
};

/**
 * The payment hashes the wallet paid or is paying (lowercase hex), from `payments`: a payment
 * still pending counts, so that its receipts are not proposed again while it settles; failed, it
 * no longer does.
 */
export function paidHashes(payments: readonly WalletPayment[]): Set<string> {
  return new Set(salePayments(payments).keys());
}

/**
 * The checkpoint of the last split's sale among `orders`: the latest one carried by an order that
 * was paid, as Mt Pelerin tells (`funded`) or the wallet (`paid`, paidHashes); null when none was.
 * An order never paid (its rate ended, its payment failed, the passkey dismissed) sold nothing:
 * its receipts are still to propose.
 */
export function lastSplitCheckpoint(
  orders: readonly SplitOrder[],
  paid: ReadonlySet<string>
): number | null {
  let last: number | null = null;
  for (const order of orders) {
    const checkpoint = splitCheckpointOf(order.oid);
    if (checkpoint === null) continue;
    const settled =
      order.funded || (order.paymentHash !== null && paid.has(order.paymentHash.toLowerCase()));
    if (settled && (last === null || checkpoint > last)) last = checkpoint;
  }
  return last;
}
