/**
 * What the wallet screen ("Wallet") shows of the wallet's payments: the payments grouped by day,
 * the totals of the last 30 days, and each payment's row and details. Amounts stay integer sats
 * (`bigint`, hard rule 3); francs come from the current rate, only at the display edge.
 */

import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import { formatFiat, rateToFraction } from "@/lib/terminal/amount";

const SATS_PER_BTC = 100_000_000n;

/** The totals cover the last 30 days, counted back from now. */
export const TOTALS_WINDOW_SEC = 30 * 24 * 60 * 60;

/**
 * How many movements "Wallet" lists first, the newest, and how many more each "Show more" adds: the
 * SDK reads the payments from its own storage.
 */
export const LIST_LIMIT = 100;

/**
 * Since when (Unix seconds) `payments`, the newest of the wallet as "Wallet" lists them, hold every
 * payment: all of them when they are all the wallet has (`listedAll`: 0); else those newer than the
 * oldest of them only (another of its second may be left out). Its days' nets count from then
 * (day-net.ts).
 */
export function everyPaymentSince(
  payments: readonly { timestamp: number }[],
  listedAll: boolean
): number {
  if (listedAll) return 0;
  let oldest = Infinity;
  for (const { timestamp } of payments) oldest = Math.min(oldest, timestamp);
  // No payment, yet not all of them (only token payments read, left out): none is known listed.
  return oldest === Infinity ? Infinity : oldest + 1;
}

/**
 * `sats` in minor units of fiat (cents) at `rate` (fiat per BTC), rounded half up to the nearest
 * minor unit: minor = ⌊(sats × rate × 10^digits + 10^8 / 2) / 10^8⌋, computed on integers from the
 * rate's decimal digits. `down`: rounded down instead, for a value told as a minimum ("at least").
 * A value shown at today's rate, never an amount that is paid.
 */
export function satsToFiatMinor(
  sats: bigint,
  digits: number,
  rate: number,
  rounding: "nearest" | "down" = "nearest"
): bigint {
  if (sats < 0n) throw new Error(`Invalid sats: ${sats}`);
  const { numerator, denominator } = rateToFraction(rate);
  const divisor = SATS_PER_BTC * denominator;
  const half = rounding === "down" ? 0n : divisor / 2n;
  return (sats * numerator * 10n ** BigInt(digits) + half) / divisor;
}

/**
 * A fiat value in minor units, signed as the list writes it ("+17,46", "−142,20", the true minus
 * sign), with the device locale's separators (formatFiat). `sign` "" writes it bare.
 */
export function formatSignedFiat(
  minor: bigint,
  digits: number,
  languageTag: string,
  sign: Sign
): string {
  // Beyond Number's exact range only past 90 trillion francs: never a wallet's.
  return `${sign}${formatFiat(Number(minor), digits, languageTag)}`;
}

export type Sign = "+" | "−" | "";

/** The sign of a payment's amount: received +, sent −, none for a failed one (nothing moved). */
export function signOf(payment: WalletPayment): Sign {
  if (payment.status === "failed") return "";
  return payment.direction === "receive" ? "+" : "−";
}

/** What was received and sent over the last 30 days: completed payments only, fees excluded. */
export function totalsSince(
  payments: WalletPayment[],
  since: number
): { receivedSats: bigint; sentSats: bigint } {
  let receivedSats = 0n;
  let sentSats = 0n;
  for (const payment of payments) {
    if (payment.status !== "completed" || payment.timestamp < since) continue;
    if (payment.direction === "receive") receivedSats += payment.amountSats;
    else sentSats += payment.amountSats;
  }
  return { receivedSats, sentSats };
}

/** A calendar day, local to the device: "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export type DayGroup = {
  key: string;
  /** "today", "yesterday", else the date of its first payment, to name. */
  when: "today" | "yesterday" | Date;
  payments: WalletPayment[];
};

/** The day of `timestamp` (Unix seconds) as a group names it: "today", "yesterday", else its date. */
export function dayOf(timestamp: number, now: Date): DayGroup["when"] {
  const date = new Date(timestamp * 1000);
  const key = dayKey(date);
  if (key === dayKey(now)) return "today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return key === dayKey(yesterday) ? "yesterday" : date;
}

/** The payments (the newest first) grouped by local calendar day, in their order. */
export function groupByDay(payments: WalletPayment[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const payment of payments) {
    const key = dayKey(new Date(payment.timestamp * 1000));
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.payments.push(payment);
      continue;
    }
    groups.push({ key, when: dayOf(payment.timestamp, now), payments: [payment] });
  }
  return groups;
}

/** What kind of payment it was ("Type"), a key of `wallet.kinds`. */
export type PaymentKind =
  "lightningReceipt" | "lightningAddress" | "lightningInvoice" | "bitcoinAddress" | "sparkTransfer";

/** Its kind; null for a transfer the SDK cannot tell (WalletPayment.network): none is said. */
export function kindOf(payment: WalletPayment): PaymentKind | null {
  switch (payment.network) {
    case "bitcoin":
      return "bitcoinAddress";
    case "spark":
      return "sparkTransfer";
    case "lightning":
      if (payment.direction === "receive") return "lightningReceipt";
      return payment.lightningAddress ? "lightningAddress" : "lightningInvoice";
    case "unknown":
      return null;
  }
}

/**
 * The row's title: the Lightning address paid, else the invoice's description, else a generic name
 * (a key of `wallet.titles`: onchain "Deposit" / "Withdrawal", and so a transfer the SDK cannot
 * tell).
 */
export function titleOf(
  payment: WalletPayment
): { text: string } | { key: "deposit" | "withdrawal" | "receipt" | "sending" } {
  if (payment.network === "bitcoin" || payment.network === "unknown") {
    return { key: payment.direction === "receive" ? "deposit" : "withdrawal" };
  }
  const text = payment.lightningAddress ?? payment.description?.trim();
  if (text) return { text };
  return { key: payment.direction === "receive" ? "receipt" : "sending" };
}

/** The state a pill shows, none for a completed payment (only the 2 that did not). */
export type PaymentPill = { state: "unconfirmed" | "open" | "canceled"; key: PillKey } | null;
type PillKey = "confirming" | "inProgress" | "failed";

export function pillOf(payment: WalletPayment): PaymentPill {
  if (payment.status === "failed") return { state: "canceled", key: "failed" };
  if (payment.status === "pending") {
    // Onchain: waiting for its confirmations ("Confirming").
    return payment.network === "bitcoin"
      ? { state: "unconfirmed", key: "confirming" }
      : { state: "open", key: "inProgress" };
  }
  return null;
}

/**
 * The payment's reference, to copy: the payment hash (Lightning), the transaction id (onchain),
 * else the SDK's id.
 */
export function referenceOf(payment: WalletPayment): string {
  return payment.paymentHash ?? payment.txId ?? payment.id;
}

/**
 * Who a payment sent went to, as its details' "Recipient" says it: the Bitcoin address a withdrawal
 * paid, the Lightning address paid; null for any other (a Spark transfer, a Lightning invoice: the
 * SDK gives no recipient to show), and for a withdrawal whose address the SDK does not give.
 */
export type SentRecipient = { network: "bitcoin" | "lightning"; address: string };

export function recipientOf(payment: WalletPayment): SentRecipient | null {
  if (payment.direction !== "send") return null;
  if (payment.network === "bitcoin" && payment.destinationAddress) {
    return { network: "bitcoin", address: payment.destinationAddress };
  }
  if (payment.network === "lightning" && payment.lightningAddress) {
    return { network: "lightning", address: payment.lightningAddress };
  }
  return null;
}

/**
 * A Bitcoin address in groups of 4 characters, the last one shorter ("bc1q w508 … t4"): read whole,
 * it is checked against another group by group, where a shortened one would hide its middle. For
 * the eye only: what is copied is the address itself.
 */
export function addressGroups(address: string): string {
  return address.match(/.{1,4}/g)?.join(" ") ?? "";
}

/** A long reference shortened: its first 8 and last 4 characters. */
export function shortReference(reference: string): string {
  return reference.length <= 14 ? reference : `${reference.slice(0, 8)}…${reference.slice(-4)}`;
}

/**
 * The least the balance will gain from what the wallet received on-chain, confirmed (3
 * confirmations at least), but has not credited yet ("at least … not in balance yet" under the
 * balance; net): each such deposit's value less the most its claim may take (`maxClaimFeeSats`, the
 * ceiling given to the SDK, MAX_DEPOSIT_CLAIM_FEE_SATS), whatever paid it (a sale of an
 * integration, of the point of sale, or none). A deposit worth no more than that fee adds nothing:
 * its claim would leave nothing. Deposits not confirmed yet are left out, as their rows are. Null
 * while not read (or their read failed): "not read" is never "none".
 */
export function pendingBalanceSats(
  deposits: readonly PendingDeposit[] | null,
  maxClaimFeeSats: bigint
): bigint | null {
  if (deposits === null) return null;
  let sats = 0n;
  for (const deposit of deposits) {
    if (deposit.mature && deposit.amountSats > maxClaimFeeSats) {
      sats += deposit.amountSats - maxClaimFeeSats;
    }
  }
  return sats;
}
