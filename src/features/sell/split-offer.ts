import { SPLIT_FEE_RESERVE, SPLIT_ORDERS_FIRST_SPAN_MS } from "@/config/mtpelerin";
import type { WalletPayment } from "@/lib/breez/types";
import type { MtpDecimal } from "@/lib/mtpelerin/decimal";
import {
  chfLeftMinor,
  isIdentified,
  limitsFrom,
  productMinor,
  sellLimits
} from "@/lib/mtpelerin/limits";
import { wiresSomething } from "@/lib/mtpelerin/transfer-fee";
import {
  SPLIT_CLOCK_GAP_SECONDS,
  lastSplitCheckpoint,
  orderFunded,
  paidHashes,
  splitCheckpointOf,
  splitDue,
  splitOid,
  unfundedSplitOrder,
  type SplitDue
} from "@/lib/mtpelerin/split";
import type { MtpBankAccount, MtpEstimate, MtpOrder, MtpPerson } from "@/lib/mtpelerin/types";
import type { MerchantSettings } from "@/lib/settings/merchant";

import type { SaleQuoteRead, SellFlow } from "./flow";

/*
 * The split's sale proposed (src/lib/mtpelerin/split.ts): read
 * once the account is open, its wallet connected and "Sell" ready (the Lightning address
 * proven, a bank account), from the wallet's payments and Mt Pelerin's orders. What is proposed is
 * the fiat share of what the wallet received since the last such sale, as a deferred sell (its
 * francs join the bank account's balance at Mt Pelerin, wired in one transfer once it reaches
 * Mt Pelerin's threshold, the equivalent of 50 CHF), less when it
 * cannot all be sold now, and then why:
 * - "limit": the profile is not identified at Mt Pelerin, whose limits leave less: the
 *   merchant sells what they leave, or is identified first (Mt Pelerin's own pages);
 * - "balance": the wallet no longer holds the share (sats sent since).
 * What is not sold then is not carried over (split.ts).
 */

export type SplitOffer = {
  /** Since when (Unix seconds) the receipts are counted: the last sale's checkpoint, else the split's start. */
  since: number;
  /** The fiat share, an integer from 1 to 100. */
  fiatPercent: number;
  /** What the wallet received, and its share. */
  due: SplitDue;
  /** The bank account the sale goes to. */
  account: MtpBankAccount;
  /** What is proposed for sale now, in sats: `due.dueSats`, or less (`short`). */
  sats: bigint;
  /** Why less than the share is proposed; null when the whole share is. */
  short: "limit" | "balance" | null;
  /**
   * Mt Pelerin's estimate of the sale of `sats`, indicative: the notice tells it; the panel
   * makes the order (quoteSplitSale) and shows the order's own figures, at the rate it locks.
   */
  estimate: MtpEstimate;
};

export type SplitRead =
  /** Nothing to propose: no fiat share, no receipt since, a share too small to wire anything. */
  | { kind: "none" }
  | { kind: "offer"; offer: SplitOffer }
  /**
   * A share is due, and Mt Pelerin's limits without an identity verification leave nothing to
   * sell (the month's or the year's are used up): the merchant is identified first.
   */
  | {
      kind: "identify";
      since: number;
      fiatPercent: number;
      due: SplitDue;
      account: MtpBankAccount;
    };

export type SplitDeps = {
  /** "Sell"'s flow, ready. */
  flow: SellFlow;
  person: MtpPerson;
  /** The bank account of the sale. */
  account: MtpBankAccount;
  settings: Pick<MerchantSettings, "bitcoinPercent" | "splitSince" | "legacyTransfers">;
  /** Every payment of the account's wallet created at or after `since` (Unix seconds). */
  readPayments: (since: number) => Promise<WalletPayment[]>;
  nowMs: () => number;
};

/**
 * The wallet's payments as readSplitOffer needs them: read once from the earliest time asked for
 * (WalletPayment.timestamp, Unix seconds), every later ask for a time after it answered from that
 * read. What is asked for is the receipts since the last split's sale and the payments of its
 * orders' invoices, never every payment since the split's start.
 */
type WalletRead = (since: number) => Promise<{ payments: WalletPayment[]; paid: Set<string> }>;

function walletRead(readPayments: SplitDeps["readPayments"]): WalletRead {
  let read: { since: number; payments: WalletPayment[]; paid: Set<string> } | null = null;
  return async (since) => {
    if (read === null || since < read.since) {
      const payments = await readPayments(since);
      read = { since, payments, paid: paidHashes(payments) };
    }
    return read;
  };
}

/**
 * The earliest time the wallet's payments of `orders`' invoices may bear: their creation, less the
 * clocks' gap.
 */
function paymentsSince(orders: readonly MtpOrder[]): number {
  return Math.min(...orders.map((order) => order.createdAt)) - SPLIT_CLOCK_GAP_SECONDS;
}

/**
 * The checkpoint of the last split's sale among `orders`, null when none of them sold anything:
 * one Mt Pelerin received the funds of, or one the wallet paid (or pays) the invoice of. The wallet
 * is read only when one without funds would be later than the last funded one, from the earliest
 * of those: whether it sold decides.
 */
async function settledCheckpoint(
  orders: readonly MtpOrder[],
  wallet: WalletRead
): Promise<number | null> {
  const asOrders = (list: readonly MtpOrder[]) =>
    list.map((order) => ({
      oid: order.oid,
      paymentHash: order.paymentHash,
      funded: orderFunded(order)
    }));
  const funded = lastSplitCheckpoint(asOrders(orders), new Set());
  const later = orders.filter(
    (order) =>
      unfundedSplitOrder(order) &&
      order.paymentHash !== null &&
      (funded === null || (splitCheckpointOf(order.oid) ?? 0) > funded)
  );
  if (later.length === 0) return funded;
  const { paid } = await wallet(paymentsSince(later));
  return lastSplitCheckpoint(asOrders(orders), paid);
}

/** Every order made from `fromMs` to now, as flow.ts `allOrders` lists them. */
type OrdersRead = { fromMs: number; orders: MtpOrder[] };

/**
 * The checkpoint of the last split's sale made since `sinceMs` (`last`), looked for among Mt
 * Pelerin's orders from the latest back: a period at a time, each four times the one before, down
 * to `sinceMs`. The first period that holds one ends the search: a sale counts what came after the
 * one before it, so a later sale's checkpoint is the later one. `last` null when none was made;
 * `read`: the orders read on the way, every one from its start to now (the limits count them
 * rather than read them again). Undefined when a period's orders could not all be read (never a
 * part read as all). Rejects when the wallet cannot be read: never a sale guessed unpaid.
 */
async function lastCheckpointSince(
  flow: SellFlow,
  sinceMs: number,
  nowMs: number,
  wallet: WalletRead
): Promise<{ last: number | null; read: OrdersRead } | undefined> {
  const read: OrdersRead = { fromMs: nowMs, orders: [] };
  // The first period ends now (its orders made meanwhile too), each next one where the last began.
  let end: number | undefined;
  let span = SPLIT_ORDERS_FIRST_SPAN_MS;
  for (;;) {
    const start = Math.max(sinceMs, (end ?? nowMs) - span);
    const orders = await flow.allOrders(start, end);
    if (orders === null) return undefined;
    read.fromMs = start;
    read.orders.push(...orders);
    end = start;
    const last = await settledCheckpoint(orders, wallet);
    if (last !== null || start <= sinceMs) return { last, read };
    span *= 4;
  }
}

/**
 * The orders the limits count (from `fromMs`, limits.ts `limitsFrom`): those `read` holds, and only
 * those before it read now; null when they cannot all be read (too many): no limit is told then. A
 * split's order without funds whose rate is still locked counts only while the wallet pays or paid
 * its invoice: the one a panel made and nobody paid sells nothing (the others, without funds and
 * their rate ended, count for nothing in limits.ts already).
 */
async function limitOrders(
  flow: SellFlow,
  read: OrdersRead,
  fromMs: number,
  nowSeconds: number,
  wallet: WalletRead
): Promise<MtpOrder[] | null> {
  const from = Math.floor(fromMs / 1000);
  const before = read.fromMs <= fromMs ? [] : await flow.allOrders(fromMs, read.fromMs);
  if (before === null) return null;
  const orders = [...read.orders.filter((order) => order.createdAt >= from), ...before];
  const locked = orders.filter(
    (order) =>
      unfundedSplitOrder(order) && (order.expiresAt === null || order.expiresAt > nowSeconds)
  );
  if (locked.length === 0) return orders;
  const { paid } = await wallet(paymentsSince(locked));
  return orders.filter(
    (order) =>
      !locked.includes(order) || (order.paymentHash !== null && paid.has(order.paymentHash))
  );
}

/**
 * The most sats whose gross value in francs, at `rate` (CHF per sat, before fees) and rounded up as
 * the limits count it (limits.ts), is within `leftMinor` centimes.
 */
function satsWithin(leftMinor: number, rate: MtpDecimal): bigint {
  if (rate.units <= 0n || leftMinor <= 0) return 0n;
  let sats = (BigInt(leftMinor) * 10n ** BigInt(rate.scale)) / (rate.units * 100n);
  while (sats > 0n) {
    const gross = productMinor({ units: sats, scale: 0 }, rate);
    if (gross !== null && gross <= leftMinor) break;
    sats -= 1n;
  }
  return sats;
}

/**
 * Whether Mt Pelerin's limits without an identity verification (limits.ts) are told for this
 * sale: not for a profile identified, nor for a sale in another currency than francs (no cap is
 * guessed: Mt Pelerin refuses an order over its limits anyway).
 */
function limitsApply({ person, account }: Pick<SplitDeps, "person" | "account">): boolean {
  return !isIdentified(person) && account.currency === "CHF";
}

/** Reads what the split proposes now. Rejects when the wallet or Mt Pelerin cannot be read. */
export async function readSplitOffer(deps: SplitDeps): Promise<SplitRead> {
  const { flow, account, settings, readPayments, nowMs } = deps;
  const fiatPercent = 100 - settings.bitcoinPercent;
  if (fiatPercent <= 0) return { kind: "none" };
  const now = nowMs();
  const nowSeconds = Math.floor(now / 1000);
  // The wallet's payments, read for what each step needs, once (walletRead).
  const wallet = walletRead(readPayments);
  const found = await lastCheckpointSince(flow, settings.splitSince * 1000, now, wallet);
  if (found === undefined) return { kind: "none" };
  const since = Math.max(settings.splitSince, found.last ?? 0);
  // The receipts since the last sale (or the split's start): every payment since then.
  const { payments } = await wallet(since);
  const due = splitDue({
    payments,
    since,
    nowSeconds,
    fiatPercent,
    exclusions: { legacyTransfers: new Set(settings.legacyTransfers) }
  });
  if (due === null || due.dueSats <= 0n) return { kind: "none" };

  let sats = due.dueSats;
  let short: SplitOffer["short"] = null;
  let estimate = await flow.estimate(sats, account.currency);
  // What the limits leave, from the orders they count: those the search above read are not read
  // again.
  const fromMs = limitsFrom(new Date(now)) * 1000;
  const leftMinor = limitsApply(deps)
    ? chfLeftMinor(
        sellLimits(await limitOrders(flow, found.read, fromMs, nowSeconds, wallet), new Date(now))
      )
    : null;
  if (leftMinor !== null && estimate.rate !== null) {
    const within = satsWithin(leftMinor, estimate.rate);
    if (within < sats) {
      sats = within;
      short = "limit";
    }
  }
  const balance = await flow.balance();
  const reserve =
    (balance * SPLIT_FEE_RESERVE.percent) / 100n > SPLIT_FEE_RESERVE.minSats
      ? (balance * SPLIT_FEE_RESERVE.percent) / 100n
      : SPLIT_FEE_RESERVE.minSats;
  // The whole share within the balance is sold as it is: its fees are checked at its quote.
  if (sats > balance) {
    const spendable = balance - reserve;
    if (spendable < sats) {
      sats = spendable > 0n ? spendable : 0n;
      short = "balance";
    }
  }
  if (sats !== due.dueSats && sats > 0n) estimate = await flow.estimate(sats, account.currency);
  // A deferred sell: no transfer fee of its own (transfer-fee.ts).
  if (sats <= 0n || !wiresSomething(estimate.destAmount, account.currency, 0)) {
    // Nothing the limits leave would wire anything: identified, the whole share could be sold.
    return short === "limit"
      ? { kind: "identify", since, fiatPercent, due, account }
      : { kind: "none" };
  }
  return { kind: "offer", offer: { since, fiatPercent, due, account, sats, short, estimate } };
}

/**
 * The order of `offer`'s sale: a deferred sell of its sats that carries its checkpoint (split.ts),
 * checked as any sale's (flow.ts `quoteSale`). Nothing is paid here.
 */
export function quoteSplitSale(flow: SellFlow, offer: SplitOffer): Promise<SaleQuoteRead> {
  return flow.quoteSale(offer.sats, offer.account, {
    oid: splitOid(offer.due.checkpoint),
    deferred: true
  });
}
