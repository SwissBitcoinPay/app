import { useEffect, useSyncExternalStore } from "react";

import { getAccountWalletId, subscribeAccount } from "@/features/account/session";
import type { Invoice } from "@/lib/invoice/record";
import { logFailure } from "@/lib/log/log";

import { loadInvoices, type InvoiceAuthor } from "./invoices";

/*
 * The invoices of the open account, as this device last read them (loadInvoices), shared by
 * "Wallet", the wizard of "New invoice" and an invoice's details: read once when one of them shows,
 * again on "Try again", kept up to date with what this device saves. Another account (or none)
 * starts afresh.
 */

export type InvoicesState =
  /** Not read yet, or being read. */
  | { status: "loading"; invoices: null }
  /** No relay answered: nothing can be told (never "no invoice"). */
  | { status: "failed"; invoices: null }
  | {
      status: "ready";
      /** The newest first, by when they were created: the owner's and its assistants'. */
      invoices: Invoice[];
      /** By invoice id, the assistant that made it (loadInvoices); absent for the owner's. */
      authors: ReadonlyMap<string, InvoiceAuthor>;
      /** Some invoice is of a newer format: a newer app of the owner's wrote it. */
      newerUnreadable: boolean;
    };

const LOADING: InvoicesState = { status: "loading", invoices: null };

let account: string | null = null;
let state: InvoicesState = LOADING;
let reading: Promise<void> | null = null;
/** Asked again while a read ran ("Wallet" live, a new invoice): read once more after it. */
let again = false;
const listeners = new Set<() => void>();

function set(next: InvoicesState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Another account (or none) since the last read: its state starts afresh. */
function current(): InvoicesState {
  const wallet = getAccountWalletId();
  if (wallet !== account) {
    account = wallet;
    state = LOADING;
    reading = null;
    again = false;
  }
  return state;
}

/**
 * Reads the invoices again, one read at a time: asked while one runs, it reads once more after it
 * (what was asked for may have come after that read's answers). Never rejects.
 */
export function refreshInvoices(): Promise<void> {
  current();
  if (reading) {
    again = true;
    return reading;
  }
  const forAccount = account;
  if (forAccount === null) return Promise.resolve();
  if (state.status === "failed") set(LOADING);
  const read: Promise<void> = (async () => {
    try {
      const result = await loadInvoices();
      if (account !== forAccount) return;
      set(
        result.answered === 0
          ? { status: "failed", invoices: null }
          : {
              status: "ready",
              invoices: result.invoices,
              authors: result.authors,
              newerUnreadable: result.newerUnreadable
            }
      );
    } catch (error) {
      logFailure("Reading the invoices failed", error);
      if (account === forAccount) set({ status: "failed", invoices: null });
    } finally {
      reading = null;
      if (again && account === forAccount) {
        again = false;
        void refreshInvoices();
      }
    }
  })();
  reading = read;
  return read;
}

/** What this device just saved (the owner's): shown at once, without reading the relays again. */
export function rememberInvoice(invoice: Invoice): void {
  const known = current();
  if (known.status !== "ready") return;
  // Never an assistant's invoice taken for the owner's: the owner saves its own only.
  if (known.authors.has(invoice.id)) return;
  const others = known.invoices.filter(({ id }) => id !== invoice.id);
  set({
    ...known,
    invoices: [...others, invoice].sort(
      (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)
    )
  });
}

/** A draft this device removed. */
export function forgetInvoice(id: string): void {
  const known = current();
  if (known.status !== "ready") return;
  set({ ...known, invoices: known.invoices.filter((invoice) => invoice.id !== id) });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeAccount(() => {
    current();
    listener();
  });
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}

/**
 * The invoices of the open account, read when first asked by a screen (`active`), and on `retry`.
 */
export function useInvoices(active = true): InvoicesState & { retry: () => void } {
  const read = useSyncExternalStore(subscribe, current, current);
  const unread = read.status === "loading";
  useEffect(() => {
    if (active && unread) void refreshInvoices();
  }, [active, unread]);
  return { ...read, retry: () => void refreshInvoices() };
}

/** Tests only. */
export function resetInvoicesStore(): void {
  account = null;
  state = LOADING;
  reading = null;
  again = false;
}
