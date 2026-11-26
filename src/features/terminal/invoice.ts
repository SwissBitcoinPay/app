import { useEffect, useState } from "react";

import { getBreezNetwork } from "@/lib/breez/config";
import {
  LnurlError,
  fetchPayRequest,
  paidPreimage,
  type Invoice,
  type PayRequest
} from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import { nowUnix } from "@/lib/rates/snapshot";

/*
 * What every invoice asked from the merchant's Lightning address shares: those of a sale, of the
 * whole amount or of the rest of an underpayment, hour by hour (useSale.ts), on the point of sale
 * and on the payer's page of a payment link.
 */

/**
 * How long a sale of the point of sale stays payable (10 minutes); each of its invoices ends with
 * its point's period at the latest, at HH:05 (useSale.ts).
 */
export const INVOICE_EXPIRY_SECONDS = 600;
/**
 * How long an invoice is still checked after its end, no longer shown, before it counts as expired,
 * unpaid (2 minutes). Its payment is reported by the LNURL
 * server once Breez's provider tells it (a webhook): among 575 public payments to breez.tips
 * addresses, 95 % within 32 s of the invoice's creation, 99 % within 103 s (payer's own
 * time included), and an LND payer may send its first HTLC up to 60 s after it started. Nothing
 * verifiable makes the receiver refuse a payment after the end: one reported later still counts, at
 * its own invoice's amount.
 */
export const EXPIRY_GRACE_SECONDS = 120;
/**
 * Interval of the LUD-21 checks while the invoice is shown (every second; the Breez LNURL server
 * pushes nothing, it is only asked).
 */
export const VERIFY_INTERVAL_MS = 1000;
/**
 * Interval of the checks of an invoice shown for INVOICE_EXPIRY_SECONDS already, before its end:
 * checked every second for as long as the screen stays open, it would cost the LNURL server 3600
 * requests an hour; its payment is seen up to 30 s late instead. A bound only: every invoice of a
 * sale, an underpayment's rest included, ends with the sale's 10 minutes.
 */
export const VERIFY_SLOW_INTERVAL_MS = 30_000;

/** BOLT11 network prefix of this build's network: invoices of another network are refused. */
export function invoiceNetwork(): string {
  return getBreezNetwork() === "mainnet" ? "bc" : "bcrt";
}

/** The LNURL-pay parameters of the address, read once per session (they do not change). */
const payRequests = new Map<string, Promise<PayRequest>>();

export function payRequestOf(address: string): Promise<PayRequest> {
  let request = payRequests.get(address);
  if (!request) {
    request = fetchPayRequest(address);
    payRequests.set(address, request);
    // A failure is not kept: the next charge asks again.
    request.catch(() => payRequests.delete(address));
  }
  return request;
}

/**
 * Forgets `request`, the parameters of `address`, unless newer ones replaced it meanwhile: they may
 * no longer match the service (new limits, metadata or callback), the next invoice reads them again.
 */
export function forgetPayRequest(address: string, request: Promise<PayRequest>): void {
  if (payRequests.get(address) === request) payRequests.delete(address);
}

/** Tests only. */
export function resetPayRequests(): void {
  payRequests.clear();
}

/**
 * How long to wait before the next LUD-21 check of an invoice ending at `expiresAt`, watched since
 * `since` (Unix seconds, as `now`): every VERIFY_INTERVAL_MS for INVOICE_EXPIRY_SECONDS, when a
 * payer most likely pays, then every VERIFY_SLOW_INTERVAL_MS until its end, and at the usual pace
 * again from its end through its grace period.
 */
export function verifyDelayMs(since: number, expiresAt: number, now: number): number {
  if (now - since < INVOICE_EXPIRY_SECONDS || now >= expiresAt) return VERIFY_INTERVAL_MS;
  return Math.max(VERIFY_INTERVAL_MS, Math.min(VERIFY_SLOW_INTERVAL_MS, (expiresAt - now) * 1000));
}

/** An invoice to watch among others (useInvoicesWatch). */
export type WatchedInvoice = {
  /** Unique among the invoices of a screen, and from one sale to the next. */
  id: string;
  invoice: Invoice;
  /** Unix seconds (nowUnix, src/lib/clock.ts): its end, after which its grace period starts. */
  expiresAt: number;
  /** When it was first shown, the start of `verifyDelayMs`'s pace. */
  since: number;
  /** Checked at once, not after a first interval: an invoice made elsewhere, maybe paid already. */
  immediate?: boolean;
};

/**
 * `preimage`: the proof of the payment (lowercase hex), with `paidAt`. Neither paid nor expired:
 * open, a check of it ended (answered or failed).
 */
export type InvoiceOutcome = { paidAt: Date | null; expired: boolean; preimage?: string };

/**
 * Another proof of an invoice's payment than LUD-21: the owner's wallet, which received it
 * (src/features/payment-link/OwnerLinksFinalizer.tsx: the LNURL server may
 * no longer know an invoice of a year ago). "paid" with the preimage of its hash, "unpaid" (the
 * wallet never received it), or "unknown" (not proven yet: asked again).
 */
export type InvoiceProof = (
  invoice: Invoice
) => Promise<
  { status: "paid"; preimage: string; paidAt: Date } | { status: "unpaid" } | { status: "unknown" }
>;

/**
 * LUD-21 checks of several invoices at once, while `active`, each at the pace of `verifyDelayMs`
 * from its own `since`, until it is paid or, past its end and its grace period, expired. An
 * invoice whose hour ended keeps being checked through its grace period while the next one is
 * shown: a payment sent in its last seconds still counts. Given `proof`, it alone tells, never
 * LUD-21: paid, or expired once past its grace period and "unpaid". Outcomes by id; an id absent is
 * open too, no check of it ended yet (a checkout link's page waits for one: useCheckoutLink).
 */
export function useInvoicesWatch(
  entries: readonly WatchedInvoice[],
  active: boolean,
  proof: InvoiceProof | null = null
): ReadonlyMap<string, InvoiceOutcome> {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, InvoiceOutcome>>(() => new Map());
  // The entries by id, kept as state (an entry never changes under its id): the checks read them,
  // keyed by the ids still open. Taken again during the render when the ids change.
  // As JSON: an id may hold any character (a sale's key holds its note).
  const ids = JSON.stringify(entries.map((entry) => entry.id));
  const [held, setHeld] = useState<{ ids: string; byId: ReadonlyMap<string, WatchedInvoice> }>(
    () => ({ ids: "[]", byId: new Map() })
  );
  if (held.ids !== ids) setHeld({ ids, byId: new Map(entries.map((entry) => [entry.id, entry])) });
  const watched = held.byId;

  const open = [...watched.values()].filter((entry) => {
    const outcome = outcomes.get(entry.id);
    return !outcome || (outcome.paidAt === null && !outcome.expired);
  });
  const signature = active && open.length > 0 ? JSON.stringify(open.map((entry) => entry.id)) : "";

  useEffect(() => {
    if (signature === "") return;
    let alive = true;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const settle = (id: string, outcome: InvoiceOutcome) => {
      if (alive) setOutcomes((last) => new Map(last).set(id, outcome));
    };
    for (const id of JSON.parse(signature) as string[]) {
      const entry = watched.get(id);
      if (!entry) continue;
      let checking = false;
      const check = async (final: boolean) => {
        if (checking) return;
        checking = true;
        try {
          if (proof) {
            const told = await proof(entry.invoice);
            if (told.status === "paid") {
              settle(id, { paidAt: told.paidAt, expired: false, preimage: told.preimage });
            } else if (told.status === "unpaid" && final) {
              settle(id, { paidAt: null, expired: true });
            }
            return;
          }
          const preimage = await paidPreimage(entry.invoice);
          if (preimage !== null) {
            settle(id, { paidAt: new Date(), expired: false, preimage });
            return;
          }
          if (final) settle(id, { paidAt: null, expired: true });
        } catch (error) {
          logFailure("Checking the invoice failed", error);
          // An invoice the service did not make (its verify URL answers for another one, under the
          // same payment hash): it can never be paid to the merchant, whenever it says it ends.
          if (error instanceof LnurlError && error.code === "otherInvoice") {
            settle(id, { paidAt: null, expired: true });
            return;
          }
          // Past the grace period, the service saying it does not know the invoice (LUD-21's
          // "Not found") is as final as "not settled": without it, the screen would wait forever.
          // Any other error is retried at the next check: a failure of the service (breez.tips
          // answers "Internal server error" with a 200 on a database error), the network, or an
          // answer the app cannot trust ("settled" without a valid preimage). Saying that nothing
          // was charged could have the payer pay twice.
          if (
            final &&
            error instanceof LnurlError &&
            error.code === "service" &&
            error.reason === "Not found"
          ) {
            settle(id, { paidAt: null, expired: true });
          }
        } finally {
          checking = false;
          // Checked once: open, unless told otherwise above (the same map kept after: no render).
          if (alive) {
            setOutcomes((last) =>
              last.has(id) ? last : new Map(last).set(id, { paidAt: null, expired: false })
            );
          }
        }
      };
      const schedule = () => {
        timers.set(
          id,
          setTimeout(
            () => {
              void check(nowUnix() >= entry.expiresAt + EXPIRY_GRACE_SECONDS);
              if (alive) schedule();
            },
            verifyDelayMs(entry.since, entry.expiresAt, nowUnix())
          )
        );
      };
      if (entry.immediate) void check(nowUnix() >= entry.expiresAt + EXPIRY_GRACE_SECONDS);
      schedule();
    }
    return () => {
      alive = false;
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [signature, watched, proof]);

  return outcomes;
}
