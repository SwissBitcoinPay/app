import type { LegacyHistoryRow } from "@/lib/legacy-v2/history";

import { byNewest, type ActivityItem } from "./model";

/*
 * The rows of the history copied from the v2 account (src/features/migration/history-import.ts)
 * among "Wallet"'s movements and in its exports, without a word of where they come from: a sale as
 * the account's own (its source by where it was made), a payout to the merchant's wallet as a
 * sending, a referral fee or a deposit as a reception. For information only: no payment of the
 * wallet, never in its balance nor its totals.
 */

/** The row of `row`, its id its own (never a wallet payment's). */
export function legacyHistoryItem(row: LegacyHistoryRow): ActivityItem {
  const source =
    row.kind === "withdraw" ? "send" : row.kind === "sale" ? (row.channel ?? "pos") : "receive";
  return {
    id: `legacy:${row.ref}`,
    source,
    timestamp: row.at,
    note: row.note,
    fiat: row.fiat,
    sats: row.sats,
    state: null,
    rest: null,
    by: null,
    payments: [],
    link: null,
    imported: {
      kind: row.kind,
      rate: row.rate && {
        payment: `legacy:${row.ref}`,
        at: row.at,
        currency: row.rate.currency,
        hour: row.at,
        rate: row.rate.price
      }
    }
  };
}

/** The rows of `rows`, the newest first. */
export function legacyHistoryItems(rows: readonly LegacyHistoryRow[]): ActivityItem[] {
  return rows.map(legacyHistoryItem).sort(byNewest);
}

/** What "Wallet" lists (listWindow). */
export type ListWindow = {
  /** The rows shown, the newest first. */
  items: ActivityItem[];
  /** Since when (Unix seconds) every movement is among them: its days' nets count from then. */
  listedFrom: number;
  /** Older movements are left out: "Show more" lists them. */
  more: boolean;
};

/**
 * What "Wallet" lists of `items` (the account's own rows: the wallet's newest payments and what the
 * relays add to them, every one of them from `walletFrom` on, everyPaymentSince) and of `legacy`
 * (the rows copied from the v2 account, legacyHistoryItems: all of them), about `limit` movements
 * ("Show more" adds LIST_LIMIT more). Every movement from `listedFrom` on, never one left out
 * between two shown, the rows of its second kept together. When the wallet's read stops the list
 * (`listedFrom` is `walletFrom`), the account's own rows as they come (all of the wallet's read, an
 * invoice's whatever its age); when `limit` stops it sooner, none older than `listedFrom` but those
 * awaiting something (a state: "To follow up"'s, an expired invoice), "Show more" listing the
 * others. `walletMore`: the wallet may hold older payments than `items`.
 */
export function listWindow({
  items,
  legacy,
  walletFrom,
  limit,
  walletMore
}: {
  items: readonly ActivityItem[];
  legacy: readonly ActivityItem[];
  walletFrom: number;
  limit: number;
  walletMore: boolean;
}): ListWindow {
  const complete = [...items, ...legacy]
    .filter(({ timestamp }) => timestamp >= walletFrom)
    .sort(byNewest);
  // Past `limit` movements, the list stops at the second of the last one it holds.
  const listedFrom = complete.length > limit ? complete[limit - 1]!.timestamp : walletFrom;
  const after = ({ timestamp }: ActivityItem) => timestamp >= listedFrom;
  const own =
    listedFrom > walletFrom ? items.filter((item) => after(item) || item.state !== null) : items;
  const shown = legacy.filter(after);
  return {
    items: [...own, ...shown].sort(byNewest),
    listedFrom,
    more: walletMore || own.length < items.length || shown.length < legacy.length
  };
}
