import {
  canceledFinal,
  existingFinal,
  isValidFinal,
  publishFinal
} from "@/features/payment-link/finalize";
import {
  openLinks,
  ownerJobsOf,
  publishOwnerFinal,
  withOwnerFinals,
  type LinkHolder,
  type OwnerFinalJob
} from "@/features/payment-link/owner-finals";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { isAddressUnused } from "@/features/terminal/onchain-pool";
import type { Settlement } from "@/features/terminal/useSale";
import { LnurlError, fetchPayRequest, paidPreimage, type PayRequest } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import { publishToRelays } from "@/lib/nostr/pool";
import {
  PAYMENT_LINK_TIMEOUT_MS,
  fetchLinkCopies,
  fetchOwnerFinalCopies,
  ownerFinalLinkEvent,
  type LinkCopy
} from "@/lib/payment-link/link";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { payloadOfSale, type SharedSale } from "@/lib/payment-link/payload";
import { nowUnix } from "@/lib/rates/snapshot";
import { currentRelays } from "@/lib/relays/current";
import { checkDeclaredInvoice, fetchDeclaredInvoices, saleRegistry } from "@/lib/registry/registry";
import { openAccountFormerMetadata } from "@/lib/settings/former-metadata";
import { deriveLinkOwner, type TeamKeys } from "@/lib/team/keys";

/*
 * Canceling an employee's payment links: the owner removes an employee
 * whose links are not final yet. Each link of the business that received nothing gets the owner's
 * final version "canceled" (src/lib/payment-link/final.ts), signed with the owner's key of its sale
 * (owner-key.ts), as owner-finals.ts publishes the others: its payer's page no longer offers to
 * pay; an open page learns it at once (watchLinkFinal). A Lightning invoice cannot be revoked (no
 * cancel in the Breez SDK nor its LNURL server): one already in a payer's wallet, and the sale's
 * on-chain address, can still be paid; the payment reaches the merchant's wallet all the same, and
 * the sale is then settled as any other, over its cancellation (isProvisionalCancel of
 * src/features/payment-link/finalize.ts).
 *
 * A link that received a payment is not canceled: its sale is followed for a moment (`settle`, the
 * screen's SaleSettler, as OwnerLinksFinalizer does), and when its outcome is final by then (paid,
 * or underpaid 3 hours after its end with every transaction deep enough), it gets the owner's final
 * version of that outcome at once, without the hour the owner otherwise
 * leaves the employee's device (OWNER_FINALS_MARGIN_SECONDS): that device is being removed.
 */

/**
 * What canceling found: done (every link that was not final is canceled, finalized, or was final by
 * then), a link that received a payment whose outcome is not final yet (nothing is canceled: its
 * sale must be settled), or relays or services that could not tell (nothing canceled, or some links
 * only: trying again goes on).
 */
export type CancelOutcome = "canceled" | "received" | "unreachable";

/**
 * Follows the sales of `jobs` for a moment (SaleSettler) and resolves with each one's settlement,
 * in the same order, or null for a sale not settled within that time.
 */
export type SettleSales = (jobs: readonly OwnerFinalJob[]) => Promise<(Settlement | null)[]>;

/** Without a screen to follow sales: none is settled. */
const settleNone: SettleSales = async (jobs) => jobs.map(() => null);

/** Whether a sale received anything: over Lightning (its declared invoices) or on-chain. */
type Received = "nothing" | "something" | "unknown";

/**
 * Whether the sale of a link received anything, as far as the services tell now: each invoice
 * declared for it (src/lib/registry/) on a majority of its relays, that its merchant's LNURL server
 * made (checkDeclaredInvoice), asked whether it was paid (LUD-21), and its on-chain address asked
 * whether anything ever paid it. "unknown" when one of them could not tell.
 */
async function receivedBy(
  sale: SharedSale,
  saleKey: Uint8Array,
  relays: readonly string[]
): Promise<Received> {
  const network = invoiceNetwork();
  const registry = saleRegistry(
    {
      key: sale.registryKey,
      reader: sale.registryReader,
      owner: sale.owner,
      ...(sale.registryEpoch ? { readerEpoch: sale.registryEpoch } : {})
    },
    saleKey,
    relays
  );
  const invoices = await fetchDeclaredInvoices(registry, network, { relays });
  if (invoices === null) return "unknown";
  if (invoices.length > 0) {
    let pay: PayRequest;
    try {
      pay = await fetchPayRequest(sale.lightningAddress);
    } catch {
      return "unknown";
    }
    for (const invoice of invoices) {
      // Not an invoice of the merchant's service: never a payment of the sale.
      // Made under a former name of the address (the owner's settings keep its metadata): its own.
      if (!checkDeclaredInvoice(invoice, pay, network, openAccountFormerMetadata())) continue;
      try {
        if ((await paidPreimage(invoice)) !== null) return "something";
      } catch (error) {
        // The service never made this invoice (a forged declaration): it can never be paid.
        if (error instanceof LnurlError && error.code === "otherInvoice") continue;
        return "unknown";
      }
    }
  }
  if (sale.onchainAddress !== null) {
    const unused = await isAddressUnused(sale.onchainAddress);
    if (unused === null) return "unknown";
    if (!unused) return "something";
  }
  return "nothing";
}

/**
 * Publishes the owner's final version "canceled" of `link` on a majority of its relays, unless a
 * final version is there by then (its device may have published one). False when it could not.
 */
async function publishCanceled(team: TeamKeys, link: OwnerFinalJob): Promise<boolean> {
  try {
    const ownerSecret = deriveLinkOwner(team).secretKey;
    const signer = saleOwnerSecretKey(ownerSecret, link.saleKey);
    const existing = await existingFinal(
      link.id,
      link.saleKey,
      link.sale.owner,
      signer,
      link.relays
    );
    if (existing === null) return false;
    if (existing) return true;
    const payload = payloadOfSale(link.sale);
    const final = canceledFinal(link.id);
    if (!isValidFinal(payload, final)) return false;
    // The link itself again: a payer's page finds the owner's final version through it.
    await publishToRelays(
      link.linkEvent,
      {
        relays: link.relays,
        timeoutMs: PAYMENT_LINK_TIMEOUT_MS,
        channel: "anonymous",
        authKey: signer
      },
      { quorum: "majority" }
    );
    const event = ownerFinalLinkEvent(ownerSecret, link.id, link.saleKey, payload, final);
    await publishFinal(event, signer, link.relays);
    return true;
  } catch (error) {
    logFailure("Canceling a payment link failed", error);
    return false;
  }
}

/**
 * The owner's final version of each of `jobs`, links that received a payment, from what following
 * their sales found (`settle`): "received" when one is not final yet (not settled in time, an
 * underpayment within its 3 hours, a transaction not deep enough), or when the owner cannot vouch
 * for it (a sale of another Lightning address than the business's `lightningAddress`, or none
 * known; an on-chain payment to an address the owner did not give the employee); "unreachable" when
 * one could not be published. The others are published all the same (they say what happened).
 */
async function finalizeReceived(
  team: TeamKeys,
  jobs: readonly OwnerFinalJob[],
  settle: SettleSales,
  lightningAddress: string | null
): Promise<CancelOutcome> {
  const settlements = await settle(jobs);
  let outcome: CancelOutcome = "canceled";
  for (const [index, job] of jobs.entries()) {
    const settlement = settlements[index] ?? null;
    if (
      settlement === null ||
      job.sale.lightningAddress !== lightningAddress ||
      (settlement.onchain !== null && !job.onchainVerified)
    ) {
      if (outcome === "canceled") outcome = "received";
      continue;
    }
    const published = await publishOwnerFinal(team, job, settlement);
    if (published === "notReady") {
      if (outcome === "canceled") outcome = "received";
    } else if (published === "failed") {
      outcome = "unreachable";
    }
  }
  return outcome;
}

/**
 * Cancels the payment links `holder` made in the last year (openLinks) that have no final version
 * yet: first each sale is asked whether it received anything (receivedBy), and nothing is done when
 * one could not tell ("unreachable"). The links that received a payment get the owner's final
 * version of their outcome when it is final and the sale pays the business's `lightningAddress`
 * (finalizeReceived, through `settle`), else nothing is canceled ("received": its sale must be
 * settled first). Then each link that received nothing gets the owner's final version "canceled".
 * Invoices of sales without a link have no final version: the employee's device stops showing them
 * once it receives its removal (watchMembership), which follows.
 */
export async function cancelOpenLinks(
  team: TeamKeys,
  holder: LinkHolder,
  {
    settle = settleNone,
    lightningAddress = null,
    now = nowUnix()
  }: { settle?: SettleSales; lightningAddress?: string | null; now?: number } = {}
): Promise<CancelOutcome> {
  // Those no relay can give and that name none of the account's relays: nobody can pay them.
  const found = await openLinks([holder], now, [], { accountRelays: currentRelays() });
  if (found === null || found.unread > 0) return "unreachable";
  const candidates = ownerJobsOf(team, found.open);
  if (candidates.length === 0) return "canceled";
  const owner = deriveLinkOwner(team).publicKey;
  const finals = await withOwnerFinals(
    candidates.map(({ id, saleKey, relays }) => ({ author: id, key: saleKey, owner, relays }))
  );
  if (finals === null) return "unreachable";
  const nothing: OwnerFinalJob[] = [];
  const paid: OwnerFinalJob[] = [];
  for (const job of candidates.filter(({ id }) => !finals.has(id))) {
    const received = await receivedBy(job.sale, job.saleKey, job.relays);
    if (received === "unknown") return "unreachable";
    (received === "something" ? paid : nothing).push(job);
  }
  if (paid.length > 0) {
    const outcome = await finalizeReceived(team, paid, settle, lightningAddress);
    if (outcome !== "canceled") return outcome;
  }
  for (const job of nothing) {
    if (!(await publishCanceled(team, job))) return "unreachable";
  }
  return "canceled";
}

/**
 * What a final version found by then says of canceling its link: "received" when its sale received
 * a payment (paid or underpaid: nothing to cancel), else "canceled" (canceled or expired: it can no
 * longer be paid). Null without a final version among `copies`.
 */
function outcomeOfFinals(copies: readonly LinkCopy[]): CancelOutcome | null {
  const finals = copies.flatMap(({ link }) =>
    link.kind === "sale" && link.sale.final !== null ? [link.sale.final] : []
  );
  if (finals.length === 0) return null;
  return finals.some((final) => final.received > 0n) ? "received" : "canceled";
}

/**
 * Cancels one payment link of the business ("Cancel the invoice"), as
 * cancelOpenLinks cancels an employee's: "canceled" once it has the owner's final version
 * "canceled" (or another final version by then that received nothing); "received" when its sale
 * received a payment, its final version's or one found now (nothing is canceled: it is settled
 * with its payments); "unreachable" when the relays or the
 * services could not tell, or the final version could not be published.
 */
export async function cancelLink(
  team: TeamKeys,
  link: { author: string; key: Uint8Array; relays: readonly string[] },
  now: number = nowUnix()
): Promise<CancelOutcome> {
  const network = invoiceNetwork();
  const found = await openLinks([], now, [link]);
  if (found === null || found.unread > 0) return "unreachable";
  if (found.open.length === 0) {
    // Its own final version is there (its device settled it meanwhile, a paid one at once): what
    // it says, never "canceled" for a sale that received a payment.
    const copies = await fetchLinkCopies([link], network, link.relays);
    return (copies && outcomeOfFinals(copies.get(link.author) ?? [])) ?? "unreachable";
  }
  const [job] = ownerJobsOf(team, found.open);
  // No copy of it on its relays, or not one of the business's.
  if (!job) return "unreachable";
  const owner = deriveLinkOwner(team).publicKey;
  const finals = await fetchOwnerFinalCopies(
    [{ author: job.id, key: job.saleKey, owner }],
    network,
    job.relays
  );
  if (finals === null) return "unreachable";
  const ownerFinal = finals.get(job.id);
  if (ownerFinal) return outcomeOfFinals([ownerFinal]) ?? "unreachable";
  const received = await receivedBy(job.sale, job.saleKey, job.relays);
  if (received === "unknown") return "unreachable";
  if (received === "something") return "received";
  return (await publishCanceled(team, job)) ? "canceled" : "unreachable";
}
