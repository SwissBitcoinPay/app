import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { decodeBolt11, type Bolt11 } from "@/lib/lightning/bolt11";
import { MAX_ONCHAIN_TOLERANCE, leastAccepted } from "@/lib/onchain/tolerance";
import { HOUR_SECONDS } from "@/lib/rates/sources";
import { fiatToSats } from "@/lib/terminal/amount";

/*
 * The final version of a sale's payment link: once the sale is paid, or
 * ended for 3 hours (Breez's provider keeps an expired invoice that long) without anything received
 * (expired) or with less than due (underpaid), the device that made the link, or the owner
 * (owner-key.ts), publishes the link again with what proves its outcome for the long term, without
 * CoinGecko, the LNURL server or the explorers: the Lightning invoices paid with their preimages,
 * the point that fixed the amount due, the transactions that paid the on-chain address. An address
 * nothing paid is left out of it. The payer's page then shows the outcome as it is and follows
 * nothing any more: nothing updates a final version (link.ts keeps the first one).
 *
 * The owner may also cancel the link of a sale that received nothing (an employee removed while
 * its links are still open, src/features/team/cancel-links.ts): a final
 * version "canceled", published at once, which no longer offers to pay. An app from before then
 * does not read it (the status is unknown to it, the copy is ignored) and follows the sale.
 *
 * A sale paid on-chain short of its amount by no more than the business's tolerance of on-chain
 * underpayments (src/lib/onchain/tolerance.ts) is paid with less than due:
 * its final version says so (`accepted`), never the tolerance itself, which its payer must not
 * learn (whoever holds the link reads its final version). The business's side alone decides it, as
 * it signs the final version: its payer's page shows the sale paid from then on. An app from before
 * then refuses such a copy (a paid sale received less than due) and follows the sale.
 */

const HEX_32 = /^[0-9a-f]{64}$/;
const SATS = /^(0|[1-9][0-9]{0,15})$/;
/** More payments than a sale ever gets: anything above is refused rather than checked. */
const MAX_PAYMENTS = 50;

/**
 * Expired: nothing was received. Underpaid: less than due, by the sale's end. Canceled: the owner
 * canceled the sale while nothing was received.
 */
export type FinalStatus = "paid" | "expired" | "underpaid" | "canceled";

/** A Lightning invoice that paid the sale, and the preimage its payment revealed. */
export type FinalLightning = { invoice: string; preimage: string };

/**
 * A transaction that paid the sale's address: when it was sent (Unix ms: BlockCypher's time, or
 * mempool.space's first sight, src/lib/onchain/broadcast-time.ts) and the sats it
 * paid to the address, as a decimal string.
 */
export type FinalTransaction = { txid: string; receivedAt: number; sats: string };

/** The final version's own part of the payload, as JSON (no bigint). */
export type FinalPayload = {
  status: FinalStatus;
  /** Whole sats received in all, as a decimal string. */
  received: string;
  /**
   * Paid: the amount due the payments covered, at `point`. Underpaid: the amount due they fell
   * short of. Null when expired or canceled.
   */
  due: string | null;
  /**
   * The point (src/lib/rates/) that fixed `due`, the price of 1 BTC; null when expired or canceled.
   */
  point: { hour: number; rate: number } | null;
  lightning: FinalLightning[];
  /** The payments of the sale's address; null when nothing paid it (the address is left out). */
  onchain: { address: string; transactions: FinalTransaction[]; sats: string } | null;
  /** Hex: the public key of the link's own author, which its id commits to (link.ts). */
  link: string;
  /**
   * Paid with less than `due`, an on-chain payment the business's tolerance accepted: `true`,
   * absent otherwise (never false). Only in a paid final version whose payments fall short of
   * `due`, something paid on-chain, by no more than the highest tolerance (MAX_ONCHAIN_TOLERANCE).
   */
  accepted?: true;
};

/** A final version, checked. */
export type SaleFinal = {
  status: FinalStatus;
  received: bigint;
  due: bigint | null;
  point: { hour: number; rate: number } | null;
  lightning: { invoice: string; preimage: string; decoded: Bolt11; sats: bigint }[];
  onchain: {
    address: string;
    transactions: { txid: string; receivedAt: number; sats: bigint }[];
    sats: bigint;
  } | null;
  link: string;
  /** Paid with less than due: the business's tolerance accepted it (FinalPayload.accepted). */
  accepted: boolean;
};

function isPositiveSafe(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function lightningOf(value: unknown, network: string): SaleFinal["lightning"] | null {
  if (!Array.isArray(value) || value.length > MAX_PAYMENTS) return null;
  const paid: SaleFinal["lightning"] = [];
  for (const entry of value as unknown[]) {
    if (entry === null || typeof entry !== "object") return null;
    const { invoice, preimage } = entry as Record<string, unknown>;
    if (typeof invoice !== "string" || typeof preimage !== "string" || !HEX_32.test(preimage)) {
      return null;
    }
    const decoded = decodeBolt11(invoice);
    if (
      !decoded ||
      decoded.network !== network ||
      decoded.amountMsat === null ||
      decoded.amountMsat <= 0n ||
      decoded.amountMsat % 1000n !== 0n ||
      // The proof of the payment: the preimage of the invoice's hash.
      bytesToHex(sha256(hexToBytes(preimage))) !== decoded.paymentHash ||
      paid.some((known) => known.decoded.paymentHash === decoded.paymentHash)
    ) {
      return null;
    }
    paid.push({ invoice, preimage, decoded, sats: decoded.amountMsat / 1000n });
  }
  return paid;
}

function onchainOf(value: unknown, address: string | null): SaleFinal["onchain"] | undefined {
  if (value === null) return address === null ? null : undefined;
  if (typeof value !== "object" || address === null) return undefined;
  const v = value as Record<string, unknown>;
  if (
    v.address !== address ||
    typeof v.sats !== "string" ||
    !SATS.test(v.sats) ||
    v.sats === "0" ||
    !Array.isArray(v.transactions) ||
    v.transactions.length === 0 ||
    v.transactions.length > MAX_PAYMENTS
  ) {
    return undefined;
  }
  const transactions: NonNullable<SaleFinal["onchain"]>["transactions"] = [];
  for (const entry of v.transactions as unknown[]) {
    if (entry === null || typeof entry !== "object") return undefined;
    const { txid, receivedAt, sats } = entry as Record<string, unknown>;
    if (
      typeof txid !== "string" ||
      !HEX_32.test(txid) ||
      !isPositiveSafe(receivedAt) ||
      typeof sats !== "string" ||
      !SATS.test(sats) ||
      sats === "0" ||
      transactions.some((known) => known.txid === txid)
    ) {
      return undefined;
    }
    transactions.push({ txid, receivedAt, sats: BigInt(sats) });
  }
  // The address's total is the sum of its transactions.
  const sum = transactions.reduce((total, tx) => total + tx.sats, 0n);
  return sum === BigInt(v.sats) ? { address, transactions, sats: sum } : undefined;
}

/**
 * Validates the final part of a payload whose sale is `fiat` and whose on-chain address is
 * `address` (the final payload's: null when nothing paid it), for invoices of `network`. Null when
 * anything is off: the sats received are the sum of the payments listed, every invoice comes with
 * its preimage; a sale said paid comes with the point that fixed what was due, which the payments
 * cover, or fall short of when its tolerance accepted them (`accepted`, something paid on-chain,
 * short by no more than MAX_ONCHAIN_TOLERANCE);
 * one said underpaid with the point of what was due, which they fall short of; one said expired or
 * canceled received nothing.
 */
export function parseSaleFinal(
  value: unknown,
  fiat: { minor: number; digits: number },
  address: string | null,
  network: string
): SaleFinal | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    (v.status !== "paid" &&
      v.status !== "expired" &&
      v.status !== "underpaid" &&
      v.status !== "canceled") ||
    typeof v.received !== "string" ||
    !SATS.test(v.received) ||
    typeof v.link !== "string" ||
    !HEX_32.test(v.link) ||
    // Absent, or true in a paid final version only (below).
    (v.accepted !== undefined && (v.accepted !== true || v.status !== "paid"))
  ) {
    return null;
  }
  const accepted = v.accepted === true;
  const lightning = lightningOf(v.lightning, network);
  const onchain = onchainOf(v.onchain, address);
  if (lightning === null || onchain === undefined) return null;
  const received = BigInt(v.received);
  const sum = lightning.reduce((total, paid) => total + paid.sats, onchain?.sats ?? 0n);
  if (sum !== received) return null;
  const base = { received, lightning, onchain, link: v.link, accepted };
  if (v.status === "expired" || v.status === "canceled") {
    return v.due === null && v.point === null && received === 0n
      ? { status: v.status, due: null, point: null, ...base }
      : null;
  }
  const point = v.point as Record<string, unknown> | null;
  if (
    typeof v.due !== "string" ||
    !SATS.test(v.due) ||
    point === null ||
    typeof point !== "object" ||
    !isPositiveSafe(point.hour) ||
    point.hour % HOUR_SECONDS !== 0 ||
    typeof point.rate !== "number" ||
    !Number.isFinite(point.rate) ||
    point.rate <= 0
  ) {
    return null;
  }
  const due = BigInt(v.due);
  let fixed: bigint;
  try {
    fixed = fiatToSats(fiat.minor, fiat.digits, point.rate);
  } catch {
    return null;
  }
  if (due !== fixed || due <= 0n) return null;
  // The amount due is the point's, to the sat; what was received covers it, or falls short of it.
  // Paid with less only when the tolerance accepted it, something paid on-chain, and never short by
  // more than the highest tolerance there is (MAX_ONCHAIN_TOLERANCE): whatever the sale's was, its
  // least accepted is at least that.
  if (v.status === "paid") {
    if (
      accepted
        ? received >= due ||
          onchain === null ||
          received < leastAccepted(due, MAX_ONCHAIN_TOLERANCE)
        : received < due
    ) {
      return null;
    }
  } else if (received === 0n || received >= due) {
    return null;
  }
  return {
    status: v.status,
    due,
    point: { hour: point.hour, rate: point.rate },
    ...base
  };
}

/** What a final version is made of: a settled sale (`accepted` false when absent). */
type FinalInput = Omit<SaleFinal, "lightning" | "accepted"> & {
  lightning: readonly FinalLightning[];
  accepted?: boolean;
};

/** The final part of a payload, as JSON, from a settled sale. */
export function finalPayload(final: FinalInput): FinalPayload {
  return {
    status: final.status,
    received: final.received.toString(),
    due: final.due === null ? null : final.due.toString(),
    point: final.point,
    lightning: final.lightning.map(({ invoice, preimage }) => ({ invoice, preimage })),
    onchain:
      final.onchain === null
        ? null
        : {
            address: final.onchain.address,
            transactions: final.onchain.transactions.map(({ txid, receivedAt, sats }) => ({
              txid,
              receivedAt,
              sats: sats.toString()
            })),
            sats: final.onchain.sats.toString()
          },
    link: final.link,
    // Only when the tolerance accepted a payment short of what was due: absent otherwise, as in the
    // final versions of before.
    ...(final.accepted ? { accepted: true as const } : {})
  };
}
