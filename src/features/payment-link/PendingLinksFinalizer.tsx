import { hexToBytes } from "@noble/hashes/utils.js";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { invoiceNetwork } from "@/features/terminal/invoice";
import { logFailure } from "@/lib/log/log";
import { parsePaymentLinkPayload, type SharedSale } from "@/lib/payment-link/payload";
import { loadPendingLinks, type PendingLink } from "@/lib/payment-link/pending";
import { nowUnix } from "@/lib/rates/snapshot";

import { finalizePendingLink, isLinkFollowed } from "./finalize";
import { SaleSettler, type SettleResult } from "./SaleSettler";

/** How often the pending links are looked at, besides the app's start and its return to the front. */
export const FINALIZE_INTERVAL_MS = 15 * 60 * 1000;
/** A sale not settled yet (underpaid, being confirmed) is looked at again this much later. */
const UNSETTLED_RETRY_SECONDS = 3600;
/**
 * A sale that still lasts, not paid yet, is looked at again from the next round on: paid in full,
 * it is settled at once, not at its end (an invoice's, months away).
 */
const RUNNING_RETRY_SECONDS = FINALIZE_INTERVAL_MS / 1000 - 60;
/** A final version not published (relays out of reach) is tried again this much later. */
const FAILED_RETRY_SECONDS = 5 * 60;

/**
 * When a link whose outcome is not ready (finalizePendingLink's "notReady") is looked at again
 * (Unix seconds): once its outcome is final (`finalFrom`), or, when it is already, an hour later: a
 * sale its owner canceled waits for the owner's settlement (isProvisionalCancel), not for the next
 * round of 15 minutes.
 */
export function nextLookWhenNotReady(finalFrom: number, now: number): number {
  return finalFrom > now ? finalFrom : now + UNSETTLED_RETRY_SECONDS;
}

/** When each pending link is to be looked at again (Unix seconds), for this session. */
const nextLook = new Map<string, number>();

/** Tests only. */
export function resetPendingLinksFinalizer(): void {
  nextLook.clear();
}

type Job = { pending: PendingLink; sale: SharedSale; key: Uint8Array };

/**
 * The payment links this device made (src/lib/payment-link/pending.ts), settled once their screen
 * is gone: at the app's start, when it comes back to the front, and every
 * 15 minutes, each pending link is followed for a moment (SaleSettler), one after the other, and
 * its final version published once its sale is paid, whether it still lasts or not (an invoice
 * paid in full is settled at once), or 3 hours after it ended expired or
 * underpaid (once what paid its address is 3 blocks deep). A link whose invoice a screen shows is
 * left to that screen. Renders nothing.
 */
export function PendingLinksFinalizer() {
  const [queue, setQueue] = useState<Job[]>([]);
  const [round, setRound] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setRound((count) => count + 1), FINALIZE_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setRound((count) => count + 1);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  // Free for the next round once the queue is through.
  useEffect(() => {
    if (queue.length === 0) running.current = false;
  }, [queue]);

  useEffect(() => {
    // A round at a time: a round asked meanwhile waits for the next tick.
    if (running.current) return;
    running.current = true;
    void (async () => {
      const jobs: Job[] = [];
      try {
        const network = invoiceNetwork();
        const now = nowUnix();
        for (const pending of await loadPendingLinks(network)) {
          const link = parsePaymentLinkPayload(pending.payload, network);
          if (
            link?.kind !== "sale" ||
            // Not started yet (a clock behind the one that made it): nothing can have paid it.
            now < link.sale.startsAt ||
            // The invoice's screen settles it.
            isLinkFollowed(pending.id) ||
            (nextLook.get(pending.id) ?? 0) > now
          ) {
            continue;
          }
          jobs.push({ pending, sale: link.sale, key: hexToBytes(pending.key) });
        }
      } catch (error) {
        // No network in the app config: this build takes no payment, and has no link to settle.
        logFailure("Reading the pending payment links failed", error);
      }
      setQueue(jobs);
    })();
  }, [round]);

  const job = queue[0];
  if (!job) return null;

  const onDone = (result: SettleResult) => {
    void (async () => {
      const { id } = job.pending;
      if (result.kind === "pending") {
        const now = nowUnix();
        // Still lasting (nothing paid, or not all of it yet): looked at again at the next round,
        // as long as it lasts.
        const running = now < job.sale.endsAt;
        nextLook.set(id, now + (running ? RUNNING_RETRY_SECONDS : UNSETTLED_RETRY_SECONDS));
      } else if (!isLinkFollowed(id)) {
        const outcome = await finalizePendingLink(job.pending, result.settlement);
        if (outcome === "notReady") {
          nextLook.set(id, nextLookWhenNotReady(result.settlement.finalFrom, nowUnix()));
        } else if (outcome === "failed") nextLook.set(id, nowUnix() + FAILED_RETRY_SECONDS);
      }
      setQueue((last) => last.slice(1));
    })();
  };

  return (
    <SaleSettler
      key={job.pending.id}
      sale={job.sale}
      saleKey={job.key}
      relays={job.pending.relays}
      tolerance={job.pending.tolerance}
      onDone={onDone}
    />
  );
}
