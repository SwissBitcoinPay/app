/**
 * What "Wallet" (the owner) and "My activity" (an employee) list: one list of what the business
 * took and moved, from the point of sale, its payment links and the wallet's transfers, with "To
 * follow up" on top. Built here from data already read (load.ts reads it), without any network:
 * amounts stay integer sats (`bigint`, hard rule 3) and the sales' own fiat amounts, as typed at
 * the keypad.
 *
 * - The owner's list starts from the wallet (the truth on what was received and sent). A payment of
 *   a sale is told by its declaration in the registry (src/lib/registry/): its sale's key, fiat
 *   amount and note. The payments of one sale make one row. Who took it comes from the employees'
 *   records (src/lib/team/member-records.ts): their sales by payment hash, their links by the
 *   sale's registry identity; the owner's own devices ("You") publish theirs alike. Past them (a
 *   month), the declaration's mark of who took it (`taker`, checked by load.ts), a removed seat's
 *   included (its name stays in its record, src/lib/team/roster.ts).
 *   A declared sale neither names is nobody's ("—"). A sale an integration's server declared
 *   (docs/integrations.md) leaves no record: its mark alone names the integration, and its row is
 *   the integration's (source "Integration").
 * - A declaration is only a claim: whoever holds the registry key (an employee or an integration
 *   removed since, any payment link's holder) can declare a payment with any amount and note. A
 *   declared sale counts only when someone the owner trusts vouches for it: a record of one of its
 *   payments by an employee of the team or one of the owner's devices, or its mark, the owner's
 *   devices', an employee's or an integration's of the account, or one removed since, for a payment
 *   the wallet received before its removal (and the invoices it had shown, paid just after:
 *   REMOVED_SEAT_GRACE_SECONDS). Any other shows as the wallet has the payment.
 * - An employee's list has no wallet: its own sales seen paid, and its payment links.
 * - Both list the invoices a point of sale shows (the records' sales not paid yet, the employees'
 *   and the owner's devices'), "Open" until their end: the owner's wallet knows nothing of a sale
 *   before it is paid.
 * - Payment links (src/lib/payment-link/) are the business's invoices: open until their sale's end,
 *   then settled by their final version (paid, underpaid or expired), or canceled by the owner.
 * - The integrations' orders paid on-chain not final yet (integration-orders.ts: "Confirming",
 *   "Underpaid"), which the wallet knows nothing of before it claims a deposit.
 * - A point of sale's sale paid on-chain: a deposit names its transaction, never its address; the
 *   transactions the sale's device saw paying its address (its records, `team-sale-tx`) tie its
 *   deposits to it. Its state is its records' verdict, "Confirming" while a payment seen is not
 *   judged yet (unjudged).
 */

import { bytesToHex } from "@noble/hashes/utils.js";

import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import type { PendingDeposit, WalletPayment } from "@/lib/breez/types";
import type { PaymentRate } from "@/lib/rates/payment-rates";
import type { LegacyHistoryKind } from "@/lib/legacy-v2/history";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { SATS_CURRENCY, deriveSaleKeys } from "@/lib/registry/registry";
import type { ImageRef } from "@/lib/media/image";
import { coversWith } from "@/lib/onchain/tolerance";
import { splitFiat } from "@/lib/terminal/amount";

import type { AcceptTarget, AcceptanceState } from "./acceptance";
import type { IntegrationOrder } from "./integration-orders";
import { depositTxid } from "./onchain-sales";

/** A sale's amount in fiat, as typed at the keypad: minor units and the digits of its currency. */
export type Fiat = { minor: number; digits: number; currency: string };

/**
 * Where a row comes from: its icon and "Source" column; an integration's sale ("Integration").
 * `recovered`: the deposit of funds that left the wallet's balance and came back to it
 * (src/features/wallet/funds-recovery.ts: a discreet row, never a sale).
 */
export type ActivitySource = "pos" | "link" | "integration" | "receive" | "send" | "recovered";

/** What "To follow up" gathers on an employee's device, in its order (no invoice drafts). */
export const FOLLOW_UPS = ["open", "underpaid", "unconfirmed"] as const;
/**
 * The owner's "To follow up": the drafts of "New invoice" last (open, underpaid, being confirmed,
 * then drafts).
 */
export const OWNER_FOLLOW_UPS = [...FOLLOW_UPS, "draft"] as const;
export type FollowUp = (typeof OWNER_FOLLOW_UPS)[number];

/** A row's state: none for what is done (paid, received, sent). */
export type ActivityState = FollowUp | "expired" | "canceled" | "inProgress" | "failed";

/**
 * The invoice of "New invoice" a row is (src/features/invoices/activity.ts): a draft, or the
 * invoice sent whose payment link the row is. Its row opens the invoice, not the details' sheet.
 */
export type InvoiceRef = {
  id: string;
  /** "2026-0042". */
  number: string;
  /** The recipient's name: the row's title. */
  recipient: string;
  status: "draft" | "sent";
  /** "YYYY-MM-DD", null in a draft without one. */
  dueDate: string | null;
};

/**
 * Who took a sale (the owner's view only): the owner itself, an employee, with its photo when its
 * profile has one (`fetchProfiles`, as "Employees"; absent when not read), or an integration of the
 * account, with the platform its record names (the logo in place of an avatar; absent: its code
 * icon, IntegrationAvatar).
 */
export type ActivityBy =
  | { kind: "you" }
  | {
      kind: "member";
      id: string;
      name: string;
      avatar?: ImageRef | null;
      /**
       * An assistant: a member's keys from its own secret, its sales its invoices'. "By" shows its
       * name (its initials until the assistants' screens give it a mark of its own), never a photo.
       */
      assistant?: true;
    }
  | { kind: "integration"; id: string; name: string; platform?: string };

export type ActivityItem = {
  /** Stable across reads: the sale's or the link's identity, else the wallet's payment id. */
  id: string;
  source: ActivitySource;
  /** Unix seconds: when it was paid (its latest payment), else when it was made. */
  timestamp: number;
  /** The sale's note, "" when none (wallet rows: see `payments`). */
  note: string;
  /**
   * The sale's amount; null for a wallet row (valued at its payment's rate once done, at the current
   * rate before: format.ts' `value`).
   */
  fiat: Fiat | null;
  /** What moved, in sats (received, or sent without fees); null while nothing did. */
  sats: bigint | null;
  state: ActivityState | null;
  /** Underpaid: what is left to pay. */
  rest: { sats: bigint; minor: number } | null;
  /**
   * The owner's view: who took the sale; null for transfers, for a sale no records name (never
   * "You" on a guess) and in an employee's view.
   */
  by: ActivityBy | null;
  /** The wallet's payments of the row (the owner's view), the newest first. */
  payments: WalletPayment[];
  /**
   * A payment link's row: its author (which names it), its sale's end, and what its URL holds
   * besides (its sale's key and its relays), for its details' link to its page.
   */
  link: { id: string; endsAt: number; key: Uint8Array; relays: readonly string[] } | null;
  /** The invoice of "New invoice" the row is; absent for anything else. */
  invoice?: InvoiceRef;
  /**
   * Paid on-chain, but not in the wallet's balance yet: a deposit of the sale the wallet has not
   * claimed (PendingDeposit), or a transaction it does not know yet. "fees" when its claim waits
   * for a lower quote of the provider (PendingDeposit.waitsForFees), "other" else (not tried yet,
   * or failed otherwise: the SDK tries again at each sync). Absent once every payment of the row is
   * credited. Until then the row is "Confirming", never "Paid" (paid means in the balance;
   * withCredit).
   */
  pendingCredit?: "fees" | "other";
  /**
   * With pendingCredit "fees": the price the provider asked to credit it, in sats
   * (PendingDeposit.claimFeeSats). Only when a single deposit of the row waits for fees and the
   * wallet tells its price: two prices would not be the row's.
   */
  pendingCreditFeeSats?: bigint;
  /**
   * A row of the history copied from the v2 account (src/features/migration/history-import.ts), for
   * information only: no payment of the wallet, never in its balance. `rate`: the price of bitcoin
   * the v2 server recorded then (a payment rate of the row, as the account's own:
   * src/lib/rates/payment-rates.ts); null when none was near.
   */
  imported?: { kind: LegacyHistoryKind; rate: PaymentRate | null };
  /**
   * A sending that paid a sale to Mt Pelerin ("Sell", src/lib/mtpelerin/sale-record.ts): the sale
   * as the merchant agreed to it, its record's. Absent for any other row, or while its record is
   * not read.
   */
  mtpSale?: MtpSaleRecord;
  /**
   * A `recovered` row: what its recovery cost in all, in sats (the value its record names less
   * what was credited: the network's fees and the deposit's claim); null when the record names
   * less than was credited (nothing proven then).
   */
  recovery?: { feeSats: bigint | null };
  /**
   * What the owner's acceptance of the sale, paid short, is made for (acceptance.ts): its sale's
   * key, or its integration's order's invoice. Absent when the row tells neither (a transfer, a
   * sale whose key was not read).
   */
  acceptTarget?: AcceptTarget;
  /** What was read of that acceptance (acceptance.ts, applyAcceptances); absent: not read. */
  acceptance?: AcceptanceState;
};

/**
 * Who took a sale, as its declaration's mark tells it (load.ts): the owner, an employee, or an
 * integration.
 */
export type Taker =
  { kind: "you" } | { kind: "member"; id: string } | { kind: "integration"; id: string };

/** A sale of the registry (src/lib/registry/), as the owner reads its declaration. */
export type DeclaredSale = {
  /** Hex: the sale's registry identity, the declaration's author (the same for all its invoices). */
  author: string;
  fiat: Fiat;
  note: string;
  /** Who took it, checked by the owner; null (or absent) when its declaration does not tell. */
  taker?: Taker | null;
  /**
   * When it was paid, when the wallet's date of the payment is not that (Unix seconds): an
   * integration's order paid on-chain, which the wallet claims once confirmed, hours or days later;
   * its witness's date (onchain-sales.ts). A seat removed since vouches for it when it was paid
   * before its removal, as for a Lightning payment (markVouches).
   */
  paidAt?: number;
  /**
   * Who took it, as the owner's copy of the declarations keeps it (src/lib/registry/archive.ts):
   * the copy vouches for the sale (it kept only sales someone the owner trusts vouched for), by
   * that name. Absent for a declaration read from the registry.
   */
  archivedBy?: ActivityBy;
  /**
   * The sale's own key, as its declaration carries it: the owner's acceptance of the sale is found
   * by it (acceptance.ts). Absent when not read (the owner's copy keeps none).
   */
  key?: Uint8Array;
  /**
   * An integration's sale paid on-chain: its order's invoice, as its lease tells it
   * (onchain-sales.ts): what it was due and with which tolerance, and where its acceptance is.
   */
  lease?: SaleLease;
};

/** An integration's order's invoice, as its lease tells it (onchain-sales.ts). */
export type SaleLease = {
  /** The integration whose witness names the order (its lease's mark names it too). */
  integration: string;
  /** The deposit address its invoice leased. */
  address: string;
  /** Unix seconds: its invoice's end. */
  expiresAt: number;
  /** Sats its invoice asks. */
  sats: bigint;
  /** Its tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts). */
  tolerance: number;
};

/** A payment link's final outcome (src/lib/payment-link/final.ts), as a row needs it. */
export type LinkOutcome = {
  status: "paid" | "expired" | "underpaid" | "canceled";
  received: bigint;
  /** The amount due, in sats; null when expired or canceled. */
  due: bigint | null;
  /** The payment hashes of the Lightning invoices that paid it. */
  lightning: readonly string[];
  /** The transactions that paid its on-chain address. */
  transactions: readonly string[];
  /**
   * When each of `transactions` was received, as the final version tells (Unix seconds): the date
   * of a deposit the wallet has not claimed yet, which the wallet gives none of. Absent: none told.
   */
  transactionsAt?: ReadonlyMap<string, number>;
  /**
   * Canceled, but its sale's settlement may still replace the cancellation (isProvisionalCancel of
   * src/features/payment-link/finalize.ts): a payment received meanwhile is judged then. Absent
   * otherwise.
   */
  provisional?: true;
};

/** A payment link, as read from the relays (or this device's pending links). */
export type LinkInfo = {
  /** Hex: the link's author, which names it. */
  id: string;
  /** Hex: its sale's registry identity (deriveSaleKeys of the sale's key). */
  saleAuthor: string;
  /** Its sale's key, which its URL holds (and which opens it). */
  key: Uint8Array;
  /** The relays it is on, which its URL names. */
  relays: readonly string[];
  /** Unix seconds: when the link was made. */
  createdAt: number;
  fiat: Fiat;
  note: string;
  endsAt: number;
  final: LinkOutcome | null;
  /** The owner's view: who made it. */
  by: ActivityBy | null;
};

/** A sale of an employee's records (member-records.ts), as a row needs it. */
export type RecordedSale = {
  /** Null for an hour of a sale that showed its address alone (no invoice: useSale.ts). */
  paymentHash: string | null;
  fiat: Fiat;
  note: string;
  sats: bigint;
  createdAt: number;
  /** Unix seconds: the invoice's end (the sale goes on with another invoice past HH:05). */
  expiresAt: number;
  paidAt: number | null;
  /** Hex: its sale's registry identity (the same as its link's saleAuthor), as its record names it. */
  sale: string;
  /** The sale seen underpaid by the device that showed it (MemberSale.underpaid); null if not. */
  underpaid: SeenUnderpaid | null;
  /**
   * The sale's own key (MemberSale.saleKey), checked against `sale`: its owner's acceptance is found
   * by it (acceptance.ts). Null (or absent) in the records of an app from before.
   */
  saleKey?: Uint8Array | null;
  /**
   * Its on-chain address (MemberSale.onchainAddress) and the transactions its device recorded
   * paying it (`team-sale-tx`, member-records.ts: when, the latest record of each): what ties the
   * wallet's deposits to the sale (a deposit names its transaction, never its address). Null (or
   * absent) for a Lightning only sale.
   */
  onchain?: {
    address: string;
    sightings: readonly { txid: string; at: number }[];
  } | null;
  by: ActivityBy | null;
};

/**
 * The row of a sale's record, open then paid (its id stays): its invoice's, or the hour's that
 * showed its address alone.
 */
function recordedRowId(sale: RecordedSale): string {
  return sale.paymentHash === null
    ? `sale-onchain:${sale.sale}:${sale.createdAt}`
    : `sale:${sale.paymentHash}`;
}

/** An underpayment as the point of sale saw it: sats received and due (null: not known yet). */
export type SeenUnderpaid = {
  at: number;
  received: bigint;
  due: bigint | null;
  transactions: readonly string[];
};

/**
 * What the points of sale recorded of a sale (useSaleRecord): paid (one of its invoices), else the
 * latest underpayment seen, with the record that told it; and the transactions its device saw
 * paying its address (by txid: when, the latest).
 */
type RecordedOutcome = {
  paid: boolean;
  underpaid: SeenUnderpaid | null;
  record: RecordedSale;
  sightings: ReadonlyMap<string, number>;
};

/** The outcome of each sale its records tie together (`sale`), by the sale's registry identity. */
function recordedOutcomes(sales: readonly RecordedSale[]): Map<string, RecordedOutcome> {
  const outcomes = new Map<string, RecordedOutcome>();
  for (const sale of sales) {
    const known = outcomes.get(sale.sale);
    const paid = (known?.paid ?? false) || sale.paidAt !== null;
    const newer =
      sale.underpaid !== null && (!known?.underpaid || sale.underpaid.at > known.underpaid.at);
    const sightings = new Map(known?.sightings ?? []);
    for (const { txid, at } of sale.onchain?.sightings ?? []) {
      sightings.set(txid, Math.max(sightings.get(txid) ?? at, at));
    }
    outcomes.set(sale.sale, {
      paid,
      underpaid: newer ? sale.underpaid : (known?.underpaid ?? null),
      record: newer || !known ? sale : known.record,
      sightings
    });
  }
  return outcomes;
}

/**
 * The transactions a sale's records name: those its device saw paying its address, and those its
 * underpayment counted.
 */
function transactionsOf(outcome: RecordedOutcome): string[] {
  return [...new Set([...outcome.sightings.keys(), ...(outcome.underpaid?.transactions ?? [])])];
}

/**
 * How long before an underpayment's record a transaction its device saw must have been recorded
 * for the record to have judged it: a record is dated later than its last version, maybe a few
 * seconds ahead of its device's clock (useSaleRecord), which dates what it sees.
 */
export const JUDGED_MARGIN_SECONDS = 60;

/**
 * The payments of a sale its point of sale has not judged yet: transactions its device saw paying
 * its address that its last underpayment recorded does not count, seen since it was recorded (or
 * with no verdict recorded at all). One seen well before and not counted was judged: replaced, or
 * gone. None once the sale is recorded paid. While there is one, the sale is neither "Underpaid"
 * nor paid: its device records its verdict (src/features/terminal/sale-follow.ts), dated after all
 * it saw.
 */
function unjudged(outcome: RecordedOutcome): string[] {
  if (outcome.paid) return [];
  const { underpaid } = outcome;
  return [...outcome.sightings].flatMap(([txid, at]) =>
    underpaid &&
    (underpaid.transactions.includes(txid) || at < underpaid.at - JUDGED_MARGIN_SECONDS)
      ? []
      : [txid]
  );
}

/** An underpaid sale's state, its rest when its amount due is known (splitFiat, as the point of sale). */
function underpaidOf(
  fiat: Fiat,
  seen: SeenUnderpaid
): Pick<ActivityItem, "state" | "rest" | "sats"> {
  const rest =
    seen.due !== null && seen.due > seen.received
      ? {
          sats: seen.due - seen.received,
          minor: splitFiat(fiat.minor, seen.due, seen.received).restMinor
        }
      : null;
  return { state: "underpaid", rest, sats: seen.received > 0n ? seen.received : null };
}

/**
 * An integration's order's state (integration-orders.ts): what it received, and its rest.
 * `lightning`: what its sale received over Lightning in the wallet, the invoices of the rest of its
 * on-chain underpayment its server declared for the sale (checkout-spec SPEC.md §31, "The rest of
 * an underpayment"): with them, an underpaid order may be paid in full, "Confirming" until its
 * on-chain part is REQUIRED_CONFIRMATIONS deep (its server's "mixed" payment).
 */
function orderOf(
  fiat: Fiat,
  order: IntegrationOrder,
  lightning: bigint = 0n
): Pick<ActivityItem, "state" | "rest" | "sats"> {
  const received = order.received + lightning;
  if (order.state === "unconfirmed") return { state: "unconfirmed", rest: null, sats: received };
  // The amount, or less within its tolerance, something paid on-chain (as its server judges it).
  if (coversWith(received, order.received, order.due, order.tolerance)) {
    return { state: order.confirmed ? null : "unconfirmed", rest: null, sats: received };
  }
  return {
    state: "underpaid",
    rest: {
      sats: order.due - received,
      minor: splitFiat(fiat.minor, order.due, received).restMinor
    },
    sats: received
  };
}

/**
 * An integration's sale paid on-chain whose order is no longer followed (integration-orders.ts:
 * its witnesses older than a month), from its payments, all credited (`paid`): underpaid when
 * what it received falls short of what its invoice's lease accepts (its amount, or less within its
 * tolerance, something paid on-chain), as its server judged it; else paid.
 */
function leaseState(
  fiat: Fiat,
  lease: SaleLease,
  paid: readonly WalletPayment[]
): Pick<ActivityItem, "state" | "rest" | "sats"> {
  let received = 0n;
  let onchain = 0n;
  for (const payment of paid) {
    if (payment.status !== "completed") continue;
    received += payment.amountSats;
    if (payment.network === "bitcoin") onchain += payment.amountSats;
  }
  if (received === 0n || coversWith(received, onchain, lease.sats, lease.tolerance)) {
    return { state: null, rest: null, sats: received > 0n ? received : null };
  }
  return {
    state: "underpaid",
    rest: {
      sats: lease.sats - received,
      minor: splitFiat(fiat.minor, lease.sats, received).restMinor
    },
    sats: received
  };
}

/**
 * A sale's state as its records tell it, not paid: "Confirming" while a payment is not judged yet
 * (unjudged), else "Underpaid" as last seen; null when they tell neither.
 */
function recordedState(
  fiat: Fiat,
  outcome: RecordedOutcome,
  received: bigint
): Pick<ActivityItem, "state" | "rest" | "sats"> | null {
  if (outcome.paid) return null;
  if (unjudged(outcome).length > 0) {
    return { state: "unconfirmed", rest: null, sats: received > 0n ? received : null };
  }
  return outcome.underpaid ? underpaidOf(fiat, outcome.underpaid) : null;
}

/**
 * The row of a sale whose records tell its state ("Underpaid", "Confirming") with nothing of it in
 * the wallet's list (a deposit not listed yet, a payment older than the list) nor a link: from its
 * records alone. Null when they tell neither.
 */
function recordedSaleItem(author: string, outcome: RecordedOutcome): ActivityItem | null {
  const { record } = outcome;
  const state = recordedState(record.fiat, outcome, 0n);
  if (!state) return null;
  return {
    id: `sale:${author}`,
    source: "pos",
    timestamp: Math.max(outcome.underpaid?.at ?? record.createdAt, ...outcome.sightings.values()),
    note: record.note,
    fiat: record.fiat,
    ...state,
    by: record.by,
    payments: [],
    link: null,
    ...(keyOfSale(record.saleKey ?? undefined, author)
      ? { acceptTarget: saleTarget(record.saleKey!) }
      : {})
  };
}

/** The acceptance of a sale of the point of sale (acceptance.ts): its key, the account's relays. */
function saleTarget(saleKey: Uint8Array): AcceptTarget {
  return { kind: "sale", saleKey, relays: null };
}

/** The acceptance of an integration's order's invoice (acceptance.ts). */
function orderTarget(sale: string, lease: Omit<SaleLease, "tolerance">): AcceptTarget {
  return {
    kind: "order",
    integration: lease.integration,
    invoice: { sale, address: lease.address, expiresAt: lease.expiresAt, sats: lease.sats }
  };
}

/** Sale keys checked against the sale they are said to be of (deriveSaleKeys), by hex. */
const checkedKeys = new Map<string, string>();
const MAX_CHECKED_KEYS = 10_000;

/**
 * `key`, when it is the key of sale `author` (a declaration names its sale's key inside, which its
 * author chose: never trusted as another sale's); else undefined.
 */
function keyOfSale(key: Uint8Array | undefined, author: string): Uint8Array | undefined {
  if (!key) return undefined;
  if (key.length !== 32) return undefined;
  const hex = bytesToHex(key);
  let derived = checkedKeys.get(hex);
  if (derived === undefined) {
    try {
      derived = deriveSaleKeys(key).nostr.publicKey;
    } catch {
      derived = "";
    }
    // Bounded: the keys of the rows of one list, read again at each build.
    if (checkedKeys.size >= MAX_CHECKED_KEYS) checkedKeys.clear();
    checkedKeys.set(hex, derived);
  }
  return derived === author ? key : undefined;
}

/**
 * The links among `items` (their authors) that are "Confirming" for want of a final version: a
 * payment of their sale reached the wallet, nothing proves it covered the amount due yet
 * (linkItem). The owner's device settles them (src/features/payment-link/finals-wake.ts).
 */
export function linksAwaitingFinal(
  items: readonly ActivityItem[],
  links: readonly LinkInfo[]
): string[] {
  const withoutFinal = new Set(links.flatMap((link) => (link.final === null ? [link.id] : [])));
  return items.flatMap((item) =>
    item.state === "unconfirmed" && item.link !== null && withoutFinal.has(item.link.id)
      ? [item.link.id]
      : []
  );
}

export function byNewest(a: ActivityItem, b: ActivityItem): number {
  return b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** A wallet payment's state as a row shows it (the wallet screen's pills, wallet/model.ts). */
function walletState(payment: WalletPayment): ActivityState | null {
  if (payment.status === "failed") return "failed";
  if (payment.status === "pending")
    return payment.network === "bitcoin" ? "unconfirmed" : "inProgress";
  return null;
}

/**
 * The rows of the invoices shown at a point of sale and not paid yet (a sale just started is
 * listed), each until its end: then a sale still open has asked for another one (each hour's,
 * useSale.ts), and one left unpaid is not listed (a point of sale's sale has no final version,
 * unlike a link). Left out, as listed otherwise: `known` payment hashes (the wallet's payments, the
 * invoices that paid a link), and the invoices of `listedSales` (by their sale's registry identity:
 * a sale shared as a link is the link's row; a sale paid, its paid row; another invoice of a sale
 * recorded paid, which useSaleRecord does not publish again).
 */
function openSaleItems(
  sales: readonly RecordedSale[],
  known: ReadonlySet<string>,
  listedSales: ReadonlySet<string>,
  now: number
): ActivityItem[] {
  const paidSales = new Set(sales.flatMap((sale) => (sale.paidAt !== null ? [sale.sale] : [])));
  return sales
    .filter(
      (sale) =>
        sale.paidAt === null &&
        now < sale.expiresAt &&
        (sale.paymentHash === null || !known.has(sale.paymentHash)) &&
        !listedSales.has(sale.sale) &&
        !paidSales.has(sale.sale)
    )
    .map((sale): ActivityItem => ({
      // A sale's record keeps its address once paid (memberActivity): the row stays in place.
      id: recordedRowId(sale),
      source: "pos",
      timestamp: sale.createdAt,
      note: sale.note,
      fiat: sale.fiat,
      sats: null,
      state: "open",
      rest: null,
      by: sale.by,
      payments: [],
      link: null
    }));
}

/**
 * A link's row: its state from its final version, else from what the point of sale showing its sale
 * recorded (`recorded`: paid, or underpaid), else from its sale's end. "Paid" only once proven: a
 * payment of its sale in the wallet (`received`) does not tell whether it covered the amount due,
 * which the point of its hour fixes; its final version does. Until then "Confirming", with what was
 * received: the list asks the owner's device to settle it at once (linksAwaitingFinal,
 * finals-wake.ts).
 */
function linkItem(
  link: LinkInfo,
  received: bigint,
  payments: WalletPayment[],
  now: number,
  recorded?: RecordedOutcome
) {
  const { final } = link;
  let state: ActivityState | null = null;
  let rest: ActivityItem["rest"] = null;
  let sats: bigint | null = received > 0n ? received : null;
  if (final) {
    sats = final.received > 0n ? final.received : null;
    if (final.status === "expired") state = "expired";
    // Canceled by the owner ("Cancel the invoice", an employee removed) while nothing was received.
    if (final.status === "canceled") {
      state = "canceled";
      // A payment reached its sale all the same (a Lightning invoice kept in a payer's wallet): never
      // hidden. Being judged while the sale's settlement may still replace the cancellation; past
      // that, canceled with what was received.
      if (received > 0n) {
        sats = received;
        if (final.provisional) state = "unconfirmed";
      }
    }
    if (final.status === "underpaid" && final.due !== null) {
      state = "underpaid";
      const restSats = final.due - final.received;
      rest = {
        sats: restSats,
        minor: splitFiat(link.fiat.minor, final.due, final.received).restMinor
      };
    }
  } else if (recorded?.paid) {
    // Paid, as the point of sale recorded it: its final version comes later.
  } else if (recorded && recordedState(link.fiat, recorded, received)) {
    // Underpaid, or a payment not judged yet, as the point of sale showing its sale recorded it.
    ({ state, rest, sats } = recordedState(link.fiat, recorded, received)!);
  } else if (received > 0n) {
    // A payment of its sale reached the wallet, in full or in part: its final version tells.
    state = "unconfirmed";
  } else if (now < link.endsAt) {
    // Still payable, nothing received.
    state = "open";
  } else {
    // Ended, its final version not published yet (3 hours later at most): nothing came.
    state = "expired";
  }
  const item: ActivityItem = {
    id: `link:${link.id}`,
    source: "link",
    timestamp: payments[0]?.timestamp ?? link.createdAt,
    note: link.note,
    fiat: link.fiat,
    sats,
    state,
    rest,
    by: link.by,
    payments,
    link: { id: link.id, endsAt: link.endsAt, key: link.key, relays: link.relays },
    acceptTarget: { kind: "sale", saleKey: link.key, relays: link.relays }
  };
  return item;
}

/**
 * The owner's list: the wallet's payments (the newest, as the wallet screen reads them), each sale
 * once (its payments in one row, the link's when it was shared), then the payment links nothing
 * paid yet, and the invoices shown at a point of sale, not paid yet (openSaleItems). `declarations`
 * null: the registry could not be read, the payments show as the wallet has them. A payment two
 * sales declared counts for none (registry.ts), nor one nobody vouches for (`vouched`): shown as
 * the wallet has it.
 */
export function ownerActivity({
  payments,
  declarations,
  onchainSales = new Map(),
  deposits = [],
  links,
  sales,
  members = new Map(),
  integrations = new Map(),
  removed = new Map(),
  integrationOrders = [],
  recovered = new Map(),
  mtpSales = new Map(),
  now
}: {
  payments: readonly WalletPayment[];
  declarations: ReadonlyMap<string, readonly DeclaredSale[]> | null;
  /**
   * The sale each deposit paid, by txid, when an integration's order leased its address
   * (onchain-sales.ts): as a Lightning payment's declaration.
   */
  onchainSales?: ReadonlyMap<string, readonly DeclaredSale[]>;
  /**
   * The deposits the wallet received but has not credited yet (useWalletData): an integration's
   * sale one paid shows paid, its amount waiting (pendingCredit).
   */
  deposits?: readonly PendingDeposit[];
  links: readonly LinkInfo[];
  sales: readonly RecordedSale[];
  /** The team's employees by id ("By"): a declaration's taker names one. */
  members?: ReadonlyMap<string, ActivityBy>;
  /** The account's integrations by id ("By"), as the roster names them. */
  integrations?: ReadonlyMap<string, ActivityBy>;
  /**
   * The employees and integrations removed, by `member:<id>` and `integration:<id>` (removedKey):
   * the date of their removal (Unix seconds) and how "By" names them.
   */
  removed?: ReadonlyMap<string, RemovedBy>;
  /**
   * The integrations' orders paid on-chain not final yet (integration-orders.ts): "Confirming" or
   * "Underpaid", on their sale's row, or a row of their own while the wallet has none of their
   * deposits.
   */
  integrationOrders?: readonly IntegrationOrder[];
  /**
   * The transactions that brought funds back to the wallet (funds-recovery.ts), by txid, with the
   * value each recovered: their deposits are `recovered` rows, whatever else names them (the
   * account's own record: no sale's address ever receives them).
   */
  recovered?: ReadonlyMap<string, bigint>;
  /**
   * The sales to Mt Pelerin by their invoices' payment hashes (src/features/sell/sale-records.ts):
   * a sending that paid one, of its sats exactly, is its row.
   */
  mtpSales?: ReadonlyMap<string, MtpSaleRecord>;
  now: number;
}): ActivityItem[] {
  // An order counts as its sale's would: its integration's, or one removed since, for a payment
  // seen before its removal (markVouches).
  const orders = new Map(
    integrationOrders
      .filter((order) => markVouches(order.taker, order.at, members, integrations, removed))
      .map((order) => [order.author, order])
  );
  const linkOfSale = new Map(links.map((link) => [link.saleAuthor, link]));
  // The Lightning invoices that paid a link: its payments without a declaration read (the registry
  // out of reach, two sales declaring one) still go to its row, never twice.
  const linkOfHash = new Map(
    links.flatMap((link) => (link.final?.lightning ?? []).map((hash) => [hash, link] as const))
  );
  const takenBy = new Map(
    sales.flatMap((sale) => (sale.paymentHash === null ? [] : [[sale.paymentHash, sale.by]]))
  );
  const outcomes = recordedOutcomes(sales);
  // The sales the business's records say each transaction paid (the wallet has no address): a
  // payment link's final version, a point of sale's records (its device saw it pay the sale's
  // address, or its underpayment counted it). Named by two sales, it counts for none, as a payment
  // two sales declared (registry.ts); named at all, an integration's witness never takes it (the
  // sale already declared wins).
  const claims = new Map<string, Set<string>>();
  const claim = (txid: string, author: string) => {
    const authors = claims.get(txid);
    if (authors) authors.add(author);
    else claims.set(txid, new Set([author]));
  };
  for (const link of links) {
    for (const txid of link.final?.transactions ?? []) claim(txid, link.saleAuthor);
  }
  for (const [author, outcome] of outcomes) {
    for (const txid of transactionsOf(outcome)) claim(txid, author);
  }
  const saleOfTx = new Map(
    [...claims].flatMap(([txid, authors]) => (authors.size === 1 ? [[txid, [...authors][0]!]] : []))
  );
  // A sale of the point of sale (not shared as a link) that a transaction paid, from its records.
  const recordedOfTx = (txid: string | undefined) => {
    const author = txid === undefined ? undefined : saleOfTx.get(txid);
    const outcome = author === undefined || linkOfSale.has(author) ? null : outcomes.get(author);
    return outcome ? { author: author!, outcome } : null;
  };
  // The sales a record vouches for (an employee's of the team, one of the owner's devices'): one of
  // their payments recorded, or the sale itself.
  const recordedSales = new Set<string>(outcomes.keys());
  for (const payment of payments) {
    const declared = payment.paymentHash ? declarations?.get(payment.paymentHash) : undefined;
    if (declared?.length === 1 && takenBy.has(payment.paymentHash!)) {
      recordedSales.add(declared[0]!.author);
    }
  }
  const vouched = (sale: DeclaredSale, payment: WalletPayment) =>
    sale.archivedBy !== undefined ||
    recordedSales.has(sale.author) ||
    linkOfSale.has(sale.author) ||
    markVouches(
      sale.taker ?? null,
      sale.paidAt ?? payment.timestamp,
      members,
      integrations,
      removed
    );
  // The payments of each declared sale, by its registry identity, the newest first.
  // With the sale's key (its acceptance's, acceptance.ts) and an integration's order's lease, as
  // any of its declarations tells them.
  const bySale = new Map<
    string,
    {
      sale: DeclaredSale | null;
      payments: WalletPayment[];
      key?: Uint8Array;
      lease?: SaleLease;
    }
  >();
  const items: ActivityItem[] = [];
  const add = (author: string, sale: DeclaredSale | null, payment: WalletPayment) => {
    const group = bySale.get(author) ?? { sale, payments: [] };
    if (!bySale.has(author)) bySale.set(author, group);
    group.payments.push(payment);
    group.key ??= keyOfSale(sale?.key, author);
    group.lease ??= sale?.lease;
  };
  for (const payment of payments) {
    const txid = depositTxid(payment);
    const recoveredSats = txid === null ? undefined : recovered.get(txid);
    if (recoveredSats !== undefined) {
      items.push({
        id: `payment:${payment.id}`,
        source: "recovered",
        timestamp: payment.timestamp,
        note: "",
        fiat: null,
        sats: payment.amountSats,
        state: walletState(payment),
        rest: null,
        by: null,
        payments: [payment],
        link: null,
        recovery: {
          feeSats: recoveredSats >= payment.amountSats ? recoveredSats - payment.amountSats : null
        }
      });
      continue;
    }
    const declared =
      payment.direction !== "receive"
        ? undefined
        : payment.paymentHash
          ? declarations?.get(payment.paymentHash)
          : // A transaction the business's records name stays theirs (claims, above), whatever an
            // integration's witness says of it.
            payment.txId && !claims.has(payment.txId)
            ? onchainSales.get(payment.txId)
            : undefined;
    if (declared?.length === 1 && payment.status !== "failed" && vouched(declared[0]!, payment)) {
      add(declared[0]!.author, declared[0]!, payment);
      continue;
    }
    const received = payment.direction === "receive" && payment.status !== "failed";
    const paidAuthor = received && payment.txId ? saleOfTx.get(payment.txId) : undefined;
    const paidLink = !received
      ? undefined
      : ((paidAuthor === undefined ? undefined : linkOfSale.get(paidAuthor)) ??
        (payment.paymentHash ? linkOfHash.get(payment.paymentHash) : undefined));
    if (paidLink) {
      add(paidLink.saleAuthor, null, payment);
      continue;
    }
    const recordedSale = received ? recordedOfTx(payment.txId) : null;
    if (recordedSale) {
      const { author, outcome } = recordedSale;
      add(author, { author, fiat: outcome.record.fiat, note: outcome.record.note }, payment);
      continue;
    }
    const state = walletState(payment);
    const mtpSale = payment.paymentHash ? mtpSales.get(payment.paymentHash) : undefined;
    items.push({
      id: `payment:${payment.id}`,
      source: payment.direction === "receive" ? "receive" : "send",
      timestamp: payment.timestamp,
      note: "",
      fiat: null,
      sats: payment.amountSats,
      state,
      rest: null,
      by: null,
      payments: [payment],
      link: null,
      // A failed payment sold nothing: the sending it is, never a sale with what it would wire.
      ...(mtpSale &&
      payment.direction === "send" &&
      payment.status !== "failed" &&
      mtpSale.sats === payment.amountSats
        ? { mtpSale }
        : {})
    });
  }
  // The deposits of integrations' sales the wallet has not credited yet:
  // paid at 3 confirmations, as the integration's server judges it, so the sale shows paid, its
  // amount waiting, its details saying that the sats are not in the balance yet (pendingCredit). A
  // sale's only: the wallet gives no date for a deposit before its claim, its witness does
  // (paidAt). Not once the wallet lists its payment (claimed meanwhile), nor a transaction a link
  // names, nor one named by two sales (claims, as above), nor one nobody vouches for. A point of
  // sale's sale takes those its records name, dated when its device saw them;
  // a payment link those its final version names, dated as it tells. Such a row is "Confirming"
  // until they are credited (withCredit).
  const listedTx = new Set(payments.flatMap((payment) => (payment.txId ? [payment.txId] : [])));
  // By sale: the prices of its deposits waiting for a lower claim fee (undefined: not told).
  const uncredited = new Map<string, (bigint | undefined)[]>();
  const markUncredited = (author: string, deposit: PendingDeposit) => {
    const waiting = uncredited.get(author) ?? [];
    if (deposit.waitsForFees) waiting.push(deposit.claimFeeSats);
    uncredited.set(author, waiting);
  };
  // A deposit waiting for a lower claim fee says so, whatever the sale's others.
  const creditOf = (
    author: string
  ): Pick<ActivityItem, "pendingCredit" | "pendingCreditFeeSats"> => {
    const waiting = uncredited.get(author);
    if (!waiting) return {};
    if (waiting.length === 0) return { pendingCredit: "other" };
    const [price] = waiting;
    return waiting.length === 1 && price !== undefined
      ? { pendingCredit: "fees", pendingCreditFeeSats: price }
      : { pendingCredit: "fees" };
  };
  for (const deposit of deposits) {
    const { txid } = deposit;
    if (!deposit.mature || listedTx.has(txid)) continue;
    const recordedSale = recordedOfTx(txid);
    if (recordedSale) {
      const { author, outcome } = recordedSale;
      const seenAt = outcome.sightings.get(txid) ?? outcome.record.createdAt;
      add(
        author,
        { author, fiat: outcome.record.fiat, note: outcome.record.note },
        pendingPayment(deposit, seenAt)
      );
      markUncredited(author, deposit);
      continue;
    }
    const linkAuthor = saleOfTx.get(txid);
    const paidLink = linkAuthor === undefined ? undefined : linkOfSale.get(linkAuthor);
    if (paidLink) {
      const at = paidLink.final?.transactionsAt?.get(txid) ?? paidLink.createdAt;
      add(paidLink.saleAuthor, null, pendingPayment(deposit, at));
      markUncredited(paidLink.saleAuthor, deposit);
      continue;
    }
    if (claims.has(txid)) continue;
    const declared = onchainSales.get(txid);
    const sale = declared?.length === 1 ? declared[0]! : undefined;
    if (sale?.paidAt === undefined) continue;
    const payment = pendingPayment(deposit, sale.paidAt);
    if (!vouched(sale, payment)) continue;
    add(sale.author, sale, payment);
    markUncredited(sale.author, deposit);
  }
  const linked = new Set<string>();
  for (const [author, group] of bySale) {
    const { sale } = group;
    // The newest first, the deposits not credited yet among them (a stable sort: the wallet's
    // payments keep their order).
    const paid = [...group.payments].sort((a, b) => b.timestamp - a.timestamp);
    const credit = creditOf(author);
    const received = paid.reduce(
      (total, payment) => (payment.status === "completed" ? total + payment.amountSats : total),
      0n
    );
    const recorded = outcomes.get(author);
    const link = linkOfSale.get(author);
    if (link) {
      linked.add(link.id);
      items.push(withCredit(linkItem(link, received, paid, now, recorded), credit));
      continue;
    }
    if (!sale) continue;
    const pending = paid.some((payment) => payment.status === "pending");
    // Whose records hold one of its invoices (an employee's, or one of the owner's devices'), else
    // whom the owner's copy keeps (with the photo of an employee still in the team, and the logo
    // the roster keeps of an integration, removed since or not: the copy keeps neither), else whom
    // its declaration's mark names (records are read for a month, declarations for good), a seat
    // removed since included, else nobody's: never the owner's on a guess.
    const archived = sale.archivedBy;
    const by =
      paid.map((payment) => takenBy.get(payment.paymentHash ?? "")).find((who) => who) ??
      recorded?.record.by ??
      (archived
        ? archived.kind === "member"
          ? (members.get(archived.id) ?? archived)
          : archived.kind === "integration"
            ? (integrations.get(archived.id) ??
              removed.get(removedKey("integration", archived.id))?.by ??
              archived)
            : archived
        : byTaker(sale.taker ?? null, members, integrations, removed));
    // Underpaid, as its point of sale saw it, unless recorded paid since, or being confirmed while
    // a payment of it is not judged yet; an integration's order, as its witnesses and the explorer
    // tell it (not all its deposits claimed yet).
    const order = orders.get(author);
    const told = recorded ? recordedState(sale.fiat, recorded, received) : null;
    const outcome = order
      ? // With its Lightning payments received (the invoices of the rest of its underpayment).
        orderOf(
          sale.fiat,
          order,
          paid.reduce(
            (total, payment) =>
              payment.status === "completed" && payment.paymentHash
                ? total + payment.amountSats
                : total,
            0n
          )
        )
      : told
        ? told
        : group.lease && !pending
          ? leaseState(sale.fiat, group.lease, paid)
          : {
              state: pending && received === 0n ? ("inProgress" as const) : null,
              rest: null,
              sats: received > 0n ? received : null
            };
    // What an acceptance of it is made for: its integration's order's invoice, else its own key.
    const lease = order?.lease ?? group.lease;
    const saleKey = group.key ?? keyOfSale(recorded?.record.saleKey ?? undefined, author);
    const acceptTarget = lease
      ? orderTarget(author, lease)
      : saleKey
        ? saleTarget(saleKey)
        : undefined;
    const row: ActivityItem = {
      id: `sale:${author}`,
      // An integration's, removed since included: its mark names it.
      source:
        by?.kind === "integration" || sale.taker?.kind === "integration" ? "integration" : "pos",
      timestamp: paid[0]!.timestamp,
      note: sale.note,
      // An integration's sale in sats alone (its declaration's amount in SATS_CURRENCY): its sats
      // valued as a transfer's (format.ts), rather than an amount in a currency of nobody's.
      fiat: sale.fiat.currency === SATS_CURRENCY ? null : sale.fiat,
      ...outcome,
      by,
      payments: paid,
      link: null,
      ...(acceptTarget ? { acceptTarget } : {})
    };
    items.push(withCredit(row, credit));
  }
  // The integrations' orders the wallet has no deposit of yet.
  for (const order of orders.values()) {
    if (bySale.has(order.author) || linkOfSale.has(order.author)) continue;
    items.push({
      id: `sale:${order.author}`,
      source: "integration",
      timestamp: order.at,
      note: order.note,
      // In sats alone: its sats valued as a transfer's, as an integration's sale above.
      fiat: order.fiat.currency === SATS_CURRENCY ? null : order.fiat,
      ...orderOf(order.fiat, order),
      by: byTaker(order.taker, members, integrations, removed),
      payments: [],
      link: null,
      acceptTarget: orderTarget(order.author, order.lease)
    });
  }
  // The sales whose records tell their state that nothing above lists: underpaid, a payment not
  // judged yet, or paid on-chain, its deposits not in the wallet's list yet.
  const recordedRows = new Set<string>();
  const oldest = payments.length > 0 ? payments[payments.length - 1]!.timestamp : null;
  const walletTx = new Set([...listedTx, ...deposits.map(({ txid }) => txid)]);
  for (const [author, outcome] of outcomes) {
    if (bySale.has(author) || linkOfSale.has(author)) continue;
    const item =
      recordedSaleItem(author, outcome) ??
      (transactionsOf(outcome).some((txid) => walletTx.has(txid))
        ? null
        : paidOnchainItem(author, outcome, oldest));
    if (!item) continue;
    items.push(item);
    recordedRows.add(author);
  }
  for (const link of links) {
    if (linked.has(link.id)) continue;
    // Paid, but none of its payments among the wallet's newest: older than the list.
    if (link.final?.status === "paid" && payments.length > 0) {
      const oldest = payments[payments.length - 1]!.timestamp;
      if (link.createdAt < oldest) continue;
    }
    const item = linkItem(link, 0n, [], now, outcomes.get(link.saleAuthor));
    // Paid on-chain by a transaction the wallet has not credited (a deposit too young to claim, or
    // not seen yet): its sats are not in the balance.
    const uncreditedTx = (link.final?.transactions ?? []).some((txid) => !listedTx.has(txid));
    items.push(
      link.final?.status === "paid" && uncreditedTx
        ? withCredit(item, { pendingCredit: "other" })
        : item
    );
  }
  const known = new Set([
    ...payments.flatMap((payment) => (payment.paymentHash ? [payment.paymentHash] : [])),
    ...linkOfHash.keys()
  ]);
  // A sale with payments in the wallet is its row; a sale shared as a link, the link's; a sale
  // whose records tell its state, its row from them.
  const listedSales = new Set([
    ...bySale.keys(),
    ...links.map((link) => link.saleAuthor),
    ...recordedRows
  ]);
  items.push(...openSaleItems(sales, known, listedSales, now));
  return items.sort(byNewest);
}

/**
 * `item` with what is not credited yet (`credit`, creditOf): a row done whose sats are not all in
 * the balance is "Confirming" ("Paid" only once they are), its details telling why (pendingCredit).
 * A row with a state of its own keeps it.
 */
function withCredit(
  item: ActivityItem,
  credit: Pick<ActivityItem, "pendingCredit" | "pendingCreditFeeSats">
): ActivityItem {
  if (!credit.pendingCredit) return item;
  return { ...item, ...credit, state: item.state ?? "unconfirmed" };
}

/**
 * The row of a sale of the point of sale recorded paid on-chain (its device saw a transaction pay
 * its address) when the wallet lists none of its deposits, credited or not, yet (its caller checks
 * it): "Confirming", its sats not in the balance yet. Null for anything else, and for a sale older
 * than the wallet's list (`oldest`, Unix seconds: its deposits are older than the list).
 */
function paidOnchainItem(
  author: string,
  outcome: RecordedOutcome,
  oldest: number | null
): ActivityItem | null {
  const { record } = outcome;
  if (!outcome.paid || outcome.sightings.size === 0) return null;
  if (oldest !== null && record.createdAt < oldest) return null;
  return {
    id: `sale:${author}`,
    source: "pos",
    timestamp: Math.max(...outcome.sightings.values()),
    note: record.note,
    fiat: record.fiat,
    sats: null,
    // Its sats not in the balance.
    state: "unconfirmed",
    rest: null,
    by: record.by,
    payments: [],
    link: null,
    pendingCredit: "other"
  };
}

/**
 * A deposit not credited yet as a payment of its sale's row (ownerActivity): its value, received
 * when its witness says it was paid. Only in the rows, never one of the wallet's payments.
 */
function pendingPayment(deposit: PendingDeposit, paidAt: number): WalletPayment {
  return {
    id: `deposit:${deposit.txid}:${deposit.vout}`,
    direction: "receive",
    status: "completed",
    amountSats: deposit.amountSats,
    feeSats: 0n,
    timestamp: paidAt,
    network: "bitcoin",
    txId: deposit.txid
  };
}

/**
 * An employee's list: its sales seen paid, those whose invoice is still shown (openSaleItems), and
 * its payment links. A sale paid through one of its links shows once, as the link (its final
 * version names the invoice that paid it).
 */
export function memberActivity({
  sales,
  links,
  now
}: {
  sales: readonly RecordedSale[];
  links: readonly LinkInfo[];
  now: number;
}): ActivityItem[] {
  const ofLinks = new Set(links.flatMap((link) => link.final?.lightning ?? []));
  const outcomes = recordedOutcomes(sales);
  const items: ActivityItem[] = links.map((link) =>
    linkItem(link, 0n, [], now, outcomes.get(link.saleAuthor))
  );
  const linkSales = new Set(links.map((link) => link.saleAuthor));
  for (const sale of sales) {
    if (sale.paidAt === null || (sale.paymentHash !== null && ofLinks.has(sale.paymentHash))) {
      continue;
    }
    // A sale of one of its links: the link's row (its record names its sale).
    if (linkSales.has(sale.sale)) continue;
    // Paid on-chain, even in part: what it received is not its invoice's amount, and only the
    // owner's wallet tells it.
    const outcome = outcomes.get(sale.sale);
    const onchain =
      outcome !== undefined && (outcome.sightings.size > 0 || outcome.underpaid !== null);
    items.push({
      id: recordedRowId(sale),
      source: "pos",
      timestamp: sale.paidAt,
      note: sale.note,
      fiat: sale.fiat,
      sats: onchain ? null : sale.sats,
      state: null,
      rest: null,
      by: null,
      payments: [],
      link: null
    });
  }
  // Its sales seen underpaid, or with a payment not judged yet, a link's on the link's row.
  const recordedRows = new Set<string>();
  for (const [author, outcome] of outcomes) {
    if (linkSales.has(author)) continue;
    const item = recordedSaleItem(author, outcome);
    if (!item) continue;
    items.push(item);
    recordedRows.add(author);
  }
  items.push(...openSaleItems(sales, ofLinks, new Set([...linkSales, ...recordedRows]), now));
  return items.sort(byNewest);
}

/** The key of a removed seat in `ownerActivity`'s `removed`: a taker's kind and id. */
export function removedKey(kind: "member" | "integration", id: string): string {
  return `${kind}:${id}`;
}

/** A removed employee or integration (`ownerActivity`'s `removed`). */
export type RemovedBy = {
  /** Unix seconds: its removal (its channel's). */
  removedAt: number;
  /** As "By" names it, by the name its record keeps. */
  by: ActivityBy;
};

/**
 * Whether a declaration's mark vouches for a payment the wallet received at `paidAt`: the owner's
 * devices', an employee's of the team or an integration's of the account; one removed since, when
 * the payment came before its removal (with REMOVED_SEAT_GRACE_SECONDS for an invoice it had
 * shown). The date is the wallet's, never the declaration's own, which its author chose.
 */
function markVouches(
  taker: Taker | null,
  paidAt: number,
  members: ReadonlyMap<string, ActivityBy>,
  integrations: ReadonlyMap<string, ActivityBy>,
  removed: ReadonlyMap<string, RemovedBy>
): boolean {
  if (taker === null) return false;
  if (taker.kind === "you") return true;
  if ((taker.kind === "member" ? members : integrations).has(taker.id)) return true;
  const seat = removed.get(removedKey(taker.kind, taker.id));
  return seat !== undefined && paidAt <= seat.removedAt + REMOVED_SEAT_GRACE_SECONDS;
}

/**
 * Who a declaration's taker names: the owner, an employee of the team or an integration of the
 * account, or one removed since (by the name its record keeps: its sales that count, paid before
 * its removal, stay its own); null for none.
 */
function byTaker(
  taker: Taker | null,
  members: ReadonlyMap<string, ActivityBy>,
  integrations: ReadonlyMap<string, ActivityBy>,
  removed: ReadonlyMap<string, RemovedBy>
): ActivityBy | null {
  if (taker === null) return null;
  switch (taker.kind) {
    case "you":
      return { kind: "you" };
    case "member":
      return members.get(taker.id) ?? removed.get(removedKey("member", taker.id))?.by ?? null;
    case "integration":
      return (
        integrations.get(taker.id) ?? removed.get(removedKey("integration", taker.id))?.by ?? null
      );
  }
}

/**
 * The first end after `after` of a row "Open" (an invoice not paid, a link without its final
 * version): its state changes then, without anything new to read. Null when none.
 */
export function nextEnd(
  sales: readonly RecordedSale[],
  links: readonly LinkInfo[],
  after: number
): number | null {
  const ends = [
    ...sales.filter((sale) => sale.paidAt === null).map((sale) => sale.expiresAt),
    ...links.filter((link) => link.final === null).map((link) => link.endsAt)
  ].filter((end) => end > after);
  return ends.length === 0 ? null : Math.min(...ends);
}

/** The rows of each state of "To follow up", in the list's order. */
export function followUpsOf(items: readonly ActivityItem[]): Record<FollowUp, ActivityItem[]> {
  const groups: Record<FollowUp, ActivityItem[]> = {
    open: [],
    underpaid: [],
    unconfirmed: [],
    draft: []
  };
  for (const item of items) {
    if (
      item.state === "open" ||
      item.state === "underpaid" ||
      item.state === "unconfirmed" ||
      item.state === "draft"
    ) {
      groups[item.state].push(item);
    }
  }
  return groups;
}

/** What a row's amount counts as in a total: received, or left to pay, or asked. */
export type Amount = { fiat: Fiat } | { sats: bigint };

/**
 * What a row of "To follow up" weighs: an underpaid sale its rest, an open one its amount, a
 * transfer being confirmed its sats.
 */
export function followUpAmount(item: ActivityItem): Amount | null {
  if (item.rest && item.fiat) return { fiat: { ...item.fiat, minor: item.rest.minor } };
  // An integration's order in sats alone (integration-orders.ts): its rest in sats.
  if (item.rest) return { sats: item.rest.sats };
  // Underpaid, its amount due not known yet: what is left is not either.
  if (item.state === "underpaid") return null;
  if (item.fiat) return { fiat: item.fiat };
  return item.sats === null ? null : { sats: item.sats };
}
