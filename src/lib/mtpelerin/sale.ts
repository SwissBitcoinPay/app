import {
  LIGHTNING_ASSET,
  LIGHTNING_NETWORK_ID,
  MTPELERIN_WID,
  SELL_CURRENCIES,
  type SellCurrency
} from "@/config/mtpelerin";
import type { WalletPayment } from "@/lib/breez/types";
import { compactIban } from "@/lib/iban";

import { decimalToInteger } from "./decimal";
import {
  INVOICE_MIN_LIFE_SECONDS,
  readExactInvoice,
  type InvoiceIssue,
  type CheckedInvoice
} from "./invoice";
import { wiresSomething } from "./transfer-fee";
import type {
  MtpBankAccount,
  MtpConfig,
  MtpNewSellOrder,
  MtpOrder,
  MtpOrderStatus,
  MtpSellOrder,
  MtpTransactionStatus
} from "./types";

/*
 * A sale to the bank ("Sell"): the order the app asks for, the
 * invoice it pays only once checked against what the merchant agreed to, and how a sale's progress
 * reads. Pure.
 */

/** What a sale is made of at Mt Pelerin: the merchant's Lightning asset, read from its config. */
export type SellAsset = {
  /** `network_in`. */
  network: string;
  /** `currency_in`: the asset's symbol ("sat"). */
  currency: string;
};

/**
 * The Lightning asset of the configuration, when Mt Pelerin counts it in sats (its symbol
 * "sat": `GET /forms/mtp-config` gives `decimals: 3`, millisats): `currency_in`,
 * `amount_in` a whole number of sats. Null otherwise: no sale is offered, rather than one in a unit
 * guessed.
 */
export function sellAssetOf(config: MtpConfig): SellAsset | null {
  const network = config.networks.find((entry) => entry.id === LIGHTNING_NETWORK_ID);
  const asset = network?.assets.find((entry) => entry.asset === LIGHTNING_ASSET);
  if (!network || !asset || asset.symbol.toLowerCase() !== "sat") return null;
  return { network: network.id, currency: asset.symbol };
}

/** Whether `currency` is one a sale is wired in (SELL_CURRENCIES). */
export function isSellCurrency(currency: string): currency is SellCurrency {
  return (SELL_CURRENCIES as readonly string[]).includes(currency);
}

/**
 * The currency a bank account of "Sell" is proposed in, before the merchant picks another: its
 * payout currency (the fiat share's, "Settings") when Mt Pelerin wires it, else its display
 * currency, else CHF for a Swiss or Liechtenstein IBAN (or none yet), EUR for another.
 */
export function proposedSellCurrency({
  payout,
  display,
  iban
}: {
  payout: string | null;
  display: string;
  iban: string | null;
}): SellCurrency {
  if (payout !== null && isSellCurrency(payout)) return payout;
  if (isSellCurrency(display)) return display;
  const country = iban === null ? null : compactIban(iban).slice(0, 2);
  return country === null || country === "CH" || country === "LI" ? "CHF" : "EUR";
}

/** How a sale's transfer travels: in Switzerland, SEPA, or SWIFT. */
export type TransferRoute = "swiss" | "sepa" | "swift";

/**
 * How Mt Pelerin wires a sale in `currency`, as its "Sell crypto" page says: francs as a Swiss
 * transfer ("usually arrives within the same business day"), euros by SEPA ("a couple of hours
 * to two business days"), any other currency "via an international bank transfer over the SWIFT
 * network" ("one to multiple business days", and "intermediary banks can charge anywhere from a
 * few dollars to several dozen dollars"). Francs and euros are read as going to an
 * account in Switzerland or in the SEPA area.
 */
export function transferRoute(currency: string): TransferRoute {
  if (currency === "CHF") return "swiss";
  return currency === "EUR" ? "sepa" : "swift";
}

/**
 * The bank accounts a sale may go to, in a currency of SELL_CURRENCIES: active, or still
 * `pending_validation` (a new account's status: Mt Pelerin takes a sale to one).
 */
export function sellAccountsOf(accounts: readonly MtpBankAccount[]): MtpBankAccount[] {
  return accounts.filter(
    (account) =>
      (account.status === "active" || account.status === "pending_validation") &&
      isSellCurrency(account.currency)
  );
}

/**
 * The order of `sats` from the merchant's Lightning wallet to `account`, as this integration's
 * (`wid`). `deferred` (`withdraw: "manual"`): its francs wait at Mt Pelerin for the one
 * transfer of the bank account's balance, rather than being wired at once.
 */
export function newSellOrder({
  sats,
  account,
  asset,
  reference,
  oid,
  deferred = false
}: {
  sats: bigint;
  account: MtpBankAccount;
  asset: SellAsset;
  reference: string;
  oid: string;
  deferred?: boolean;
}): MtpNewSellOrder {
  if (sats <= 0n || sats > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("A sale's sats out of range");
  }
  return {
    beneficiary_id: account.id,
    currency_in: asset.currency,
    currency_out: account.currency,
    amount_in: Number(sats),
    network_in: asset.network,
    reference,
    oid,
    wid: MTPELERIN_WID,
    ...(deferred ? { withdraw: "manual" as const } : {})
  };
}

export type SellOrderIssue =
  /** The order is not the one asked for: another amount, currency or account. */
  | "otherOrder"
  /** The order would leave the merchant nothing, its fees taken (wiresSomething). */
  | "nothingWired"
  /** Its rate is no longer locked (locked until `expiration_date`). */
  | "orderExpired"
  | InvoiceIssue;

export type SellOrderRead =
  { ok: true; invoice: CheckedInvoice } | { ok: false; issue: SellOrderIssue };

/**
 * Checks `order` against what the merchant agreed to (`sats` to `account`, from `asset`), then its
 * invoice: of `network`, of exactly those sats, still payable while the rate is locked.
 * Anything else is never paid, nor an order that would leave the merchant nothing once Mt Pelerin's
 * transfer fee is taken (`transferFeeMinor`, transfer-fee.ts; wiresSomething). The rate's
 * lock needs the invoice's margin too (INVOICE_MIN_LIFE_SECONDS): a payment that leaves in its last
 * seconds would reach Mt Pelerin once it ended.
 */
export function checkSellOrder(
  order: MtpSellOrder,
  {
    sats,
    account,
    asset,
    network,
    nowSeconds,
    transferFeeMinor
  }: {
    sats: bigint;
    account: MtpBankAccount;
    asset: SellAsset;
    network: string;
    nowSeconds: number;
    /** Mt Pelerin's transfer fee of this sale, in minor units of its currency (transfer-fee.ts). */
    transferFeeMinor: number;
  }
): SellOrderRead {
  // `source_amount` is Mt Pelerin's own, back from the francs (types.ts): the order's estimate
  // tells what was asked, and its invoice what is paid, exactly.
  if (
    order.beneficiaryId !== account.id ||
    order.sourceCurrency !== asset.currency ||
    order.destCurrency !== account.currency ||
    (order.estimate !== null && decimalToInteger(order.estimate.sourceAmount) !== sats)
  ) {
    return { ok: false, issue: "otherOrder" };
  }
  if (!wiresSomething(order.destAmount, order.destCurrency, transferFeeMinor)) {
    return { ok: false, issue: "nothingWired" };
  }
  if (order.expiresAt - nowSeconds < INVOICE_MIN_LIFE_SECONDS) {
    return { ok: false, issue: "orderExpired" };
  }
  const read = readExactInvoice(order.invoice, { network, nowSeconds, amountSats: sats });
  return read.ok ? read : { ok: false, issue: read.issue };
}

/** `type` of a deferred sell (`withdraw: "manual"`): "spot". A sell wired at once is "fixing". */
const DEFERRED_SELL_TYPE = "spot";

/**
 * Whether Mt Pelerin received the funds of a deferred sell that has no transaction of its own. A
 * deferred sell is created `pending`, goes to `validated` once its funds are received, and its
 * francs join the bank account's balance (`GET /orders/{beneficiary_id}/balances` counts only
 * `validated` deferred sells), and Mt Pelerin makes no transaction for it then: no transaction
 * is no proof that nothing was received. A sell wired at once is `validated` from its creation, with or
 * without funds: its status alone says nothing, its transaction does.
 */
export function deferredSellFunded({
  type,
  status
}: {
  type: string | null;
  status: MtpOrderStatus;
}): boolean {
  return type === DEFERRED_SELL_TYPE && status === "validated";
}

/**
 * Where the merchant's wallet's payment of a sale's invoice stands: sent (`completed`: the wallet
 * holds the invoice's preimage, Mt Pelerin's node received the sats), or on its way (`pending`).
 */
export type SalePayment = "completed" | "pending";

/**
 * The wallet's payments sent, by payment hash (lowercase hex), with where each stands; a failed one
 * is none. Two payments of one invoice (a retry): the one sent.
 */
export function salePayments(payments: readonly WalletPayment[]): Map<string, SalePayment> {
  const sent = new Map<string, SalePayment>();
  for (const payment of payments) {
    if (payment.direction !== "send" || payment.status === "failed" || !payment.paymentHash) {
      continue;
    }
    const hash = payment.paymentHash.toLowerCase();
    if (sent.get(hash) !== "completed") sent.set(hash, payment.status);
  }
  return sent;
}

/**
 * Whether Mt Pelerin tells no funds of `order` yet and has not refused it: no transaction, not
 * finished, not a deferred sell validated (deferredSellFunded), not cancelled nor rejected. Its
 * invoice's payment is then the wallet's to tell (SalePayment).
 */
export function awaitsFunds(
  order: Pick<MtpOrder, "transactionStatus" | "status" | "type">
): boolean {
  return (
    order.transactionStatus === null &&
    order.status !== "finished" &&
    !FAILED.includes(order.status) &&
    !deferredSellFunded(order)
  );
}

/** A step of a sale's progress (three steps). */
export type SaleStep = "done" | "now" | "todo" | "failed";

/** What a sale is, overall. */
export type SaleOutcome =
  /** No sats received yet, its rate still locked: Mt Pelerin waits for its invoice's payment. */
  | "awaitingPayment"
  /** No sats received, its rate no longer locked: nothing was sold. */
  | "expired"
  | "inProgress"
  /** `out_status: "delayed"`: expect it within the week rather than showing a failure. */
  | "delayed"
  /** `onhold`: Mt Pelerin checks it (its e-mails), or the reference was missing. */
  | "held"
  | "sent"
  | "refunded"
  | "failed";

export type SaleProgress = {
  outcome: SaleOutcome;
  received: SaleStep;
  converted: SaleStep;
  transferred: SaleStep;
};

const FAILED = ["rejected", "cancelled", "deleted"];
const REFUNDS = ["waiting_refund", "validated_refund", "refunded"];

function step(status: string | null): SaleStep {
  if (status === "finished" || status === "validated") return "done";
  if (status !== null && (FAILED.includes(status) || REFUNDS.includes(status))) return "failed";
  return status === null ? "todo" : "now";
}

/**
 * `status` read as the widget's status page reads it, a deferred sell's funds as its order's status
 * tells them (deferredSellFunded); `expiresAt` the order's locked-rate deadline (an order without
 * funds after it sold nothing). While Mt Pelerin tells no funds of it, `walletPayment`, the wallet's
 * payment of its invoice, tells them sent or on their way: never "awaiting payment" nor "expired"
 * once the sats left.
 */
export function saleProgress(
  status: MtpTransactionStatus,
  {
    expiresAt,
    nowSeconds,
    walletPayment = null
  }: { expiresAt: number | null; nowSeconds: number; walletPayment?: SalePayment | null }
): SaleProgress {
  if (status.groupId === null) {
    // No transaction: what the order's own status proves, as orderOutcome reads it.
    if (status.orderStatus === "finished") {
      return { outcome: "sent", received: "done", converted: "done", transferred: "done" };
    }
    if (deferredSellFunded({ type: status.orderType, status: status.orderStatus })) {
      // Its francs held for the bank account's grouped transfer, whatever its rate's deadline.
      return { outcome: "inProgress", received: "done", converted: "done", transferred: "todo" };
    }
    const failed = FAILED.includes(status.orderStatus);
    if (!failed && walletPayment === "completed") {
      return { outcome: "inProgress", received: "done", converted: "now", transferred: "todo" };
    }
    if (!failed && walletPayment === "pending") {
      return { outcome: "inProgress", received: "now", converted: "todo", transferred: "todo" };
    }
    const expired = failed || (expiresAt !== null && expiresAt <= nowSeconds);
    return {
      outcome: failed ? "failed" : expired ? "expired" : "awaitingPayment",
      // Nothing received: never told as on its way.
      received: expired ? "failed" : "todo",
      converted: "todo",
      transferred: "todo"
    };
  }
  const received = step(status.inStatus ?? "pending");
  const converted = received === "done" ? step(status.forexStatus) : "todo";
  const transferred = converted === "done" ? step(status.outStatus) : "todo";
  const current = status.currentStatus;
  let outcome: SaleOutcome = "inProgress";
  if (current === "finished") outcome = "sent";
  else if (current !== null && REFUNDS.includes(current)) outcome = "refunded";
  else if (current !== null && FAILED.includes(current)) outcome = "failed";
  else if (status.inStatus === "onhold" || current === "onhold") outcome = "held";
  else if (status.outStatus === "delayed") outcome = "delayed";
  // Done: every step done, whatever the order's word for it.
  return {
    outcome,
    received: outcome === "sent" ? "done" : received,
    converted: outcome === "sent" ? "done" : converted,
    transferred: outcome === "sent" ? "done" : transferred
  };
}

/**
 * A sale of the list, read as its row says it; `walletPayment` as saleProgress reads it, while Mt
 * Pelerin tells no funds of it.
 */
export function orderOutcome(
  order: MtpOrder,
  nowSeconds: number,
  walletPayment: SalePayment | null = null
): SaleOutcome {
  const current = order.transactionStatus;
  if (current === null) {
    if (FAILED.includes(order.status)) return "failed";
    if (order.status === "finished") return "sent";
    if (deferredSellFunded(order) || walletPayment !== null) return "inProgress";
    return order.expiresAt !== null && order.expiresAt <= nowSeconds
      ? "expired"
      : "awaitingPayment";
  }
  if (current === "finished") return "sent";
  if (REFUNDS.includes(current)) return "refunded";
  if (FAILED.includes(current)) return "failed";
  if (current === "onhold") return "held";
  return "inProgress";
}

/** Whether `order` is one of "Sell"'s sales: a sell from Lightning (`type: "fixing"`). */
export function isLightningSale(order: MtpOrder, asset: SellAsset): boolean {
  return (
    order.sourceCurrency === asset.currency &&
    (order.network === null || order.network === asset.network) &&
    order.type !== "buy"
  );
}
