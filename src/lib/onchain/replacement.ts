/*
 * Replaced transactions (RBF, checkout-spec SPEC.md §31). A payer whose
 * transaction is slow to confirm may broadcast another one in its place, with a higher fee (RBF):
 * the replacement has its own txid, and the explorers forget the first one. Both spend one coin at
 * least of the same (an outpoint, `<txid>:<vout>`), so that at most one of them is ever mined: two
 * transactions that spend a common coin are alternatives of one payment.
 *
 * So a replacement keeps the time of the payment it replaces, for at most what that payment paid
 * the address (what it pays more was added after, and counts at the
 * replacement's own time, as any other payment would). Transactions are taken in the order of their
 * own times: one that spends a coin an earlier one spent replaces it, and the payments it stands
 * for are the earlier one's (its roots); one that spends none is a root, the payment of its own
 * time. Each root's sats are counted once, by the transactions listed now that stand for it, in
 * that order: a coin spent twice never pays twice.
 *
 * Pure: the callers tell what each transaction spends and pays and when it was seen (witnesses of
 * an integration, when each was sent at the point of sale), then what each part's time means for
 * them.
 */

/** A transaction as the rule needs it. */
export type KnownTx = {
  /** Lowercase hex. */
  txid: string;
  /** Sats it pays the address. */
  sats: bigint;
  /** The coins it spends (`<txid>:<vout>`), or the first of them only (MAX_RECORDED_INPUTS). */
  inputs: readonly string[];
  /**
   * Orders the transactions by their own times (any unit, earlier first); null when that time is
   * not known (after every known one).
   */
  at: number | null;
  /** Listed by the explorer now: it pays the address, or may still. */
  listed: boolean;
};

/** Sats of a listed transaction, counted at the own time of `source` (a txid). */
export type PaymentPart = { sats: bigint; source: string };

/**
 * How many coins a record of a transaction keeps (an integration's witness): a replacement that
 * spends none of these is taken for a new payment. A payment of more inputs than that is rare, and
 * a record must stay small (relays refuse large events).
 */
export const MAX_RECORDED_INPUTS = 100;

/** The largest output index: a u32. */
export const MAX_VOUT = 0xffff_ffff;

const OUTPOINT = /^[0-9a-f]{64}:(0|[1-9][0-9]{0,9})$/;

/** Whether `value` is a coin as the rule writes it: `<txid>:<vout>`, lowercase, vout a u32. */
export function isOutpoint(value: unknown): value is string {
  return typeof value === "string" && OUTPOINT.test(value) && Number(value.slice(65)) <= MAX_VOUT;
}

/** The coin `vout` of `txid`, as the rule writes it. */
export function outpoint(txid: string, vout: number): string {
  return `${txid.toLowerCase()}:${vout}`;
}

function compare(a: KnownTx, b: KnownTx): number {
  if (a.at !== b.at) {
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return a.at - b.at;
  }
  return a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0;
}

/**
 * The parts of each transaction of `txs` listed now, by txid: what it pays the address, split into
 * the sats it takes of the roots it replaces (each at that root's own time) and the rest, at its
 * own time. A transaction that replaces nothing is one part, its own. Each root's sats go to the
 * listed transactions that replace it in the order of their times, then txids: never more than the
 * root paid in all. A txid given twice counts once (its first entry).
 */
export function paymentParts(txs: readonly KnownTx[]): Map<string, PaymentPart[]> {
  const unique = new Map<string, KnownTx>();
  for (const tx of txs) if (!unique.has(tx.txid)) unique.set(tx.txid, tx);
  const ordered = [...unique.values()].sort(compare);

  // The roots each transaction stands for, in the order above.
  const roots = new Map<string, string[]>();
  // Who spent each coin so far.
  const spentBy = new Map<string, string[]>();
  for (const tx of ordered) {
    const earlier = new Set<string>();
    for (const coin of tx.inputs) for (const txid of spentBy.get(coin) ?? []) earlier.add(txid);
    if (earlier.size === 0) {
      roots.set(tx.txid, [tx.txid]);
    } else {
      const found = new Set<string>();
      for (const txid of earlier) for (const root of roots.get(txid) ?? []) found.add(root);
      roots.set(
        tx.txid,
        ordered.filter((other) => found.has(other.txid)).map((other) => other.txid)
      );
    }
    for (const coin of tx.inputs) {
      const spenders = spentBy.get(coin);
      if (spenders) spenders.push(tx.txid);
      else spentBy.set(coin, [tx.txid]);
    }
  }

  // What each root still has to give: its own sats.
  const left = new Map(ordered.map((tx) => [tx.txid, tx.sats]));
  const parts = new Map<string, PaymentPart[]>();
  for (const tx of ordered) {
    if (!tx.listed) continue;
    const own = roots.get(tx.txid) ?? [tx.txid];
    if (own.length === 1 && own[0] === tx.txid) {
      left.set(tx.txid, 0n);
      parts.set(tx.txid, [{ sats: tx.sats, source: tx.txid }]);
      continue;
    }
    const split: PaymentPart[] = [];
    let rest = tx.sats;
    for (const root of own) {
      if (rest === 0n) break;
      const available = left.get(root) ?? 0n;
      const take = available < rest ? available : rest;
      if (take === 0n) continue;
      left.set(root, available - take);
      rest -= take;
      split.push({ sats: take, source: root });
    }
    if (rest > 0n) split.push({ sats: rest, source: tx.txid });
    parts.set(tx.txid, split);
  }
  return parts;
}
