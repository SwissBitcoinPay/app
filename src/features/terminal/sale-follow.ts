import { hexToBytes } from "@noble/hashes/utils.js";

import { logFailure } from "@/lib/log/log";
import { deriveSaleKeys } from "@/lib/registry/registry";
import {
  MAX_SALE_PROOFS,
  type SaleProof,
  type SaleRecordValue,
  type SaleUnderpaid
} from "@/lib/team/member-records";
import {
  NewerFollowedSalesError,
  parseFollowedSales,
  serializeFollowedSales,
  type FollowedSale
} from "@/lib/terminal/followed-sales";
import { readFollowedSales, writeFollowedSales } from "@/lib/terminal/followed-sales-store";

/*
 * The verdict of a point of sale's sale with an on-chain address does not depend on its screen:
 * from the first invoice shown with its address, the sale is kept on the
 * device (src/lib/terminal/followed-sales.ts) until its verdict is recorded on a majority of the
 * relays. Its screen records it while it shows (useSaleRecord); once the screen is gone ("Back
 * to the Point of Sale", "Back", a reload of the web app, a restart), SalesFollower follows the
 * sale out of sight with the same engine (useSale, through SaleSettler) and records it: paid, or
 * underpaid past its end, in the records' format of always (member-records.ts, MemberSale).
 */

export type { SaleRecordValue };

/** The sale's registry identity (hex): its records name it (MemberSale.sale). */
export function saleIdOf(saleKey: string): string {
  return deriveSaleKeys(hexToBytes(saleKey)).nostr.publicKey;
}

/**
 * The record of `sale`'s invoice shown last (or of the hour that showed its address alone),
 * `paidAt` and `underpaid` as given.
 */
export function followedRecord(
  sale: FollowedSale,
  paidAt: number | null,
  underpaid: SaleUnderpaid | null,
  /** Paid: the Lightning invoices that paid it, with their preimages (MemberSale.lightning). */
  proofs: readonly SaleProof[] = []
): SaleRecordValue {
  const { invoice } = sale;
  const lightning = paidAt !== null ? proofs.slice(0, MAX_SALE_PROOFS) : [];
  const common = {
    sats: invoice.sats,
    fiat: sale.fiat,
    note: sale.note,
    createdAt: invoice.createdAt,
    expiresAt: invoice.expiresAt,
    paidAt,
    onchainAddress: sale.address,
    sale: saleIdOf(sale.saleKey),
    saleKey: sale.saleKey,
    ...(underpaid ? { underpaid } : {}),
    ...(lightning.length > 0 ? { lightning: lightning.map((proof) => ({ ...proof })) } : {})
  };
  return invoice.paymentHash === null
    ? { ...common, paymentHash: null, verifyUrl: null, hour: invoice.hour }
    : { ...common, paymentHash: invoice.paymentHash, verifyUrl: invoice.verifyUrl };
}

/** Whether two underpayments say the same (their dates aside). */
export function sameUnderpaid(a: SaleUnderpaid | null, b: Omit<SaleUnderpaid, "at">): boolean {
  return (
    a !== null &&
    a.received === b.received &&
    a.due === b.due &&
    a.transactions.length === b.transactions.length &&
    a.transactions.every((txid, index) => txid === b.transactions[index])
  );
}

// Every change goes through one queue: the screen and the follower never lose each other's.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(change: () => Promise<T>): Promise<T> {
  const next = queue.then(change, change);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Applies `update` to the stored sales. A record of a newer format is left as it is (an app of
 * after this one follows them); one that cannot be read is replaced.
 */
function changeSales(update: (sales: FollowedSale[]) => FollowedSale[]): Promise<void> {
  return serialized(async () => {
    let sales: FollowedSale[];
    try {
      sales = parseFollowedSales(await readFollowedSales());
    } catch (error) {
      if (error instanceof NewerFollowedSalesError) return;
      logFailure("Unreadable followed sales", error);
      sales = [];
    }
    const next = update(sales);
    await writeFollowedSales(next.length === 0 ? null : serializeFollowedSales(next));
  });
}

/** The sales followed on this device; none when they cannot be read. */
export function loadFollowedSales(): Promise<FollowedSale[]> {
  return serialized(async () => {
    try {
      return parseFollowedSales(await readFollowedSales());
    } catch (error) {
      logFailure("Unreadable followed sales", error);
      return [];
    }
  });
}

/** Keeps `sale` until its verdict is recorded (the same sale again: replaced). */
export function saveFollowedSale(sale: FollowedSale): Promise<void> {
  return changeSales((sales) => [...sales.filter((other) => other.saleKey !== sale.saleKey), sale]);
}

/** Changes the sale of key `saleKey`, if kept. */
export function updateFollowedSale(
  saleKey: string,
  update: (sale: FollowedSale) => FollowedSale
): Promise<void> {
  return changeSales((sales) =>
    sales.map((sale) => (sale.saleKey === saleKey ? update(sale) : sale))
  );
}

/** Forgets the sale of key `saleKey`: its verdict is recorded, or it has none to record. */
export function forgetFollowedSale(saleKey: string): Promise<void> {
  nextLook.delete(saleKey);
  return changeSales((sales) => sales.filter((sale) => sale.saleKey !== saleKey));
}

/** Forgets the sales of `account` (an employee who leaves the business: it signs nothing more). */
export function forgetAccountSales(account: string): Promise<void> {
  return changeSales((sales) =>
    sales.filter((sale) => {
      if (sale.account === account) nextLook.delete(sale.saleKey);
      return sale.account !== account;
    })
  );
}

/** When the follower (SalesFollower) is to look at each sale again (Unix seconds), by its key. */
const nextLook = new Map<string, number>();

/** The follower looks at the sale of key `saleKey` again from `at` (Unix seconds) on. */
export function lookAgainAt(saleKey: string, at: number): void {
  nextLook.set(saleKey, at);
}

/** Whether the follower is to look at the sale of key `saleKey` at `now` (Unix seconds). */
export function isLookDue(saleKey: string, now: number): boolean {
  return (nextLook.get(saleKey) ?? 0) <= now;
}

/** Tests only: no sale followed by a screen nor scheduled, as after a restart. */
export function resetFollowedMarks(): void {
  shown.clear();
  nextLook.clear();
}

/** Tests only: no sale kept, followed by a screen, nor scheduled. */
export async function resetFollowedSales(): Promise<void> {
  resetFollowedMarks();
  await changeSales(() => []);
}

/** Sales a screen follows (by key), and how many times: the follower leaves them to it. */
const shown = new Map<string, number>();
const releases = new Set<() => void>();

/** Marks the sale of key `saleKey` as followed by its screen; returns the unmarking. */
export function followSale(saleKey: string): () => void {
  shown.set(saleKey, (shown.get(saleKey) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const count = (shown.get(saleKey) ?? 1) - 1;
    if (count > 0) {
      shown.set(saleKey, count);
      return;
    }
    shown.delete(saleKey);
    // Its screen gone: the follower looks at it at once, not at its next round.
    for (const listener of releases) listener();
  };
}

export function isSaleFollowed(saleKey: string): boolean {
  return shown.has(saleKey);
}

/** Calls `listener` whenever a screen leaves its sale; returns the unsubscription. */
export function subscribeSaleReleases(listener: () => void): () => void {
  releases.add(listener);
  return () => {
    releases.delete(listener);
  };
}
