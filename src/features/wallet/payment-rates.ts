import { majority } from "@/config/registry";
import { ownerEpochSettled } from "@/features/team/export-epochs";
import {
  getAccountSettings,
  getAccountTeamKeys,
  subscribeAccount
} from "@/features/account/session";
import { inBatches } from "@/lib/batches";
import type { WalletPayment } from "@/lib/breez/types";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { COPIES_AT_ONCE, copyEveryEvent, publishAgain, type RelayCall } from "@/lib/nostr/pool";
import {
  fetchPaymentRates,
  paymentRateAddress,
  paymentRateEvent,
  paymentRatesFilter,
  type PaymentRate
} from "@/lib/rates/payment-rates";
import {
  HISTORY_DAYS,
  HOUR_SECONDS,
  fetchHourPoints,
  hourOf,
  pointHourOf
} from "@/lib/rates/sources";
import { derivePaymentRateKeys, type PaymentRateKeys, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { sameRelayList } from "@/lib/relays/list";

import { readWalletPayments } from "./payments-history";

/*
 * The price of bitcoin at each payment of the account's wallet, recorded once (an export never
 * calls CoinGecko; the app records the rate when it sends a payment and when it sees a reception
 * arrive; a reception seen later gets the rate of its payment's time): the CoinGecko point of the
 * hour that prices the payment's time (pointHourOf), in the account's currency, as a record of the
 * account on its relays (src/lib/rates/payment-rates.ts). "Wallet" records them while it shows the
 * wallet (usePaymentRates): every payment done that has none, sent or received, once its list is
 * read after the wallet's sync and at each new payment. A payment seen as it is made gets the point
 * of the present; one seen later (the app closed) the point of its hour, which CoinGecko keeps 365
 * days: older than that, a payment gets none (its lines tell bitcoin only). "Export" reads them
 * (readPaymentRates), never CoinGecko; "Wallet" values its transfers with those this device knows
 * (knownPaymentRates: their value in fiat at the time of payment).
 *
 * A rate is written only after a whole read of its week's rates from a majority of the relays told
 * it was not there (any two majorities share a relay: another of the owner's devices that wrote it
 * first is seen); one that fewer than a majority hold is published again as it is. It is learnt
 * once a majority holds it, and never written over a record of a newer format. What this device
 * knows of them only grows while the account is open, and is forgotten when it closes (archive.ts
 * does the same). "Delete account" stops the rounds first (holdPaymentRates): a rate written after
 * its deletion requests would outlive them.
 */

const DAY_SECONDS = 24 * HOUR_SECONDS;

/** The longest span of payments whose points one request of CoinGecko gives (fetchHourPoints). */
const POINTS_SPAN_SECONDS = 89 * DAY_SECONDS;

/**
 * The rates are read a week at a time, each week whole (fetchPaymentRates): a relay sends 50 pages
 * of 500 events at most (MAX_PAGES, strfry), 3 500 payments a day.
 */
export const READ_SPAN_SECONDS = 7 * DAY_SECONDS;

/** Weeks of rates read at once (readPaymentRates): each one is a read of every relay. */
const SPANS_AT_ONCE = 4;

type Known = {
  team: TeamKeys;
  /** Every rate a majority of the relays holds, read or written since the account opened. */
  rates: Map<string, PaymentRate>;
  /** The addresses (paymentRateAddress) of rates a newer app wrote: never written over. */
  newer: Set<string>;
  /** "Delete account" runs (holdPaymentRates): nothing is written any more. */
  held: boolean;
  /** The round running (recordPaymentRates), null when none. */
  running: Promise<RoundOutcome> | null;
  /** A round asked while one ran: it runs next, in this currency, with these payments. */
  again: Ask | null;
  /**
   * A round went through every payment CoinGecko still prices since the account opened: later
   * rounds go through the payments "Wallet" shows only (its newest, its last 30 days).
   */
  wholeYear: boolean;
};

/** A round asked: its currency, and the payments "Wallet" shows. */
type Ask = { currency: string; shown: readonly WalletPayment[] };

let known: Known | null = null;

/** The screens that show the rates known (followPaymentRates), and the copy they read. */
const followers = new Set<() => void>();
let shownRates: ReadonlyMap<string, PaymentRate> | null = null;

/** The rates known changed: the screens read a new copy of them. */
function learnt(): void {
  shownRates = null;
  for (const follower of followers) follower();
}

// The account closed (or another one opened): what this device knew of its rates goes with it.
subscribeAccount(() => {
  if (known && getAccountTeamKeys() !== known.team) {
    known = null;
    learnt();
  }
});

function knownOf(team: TeamKeys): Known {
  if (known?.team !== team) {
    known = {
      team,
      rates: new Map(),
      newer: new Set(),
      held: false,
      running: null,
      again: null,
      wholeYear: false
    };
  }
  return known;
}

function openAccount(): { team: TeamKeys; relays: readonly string[] } | null {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  return team && settings && settings.signUp === "done" ? { team, relays: settings.relays } : null;
}

/**
 * A call to `relays` as the rates' author: a relay may give and take an author's events from that
 * author only. Its key derives again at each authentication: refused once the account closes.
 */
function ratesCall(team: TeamKeys, relays: readonly string[]): RelayCall {
  return {
    relays,
    timeoutMs: TEAM_TIMEOUT_MS.background,
    channel: "account",
    authKey: () => derivePaymentRateKeys(team).nostr.secretKey
  };
}

/** The oldest hour CoinGecko gives a point of at `now` without key (fetchHourPoints). */
function oldestPricedHour(now: number): number {
  return hourOf(now - (HISTORY_DAYS - 1) * DAY_SECONDS);
}

/**
 * The payments of `payments` that need a rate at `now`: done, of an hour CoinGecko still prices,
 * without one known nor one of a newer format at their address, each once, the oldest first.
 */
export function paymentsToPrice(
  state: Pick<Known, "rates" | "newer">,
  keys: PaymentRateKeys,
  payments: readonly WalletPayment[],
  now: number
): WalletPayment[] {
  const oldest = oldestPricedHour(now);
  const due = new Map<string, WalletPayment>();
  for (const payment of payments) {
    if (
      payment.status === "completed" &&
      payment.timestamp <= now &&
      pointHourOf(payment.timestamp) >= oldest &&
      !state.rates.has(payment.id) &&
      !(state.newer.size > 0 && state.newer.has(paymentRateAddress(keys, payment.id)))
    ) {
      due.set(payment.id, payment);
    }
  }
  return [...due.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * The spans of READ_SPAN_SECONDS at most from `since` to `until` (both included) that the rates
 * are read in, the oldest first.
 */
export function readSpans(since: number, until: number): { since: number; until: number }[] {
  const spans: { since: number; until: number }[] = [];
  for (let start = since; start <= until; start += READ_SPAN_SECONDS) {
    spans.push({ since: start, until: Math.min(until, start + READ_SPAN_SECONDS - 1) });
  }
  return spans;
}

/** `payments` (the oldest first) by week (READ_SPAN_SECONDS from the first of each). */
function byWeek(payments: readonly WalletPayment[]): WalletPayment[][] {
  const weeks: WalletPayment[][] = [];
  for (const payment of payments) {
    const week = weeks[weeks.length - 1];
    if (week && payment.timestamp - week[0]!.timestamp < READ_SPAN_SECONDS) week.push(payment);
    else weeks.push([payment]);
  }
  return weeks;
}

/**
 * The hours of `hours` (sorted) in spans CoinGecko gives in one request each: a year of payments in
 * five at most, a day of them in one.
 */
export function pointSpans(hours: readonly number[]): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  for (const hour of hours) {
    const last = spans[spans.length - 1];
    if (last && hour - last.from <= POINTS_SPAN_SECONDS) last.to = hour;
    else spans.push({ from: hour, to: hour });
  }
  return spans;
}

/** How a round ended: every payment priced (or none to price), or some left for a later one. */
export type RoundOutcome = "done" | "left";

/**
 * Records the rate of every payment of the open account's wallet (connected) that has none, in
 * `currency` (the account's), as above: the first round of an opening of the account goes through
 * the wallet's year (its storage, page by page), the next ones through the payments `shown` only
 * (useWalletData's), once the first one priced all. A payment older than those that is done later
 * (an on-chain transfer confirmed after a month) is priced at the account's next opening. One round
 * at a time: asked while one runs, another follows it, which the promise returned waits for too.
 * Resolves with "left" when a payment could not get its rate (no majority's answer, CoinGecko out
 * of reach or its point not published yet, the wallet closed): a later round tries again. Never
 * rejects.
 */
export function recordPaymentRates(
  currency: string,
  shown: readonly WalletPayment[]
): Promise<RoundOutcome> {
  const open = openAccount();
  if (!open) return Promise.resolve("left");
  const state = knownOf(open.team);
  if (state.held) return Promise.resolve("left");
  if (state.running) {
    state.again = { currency, shown };
    return state.running;
  }
  const running = (async (): Promise<RoundOutcome> => {
    let outcome = await round(state, { currency, shown });
    while (state.again !== null && known === state && !state.held) {
      const next = state.again;
      state.again = null;
      outcome = await round(state, next);
    }
    return outcome;
  })().finally(() => {
    state.running = null;
  });
  state.running = running;
  return running;
}

/**
 * The round running, if any ("Export" waits for the rates it is writing: a payment just made is
 * told in its currency, not in bitcoin). Never rejects.
 */
export function paymentRatesWritten(): Promise<void> {
  const open = openAccount();
  const running = open && known?.team === open.team ? known.running : null;
  return running ? running.then(() => undefined) : Promise.resolve();
}

async function round(state: Known, { currency, shown }: Ask): Promise<RoundOutcome> {
  // The account's export epoch first (export-epochs.ts): what a withdrawn grant read never opens it.
  await ownerEpochSettled();
  try {
    const open = openAccount();
    if (!open || open.team !== state.team) return "left";
    const now = nowUnix();
    const whole = !state.wholeYear;
    const payments = whole ? await readWalletPayments(oldestPricedHour(now)) : shown;
    const outcome = await priceAll(state, open.relays, currency, payments, now);
    if (whole && outcome === "done") state.wholeYear = true;
    return outcome;
  } catch (error) {
    // CoinGecko or the wallet failed, or the account closed meanwhile (its team keys wiped).
    logFailure("Recording the payments' rates failed", error);
    return "left";
  }
}

/** Records the rates `payments` lack (round). Rejects as CoinGecko, or once the account closed. */
async function priceAll(
  state: Known,
  relays: readonly string[],
  currency: string,
  payments: readonly WalletPayment[],
  now: number
): Promise<RoundOutcome> {
  // Derived again at each use: refused once the account closes.
  const keys = () => derivePaymentRateKeys(state.team);
  const wanted = paymentsToPrice(state, keys(), payments, now);
  if (wanted.length === 0) return "done";
  const knownBefore = state.rates.size;
  const call = ratesCall(state.team, relays);
  const quorum = majority(relays.length);
  let left = false;
  // Those another of the owner's devices wrote, week by week: from a majority, else nothing of
  // that week is written.
  const missing: WalletPayment[] = [];
  const thin: { payment: string; rate: PaymentRate; event: NostrEvent }[] = [];
  for (const week of byWeek(wanted)) {
    if (state.held) return "left";
    const read = await fetchPaymentRates(
      keys(),
      call,
      week[0]!.timestamp,
      week[week.length - 1]!.timestamp
    );
    for (const address of read.newer) state.newer.add(address);
    if (read.answered < quorum) {
      left = true;
      continue;
    }
    for (const payment of paymentsToPrice(state, keys(), week, now)) {
      const rate = read.rates.get(payment.id);
      const event = read.events.get(payment.id);
      if (!rate || !event) missing.push(payment);
      else if ((read.copies.get(payment.id) ?? 0) >= quorum) state.rates.set(payment.id, rate);
      // Held by too few relays (a write that half failed): the same record, again.
      else thin.push({ payment: payment.id, rate, event });
    }
  }

  // Those another device wrote, learnt: the screens value their payments at once.
  if (state.rates.size !== knownBefore) learnt();
  const hours = [...new Set(missing.map(({ timestamp }) => pointHourOf(timestamp)))].sort(
    (a, b) => a - b
  );
  const points = new Map<number, number>();
  for (const { from, to } of pointSpans(hours)) {
    if (state.held) return "left";
    for (const [hour, point] of await fetchHourPoints(currency, from, to, now)) {
      points.set(hour, point);
    }
  }
  const fresh = missing.flatMap((payment) => {
    const hour = pointHourOf(payment.timestamp);
    const rate = points.get(hour);
    // Not published yet (the present hour's, in its first minutes): the next round.
    if (rate === undefined) {
      left = true;
      return [];
    }
    const value: PaymentRate = { payment: payment.id, at: payment.timestamp, currency, hour, rate };
    return [{ payment: payment.id, rate: value, event: paymentRateEvent(keys(), value) }];
  });
  const took = await inBatches([...thin, ...fresh], COPIES_AT_ONCE, async (entry) => {
    // "Delete account" started: nothing more goes out.
    if (state.held) return null;
    const held = await publishAgain(entry.event, call, { quorum: "majority" });
    if (held.length < quorum) return false;
    state.rates.set(entry.payment, entry.rate);
    return true;
  });
  if (took?.some(Boolean)) learnt();
  return !left && took !== null && took.every(Boolean) ? "done" : "left";
}

/**
 * The rates of the open account's payments this device knows (those a majority of its relays holds,
 * learnt or written by its rounds since the account opened), by payment id: what "Wallet" values
 * its transfers with (activity/format.ts). The same copy until they change; empty without an open
 * account.
 */
export function knownPaymentRates(): ReadonlyMap<string, PaymentRate> {
  if (shownRates === null) {
    const open = openAccount();
    shownRates = new Map(open && known?.team === open.team ? known.rates : []);
  }
  return shownRates;
}

/** Calls `listener` at each change of the rates known (knownPaymentRates); returns how to stop. */
export function followPaymentRates(listener: () => void): () => void {
  followers.add(listener);
  return () => {
    followers.delete(listener);
  };
}

/** The rates of a period (readPaymentRates). */
export type PeriodRates = ReadonlyMap<string, PaymentRate>;

/**
 * The rates of the open account's payments made from `since` to `until` (Unix seconds): those the
 * relays hold, read whole week by week from a majority of them, and those this device wrote. Null
 * when fewer than a majority answered for a week: a rate there may be missing. Rejects once the
 * account closed.
 */
export async function readPaymentRates(since: number, until: number): Promise<PeriodRates | null> {
  const open = openAccount();
  if (!open) throw new Error("No finished account is open");
  const state = knownOf(open.team);
  const call = ratesCall(open.team, open.relays);
  const reads = await inBatches(readSpans(since, until), SPANS_AT_ONCE, async (span) => {
    const read = await fetchPaymentRates(
      derivePaymentRateKeys(open.team),
      call,
      span.since,
      span.until
    );
    for (const address of read.newer) state.newer.add(address);
    return read.answered >= majority(open.relays.length) ? read : null;
  });
  if (reads === null) return null;
  const keys = derivePaymentRateKeys(open.team);
  const rates = new Map<string, PaymentRate>();
  for (const [id, rate] of state.rates) {
    if (rate.at >= since && rate.at <= until) rates.set(id, rate);
  }
  // A rate fewer than a majority holds is a rate recorded all the same: its own record, signed.
  for (const read of reads) for (const [id, rate] of read.rates) rates.set(id, rate);
  for (const id of rates.keys()) {
    if (state.newer.has(paymentRateAddress(keys, id))) rates.delete(id);
  }
  return rates;
}

/**
 * Stops the rounds of the open account ("Delete account", account-deletion.ts): once the round
 * running ended, nothing is written any more. Returns the function that lets them run again (the
 * deletion failed). Never rejects.
 */
export async function holdPaymentRates(): Promise<() => void> {
  const open = openAccount();
  if (!open) return () => {};
  const state = knownOf(open.team);
  if (state.held) return () => {};
  state.held = true;
  await state.running;
  return () => {
    if (known === state) state.held = false;
  };
}

/**
 * Copies the rates to the relays `next` after a change of the account's relays ("Settings",
 * changeRelays), each record as it is (copyEveryEvent): "Export" reads them there afterwards. A
 * record over 3 years old is refused by relays that keep nothing older (strfry's default): those
 * payments then tell bitcoin only on the new list. Resolves with whether a majority of `next` holds
 * every record. Never rejects.
 */
export async function copyPaymentRates(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  try {
    // To a majority of the new list, each rate: "Export" reads them there from a majority.
    const copied = await copyEveryEvent(
      paymentRatesFilter(derivePaymentRateKeys(team), 0),
      ratesCall(team, before),
      next
    );
    if (!copied) logFailure("Copying the payments' rates: not every record reached the new relays");
    return copied;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): copied again at its next opening.
    logFailure("Copying the payments' rates to the new relays failed", error);
    return false;
  }
}
