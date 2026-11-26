import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { getAccountTeamKeys } from "@/features/account/session";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { isAddressUnused, releaseOnchainAddress } from "@/features/terminal/onchain-pool";
import { FINAL_DELAY_SECONDS, type Settlement } from "@/features/terminal/useSale";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToQuorum, publishToRelays } from "@/lib/nostr/pool";
import { finalPayload, type FinalPayload } from "@/lib/payment-link/final";
import {
  PAYMENT_LINK_TIMEOUT_MS,
  fetchFinalVersion,
  finalLinkEvent,
  finalLinkPayload,
  ownerFinalLinkEvent,
  type LinkCopy
} from "@/lib/payment-link/link";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { parsePaymentLinkPayload, type PaymentLinkPayload } from "@/lib/payment-link/payload";
import { removePendingLink, type PendingLink } from "@/lib/payment-link/pending";
import { nowUnix } from "@/lib/rates/snapshot";
import { deriveLinkOwner, type TeamKeys } from "@/lib/team/keys";

/*
 * Publishing the final version of a payment link (src/lib/payment-link/final.ts), from what its
 * sale's engine settled (useSale's `settlement`): by the device that
 * made the link, signed with the link's own key (it replaces the link on the relays), or by the
 * owner (owner-finals.ts). Before publishing, the relays are asked whether a final version is
 * already there: nothing replaces one, but the owner's settlement a provisional cancellation
 * waits for (isProvisionalCancel).
 */

/**
 * Whether `copy` is a cancellation its sale's settlement may still replace (a payment received is
 * never hidden): a final version
 * "canceled" made before its sale's end and its 3 hours (FINAL_DELAY_SECONDS). Until then a payment
 * can still reach the sale (a Lightning invoice kept in a payer's wallet, its on-chain address,
 * which the device that made the link keeps for it meanwhile), and the sale is followed as any
 * other; once its settlement is final, the owner publishes it (ownerSettlementOf): paid or underpaid
 * with what was received, which then counts (betterCopy), else canceled again, for good, dated past
 * the sale's time. A cancellation made past that time is final at once: nothing paid the sale by
 * then (cancel-links.ts asks), and its outcome would be final anyway.
 */
export function isProvisionalCancel(copy: LinkCopy): boolean {
  if (copy.link.kind !== "sale") return false;
  const { sale } = copy.link;
  return (
    sale.final?.status === "canceled" && copy.event.created_at < sale.endsAt + FINAL_DELAY_SECONDS
  );
}

/** The final part of a link's payload when its owner canceled its sale, naming the link's author. */
export function canceledFinal(linkAuthor: string): FinalPayload {
  return finalPayload({
    status: "canceled",
    received: 0n,
    due: null,
    point: null,
    lightning: [],
    onchain: null,
    link: linkAuthor
  });
}

/**
 * The owner's final version of a sale it canceled (isProvisionalCancel), from its settlement: paid
 * or underpaid as any sale (its payments, the point of the amount due, its tolerance), or canceled
 * again when nothing was received (an expired settlement, final from the sale's end and its 3
 * hours: dated then, it is a cancellation for good).
 */
export function ownerSettlementOf(settlement: Settlement, linkAuthor: string): FinalPayload {
  return settlement.status === "expired"
    ? canceledFinal(linkAuthor)
    : finalOf(settlement, linkAuthor);
}

/** The final part of a link's payload from its sale's settlement, naming the link's author. */
export function finalOf(settlement: Settlement, linkAuthor: string): FinalPayload {
  // Sorted: the same sale gives the same final version, whoever makes it.
  const lightning = settlement.lightning
    .map(({ invoice, preimage }) => ({
      invoice: invoice.pr,
      preimage,
      hash: invoice.decoded.paymentHash
    }))
    .sort((a, b) => (a.hash < b.hash ? -1 : 1));
  return finalPayload({
    status: settlement.status,
    received: settlement.received,
    accepted: settlement.accepted,
    due: settlement.due,
    point: settlement.point,
    lightning,
    onchain:
      settlement.onchain === null
        ? null
        : {
            ...settlement.onchain,
            transactions: [...settlement.onchain.transactions].sort((a, b) =>
              a.txid < b.txid ? -1 : 1
            )
          },
    link: linkAuthor
  });
}

/**
 * Publishes a final version to every relay of its link (`relays`, those its URL names): done once
 * a majority took it (3 of 5), so that the relays that drop it later do not lose it; rejects
 * otherwise (the next attempt publishes it again).
 */
export function publishFinal(
  event: NostrEvent,
  authKey: Uint8Array,
  relays: readonly string[]
): Promise<void> {
  return publishToQuorum(
    event,
    { channel: "anonymous", relays, timeoutMs: PAYMENT_LINK_TIMEOUT_MS, authKey },
    majority(relays.length)
  );
}

/**
 * The final version link `id` already has (the one that counts, betterCopy), kept then on a
 * majority of the relays: one that fewer took (a publication cut short) is published again to the
 * others, as `authKey` (NIP-42). A provisional cancellation (isProvisionalCancel) as it is: the
 * owner's settlement replaces it. False without one. Null when it is not known (fewer than a
 * majority of the relays answered), or when that final version still sits on fewer than a majority
 * (tried again later).
 */
export async function existingFinal(
  author: string,
  saleKey: Uint8Array,
  owner: string,
  authKey: Uint8Array,
  relays: readonly string[]
): Promise<LinkCopy | false | null> {
  const found = await fetchFinalVersion(author, saleKey, owner, invoiceNetwork(), relays);
  if (found === null) return null;
  if (found.final === null) return false;
  if (isProvisionalCancel(found.final)) return found.final;
  const quorum = majority(relays.length);
  if (found.holders.length >= quorum) return found.final;
  const others = relays.filter((relay) => !found.holders.includes(relay));
  const took = await publishToRelays(
    found.final.event,
    { relays: others, timeoutMs: PAYMENT_LINK_TIMEOUT_MS, channel: "anonymous", authKey },
    // What the majority lacks; the other relays get it in the background.
    { quorum: { count: quorum - found.holders.length } }
  );
  return found.holders.length + took.length >= quorum ? found.final : null;
}

/** Whether `payload` with `final` is a final version the payer's page accepts. */
export function isValidFinal(payload: PaymentLinkPayload, final: FinalPayload): boolean {
  const link = parsePaymentLinkPayload(finalLinkPayload(payload, final), invoiceNetwork());
  return link?.kind === "sale" && link.sale.final !== null;
}

export type FinalizeOutcome =
  /** Published on a majority of the relays: the link is forgotten. */
  | "published"
  /** A final version was there already: the link is forgotten. */
  | "alreadyFinal"
  /** The outcome is not final yet (an expired sale within its 3 hours). */
  | "notReady"
  /** Not published (relays out of reach, or fewer than a majority took it): kept for later. */
  | "failed";

// Links being finalized: two calls for the same link (the invoice's screen and the pending links'
// worker) never publish two final versions.
const finalizing = new Set<string>();

/**
 * Forgets `pending` once its final version is on the relays, and puts its on-chain address back to
 * its pool (the owner's wallet's, or an employee's lot) when nothing paid it
 * (the final version leaves it out,
 * the payer's page shows it no more): once the explorer shows that nothing ever paid it, by the
 * call that removes the link's entry only (never twice). False when the explorer cannot tell: the
 * link is kept, the next attempt looks again.
 */
async function forget(pending: PendingLink, unpaid: boolean): Promise<boolean> {
  const { pool } = pending;
  const address = pending.payload.onchainAddress;
  if (!unpaid || address === null || pool === null) {
    await removePendingLink(pending.id);
    return true;
  }
  // A payment that came since (a payer with an old copy of the code) keeps it used.
  const unused = await isAddressUnused(address);
  if (unused === null) return false;
  if ((await removePendingLink(pending.id)) && unused) {
    await releaseOnchainAddress(pool, address);
  }
  return true;
}

/**
 * Publishes the final version of `pending`, a link this device made, from its sale's settlement,
 * signed with the link's own key, unless one is already there; then forgets the link (its signing
 * key with it), its on-chain address back to the pool when nothing paid it. Over a provisional
 * cancellation (isProvisionalCancel), the owner's settlement of the sale (ownerSettlementOf),
 * signed with the owner's key of the sale, when this device is the owner's with its account open
 * (`team`): it alone knows the address it gave the sale (the owner never vouches for an on-chain
 * payment to an address of one of its devices, owner-finals.ts). Otherwise the link is kept,
 * its address with it, until the owner's settlement is there ("notReady").
 */
export async function finalizePendingLink(
  pending: PendingLink,
  settlement: Settlement,
  now: number = nowUnix(),
  team: TeamKeys | null = getAccountTeamKeys()
): Promise<FinalizeOutcome> {
  if (settlement.finalFrom > now) return "notReady";
  if (finalizing.has(pending.id)) return "failed";
  finalizing.add(pending.id);
  try {
    const key = hexToBytes(pending.key);
    const secretKey = hexToBytes(pending.secret);
    const existing = await existingFinal(
      pending.id,
      key,
      pending.payload.owner,
      secretKey,
      pending.relays
    );
    if (existing === null) return "failed";
    if (existing && isProvisionalCancel(existing)) {
      return await settleCanceled(pending, settlement, team, now);
    }
    if (existing) {
      return (await forget(pending, settlement.onchain === null)) ? "alreadyFinal" : "failed";
    }
    const final = finalOf(settlement, bytesToHex(schnorr.getPublicKey(secretKey)));
    // A version the payer's page would refuse is never published (it would be ignored).
    if (!isValidFinal(pending.payload, final)) {
      logFailure("Refused final version of a payment link", final);
      return "failed";
    }
    const event = finalLinkEvent(
      { secretKey, key, payload: pending.payload },
      pending.createdAt,
      final,
      now
    );
    await publishFinal(event, secretKey, pending.relays);
    return (await forget(pending, final.onchain === null)) ? "published" : "failed";
  } catch (error) {
    logFailure("Publishing the final version of a payment link failed", error);
    return "failed";
  } finally {
    finalizing.delete(pending.id);
  }
}

/**
 * The owner's settlement of `pending`'s sale over its provisional cancellation (finalizePendingLink),
 * on a majority of its relays; then the link is forgotten. "notReady" while this device cannot sign
 * for the owner the link names (another account's, or none open): the owner settles it.
 */
async function settleCanceled(
  pending: PendingLink,
  settlement: Settlement,
  team: TeamKeys | null,
  now: number
): Promise<FinalizeOutcome> {
  let ownerSecret: Uint8Array;
  try {
    if (team === null) return "notReady";
    const owner = deriveLinkOwner(team);
    if (owner.publicKey !== pending.payload.owner) return "notReady";
    ownerSecret = owner.secretKey;
  } catch (error) {
    // The account closed meanwhile (its keys wiped): the owner settles it.
    logFailure("Settling a canceled payment link failed", error);
    return "notReady";
  }
  const key = hexToBytes(pending.key);
  const final = ownerSettlementOf(settlement, pending.id);
  if (!isValidFinal(pending.payload, final)) {
    logFailure("Refused final version of a payment link", final);
    return "failed";
  }
  const event = ownerFinalLinkEvent(ownerSecret, pending.id, key, pending.payload, final, now);
  await publishFinal(event, saleOwnerSecretKey(ownerSecret, key), pending.relays);
  return (await forget(pending, final.onchain === null)) ? "published" : "failed";
}

/** Links whose sale a screen follows (the invoice shown): the worker leaves them to it. */
const followed = new Map<string, number>();

/** Marks link `id` as followed by a screen; returns the unmarking. */
export function followLink(id: string): () => void {
  followed.set(id, (followed.get(id) ?? 0) + 1);
  return () => {
    const count = (followed.get(id) ?? 1) - 1;
    if (count <= 0) followed.delete(id);
    else followed.set(id, count);
  };
}

export function isLinkFollowed(id: string): boolean {
  return followed.has(id);
}
