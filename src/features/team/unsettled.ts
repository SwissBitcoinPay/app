import { hexToBytes } from "@noble/hashes/utils.js";

import {
  HOLDERS_AT_ONCE,
  openLinks,
  withOwnerFinals,
  type LinkHolder,
  type RecordedLink
} from "@/features/payment-link/owner-finals";
import {
  EXPIRY_GRACE_SECONDS,
  INVOICE_EXPIRY_SECONDS,
  invoiceNetwork
} from "@/features/terminal/invoice";
import { FINAL_DELAY_SECONDS } from "@/features/terminal/useSale";
import { inBatches } from "@/lib/batches";
import { loadPendingLinks } from "@/lib/payment-link/pending";
import { nowUnix } from "@/lib/rates/snapshot";
import { currentRelays } from "@/lib/relays/current";
import { deriveLinkOwner, type TeamKeys } from "@/lib/team/keys";
import { fetchSales, type MemberSale } from "@/lib/team/member-records";

/*
 * Whether a sale of the business is not final yet: an employee is not
 * removed, and the account's relays do not change, while one is. The owner reads it from the sales
 * and payment links the employees and its own devices publish (member.ts, recordSale and
 * recordLink), and from this device's pending links.
 */

/**
 * How far back invoices of sales without a link are read: an invoice ends within the period of its
 * point (src/lib/rates/), an hour at most.
 */
export const SALES_LOOKBACK_SECONDS = 24 * 3600;

/**
 * The longest a sale's invoice lasts: a point of sale's invoice ends within the period of the
 * point that priced it (fitsItsPeriod of src/lib/registry/registry.ts, checked before it is shown,
 * its top-ups included), which runs from 5 minutes after its hour to 5 minutes after the next
 * (pointHourOf, pointEnd of src/lib/rates/sources.ts): 3600 s from its date at most. Its record's
 * `createdAt` is the time its device showed it, on the issuer's clock (src/lib/clock.ts), after
 * that date.
 */
export const MAX_SALE_INVOICE_SECONDS = 3600;

/**
 * How far the owner's clock may be from the clock a sale's record was dated with (5 minutes, as
 * REMOVED_SEAT_GRACE_SECONDS of src/config/team.ts allows for the owner's device).
 */
export const SALE_CLOCK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Whether `sale`, not paid, may still be paid at `now`. Its record is the employee's device's word,
 * which whoever holds the employee's keys can write too (an invitation opened before the
 * employee): its end counts no later than an invoice can last (MAX_SALE_INVOICE_SECONDS),
 * and a sale dated past this device's clock is no sale shown yet. Otherwise a record claiming to
 * end in years would hold back the removal of the employee, a change of relays and the account's
 * deletion for as long as it is read (SALES_LOOKBACK_SECONDS). The record's format is unchanged:
 * every reader still accepts it as it is, only this check bounds it.
 */
function mayStillBePaid(sale: MemberSale, now: number): boolean {
  if (sale.paidAt !== null || sale.createdAt > now + SALE_CLOCK_TOLERANCE_SECONDS) return false;
  const end = Math.min(
    sale.expiresAt,
    sale.createdAt + MAX_SALE_INVOICE_SECONDS + SALE_CLOCK_TOLERANCE_SECONDS
  );
  return end + EXPIRY_GRACE_SECONDS > now;
}

/**
 * Whether `recorded`, a link no relay holds (or a removed employee's), may still be published by
 * its device and paid. Only a
 * link of the point of sale is recorded before it is published (src/features/terminal/
 * usePaymentLink.ts; an invoice's, src/features/invoices/invoices.ts, once a relay took it): its
 * sale ends INVOICE_EXPIRY_SECONDS after it starts, before its link is made (useCharge.ts), and an
 * invoice of it may be paid up to FINAL_DELAY_SECONDS after that end. Past them, no payment of it
 * can come: a record of a link that never existed (whoever holds an employee's keys can write
 * one) holds nothing back any more. One dated past this device's clock neither.
 * This device's own pending links (no holder) always count.
 */
function mayStillBePublished(recorded: RecordedLink, now: number): boolean {
  if (recorded.holder === null || recorded.createdAt === null) return true;
  return (
    recorded.createdAt <= now + SALE_CLOCK_TOLERANCE_SECONDS &&
    recorded.createdAt +
      INVOICE_EXPIRY_SECONDS +
      FINAL_DELAY_SECONDS +
      SALE_CLOCK_TOLERANCE_SECONDS >
      now
  );
}

/** What is not final yet: invoices that may still be paid, links without their final version. */
export type Unsettled = { invoices: number; links: number };

/**
 * Of the sales `holders` made, and of this device's pending links when `thisDevice`, those not
 * final yet:
 * - a payment link without its final version, the link's own nor the owner's: up to 3 hours after
 *   the end of a sale not paid (FINAL_DELAY_SECONDS), until its on-chain payment is confirmed, and
 *   until its device publishes it, the link itself included (a link no relay holds yet was shared
 *   all the same, while it may still be published and paid: mayStillBePublished); within the last
 *   year (OWNER_FINALS_LOOKBACK_SECONDS), as the owner finalizes; a link none of whose relays
 *   answer and that names none of the account's relays left out (openLinks, `accountRelays`);
 * - an invoice not paid, until its end and the EXPIRY_GRACE_SECONDS of checks after it (a sale
 *   without a link has no final version), its end bounded as an invoice's (mayStillBePaid).
 * Read on `relays`, the account's (a change of relays: those of the list it leaves that are not
 * retired, src/lib/relays/retired.ts). Null when the relays could not tell.
 */
export async function findUnsettled(
  team: TeamKeys,
  holders: readonly LinkHolder[],
  { thisDevice, relays = currentRelays() }: { thisDevice: boolean; relays?: readonly string[] },
  now: number = nowUnix()
): Promise<Unsettled | null> {
  const open = await inBatches(holders, HOLDERS_AT_ONCE, async (holder) => {
    const sales = await fetchSales(holder.keys, now - SALES_LOOKBACK_SECONDS, relays);
    return (
      sales &&
      sales.filter(
        (sale) =>
          (holder.until === undefined || sale.createdAt <= holder.until) &&
          mayStillBePaid(sale, now)
      ).length
    );
  });
  if (open === null) return null;
  const invoices = open.reduce((sum, count) => sum + count, 0);
  const pending = thisDevice ? await loadPendingLinks(invoiceNetwork()) : [];
  const found = await openLinks(
    holders,
    now,
    pending.map((link) => ({ author: link.id, key: hexToBytes(link.key), relays: link.relays })),
    {
      accountRelays: relays,
      recordsRelays: relays,
      // A removed employee's links, made before its removal (openLinks), count only while a link
      // of the point of sale may be paid, final or not: the owner settles them later
      // (settlingHolders), and its keys may be someone else's.
      keep: (recorded) => recorded.holder?.until === undefined || mayStillBePublished(recorded, now)
    }
  );
  if (found === null || found.unread > 0) return null;
  const unfinished = found.open.filter(
    ({ recorded, copy }) => copy !== null || mayStillBePublished(recorded, now)
  );
  // The owner's final version is signed with the owner key the link names: the business's.
  const owner = deriveLinkOwner(team).publicKey;
  const finals = await withOwnerFinals(
    unfinished.map(({ recorded, copy }) => ({
      author: recorded.author,
      key: recorded.key,
      owner: copy?.link.kind === "sale" ? copy.link.sale.owner : owner,
      relays: recorded.relays
    }))
  );
  if (finals === null) return null;
  const links = unfinished.filter(({ recorded }) => !finals.has(recorded.author)).length;
  return { invoices, links };
}
