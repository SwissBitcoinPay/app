import { hexToBytes } from "@noble/hashes/utils.js";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { ACTIVITY_LOOKBACK_SECONDS } from "@/features/activity/load";
import { JUDGED_MARGIN_SECONDS } from "@/features/activity/model";
import {
  SaleSettler,
  type SettleResult,
  type SettledSale
} from "@/features/payment-link/SaleSettler";
import { recordSaleVerdict } from "@/features/team/member";
import { saleSightings } from "@/features/team/sale-sightings";
import type { SightingsBook } from "@/features/onchain/useOnchainTimes";
import { logFailure } from "@/lib/log/log";
import { saleRegistry } from "@/lib/registry/registry";
import type { Settlement } from "@/features/terminal/useSale";
import { nowUnix } from "@/lib/rates/snapshot";
import { bolt11ExpiresAt } from "@/lib/lightning/bolt11";
import {
  MAX_UNDERPAID_TRANSACTIONS,
  saleRecordDate,
  type SaleUnderpaid
} from "@/lib/team/member-records";
import type { FollowedSale } from "@/lib/terminal/followed-sales";
import { profileAccount, type TerminalProfile } from "@/lib/terminal/model";

import { loadBusinessRegistry } from "./registry-key";
import {
  followedRecord,
  forgetFollowedSale,
  isSaleFollowed,
  isLookDue,
  loadFollowedSales,
  lookAgainAt,
  sameUnderpaid,
  subscribeSaleReleases,
  updateFollowedSale
} from "./sale-follow";

/** How often the sales kept for their verdict are looked at, besides a screen leaving one. */
export const SALES_FOLLOW_INTERVAL_MS = 10 * 60 * 1000;
/** A sale not settled yet (being confirmed, underpaid, still lasting): at the next round. */
const PENDING_RETRY_SECONDS = SALES_FOLLOW_INTERVAL_MS / 1000 - 60;
/** A verdict not recorded (relays out of reach, fewer than a majority took it): tried again then. */
const FAILED_RETRY_SECONDS = 5 * 60;
/**
 * A sale is followed this long after its end at most: past it, "Wallet" no longer reads
 * its records (ACTIVITY_LOOKBACK_SECONDS), its verdict would change nothing.
 */
export const FOLLOW_LIMIT_SECONDS = ACTIVITY_LOOKBACK_SECONDS;

/** What recording a sale's verdict came to. */
export type VerdictOutcome =
  /** Recorded (or nothing ever is on this device, or there is nothing to record): forgotten. */
  | "done"
  /** Recorded underpaid, but a payment may still be reported until `finalFrom`: looked at again. */
  | "later"
  /** Not recorded (relays out of reach, fewer than a majority took it): tried again. */
  | "failed";

/**
 * Records the verdict of `sale` that following it found (`settlement`), on the record of its
 * invoice shown last, dated after that record's last version: paid, then the sale is forgotten;
 * underpaid past its end (each of its transactions deep enough), kept until its `finalFrom`;
 * expired (nothing paid it), forgotten without a record (its screen would have recorded nothing).
 */
export async function recordVerdict(
  profile: TerminalProfile,
  sale: FollowedSale,
  settlement: Settlement,
  now: number = nowUnix()
): Promise<VerdictOutcome> {
  try {
    if (settlement.status === "expired") {
      await forgetFollowedSale(sale.saleKey);
      return "done";
    }
    if (settlement.status === "paid") {
      const value = paidRecord(sale, settlement, now);
      // A later attempt dates its record after this one's.
      if (value.paymentHash === sale.invoice.paymentHash) {
        await updateFollowedSale(sale.saleKey, (last) => ({
          ...last,
          recordedAt: Math.max(last.recordedAt, saleRecordDate(value))
        }));
      }
      await recordSaleVerdict(profile, value);
      await forgetFollowedSale(sale.saleKey);
      return "done";
    }
    if (settlement.due === null) return "failed";
    // Undeclared, its Lightning payments unknown here: never recorded underpaid on a guess. Its
    // records keep what its screen saw ("Confirming" while a payment is not judged).
    if (!sale.declared) {
      if (settlement.finalFrom > now) return "later";
      await forgetFollowedSale(sale.saleKey);
      return "done";
    }
    const verdict: Omit<SaleUnderpaid, "at"> = {
      received: settlement.received.toString(),
      due: settlement.due.toString(),
      transactions: (settlement.onchain?.transactions.map(({ txid }) => txid) ?? []).slice(
        0,
        MAX_UNDERPAID_TRANSACTIONS
      )
    };
    // Recorded once on a majority of the relays, dated after every transaction its device saw
    // paying its address: "Wallet" tells by it that none is left to judge (a transaction
    // seen a minute before at least, model.ts).
    if (!sale.settled || !sameUnderpaid(sale.underpaid, verdict)) {
      const underpaid: SaleUnderpaid = {
        ...verdict,
        at: Math.max(now + JUDGED_MARGIN_SECONDS, sale.recordedAt + 1)
      };
      await updateFollowedSale(sale.saleKey, (last) => ({
        ...last,
        recordedAt: Math.max(last.recordedAt, underpaid.at),
        underpaid,
        settled: false
      }));
      if (
        (await recordSaleVerdict(profile, followedRecord(sale, null, underpaid))) === "unsigned"
      ) {
        await forgetFollowedSale(sale.saleKey);
        return "done";
      }
      await updateFollowedSale(sale.saleKey, (last) => ({ ...last, settled: true }));
    }
    if (settlement.finalFrom <= now) {
      await forgetFollowedSale(sale.saleKey);
      return "done";
    }
    return "later";
  } catch (error) {
    logFailure("Recording the sale's verdict failed", error);
    return "failed";
  }
}

/**
 * The record of `sale` paid, as its screen records it (useSaleRecord): on the Lightning invoice
 * paid last when one paid it (its own record: no underpayment of the invoice shown last in it),
 * else on the invoice shown last, the underpayment it holds kept (its date never goes back). Paid
 * when its last payment came (the time its last transaction was broadcast, useOnchainTimes; the
 * time it is seen paid over Lightning, whose proof tells none), and later than the last version of
 * that record.
 */
function paidRecord(sale: FollowedSale, settlement: Settlement, now: number) {
  // The proofs of its Lightning payments (MemberSale.lightning), on its paid record.
  const proofs = settlement.lightning.map(({ invoice, preimage }) => ({
    invoice: invoice.pr,
    preimage
  }));
  const lightning = [...settlement.lightning]
    .map(({ invoice }) => invoice)
    .sort((a, b) => b.decoded.timestamp - a.decoded.timestamp)[0];
  const onchainAt = Math.max(
    0,
    ...(settlement.onchain?.transactions ?? []).map(({ receivedAt }) =>
      Math.floor(receivedAt / 1000)
    )
  );
  const paidAt = Math.min(now, lightning ? now : onchainAt || now);
  if (lightning && lightning.decoded.paymentHash !== sale.invoice.paymentHash) {
    const { decoded } = lightning;
    const invoice = {
      paymentHash: decoded.paymentHash,
      sats: ((decoded.amountMsat ?? 0n) / 1000n).toString(),
      verifyUrl: lightning.verifyUrl,
      createdAt: decoded.timestamp,
      expiresAt: bolt11ExpiresAt(decoded)
    };
    // Its record was shown before now: seen paid now, it is dated after it.
    return followedRecord({ ...sale, invoice }, Math.max(now, decoded.timestamp + 1), null, proofs);
  }
  return followedRecord(sale, Math.max(paidAt, sale.recordedAt + 1), sale.underpaid, proofs);
}

type Job = {
  sale: FollowedSale;
  settled: SettledSale;
  key: Uint8Array;
  /** Its transactions seen, recorded and declared in the registry as its screen did. */
  sightings: SightingsBook;
};

/**
 * The point of sale's sales with an on-chain address whose screen is gone before their verdict
 * (sale-follow.ts): at the app's start, when it comes back to the front, when a screen leaves its
 * sale, and every SALES_FOLLOW_INTERVAL_MS, each is followed for a moment (SaleSettler, the
 * point of sale's engine, useSale), one after the other, and its verdict recorded once it has one
 * (recordVerdict). A sale its screen shows is left to it. Only with the business's registry: the
 * sale's Lightning invoices are known by their declarations, never judged without them. Renders
 * nothing.
 */
export function SalesFollower({ profile }: { profile: TerminalProfile }) {
  const [queue, setQueue] = useState<Job[]>([]);
  const [round, setRound] = useState(0);
  const running = useRef(false);
  // A round asked while one runs: made once it is through.
  const again = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set again on a remount of the same instance (Strict Mode, Fast Refresh).
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const next = () => setRound((count) => count + 1);
    const timer = setInterval(next, SALES_FOLLOW_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") next();
    });
    const unsubscribe = subscribeSaleReleases(next);
    return () => {
      clearInterval(timer);
      subscription.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (queue.length > 0 || !running.current) return;
    running.current = false;
    if (again.current) {
      again.current = false;
      setRound((count) => count + 1);
    }
  }, [queue]);

  useEffect(() => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    void (async () => {
      const jobs: Job[] = [];
      try {
        const account = profileAccount(profile).toLowerCase();
        const now = nowUnix();
        const registry = await loadBusinessRegistry(profile);
        for (const sale of await loadFollowedSales()) {
          if (sale.account !== account) continue;
          if (sale.endsAt + FOLLOW_LIMIT_SECONDS < now) {
            await forgetFollowedSale(sale.saleKey);
            continue;
          }
          // Declared, it waits for the business's registry (its invoices are known by it).
          if (
            (sale.declared && registry === null) ||
            isSaleFollowed(sale.saleKey) ||
            !isLookDue(sale.saleKey, now)
          ) {
            continue;
          }
          const key = hexToBytes(sale.saleKey);
          const own = sale.declared && registry ? registry : null;
          jobs.push({
            sale,
            key,
            sightings: saleSightings(own ? saleRegistry(own, key, sale.relays, sale.taker) : null, {
              fiat: sale.fiat,
              note: sale.note
            }),
            settled: {
              fiat: sale.fiat,
              note: sale.note,
              startsAt: sale.startsAt,
              endsAt: sale.endsAt,
              onchainAddress: sale.address,
              lightningAddress: sale.lightningAddress,
              registryKey: own?.key ?? null,
              registryReader: own?.reader ?? "",
              owner: own?.owner ?? "",
              taker: sale.taker
            }
          });
        }
      } catch (error) {
        logFailure("Reading the sales to follow failed", error);
      }
      if (!mounted.current) return;
      if (jobs.length === 0) {
        running.current = false;
        if (again.current) {
          again.current = false;
          setRound((count) => count + 1);
        }
        return;
      }
      setQueue(jobs);
    })();
    // A round per tick; the profile is the account's (another one mounts it again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const job = queue[0];
  if (!job) return null;

  const onDone = (result: SettleResult) => {
    void (async () => {
      const { saleKey } = job.sale;
      const now = nowUnix();
      // Its screen shows it again meanwhile: left to it.
      if (!isSaleFollowed(saleKey)) {
        if (result.kind === "pending") lookAgainAt(saleKey, now + PENDING_RETRY_SECONDS);
        else {
          // What its screen or the last round recorded since this round read it.
          const current = (await loadFollowedSales()).find((sale) => sale.saleKey === saleKey);
          if (current) {
            const outcome = await recordVerdict(profile, current, result.settlement);
            if (outcome === "later") lookAgainAt(saleKey, result.settlement.finalFrom);
            else if (outcome === "failed") lookAgainAt(saleKey, now + FAILED_RETRY_SECONDS);
          }
        }
      }
      setQueue((last) => last.slice(1));
    })();
  };

  return (
    <SaleSettler
      key={job.sale.saleKey}
      sale={job.settled}
      saleKey={job.key}
      relays={job.sale.relays}
      tolerance={job.sale.tolerance}
      sightings={job.sightings}
      onDone={onDone}
    />
  );
}
