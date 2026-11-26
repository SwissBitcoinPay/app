import { useSyncExternalStore } from "react";

import type { ActivityItem } from "@/features/activity/model";

/*
 * The rows "Wallet" listed last (useOwnerActivity), for an invoice's details:
 * its state, its payments and what is left to pay, as the list judged them, without reading the
 * employees' records again. Another account's rows are never read: the list's account is kept.
 */

let rows: { account: string; items: readonly ActivityItem[] } | null = null;
const listeners = new Set<() => void>();

/** The rows "Wallet" just listed for `account`. */
export function rememberOwnerRows(account: string, items: readonly ActivityItem[]): void {
  if (rows?.account === account && rows.items === items) return;
  rows = { account, items };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => rows;

/** The row of invoice `id` as "Wallet" listed it for `account` last; null when none. */
export function useInvoiceRow(account: string | null, id: string): ActivityItem | null {
  const read = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!read || read.account !== account) return null;
  return read.items.find((item) => item.invoice?.id === id) ?? null;
}

/** Tests only. */
export function resetOwnerRows(): void {
  rows = null;
}
