import { bytesToHex } from "@noble/hashes/utils.js";
import { useEffect, useRef } from "react";

import type { PointOfSaleProfile, Sale } from "@/features/terminal/pos";
import {
  followSale,
  forgetFollowedSale,
  saveFollowedSale,
  updateFollowedSale,
  type SaleRecordValue
} from "@/features/terminal/sale-follow";
import type { ChargeState } from "@/features/terminal/useCharge";
import { bolt11ExpiresAt } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import { nowUnix } from "@/lib/rates/snapshot";
import { deriveSaleKeys } from "@/lib/registry/registry";
import {
  MAX_SALE_PROOFS,
  MAX_UNDERPAID_TRANSACTIONS,
  saleRecordDate,
  type SaleProof,
  type SaleUnderpaid
} from "@/lib/team/member-records";
import type { FollowedInvoice } from "@/lib/terminal/followed-sales";
import { profileAccount } from "@/lib/terminal/model";

import { recordSale, recordSaleVerdict } from "./member";

/**
 * What a sale showed, as first shown, with the sale's on-chain address: an invoice (`key`: its
 * payment request), or, above the most the Lightning address accepts, an hour's address alone
 * (useSale.ts; `key`: its hour). Each gets its record, as the follower keeps it (FollowedInvoice).
 */
type Shown =
  | {
      kind: "invoice";
      key: string;
      request: Extract<FollowedInvoice, { paymentHash: string }>;
      onchainAddress: string | null;
    }
  | {
      kind: "address";
      key: string;
      request: Extract<FollowedInvoice, { paymentHash: null }>;
      onchainAddress: string;
    };

/** What tells a record of the sale from its others (as saleRecordKey does among a device's). */
function recordKeyOf(request: FollowedInvoice): string {
  return request.paymentHash ?? `onchain:${request.hour}`;
}

/** The record of `invoice`, shown at `createdAt`. */
function invoiceRequest(
  invoice: Invoice,
  createdAt: number
): Extract<FollowedInvoice, { paymentHash: string }> {
  return {
    paymentHash: invoice.decoded.paymentHash,
    sats: ((invoice.decoded.amountMsat ?? 0n) / 1000n).toString(),
    verifyUrl: invoice.verifyUrl,
    createdAt,
    expiresAt: bolt11ExpiresAt(invoice.decoded)
  };
}

/**
 * What the sale says of an underpayment (useSale): during the sale, the sats received and, once the
 * hour's point is read, those due (received + the rest asked); past its end, the amount the
 * payments fell short of. Null otherwise.
 */
function underpaidOf(state: ChargeState): Omit<SaleUnderpaid, "at"> | null {
  if (state.phase === "underpaid") {
    return {
      received: state.received.toString(),
      due: state.rest === null ? null : (state.received + state.rest).toString(),
      transactions: state.txids.slice(0, MAX_UNDERPAID_TRANSACTIONS)
    };
  }
  if (state.phase === "underpaidEnded") {
    return {
      received: state.received.toString(),
      due: state.due.toString(),
      transactions: state.transactions.map(({ txid }) => txid).slice(0, MAX_UNDERPAID_TRANSACTIONS)
    };
  }
  return null;
}

/**
 * Each invoice shown is published as the device's sale, then again once the sale is paid, over
 * Lightning or on-chain (member.ts): on an employee's device, the owner sees who took it, for how
 * much in fiat, and the note, and the employee finds its own sales; on the owner's devices too,
 * so that the owner sees from any of them whether a sale is not final yet
 * (unsettled.ts). A device without the keys to sign it publishes nothing (recordSigner). An hour
 * that shows the sale's address alone, above the most the Lightning address accepts
 * (useSale.ts), is published as an invoice is, a record of its own
 * (`team-sale-onchain`, member-records.ts).
 *
 * Each version of an invoice's record is dated later than the one before it (saleRecordDate): a
 * relay keeps the latest, and of two as old the lowest id, so that a version as old as the one it
 * replaces would be lost one time in two. The paid one goes to a majority of the
 * relays (recordSaleVerdict).
 *
 * A sale with an on-chain address is kept on the device from its first invoice (or its address
 * shown alone) until its verdict is recorded (sale-follow.ts): paid, or expired. Once its screen is
 * gone, SalesFollower follows it.
 */
export function useSaleRecord({
  state,
  sale,
  profile,
  digits,
  startsAt,
  endsAt,
  tolerance,
  declared,
  taker,
  lightningProofs = []
}: {
  state: ChargeState;
  sale: Sale;
  profile: PointOfSaleProfile;
  digits: number;
  /** Unix seconds (src/lib/clock.ts): the sale's start and end. */
  startsAt: number;
  endsAt: number;
  /** The sale's tolerance of on-chain underpayments (basis points), held from its start. */
  tolerance: number;
  /**
   * Its invoices are declared (src/lib/registry/): its follower sees them, and judges an
   * underpayment. Undeclared (a device without the business's registry key), only a payment
   * on-chain alone is judged once its screen is gone (SalesFollower).
   */
  declared: boolean;
  /** Who took it (takerTag), as its declarations say it; null when they do not. */
  taker: string | null;
  /**
   * The Lightning invoices counted as paying the sale, with their preimages (useSale): its paid
   * record carries them (MemberSale.lightning), the proof an assistant's export checks.
   */
  lightningProofs?: readonly SaleProof[];
}): void {
  // The invoice shown: the hour's while the sale is open, the rest's after an underpayment. Each
  // hour asks another one (useSale.ts): each gets its record. Above the most the Lightning address
  // accepts, the hour's address alone, which gets its record too.
  const invoice =
    state.phase === "open" ? state.invoice : state.phase === "underpaid" ? state.topUp : null;
  const address = state.phase === "open" || state.phase === "underpaid" ? state.address : null;
  const alone =
    state.phase === "open" && state.invoice === null && state.address !== null
      ? { hour: state.hour, sats: state.sats, expiresAt: state.invoiceExpiresAt }
      : null;
  const shownKey = invoice ? invoice.pr : alone ? `onchain:${alone.hour}` : null;
  const paidAt = state.phase === "paid" ? Math.floor(state.paidAt.getTime() / 1000) : null;
  // The last invoice shown, so that its "paid" record keeps its date: a paid sale no longer has it.
  const shown = useRef<Shown | null>(null);
  // The date of the last version published of each record, by recordKeyOf.
  const dated = useRef(new Map<string, number>());
  // The underpayment last recorded, as published, with the record that holds it (recordKeyOf).
  const underpaidRecorded = useRef<{ hash: string; value: SaleUnderpaid } | null>(null);
  const underpaidRecordedKey = useRef<string | null>(null);
  // Its registry identity: the records of one sale are tied by it ("Wallet").
  const saleId = deriveSaleKeys(sale.key).nostr.publicKey;
  const saleKey = bytesToHex(sale.key);
  // When each invoice was first shown, by payment request: the one paid may be an earlier one.
  const shownAt = useRef(new Map<string, number>());
  const paidRecorded = useRef<string | null>(null);
  // The sale kept on the device for its verdict (by its key), once it has an address.
  const kept = useRef<string | null>(null);

  // Followed by this screen: the follower leaves it to it, and takes it over once it is gone.
  useEffect(() => followSale(saleKey), [saleKey]);

  const valueOf = (
    record: Shown,
    paid: number | null,
    underpaid: SaleUnderpaid | null
  ): SaleRecordValue => {
    // Its proofs on its paid record only: the payments that paid it, as many as a record names.
    const proofs = paid !== null ? lightningProofs.slice(0, MAX_SALE_PROOFS) : [];
    const { request } = record;
    const common = {
      sats: request.sats,
      fiat: { minor: sale.minor, digits, currency: profile.currency },
      note: sale.note.trim(),
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      paidAt: paid,
      sale: saleId,
      saleKey,
      ...(underpaid ? { underpaid } : {}),
      ...(proofs.length > 0 ? { lightning: proofs.map((proof) => ({ ...proof })) } : {})
    };
    return record.kind === "invoice"
      ? {
          ...common,
          paymentHash: record.request.paymentHash,
          verifyUrl: record.request.verifyUrl,
          onchainAddress: record.onchainAddress
        }
      : {
          ...common,
          paymentHash: null,
          verifyUrl: null,
          hour: record.request.hour,
          onchainAddress: record.onchainAddress
        };
  };

  const publish = (record: Shown, underpaid: SaleUnderpaid | null = null) => {
    const value = valueOf(record, null, underpaid);
    dated.current.set(recordKeyOf(record.request), saleRecordDate(value));
    recordSale(profile, value);
  };

  useEffect(() => {
    if (shownKey === null || shown.current?.key === shownKey) return;
    const createdAt = nowUnix();
    let record: Shown;
    if (invoice) {
      record = {
        kind: "invoice",
        key: shownKey,
        request: invoiceRequest(invoice, createdAt),
        onchainAddress: address
      };
      shownAt.current.set(invoice.pr, createdAt);
    } else if (alone && address !== null) {
      record = {
        kind: "address",
        key: shownKey,
        request: {
          paymentHash: null,
          verifyUrl: null,
          hour: alone.hour,
          sats: alone.sats.toString(),
          createdAt,
          expiresAt: alone.expiresAt
        },
        onchainAddress: address
      };
    } else {
      return;
    }
    shown.current = record;
    publish(record);
    if (record.onchainAddress === null) return;
    const followed = record.request;
    const keep =
      kept.current === saleKey
        ? updateFollowedSale(saleKey, (last) => ({
            ...last,
            invoice: followed,
            recordedAt: createdAt,
            underpaid: null,
            settled: false
          }))
        : saveFollowedSale({
            account: profileAccount(profile).toLowerCase(),
            saleKey,
            relays: sale.relays,
            lightningAddress: profile.lightningAddress,
            fiat: { minor: sale.minor, digits, currency: profile.currency },
            note: sale.note.trim(),
            startsAt,
            endsAt,
            address: record.onchainAddress,
            tolerance,
            taker,
            declared,
            invoice: followed,
            recordedAt: createdAt,
            underpaid: null,
            settled: false
          });
    kept.current = saleKey;
    keep.catch((error: unknown) => {
      logFailure("Keeping the sale for its verdict failed", error);
    });
    // One record per invoice (per hour shown with the address alone): its amount in sats is fixed
    // with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  // The invoice that paid, which may be an hour's before the one shown last (paid in its last
  // seconds); the last shown for an on-chain payment.
  const paidInvoice = state.phase === "paid" ? state.invoice : null;
  useEffect(() => {
    const last = shown.current;
    const paid: Shown | null =
      paidInvoice && paidInvoice.pr !== last?.key
        ? {
            kind: "invoice",
            key: paidInvoice.pr,
            request: invoiceRequest(paidInvoice, shownAt.current.get(paidInvoice.pr) ?? nowUnix()),
            onchainAddress: last?.onchainAddress ?? null
          }
        : last;
    if (paidAt === null || !paid || paidRecorded.current === paid.key) return;
    paidRecorded.current = paid.key;
    const hash = recordKeyOf(paid.request);
    // The underpayment its record held stays in it (on that record only: its date is never before
    // the invoice's); the record dated after its last version.
    const held = underpaidRecorded.current?.hash === hash ? underpaidRecorded.current.value : null;
    const before = dated.current.get(hash);
    const at = before === undefined ? paidAt : Math.max(paidAt, before + 1);
    const value = valueOf(paid, at, held);
    dated.current.set(hash, saleRecordDate(value));
    const followed = kept.current === saleKey ? saleKey : null;
    // Held as this screen's while it is published, even once the screen is gone: the follower
    // would otherwise record it again meanwhile, paid later than it was.
    const release = followed ? followSale(followed) : null;
    void (async () => {
      try {
        if (followed && paid === last) {
          await updateFollowedSale(followed, (sale) => ({
            ...sale,
            recordedAt: Math.max(sale.recordedAt, saleRecordDate(value))
          }));
        }
        await recordSaleVerdict(profile, value);
        // Recorded (or nothing ever is on this device): nothing more to follow.
        if (followed) await forgetFollowedSale(followed);
      } catch (error) {
        // Kept: the follower records it once its screen is gone.
        logFailure("Publishing the paid sale failed", error);
      } finally {
        release?.();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidAt]);

  // An underpayment ("Wallet" says "Underpaid" as soon as it is
  // one), on the record of the invoice shown last, again whenever what it says changes: its rest
  // once the point is read, a transaction more, the amount due past the sale's end. The sale paid
  // after it is recorded as paid above, which prevails.
  const underpaid = underpaidOf(state);
  const underpaidKey = underpaid ? JSON.stringify(underpaid) : null;
  useEffect(() => {
    const last = shown.current;
    if (!underpaid || !last) return;
    if (underpaidRecordedKey.current === underpaidKey) return;
    const hash = recordKeyOf(last.request);
    // Dated after the record it replaces, its first one included.
    const at = Math.max(nowUnix(), last.request.createdAt + 1, (dated.current.get(hash) ?? 0) + 1);
    const value: SaleUnderpaid = { ...underpaid, at };
    underpaidRecorded.current = { hash, value };
    underpaidRecordedKey.current = underpaidKey;
    publish(last, value);
    if (kept.current === saleKey) {
      updateFollowedSale(saleKey, (sale) =>
        recordKeyOf(sale.invoice) === hash
          ? { ...sale, recordedAt: Math.max(sale.recordedAt, at), underpaid: value, settled: false }
          : sale
      ).catch((error: unknown) => {
        logFailure("Keeping the sale's underpayment failed", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underpaidKey]);

  // Expired: nothing paid it, its address read unpaid; nothing to record.
  const expired = state.phase === "expired";
  useEffect(() => {
    if (!expired || kept.current !== saleKey) return;
    forgetFollowedSale(saleKey).catch((error: unknown) => {
      logFailure("Forgetting the expired sale failed", error);
    });
  }, [expired, saleKey]);
}
