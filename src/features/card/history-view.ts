import {
  CARD_MIGRATION_INVOICE_DESCRIPTION,
  CARD_MIGRATION_TRANSFER_WINDOW_MS
} from "@/config/card";
import type {
  CardMovement,
  CardWithdrawalWay,
  UnidentifiedMovement,
  WalletMovement
} from "@/lib/card/card-movement";
import {
  movementKey,
  type HeadCopy,
  type HistoryCopy,
  type MovementCopy
} from "@/lib/card/history-records";
import { sameCardWallet, type CardWalletOf } from "@/lib/card/keys";
import { monthEnd, type MonthHead } from "@/lib/card/month-head";
import { CARD_PAYMENTS_KEPT_MS, type CardPaymentEntry } from "@/lib/card/payment-entry";
import type { CardDeclineReason } from "@/lib/card/relay-session";
import type { WalletPayment } from "@/lib/breez/types";
import type { LegacyCardRow } from "@/lib/legacy-v2/card-history";
import { monthAfter, type Calendar } from "@/lib/locale/calendar";

/*
 * "History" of a card (every movement of the card, kept for good): its payments at a point of sale,
 * the refused ones included, and what came to its wallet or left it (top-ups, returns,
 * withdrawals), newest first. Merged from where each is kept: the phone's log (its own payments,
 * which decide), the account's relays (every device's payments and the movements recorded with
 * their value, 90 days), the copies of the months (beyond), and the card's wallet itself (its
 * movements of any age: the ledger). Its current wallet's only (keys.ts, CardWalletOf): a card
 * added again after its deletion shows nothing of before. A card migrated from Swiss Bitcoin Pay
 * shows its v2 history too, as its copy keeps it (src/features/card/legacy-history.ts): among the
 * rest, without saying where it comes from. The transfer of its balance at the migration shows
 * nowhere in the app (only the v2 service's own pages show it): neither the top-up its wallet
 * received nor the v2 payment that sent it. Pure.
 */

export type CardHistoryRow =
  | { kind: "tap"; key: string; at: number; entry: CardPaymentEntry }
  | {
      kind: "movement";
      key: string;
      at: number;
      movement: CardMovement;
      /**
       * A deposit that brought funds back to the card's wallet (src/features/wallet/
       * funds-recovery.ts): "Funds recovered", not a top-up. Its movement as recorded.
       */
      recovered?: boolean;
      /** What its payer wrote with it, as the card's wallet tells it (senderNoteOf). */
      note?: string;
    }
  | { kind: "unidentified"; key: string; at: number; movement: UnidentifiedMovement }
  /** A row of the card's v2 history (legacy-history.ts): for information, never in its balance. */
  | { kind: "legacy"; key: string; at: number; row: LegacyCardRow };

export type HistorySources = {
  /** The card's wallet whose history it is. */
  card: CardWalletOf;
  /** What happened before this (ms) is not shown yet (firstHorizon, olderStep). */
  horizon: number;
  /** The phone's log: its own payments, which decide over any copy of them. */
  own: readonly CardPaymentEntry[];
  /** Copies of the taps: their records on the relays, the months' copies; any card, any order. */
  taps: readonly HistoryCopy[];
  /** Copies of the movements: their records, the months' copies, those just recorded. */
  movements: readonly MovementCopy[];
  /** The card's wallet's movements, its unidentified ones too, of any age; null when unread. */
  wallet: readonly WalletMovement[] | null;
  /** The transactions that brought funds back to the card's wallet (its recovery's record). */
  recovered?: ReadonlySet<string>;
  /**
   * Where each withdrawal went, by its payment (movementKey), as its note on the relays says: a
   * record of it as a return (as older versions of the app made it) shows as the withdrawal.
   */
  withdrawals?: ReadonlyMap<string, CardWithdrawalWay>;
  /**
   * What the payers of its recharges wrote, by movement (movementKey), as the card's wallet tells
   * it (senderNoteOf): never in a record, so shown over one too.
   */
  notes?: ReadonlyMap<string, string>;
  /** The rows of the card's v2 history, as its copy keeps them (its current wallet's). */
  legacy?: readonly LegacyCardRow[];
};

function newestFirst(a: CardHistoryRow, b: CardHistoryRow): number {
  return b.at - a.at || (a.key < b.key ? -1 : 1);
}

/**
 * The card's movements to show, newest first, since `horizon`: each tap once (the phone's own
 * entry, else the latest copy of it), each movement once (the latest copy, which keeps its value,
 * else as the wallet tells it; a withdrawal's note over a copy saying return), and the unidentified
 * ones as the wallet tells them: over a record of the same payment, made when an older SDK told it
 * otherwise (WalletPayment.network); a Spark transfer not decided yet, under one (its record was
 * made once its notes were read).
 */
export function historyRows(sources: HistorySources): CardHistoryRow[] {
  const { card } = sources;
  const taps = new Map<string, HistoryCopy>();
  for (const copy of sources.taps) {
    if (!sameCardWallet(copy.entry, card)) continue;
    const known = taps.get(copy.entry.id);
    if (!known || copy.revision > known.revision) taps.set(copy.entry.id, copy);
  }
  const entries = new Map<string, CardPaymentEntry>();
  for (const [id, copy] of taps) entries.set(id, copy.entry);
  for (const entry of sources.own) if (sameCardWallet(entry, card)) entries.set(entry.id, entry);

  const copies = new Map<string, MovementCopy>();
  for (const copy of sources.movements) {
    if (!sameCardWallet(copy.movement, card)) continue;
    const key = movementKey(copy.movement);
    const known = copies.get(key);
    if (!known || copy.revision > known.revision) copies.set(key, copy);
  }
  const unidentified = new Map<string, UnidentifiedMovement>();
  for (const movement of sources.wallet ?? []) {
    if (movement.kind !== "unidentified" || !sameCardWallet(movement, card)) continue;
    const key = movementKey(movement);
    if (!(movement.undecided && copies.has(key))) unidentified.set(key, movement);
  }
  const movements = new Map<string, CardMovement>();
  for (const [key, copy] of copies) {
    if (unidentified.has(key)) continue;
    const way = sources.withdrawals?.get(key);
    movements.set(
      key,
      way !== undefined && copy.movement.kind === "return"
        ? { ...copy.movement, kind: "withdrawal", way }
        : copy.movement
    );
  }
  // The wallet tells the same movement as its record (the record is made from it): the record
  // keeps its value.
  for (const movement of sources.wallet ?? []) {
    if (movement.kind === "unidentified" || !sameCardWallet(movement, card)) continue;
    const key = movementKey(movement);
    if (!movements.has(key)) movements.set(key, movement);
  }

  const rows: CardHistoryRow[] = [];
  for (const [id, entry] of entries) {
    rows.push({ kind: "tap", key: `t/${id}`, at: entry.at, entry });
  }
  for (const [key, movement] of movements) {
    // The transfer of its v2 balance at the migration: never shown (see above).
    if (isMigrationTransfer(movement)) continue;
    const recovered =
      movement.kind === "recharge" &&
      movement.txid !== null &&
      (sources.recovered?.has(movement.txid) ?? false);
    const note = movement.kind === "recharge" ? sources.notes?.get(key) : undefined;
    rows.push({
      kind: "movement",
      key: `m/${key}`,
      at: movement.at,
      movement,
      ...(recovered ? { recovered } : {}),
      ...(note ? { note } : {})
    });
  }
  for (const [key, movement] of unidentified) {
    rows.push({ kind: "unidentified", key: `u/${key}`, at: movement.at, movement });
  }
  const legacy = sources.legacy ?? [];
  const transfers = migrationTransfers(legacy, [...movements.values()]);
  for (const row of legacy) {
    if (transfers.has(row.ref)) continue;
    rows.push({ kind: "legacy", key: `l/${row.ref}`, at: row.at * 1000, row });
  }
  return rows.filter((row) => row.at >= sources.horizon).sort(newestFirst);
}

/**
 * Whether `movement` is the transfer of a v2 card's balance its migration made (migration.ts): the
 * recharge of the invoice the migration made, told by its description.
 */
export function isMigrationTransfer(movement: CardMovement | WalletMovement): boolean {
  return (
    movement.kind === "recharge" &&
    movement.way === "invoice" &&
    movement.description === CARD_MIGRATION_INVOICE_DESCRIPTION
  );
}

/**
 * The most a card's wallet may keep of a migration's transfer as its fee to receive it, beyond
 * which a v2 payment is not that transfer: a tenth of what it received, at least 100 sats. The v2
 * server pays the invoice's whole amount (its row's sats); the wallet's receipt says what it
 * credited, which a fee to receive would lower (the SDK's receipt does not tell it apart).
 */
function receiveFeeBound(received: bigint): bigint {
  const tenth = received / 10n;
  return tenth > 100n ? tenth : 100n;
}

/**
 * The refs of the rows of the card's v2 history (`legacy`) that are the transfers of its balance
 * its migration made, which its wallet shows as top-ups (`movements`): the transfer shows nowhere
 * in the app, on either side. Each top-up of a migration takes, on
 * the v2 side, the payment nearest it within CARD_MIGRATION_TRANSFER_WINDOW_MS of at least the sats
 * it received and at most receiveFeeBound more (its very sats first, at the same distance): the
 * whole balance, paid seconds before the wallet received it, when the card could pay nothing else
 * (the holder's card held to the phone for its migration, its balance emptied by it).
 */
export function migrationTransfers(
  legacy: readonly LegacyCardRow[],
  movements: readonly CardMovement[]
): Set<string> {
  const taken = new Set<string>();
  const recharges = movements
    .filter((movement) => isMigrationTransfer(movement))
    .sort((a, b) => a.at - b.at);
  for (const recharge of recharges) {
    const received = recharge.amountSats;
    let best: { ref: string; gap: number; exact: boolean } | null = null;
    for (const row of legacy) {
      if (row.kind !== "payment" || taken.has(row.ref)) continue;
      if (row.sats < received || row.sats - received > receiveFeeBound(received)) continue;
      const gap = Math.abs(row.at * 1000 - recharge.at);
      if (gap > CARD_MIGRATION_TRANSFER_WINDOW_MS) continue;
      const exact = row.sats === received;
      if (
        !best ||
        gap < best.gap ||
        (gap === best.gap && exact && !best.exact) ||
        (gap === best.gap && exact === best.exact && row.ref < best.ref)
      ) {
        best = { ref: row.ref, gap, exact };
      }
    }
    if (best) taken.add(best.ref);
  }
  return taken;
}

/**
 * Where "History" starts showing, at first: its records' 90 days (the phone's log keeps as
 * long). Each month shown beyond moves it back to that month's first instant, in the device's time
 * (olderStep).
 */
export function firstHorizon(now: number): number {
  return now - CARD_PAYMENTS_KEPT_MS;
}

/** When the month of a copy ("YYYY-MM", in UTC: month-head.ts) starts and ends (ms). */
function copiedMonth(month: string): { start: number; end: number } {
  const [year, number] = month.split("-").map(Number);
  return { start: Date.UTC(year, number - 1, 1), end: monthEnd(month) };
}

/** What "History" knows of the card's wallet before how far back it goes (olderStep). */
export type OlderSources = {
  /** The heads of the months' copies the relays hold, any card's (history-records.ts). */
  heads: ReadonlyMap<string, HeadCopy>;
  /** The months (UTC) of the card's wallet whose copies were read: what they hold is below. */
  read: ReadonlySet<string>;
  /**
   * Of those, the copies read but not whole (a part missing, or of a newer format): what they hide
   * counts at their middle, a note saying it once some of their month shows (copyShown).
   */
  partial: ReadonlySet<string>;
  taps: readonly HistoryCopy[];
  movements: readonly MovementCopy[];
  /** The card's wallet's movements, its unidentified ones too, of any age; null when unread. */
  wallet: readonly WalletMovement[] | null;
  /** The rows of the card's v2 history, its copy read whole (its current wallet's). */
  legacy?: readonly LegacyCardRow[];
};

/**
 * The next step back of "History" (olderStep): `month` to offer, or the copies to read first
 * (`unread`), `month` null then.
 */
export type OlderStep = { month: string; unread: [] } | { month: null; unread: MonthHead[] };

/** The middle of the month of a copy ("YYYY-MM", UTC): where what it hides counts (ms). */
function copyMiddle(month: string): number {
  const { start, end } = copiedMonth(month);
  return start + (end - start) / 2;
}

/**
 * Whether some of the month of a copy ("YYYY-MM", UTC) shows beyond the records: between `horizon`
 * and `recordsFrom` (firstHorizon), its edge hours included (in Zurich, November shows the last hour
 * of October's copy). What such a copy, read but not whole, may hide could be there: its note shows
 * Never before a month shows: the records hold what the list shows then.
 */
export function copyShown(month: string, horizon: number, recordsFrom: number): boolean {
  const { start, end } = copiedMonth(month);
  return horizon < recordsFrom && start < recordsFrom && end > horizon;
}

/**
 * The next step back of "History", before `horizon` (ms), as the device counts months (`calendar`,
 * its time zone): the newest month something of the card's wallet is known in, never an empty one,
 * nor one whose label would not say what shows. The copies are by month in UTC and only their heads
 * are known before they
 * are read: a copy not read yet may hold something of the device's next month, by its last hours
 * (in Zurich, those of the next month; in New York, its first hours are the month before). While one
 * may hold something newer than what is known, those copies come first (`unread`, the newest ones
 * only), and the step is known once they are read. Null when nothing older is kept anywhere.
 */
export function olderStep(
  horizon: number,
  card: CardWalletOf,
  sources: OlderSources,
  calendar: Calendar
): OlderStep | null {
  const heads = [...sources.heads.values()].flatMap(({ head }) =>
    sameCardWallet(head, card) ? [head] : []
  );
  // When something of the card's wallet is known to be: its taps and movements read, and what the
  // copies read but not whole may hide.
  const times = [
    ...sources.taps.flatMap(({ entry }) => (sameCardWallet(entry, card) ? [entry.at] : [])),
    // The transfer of a migration shows nowhere: no month is offered for it.
    ...sources.movements.flatMap(({ movement }) =>
      sameCardWallet(movement, card) && !isMigrationTransfer(movement) ? [movement.at] : []
    ),
    ...(sources.wallet ?? []).flatMap((movement) =>
      sameCardWallet(movement, card) && !isMigrationTransfer(movement) ? [movement.at] : []
    ),
    ...(sources.legacy ?? []).map((row) => row.at * 1000),
    ...heads.flatMap((head) => (sources.partial.has(head.month) ? [copyMiddle(head.month)] : []))
  ];
  let known: string | null = null;
  for (const at of times) {
    if (at >= horizon) continue;
    const month = calendar.monthOf(at);
    if (known === null || month > known) known = month;
  }
  // The copies not read yet that may hold something newer than what is known: the newest month
  // each may show before the horizon (its last instant there), those of the newest such month.
  let latest: string | null = null;
  let unread: MonthHead[] = [];
  for (const head of heads) {
    if (sources.read.has(head.month)) continue;
    const { start, end } = copiedMonth(head.month);
    if (start >= horizon) continue;
    const month = calendar.monthOf(Math.min(end, horizon) - 1);
    if (known !== null && month <= known) continue;
    if (latest === null || month > latest) {
      latest = month;
      unread = [head];
    } else if (month === latest) {
      unread.push(head);
    }
  }
  if (unread.length > 0) return { month: null, unread };
  return known === null ? null : { month: known, unread: [] };
}

/**
 * The heads of the copies of the card's wallet's months (UTC) that hold something of the device's
 * `month` (`calendar`): those overlapping it, the month next to it included for its edge.
 */
export function monthHeadsOf(
  heads: ReadonlyMap<string, HeadCopy>,
  card: CardWalletOf,
  month: string,
  calendar: Calendar
): MonthHead[] {
  const start = calendar.monthStart(month);
  const end = calendar.monthStart(monthAfter(month));
  return [...heads.values()].flatMap(({ head }) => {
    if (!sameCardWallet(head, card)) return [];
    const copied = copiedMonth(head.month);
    return copied.start < end && copied.end > start ? [head] : [];
  });
}

/**
 * The fees the card's wallet paid for its Lightning payments, by payment hash: what a payment at a
 * point of sale cost on top of its amount (the log keeps none).
 */
export function sentFees(payments: readonly WalletPayment[]): Map<string, bigint> {
  const fees = new Map<string, bigint>();
  for (const payment of payments) {
    if (
      payment.direction === "send" &&
      payment.network === "lightning" &&
      payment.status === "completed" &&
      payment.paymentHash
    ) {
      fees.set(payment.paymentHash.toLowerCase(), payment.feeSats);
    }
  }
  return fees;
}

/** Why a payment was refused, as "History" says it (`cards.history.reasons`, `motives`). */
export type RefusalReason =
  | "declined"
  | "newPayee"
  | "unidentifiedPayee"
  | "unconfirmed"
  | "insufficientBalance"
  | "invalidInvoice"
  | "expired"
  | "noAmount"
  | "alreadyPaid"
  | "outOfBounds"
  | "aboveLimit"
  | "dayLimit"
  | "hourLimit"
  | "suspended"
  | "invalidTap"
  | "failed"
  | "superseded"
  | "unavailable";

/** The reasons the phone's log keeps (relay-session.ts). */
const REASONS: Record<CardDeclineReason, RefusalReason> = {
  declined: "declined",
  payee_not_approved: "newPayee",
  payee_unidentified: "unidentifiedPayee",
  payment_unconfirmed: "unconfirmed",
  insufficient_balance: "insufficientBalance",
  "invalid invoice": "invalidInvoice",
  "invoice expired": "expired",
  "invoice without amount": "noAmount",
  "invoice already paid": "alreadyPaid",
  "amount out of bounds": "outOfBounds",
  "amount above limit": "aboveLimit",
  "daily limit reached": "dayLimit",
  "hourly limit reached": "hourLimit",
  "card suspended": "suspended",
  "invalid tap": "invalidTap",
  "payment failed": "failed",
  superseded: "superseded",
  unavailable: "unavailable"
};

const REASON_OF = new Map<string, RefusalReason>(Object.entries(REASONS));

/** The reason a log entry keeps, as "History" says it; null for none, or one it does not know. */
export function refusalReasonOf(reason: string | null): RefusalReason | null {
  return reason === null ? null : (REASON_OF.get(reason) ?? null);
}
