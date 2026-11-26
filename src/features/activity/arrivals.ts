import { useState } from "react";

import { nowUnix } from "@/lib/clock";

import type { ActivityItem } from "./model";

/*
 * "Wallet" live: the rows that arrive while the list shows fold in, lit in apricot (parts.tsx,
 * Fold's `enter`, ArrivalGlow). Which rows arrived is told here, from one list to the next: never
 * the first list shown, never a row of the history copied from the v2 account, nor a row older than
 * the list ("Show more") or than a few minutes (a read come late), and never a row that was already
 * there under another identity (an open sale now paid, a draft now sent). While the list is
 * scrolled down past its top, what arrives is kept out of it (`held`): nothing moves under the eyes
 * or the finger; the screen tells how many wait, and they come in once the top of the list shows
 * again.
 */

/**
 * How old a row may be and still arrive: a sale or a payment of the last minutes, which a read
 * brings late (a relay slow, a device's clock a little behind). An older row the list did not have
 * comes in without a glow.
 */
export const ARRIVAL_RECENT_SECONDS = 15 * 60;

/**
 * What tells that two rows of two lists are the same movement: its id, and what its later row
 * keeps of it: an open sale's payment hash (its paid row's payment), an on-chain sale's author, a
 * payment's transaction (its deposit's row, then its credit), a link's id, an invoice's id (its
 * draft, then its link's row).
 */
export function continuityKeys(item: ActivityItem): string[] {
  const keys = [item.id];
  // An open sale of the point of sale shown with its address alone (model.ts, recordedRowId):
  // `sale-onchain:<sale author>:<date>`, whose paid row is `sale:<sale author>`.
  if (item.id.startsWith("sale-onchain:")) {
    const author = item.id.split(":")[1];
    if (author) keys.push(`sale:${author}`);
  }
  for (const payment of item.payments) {
    keys.push(`payment:${payment.id}`);
    if (payment.paymentHash) keys.push(`sale:${payment.paymentHash}`);
    if (payment.txId) keys.push(`tx:${payment.txId.toLowerCase()}`);
  }
  if (item.link) keys.push(`link:${item.link.id}`);
  if (item.invoice) keys.push(`invoice:${item.invoice.id}`);
  return keys;
}

export type Arrivals = {
  /** The ids of the list it was told from, in its order: another list is told again. */
  signature: string;
  /** Whether the list's top was out of sight then. */
  holding: boolean;
  /** Its oldest row's date (Unix seconds), null without rows: an older row never arrives. */
  oldest: number | null;
  /** Every continuity key of the rows the screen had (shown or held). */
  known: ReadonlySet<string>;
  /** The rows that arrived at this list: they fold in, lit, as they mount. */
  arriving: ReadonlySet<string>;
  /** The rows that arrived while the list's top was out of sight: kept out of it until it shows. */
  held: ReadonlySet<string>;
  /** Their continuity keys: a held row that changed identity meanwhile (paid) stays held. */
  heldKeys: ReadonlySet<string>;
};

const NONE: ReadonlySet<string> = new Set();

function signatureOf(items: readonly ActivityItem[]): string {
  return items.map(({ id }) => id).join("\n");
}

function oldestOf(items: readonly ActivityItem[]): number | null {
  return items.length === 0 ? null : Math.min(...items.map(({ timestamp }) => timestamp));
}

/** The first list the screen shows: every row was there, none arrives. */
export function firstArrivals(items: readonly ActivityItem[], holding = false): Arrivals {
  return {
    signature: signatureOf(items),
    holding,
    oldest: oldestOf(items),
    known: new Set(items.flatMap(continuityKeys)),
    arriving: NONE,
    held: NONE,
    heldKeys: NONE
  };
}

/**
 * The rows of `items` that arrived since `previous` (see above), at `now` (Unix seconds): kept out
 * of the list while `holding`, else arriving, with those held until then.
 */
export function nextArrivals(
  previous: Arrivals,
  items: readonly ActivityItem[],
  holding: boolean,
  now: number
): Arrivals {
  const known = new Set(previous.known);
  // Those held until now (by any of their keys), and those that arrive now.
  const come: string[] = [];
  const comeKeys = new Set<string>();
  for (const item of items) {
    const keys = continuityKeys(item);
    const waiting = keys.some((key) => previous.heldKeys.has(key));
    const arrived =
      waiting ||
      (!keys.some((key) => previous.known.has(key)) &&
        item.imported === undefined &&
        item.timestamp >= now - ARRIVAL_RECENT_SECONDS &&
        (previous.oldest === null || item.timestamp >= previous.oldest));
    for (const key of keys) known.add(key);
    if (!arrived) continue;
    come.push(item.id);
    for (const key of keys) comeKeys.add(key);
  }
  return {
    signature: signatureOf(items),
    holding,
    oldest: oldestOf(items),
    known,
    arriving: holding ? NONE : new Set(come),
    held: holding ? new Set(come) : NONE,
    heldKeys: holding ? comeKeys : NONE
  };
}

/**
 * The rows `items` shows, those that arrived (`arriving`, to fold in lit) and how many wait while
 * `holding` (the list scrolled down past its top), from one list to the next of the same screen.
 */
export function useArrivals(
  items: readonly ActivityItem[],
  holding: boolean
): { rows: readonly ActivityItem[]; arriving: ReadonlySet<string>; held: number } {
  const [state, setState] = useState(() => firstArrivals(items, holding));
  let current = state;
  // Told again only when the list's rows (their ids) or `holding` changed: its reads make a new
  // array each time.
  if (state.holding !== holding || state.signature !== signatureOf(items)) {
    current = nextArrivals(state, items, holding, nowUnix());
    setState(current);
  }
  const { held } = current;
  return {
    rows: held.size === 0 ? items : items.filter(({ id }) => !held.has(id)),
    arriving: current.arriving,
    held: held.size
  };
}
