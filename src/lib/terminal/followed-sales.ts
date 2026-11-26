import { parseTaprootAddress } from "@/lib/onchain/address";
import { HOUR_SECONDS } from "@/lib/rates/sources";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { isTakerTag } from "@/lib/registry/registry";
import { parseRelayList } from "@/lib/relays/list";
import { parseUnderpaid, type SaleUnderpaid } from "@/lib/team/member-records";
import { isUnixSeconds } from "@/lib/team/shared";

/*
 * The point of sale's sales with an on-chain address whose verdict is not recorded yet (else a
 * sale left "Confirming" would never be recorded paid): what the device needs to
 * follow such a sale once its screen is gone, after a restart or a reload of the web app, and to
 * record its verdict as the screen would (src/features/terminal/sale-follow.ts). One record per
 * device, all its accounts' sales in it: a JSON file of the documents directory on a phone
 * (followed-sales-store.ts), an entry of `localStorage` on the web. Nothing secret: a sale's key
 * is in its payment link too, and declares nothing without the business's registry key.
 */

/**
 * Format of the stored record. Version 2 also holds sales whose
 * last request showed the address alone (FollowedInvoice without a payment hash: useSale.ts); it is
 * written only while one is followed, version 1 otherwise, so that an app from before keeps
 * following the others. Both are read.
 */
const FOLLOWED_SALES_VERSION = 2;
/** The version without such sales, which an app from before reads. */
const INVOICES_ONLY_VERSION = 1;

/** At most this many sales are followed on a device: a new one then drops the one that ended first. */
export const FOLLOWED_SALES_LIMIT = 64;

/**
 * The record of an invoice of the sale, as its record on the relays has it (MemberSale); or of an
 * hour that showed its address alone, above the most the Lightning address accepts (no payment
 * hash nor verify URL, its `hour`: useSale.ts).
 */
export type FollowedInvoice = {
  /** Whole sats, as a decimal string. */
  sats: string;
  /** Unix seconds: when the invoice (the address alone) was shown, and its end. */
  createdAt: number;
  expiresAt: number;
} & (
  | {
      /** Hex: the invoice's payment hash, which names its record. */
      paymentHash: string;
      verifyUrl: string;
    }
  | {
      paymentHash: null;
      verifyUrl: null;
      /** Unix seconds (HH:00:00 UTC): the hour of the point its amount was fixed at. */
      hour: number;
    }
);

export type FollowedSale = {
  /** The point of sale's account it was taken for (profileAccount): its keys sign the records. */
  account: string;
  /** Hex: the sale's own key: its registry identity, its declarations' keys. */
  saleKey: string;
  /** The relays of its declarations (the device's when it was charged). */
  relays: readonly string[];
  lightningAddress: string;
  fiat: { minor: number; digits: number; currency: string };
  note: string;
  /** Unix seconds (src/lib/clock.ts): the sale's start and end. */
  startsAt: number;
  endsAt: number;
  /** Its on-chain address: what follows it after its screen. */
  address: string;
  /** Its tolerance of on-chain underpayments (basis points, 0: none), held from its start. */
  tolerance: number;
  /**
   * Who took it (takerTag of src/lib/registry/), as its declarations say it; null when its device
   * could not say it. Its on-chain payments are declared with it (onchain-payments.ts).
   */
  taker: string | null;
  /**
   * Its invoices are declared in the registry (src/lib/registry/): its follower sees them. Without
   * (a device without the business's registry key), it cannot tell a Lightning payment of its rest:
   * it records the sale paid on-chain only, never underpaid.
   */
  declared: boolean;
  /** The invoice shown last: its record is the one the sale's verdict goes on. */
  invoice: FollowedInvoice;
  /**
   * Unix seconds: the date of the last version of that record published, or tried (the next one
   * must be later: a relay keeps the latest version, and of two as old the lowest id).
   */
  recordedAt: number;
  /** The underpayment that record holds (MemberSale.underpaid), null when none. */
  underpaid: SaleUnderpaid | null;
  /** That underpayment is the sale's verdict, past its end, and a majority of the relays took it. */
  settled: boolean;
};

const HEX_64 = /^[0-9a-f]{64}$/;

/** A stored FollowedInvoice; `addressAlone`: one without an invoice may be (version 2). */
function parseInvoice(value: unknown, addressAlone: boolean): FollowedInvoice | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.sats !== "string" ||
    !/^[1-9][0-9]{0,15}$/.test(v.sats) ||
    !isUnixSeconds(v.createdAt) ||
    !isUnixSeconds(v.expiresAt)
  ) {
    return null;
  }
  const common = { sats: v.sats, createdAt: v.createdAt, expiresAt: v.expiresAt };
  if (addressAlone && v.paymentHash === null) {
    if (
      v.verifyUrl !== null ||
      !Number.isSafeInteger(v.hour) ||
      (v.hour as number) <= 0 ||
      (v.hour as number) % HOUR_SECONDS !== 0
    ) {
      return null;
    }
    return { ...common, paymentHash: null, verifyUrl: null, hour: v.hour as number };
  }
  if (
    typeof v.paymentHash !== "string" ||
    !HEX_64.test(v.paymentHash) ||
    typeof v.verifyUrl !== "string" ||
    !v.verifyUrl.startsWith("https://")
  ) {
    return null;
  }
  return { ...common, paymentHash: v.paymentHash, verifyUrl: v.verifyUrl };
}

/**
 * A stored sale, checked as anything stored is (an older or newer app may have written it), of the
 * record's `version` (the current one when not said).
 */
export function parseFollowedSale(
  value: unknown,
  version: number = FOLLOWED_SALES_VERSION
): FollowedSale | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const fiat = v.fiat as Record<string, unknown> | null | undefined;
  const relays = parseRelayList(v.relays);
  const invoice = parseInvoice(v.invoice, version >= FOLLOWED_SALES_VERSION);
  const underpaid =
    invoice && v.underpaid !== null ? parseUnderpaid(v.underpaid, invoice.createdAt) : null;
  if (
    typeof v.account !== "string" ||
    !/^[0-9a-f]{2,130}$/.test(v.account) ||
    typeof v.saleKey !== "string" ||
    !HEX_64.test(v.saleKey) ||
    relays === null ||
    typeof v.lightningAddress !== "string" ||
    v.lightningAddress.length === 0 ||
    v.lightningAddress.length > 320 ||
    !fiat ||
    typeof fiat !== "object" ||
    !Number.isSafeInteger(fiat.minor) ||
    (fiat.minor as number) <= 0 ||
    !Number.isInteger(fiat.digits) ||
    (fiat.digits as number) < 0 ||
    (fiat.digits as number) > 4 ||
    typeof fiat.currency !== "string" ||
    !/^[A-Z]{3}$/.test(fiat.currency) ||
    typeof v.note !== "string" ||
    v.note.length > 200 ||
    !isUnixSeconds(v.startsAt) ||
    !isUnixSeconds(v.endsAt) ||
    v.endsAt <= v.startsAt ||
    typeof v.address !== "string" ||
    !["bc", "bcrt"].some(
      (network) => parseTaprootAddress(v.address as string, network) === v.address
    ) ||
    invoice === null ||
    !isUnixSeconds(v.recordedAt) ||
    v.recordedAt < invoice.createdAt ||
    (v.underpaid !== null && !underpaid) ||
    (underpaid && underpaid.at > v.recordedAt) ||
    typeof v.settled !== "boolean" ||
    !(v.taker === null || isTakerTag(v.taker)) ||
    typeof v.declared !== "boolean"
  ) {
    return null;
  }
  return {
    account: v.account,
    saleKey: v.saleKey,
    relays,
    lightningAddress: v.lightningAddress,
    fiat: { minor: fiat.minor as number, digits: fiat.digits as number, currency: fiat.currency },
    note: v.note,
    startsAt: v.startsAt,
    endsAt: v.endsAt,
    address: v.address,
    tolerance: toleranceOf(v.tolerance),
    invoice,
    recordedAt: v.recordedAt,
    underpaid: underpaid ?? null,
    settled: v.settled,
    taker: v.taker as string | null,
    declared: v.declared
  };
}

/** Thrown when the stored record is of a newer format: it is never written over. */
export class NewerFollowedSalesError extends Error {}

/**
 * The stored record's sales (a JSON text, null when none): an unreadable one, or a sale that does
 * not pass its checks, is left out. NewerFollowedSalesError for a newer format.
 */
export function parseFollowedSales(stored: string | null): FollowedSale[] {
  if (stored === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return [];
  }
  if (value === null || typeof value !== "object") return [];
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > FOLLOWED_SALES_VERSION) {
    throw new NewerFollowedSalesError("A newer app wrote the followed sales");
  }
  const version = v.version;
  if (
    (version !== FOLLOWED_SALES_VERSION && version !== INVOICES_ONLY_VERSION) ||
    !Array.isArray(v.sales)
  ) {
    return [];
  }
  return v.sales.flatMap((sale) => parseFollowedSale(sale, version) ?? []);
}

/**
 * The record of `sales` as stored (bigint-free): the FOLLOWED_SALES_LIMIT that end last, a sale
 * once (by its key, the latest given).
 */
export function serializeFollowedSales(sales: readonly FollowedSale[]): string {
  const byKey = new Map<string, FollowedSale>();
  for (const sale of sales) byKey.set(sale.saleKey, sale);
  const kept = [...byKey.values()].sort((a, b) => a.endsAt - b.endsAt).slice(-FOLLOWED_SALES_LIMIT);
  const addressAlone = kept.some((sale) => sale.invoice.paymentHash === null);
  return JSON.stringify({
    version: addressAlone ? FOLLOWED_SALES_VERSION : INVOICES_ONLY_VERSION,
    sales: kept
  });
}
