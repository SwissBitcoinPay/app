import { useEffect, useMemo, useRef, useState } from "react";

import { LEASE_GRACE_SECONDS, REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import { useOnchainWatch } from "@/features/onchain/useOnchainPayment";
import { askUntilTold } from "@/features/onchain/ask-again";
import { useReplacedTxs, type ReplacedTx } from "@/features/onchain/useReplacedTxs";
import {
  methodOf,
  settledTransactions,
  watchedTransactions,
  type PaymentDetails
} from "@/features/payment-link/details";
import {
  EXPIRY_GRACE_SECONDS,
  invoiceNetwork,
  useInvoicesWatch,
  type WatchedInvoice
} from "@/features/terminal/invoice";
import type { SaleReceipt, SaleTransaction } from "@/features/terminal/useSale";
import type { Invoice } from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import {
  fetchCheckoutLink,
  newerAcceptance,
  parseCheckoutFragment,
  watchCheckoutRests,
  type CheckoutAcceptance,
  type CheckoutFragment,
  type CheckoutLookup,
  type CheckoutRecord
} from "@/lib/payment-link/checkout";
import { fetchTxReceived } from "@/lib/onchain/blockcypher";
import { paymentParts } from "@/lib/onchain/replacement";
import { nowUnix } from "@/lib/rates/snapshot";

import { FIRST_CHECK_TIMEOUT_MS, NOT_FOUND_RETRY_MS, useWaited } from "./useSharedInvoice";

/**
 * Once its invoice is proven paid, or enough was sent on-chain in time (being confirmed), the page
 * sends the payer to the link's redirect URL this long after, unless a tap does it sooner.
 */
export const REDIRECT_DELAY_MS = 7000;

export type CheckoutState =
  | { phase: "loading" }
  /** The fragment is a checkout link cut short or damaged. */
  | { phase: "invalid" }
  /** A link, or a record, of a newer format than this page reads. */
  | { phase: "newer" }
  /** Relays answered without it: a wrong link, or one past its life. */
  | { phase: "notFound" }
  /** No relay answered: the payer's connection, most likely. */
  | { phase: "unreachable" }
  /**
   * The record read, whether it was paid not known yet ("Request expired"
   * showed for a moment before "Confirming"): the first answers of its checks awaited
   * (FIRST_CHECK_TIMEOUT_MS at most), or, past its end, a transaction listed whose time is not told
   * yet (BlockCypher, what it replaced).
   */
  | { phase: "checking" }
  /** The invoice to pay, until its end. */
  | { phase: "open"; record: CheckoutRecord }
  /**
   * Less than the amount received in time (SPEC.md §30, §31): `received`, on-chain and by invoices
   * of the rest paid; `rest` is still payable until the invoice's end, in Lightning with
   * `restInvoice`, the invoice of exactly that rest the integration's server published (null while
   * none came), and on-chain to the same address from MIN_ONCHAIN_SATS. Without rest keys in the
   * record (its server shows no invoice of the rest), on-chain only, whatever the rest.
   * `receipts`: each transaction sent in time (from when it came, as `underpaidEnded`'s), then each
   * invoice of the rest paid, whose sats add up to `received`.
   */
  | {
      phase: "underpaid";
      record: CheckoutRecord;
      received: bigint;
      rest: bigint;
      restInvoice: Invoice | null;
      /**
       * An invoice of the rest came whose payment is not told yet: what was received may be more,
       * nothing is offered to pay meanwhile (the code blurred, as a payment link's).
       */
      checking: boolean;
      receipts: SaleReceipt[];
    }
  /**
   * Past the invoice's end, its payment not proven: still checked until `lateUntil` (Unix
   * seconds, nowUnix), a payment of its last seconds may be reported that late.
   */
  | { phase: "ended"; record: CheckoutRecord; lateUntil: number }
  /**
   * Enough sent on-chain in time to the record's address, not deep enough yet
   * (REQUIRED_CONFIRMATIONS): `confirmations` of the shallowest.
   */
  | {
      phase: "unconfirmed";
      record: CheckoutRecord;
      confirmations: number;
      details: PaymentDetails;
    }
  /**
   * Paid: the preimage of its payment hash, from an answer about this invoice (LUD-21); or its
   * address paid in time, REQUIRED_CONFIRMATIONS deep on mempool.space (SPEC.md §31).
   */
  | { phase: "paid"; record: CheckoutRecord; details: PaymentDetails }
  /**
   * Past its end, less than the amount received in time, for good (as "Expired" below):
   * `received`, of `transactions`, those sent in time, each with when it was received (when this
   * page saw it, else BlockCypher's time), and of the invoices of the rest paid (`lightning`).
   */
  | {
      phase: "underpaidEnded";
      record: CheckoutRecord;
      received: bigint;
      transactions: SaleTransaction[];
      lightning: bigint;
    }
  /**
   * Never paid, for good: past its end and the grace period, the LNURL server says so; with an
   * address, nothing sent to it in time, the lease over and no transaction undecided. `late`: a
   * transaction paid the address after the lease's end: it counts for no order (SPEC.md §31).
   */
  | { phase: "expired"; record: CheckoutRecord; late: boolean };

/** A transaction this page listed: what it pays, the coins it spends, when the page first saw it. */
type SeenTx = { sats: bigint; inputs: string[]; firstSeen: number };

/** What the watch lists, as its key writes it (txid, sats, coins). */
type ListedTx = { txid: string; sats: bigint; inputs: string[] };

function parseListed(key: string): ListedTx[] {
  return (JSON.parse(key) as [string, string, string[]][]).map(([txid, sats, inputs]) => ({
    txid,
    sats: BigInt(sats),
    inputs
  }));
}

/** An invoice of the rest, and when it came (its `since` in useInvoicesWatch, kept for good). */
type HeldRest = { invoice: Invoice; since: number };

/** No invoice of the rest: one array, so that a render without them changes nothing. */
const NO_RESTS: readonly HeldRest[] = [];

/** The id of an invoice of the rest among the invoices the page watches (useInvoicesWatch). */
function restId(invoice: Invoice): string {
  return `rest|${invoice.decoded.paymentHash}`;
}

/** The order of the invoices of the rest (SPEC.md §31): by date, then payment hash. */
function byRestOrder(a: Invoice, b: Invoice): number {
  const hashA = a.decoded.paymentHash;
  const hashB = b.decoded.paymentHash;
  return a.decoded.timestamp - b.decoded.timestamp || (hashA < hashB ? -1 : hashA > hashB ? 1 : 0);
}

/**
 * When `txid` came, if in time (Unix ms): seen by this page by the lease's `end` (Unix seconds),
 * else received by BlockCypher by then; null otherwise.
 */
function cameInTimeAt(
  txid: string,
  seen: ReadonlyMap<string, SeenTx>,
  receivedAt: ReadonlyMap<string, number>,
  end: number | null
): number | null {
  if (end === null) return null;
  const first = seen.get(txid)?.firstSeen;
  if (first !== undefined && first <= end * 1000) return first;
  const received = receivedAt.get(txid);
  return received !== undefined && received <= end * 1000 ? received : null;
}

/**
 * The parts of what is listed (`ids`), from every transaction the page saw, those listed it has not
 * recorded yet (`fresh`: after all others), and those a listed one replaced that it never saw
 * (`replaced`, as BlockCypher keeps them).
 */
function partsOf(
  seen: ReadonlyMap<string, SeenTx>,
  ids: ReadonlySet<string>,
  replaced: ReadonlyMap<string, ReplacedTx | null>,
  fresh: readonly ListedTx[] = []
) {
  return paymentParts([
    ...[...seen].map(([txid, tx]) => ({
      txid,
      sats: tx.sats,
      inputs: tx.inputs,
      at: tx.firstSeen,
      listed: ids.has(txid)
    })),
    ...[...replaced].flatMap(([txid, tx]) =>
      tx && !seen.has(txid)
        ? [{ txid, sats: tx.sats, inputs: tx.inputs, at: tx.receivedAt, listed: false }]
        : []
    ),
    ...fresh.map((tx) => ({
      txid: tx.txid,
      sats: tx.sats,
      inputs: tx.inputs,
      at: null,
      listed: true
    }))
  ]);
}

/** What counts of each transaction, and from when (the latest of its parts that came in time). */
function countedOf(
  parts: ReturnType<typeof paymentParts>,
  inTimeAt: (txid: string) => number | null
): { sats: Map<string, bigint>; at: Map<string, number> } {
  const sats = new Map<string, bigint>();
  const at = new Map<string, number>();
  for (const [txid, list] of parts) {
    for (const part of list) {
      const came = inTimeAt(part.source);
      if (came === null) continue;
      sats.set(txid, (sats.get(txid) ?? 0n) + part.sats);
      at.set(txid, Math.max(at.get(txid) ?? 0, came));
    }
  }
  return { sats, at };
}

/**
 * When BlockCypher received each of `txids` (comma-separated; Unix ms), asked past the lease's end
 * (`end`, Unix seconds), once each. One it does not know yet (HTTP 404) will be received after now,
 * so after the end: late for good, its time Infinity, never waited for
 * (SPEC.md §31). Only a failure is asked again (5 s, 10 s… 10 min, receivedRetryMs: within the
 * hundred requests an hour it allows without a token): nothing is decided meanwhile.
 */
function useReceivedTimes(txids: string, end: number | null): ReadonlyMap<string, number> {
  const [times, setTimes] = useState<ReadonlyMap<string, number>>(() => new Map());
  // The transactions whose time was read: never asked again (a retry, a longer list), within the
  // requests an hour BlockCypher allows.
  const read = useRef(new Set<string>());
  useEffect(() => {
    if (txids === "" || end === null) return;
    const done = read.current;
    return askUntilTold(
      txids.split(",").filter((txid) => !done.has(txid)),
      async (txid, alive) => {
        if (done.has(txid)) return false;
        const known = await fetchTxReceived(txid);
        // Not known now, past the end: received later still (asked only then, toAsk below).
        const time = known ?? (nowUnix() > end ? Number.POSITIVE_INFINITY : null);
        if (time === null) return true;
        if (alive()) {
          done.add(txid);
          setTimes((times) => new Map(times).set(txid, time));
        }
        return false;
      },
      (error) => {
        logFailure("Reading when the transaction was received failed", error);
      }
    );
  }, [txids, end]);
  return times;
}

/**
 * The payer's side of a checkout link (src/lib/payment-link/checkout.ts): reads its record from the
 * relays its URL names, then checks the invoice's payment from the payer's browser (LUD-21, as the
 * point of sale does: useInvoicesWatch) and, with an address (version 2), its on-chain payment (the
 * explorers, as a payment link's: useOnchainWatch), counted only when sent by the lease's end
 * (SPEC.md §30, §31): seen by this page by then, else received by then as BlockCypher tells it. A
 * payer who comes back sees the payment being confirmed, or paid, as on a payment link's page;
 * less than the amount in time, underpaid, its rest payable until the invoice's end, then
 * underpaid for good. With the rest keys a record may carry, it listens for the
 * invoices of the rest the integration's server publishes (watchCheckoutRests): the rest in
 * Lightning, and on-chain from MIN_ONCHAIN_SATS; what they paid counts with the on-chain payment,
 * which then needs only the difference, read on a majority of the link's relays before anything
 * but a payment is told; and for the server's acceptance of a payment short of the amount
 * (the merchant's tolerance, which this page never knows, SPEC.md §31): enough from what
 * it accepted on, something counting on-chain. Nothing is shown that is not proven: paid only
 * with the preimage, or deep enough on mempool.space; expired only once the LNURL server says so
 * past the grace period, and nothing was sent on-chain in time by the lease's end, no
 * transaction undecided; in between, checked again. Neither open nor ended before the first
 * answers of the checks ("checking"). `fragment` is the URL's, read once (the page is keyed by
 * it).
 */
export function useCheckoutLink(fragment: string): {
  state: CheckoutState;
  now: number;
  /** Hex: the link's author, which names it (its redirect is remembered by it); null without one. */
  id: string | null;
  retry: () => void;
} {
  const [link] = useState<CheckoutFragment>(() => parseCheckoutFragment(fragment));
  const ref = link.status === "link" ? link.ref : null;
  const [lookup, setLookup] = useState<CheckoutLookup | { status: "loading" }>({
    status: "loading"
  });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(nowUnix);

  useEffect(() => {
    if (!ref) return;
    let alive = true;
    void (async () => {
      const network = invoiceNetwork();
      let result = await fetchCheckoutLink(ref, network);
      // A relay that took the record late: once more, as a payment link (useSharedInvoice).
      if (result.status === "notFound" && alive) {
        await new Promise((resolve) => setTimeout(resolve, NOT_FOUND_RETRY_MS));
        if (alive) result = await fetchCheckoutLink(ref, network);
      }
      if (!alive) return;
      // The clock only runs once a record is shown: without this, a record read late (a slow
      // relay, "Try again" minutes later) would be judged at the page's opening time, an
      // expired invoice shown open until the next tick.
      setNow(nowUnix());
      setLookup(result);
    })();
    return () => {
      alive = false;
    };
  }, [ref, attempt]);

  const record = lookup.status === "found" ? lookup.record : null;
  // The invoices of the rest of an underpayment the integration's server published for this record
  // (SPEC.md §31, "Rest records"), each once, in the order they came.
  const [restsHeld, setRests] = useState<{
    record: CheckoutRecord;
    invoices: readonly HeldRest[];
  } | null>(null);
  const held = restsHeld !== null && restsHeld.record === record ? restsHeld.invoices : NO_RESTS;
  const rests = useMemo(() => held.map(({ invoice }) => invoice), [held]);
  // The record whose rest records a majority of the link's relays sent (watchCheckoutRests): until
  // then, one already paid may not have come, and what is left to pay is not known. Nothing to pay
  // is shown meanwhile, even before anything came on-chain, however long the relays take
  // (never a payment asked twice, rather a payer who waits).
  const [restsRead, setRestsRead] = useState<CheckoutRecord | null>(null);
  const restsKnown = record !== null && (record.rest === null || restsRead === record);
  // The merchant's acceptance of a payment short of the amount, the newest the integration's server
  // published (SPEC.md §31, "Acceptance records"): this page never knows the merchant's tolerance,
  // only that a payment of so much counts.
  const [acceptanceHeld, setAcceptance] = useState<{
    record: CheckoutRecord;
    acceptance: CheckoutAcceptance;
  } | null>(null);
  const acceptance =
    acceptanceHeld !== null && acceptanceHeld.record === record ? acceptanceHeld.acceptance : null;
  // What pays the order: its amount, or what the server accepted (below it, SPEC.md §31).
  const enoughFrom =
    record === null
      ? null
      : acceptance !== null && acceptance.received < record.sats
        ? acceptance.received
        : record.sats;
  // Watched from the moment it is read: at once, it may be paid already (a page opened again);
  // each invoice of the rest from the moment it came (never again from a later one's arrival: its
  // pace, verifyDelayMs, would start over).
  const invoiceEntry = useMemo(
    (): WatchedInvoice | null =>
      record?.invoice
        ? {
            id: record.invoice.pr,
            invoice: record.invoice,
            expiresAt: record.expiresAt,
            since: nowUnix(),
            immediate: true
          }
        : null,
    [record]
  );
  const entries = useMemo(
    (): WatchedInvoice[] => [
      ...(invoiceEntry ? [invoiceEntry] : []),
      ...held.map(({ invoice, since }) => ({
        id: restId(invoice),
        invoice,
        expiresAt: invoice.decoded.timestamp + invoice.decoded.expirySeconds,
        since,
        immediate: true
      }))
    ],
    [invoiceEntry, held]
  );
  const outcomes = useInvoicesWatch(entries, entries.length > 0);
  const outcome = outcomes.get(record?.invoice?.pr ?? "");
  const lightningPaid = outcome?.paidAt != null;
  // What the invoices of the rest paid (proven by the preimage of each, LUD-21), and whether each
  // is told: one not checked yet may be paid already (a payer who comes back).
  const restOutcomes = rests.map((invoice) => outcomes.get(restId(invoice)));
  const restPaid = rests.reduce(
    (sum, invoice, index) =>
      restOutcomes[index]?.paidAt != null ? sum + invoice.decoded.amountMsat! / 1000n : sum,
    0n
  );
  const restsPending = restOutcomes.some((told) => told === undefined);
  const restsFinal = restOutcomes.every((told) => told?.paidAt != null || told?.expired === true);
  // The invoices of the rest alone pay it all (the on-chain payment replaced or dropped since).
  const restsPay = record !== null && restPaid >= record.sats;
  // The record whose first answers were waited for long enough (FIRST_CHECK_TIMEOUT_MS): another
  // one read ("Try again") is waited for again.
  const waited = useWaited(record, FIRST_CHECK_TIMEOUT_MS);
  // The Lightning part is final: expired (the LNURL server says so past the grace period), or none;
  // and so is each invoice of the rest, all of them read.
  const lightningFinal =
    record !== null &&
    (record.invoice === null || outcome?.expired === true) &&
    restsKnown &&
    restsFinal;
  // The on-chain part (SPEC.md §31): the lease ends at the invoice's end and the grace period.
  const end = record?.onchainAddress ? record.expiresAt + LEASE_GRACE_SECONDS : null;
  // Which transactions came in time (SPEC.md §30): the page cannot read the integration's
  // witnesses (sealed with its key). One it saw while the lease ran was broadcast by then (when it
  // saw it, Unix ms); one it first sees later (a payer who comes back) is told by BlockCypher's
  // time, as the integration's server tells it, so that both say the same. A replacement (RBF)
  // counts for what it takes of the payment it replaces (src/lib/onchain/replacement.ts): one this
  // page saw, or, past the lease's end, one mempool.space's history names (a payer who bumped its
  // fee, then came back), as BlockCypher keeps it (useReplacedTxs).
  const [seen, setSeen] = useState<{
    txs: ReadonlyMap<string, SeenTx>;
    listed: ReadonlySet<string>;
  }>(() => ({ txs: new Map(), listed: new Set() }));
  const [askKey, setAskKey] = useState("");
  const ownReceivedAt = useReceivedTimes(askKey, end);
  // Past the lease's end only, for what this page did not see in time: one it saw by then counts
  // from then, whatever it replaced (its parts would all be in time too).
  const replacedWanted = end !== null && now > end && !lightningPaid && !restsPay;
  const seenInTime = (txid: string) => {
    const first = seen.txs.get(txid)?.firstSeen;
    return first !== undefined && end !== null && first <= end * 1000;
  };
  const replaced = useReplacedTxs({
    address: record?.onchainAddress ?? null,
    txids: [...seen.listed].filter((txid) => !seenInTime(txid)),
    known: new Set(seen.txs.keys()),
    enabled: replacedWanted
  });
  // When BlockCypher received each transaction asked about, and each replaced one it keeps.
  const receivedAt = useMemo(() => {
    const times = new Map(ownReceivedAt);
    for (const [txid, tx] of replaced.details) {
      if (tx && !times.has(txid)) times.set(txid, tx.receivedAt);
    }
    return times;
  }, [ownReceivedAt, replaced.details]);
  /** When `txid` came, if in time (Unix ms): seen by then, else BlockCypher's time by then. */
  const ownInTimeAt = (txid: string) => cameInTimeAt(txid, seen.txs, receivedAt, end);
  // Each part as its own transaction came: in time, late (BlockCypher's time after the end), or
  // not told yet.
  const partState = (source: string): "inTime" | "late" | "undecided" =>
    ownInTimeAt(source) !== null ? "inTime" : receivedAt.has(source) ? "late" : "undecided";
  // As last recorded: the watch lists a replacement and the transaction it replaces at once for a
  // moment, before its next read of the explorer. Computed again only when what it depends on
  // changes, not at each second of the countdown.
  const recordedCounted = useMemo(
    () =>
      countedOf(partsOf(seen.txs, seen.listed, replaced.details), (txid) =>
        cameInTimeAt(txid, seen.txs, receivedAt, end)
      ).sats,
    [seen, replaced.details, receivedAt, end]
  );
  const { payment: onchain, listed } = useOnchainWatch({
    address: record?.onchainAddress ?? null,
    // What the invoices of the rest did not pay (of the amount, or of what the server accepted):
    // due on-chain, 3 confirmations deep on the explorer read (SPEC.md §31).
    expected: enoughFrom !== null && enoughFrom > restPaid ? enoughFrom - restPaid : 0n,
    active: record?.onchainAddress != null && !lightningPaid && !restsPay,
    counted: recordedCounted,
    // The merchant's node when the record names it (the owner let payers' pages read there), with
    // the owner's fallback; mempool.space otherwise.
    explorer: record?.bitcoinNode ?? "public"
  });
  const transactions = listed ?? [];
  const listedKey = JSON.stringify(
    transactions.map(({ txid, sats, inputs }) => [txid, sats.toString(), inputs])
  );
  // What the page shows: the parts of what the watch lists now.
  const shown = useMemo(() => {
    const current = parseListed(listedKey);
    const parts = partsOf(
      seen.txs,
      new Set(current.map(({ txid }) => txid)),
      replaced.details,
      current.filter(({ txid }) => !seen.txs.has(txid))
    );
    return {
      parts,
      ...countedOf(parts, (txid) => cameInTimeAt(txid, seen.txs, receivedAt, end))
    };
  }, [seen, replaced.details, receivedAt, end, listedKey]);
  const { parts, sats: counted, at: countedAt } = shown;
  const inTime = transactions.flatMap((tx): SaleTransaction[] => {
    const sats = counted.get(tx.txid);
    const at = countedAt.get(tx.txid);
    return sats === undefined || at === undefined
      ? []
      : [{ txid: tx.txid, sats, confirmations: tx.confirmations, receivedAt: at }];
  });
  // What a transaction replaced is not known yet (past the lease's end): its parts are not either.
  const replacedUnknown = (txid: string) =>
    replacedWanted && !seenInTime(txid) && (!replaced.told(txid) || replaced.pending);
  // Every part late: received by BlockCypher after the lease's end, or not known to it yet; no
  // payment of this order.
  const late = transactions.filter(
    (tx) =>
      !replacedUnknown(tx.txid) &&
      (parts.get(tx.txid) ?? []).every(({ source }) => partState(source) === "late")
  );
  // Listed, with a part neither in time nor late yet: seen a moment ago, BlockCypher not read yet
  // (or failing), or what it replaced not told yet.
  const undecided = transactions.filter(
    (tx) =>
      replacedUnknown(tx.txid) ||
      (parts.get(tx.txid) ?? []).some(({ source }) => partState(source) === "undecided")
  ).length;
  // The first answers awaited: no check of the invoice ended yet, the explorer not read yet.
  const firstAnswers =
    record !== null &&
    !waited &&
    ((record.invoice !== null && outcome === undefined) ||
      (record.onchainAddress !== null && listed === null));
  const onchainReceived = inTime.reduce((sum, tx) => sum + tx.sats, 0n);
  // What was received in time: on-chain, and by the invoices of the rest paid.
  const received = onchainReceived + restPaid;
  // The amount, or what the merchant accepted, something counting on-chain (an acceptance stands
  // for an on-chain payment the server saw).
  const enough =
    record !== null &&
    enoughFrom !== null &&
    (received >= record.sats || (onchainReceived > 0n && received >= enoughFrom));
  const onchainPaid = enough && onchain.phase === "paid";
  const onchainFinal =
    end === null || (now > end && undecided === 0 && onchain.phase !== "unknown" && !enough);
  const settled = lightningPaid || restsPay || onchainPaid || (lightningFinal && onchainFinal);

  // The invoices of the rest, as the integration's server publishes them: listened for until the
  // outcome is final (a server asks one as soon as it sees an underpayment).
  useEffect(() => {
    if (!ref || !record?.rest || settled) return;
    return watchCheckoutRests(
      ref,
      record,
      invoiceNetwork(),
      (invoice) =>
        setRests((last) => {
          const known = last !== null && last.record === record ? last.invoices : NO_RESTS;
          const hash = invoice.decoded.paymentHash;
          if (known.some((k) => k.invoice.decoded.paymentHash === hash)) return last;
          return { record, invoices: [...known, { invoice, since: nowUnix() }] };
        }),
      {
        onRead: () => setRestsRead(record),
        onAccepted: (next) =>
          setAcceptance((last) => {
            const known = last !== null && last.record === record ? last.acceptance : null;
            const newer = newerAcceptance(known, next);
            return newer === known ? last : { record, acceptance: newer };
          })
      }
    );
  }, [ref, record, settled]);

  // What this page lists, with when it first saw each: judged once the effect runs (a render
  // later), with the clock of now, never a render's.
  useEffect(() => {
    if (end === null) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      const at = nowUnix() * 1000;
      const current = parseListed(listedKey);
      setSeen((known) => {
        const listedNow = new Set(current.map(({ txid }) => txid));
        const fresh = current.filter(({ txid }) => !known.txs.has(txid));
        const same =
          fresh.length === 0 &&
          listedNow.size === known.listed.size &&
          [...listedNow].every((txid) => known.listed.has(txid));
        if (same) return known;
        const txs = new Map(known.txs);
        for (const { txid, sats, inputs } of fresh) txs.set(txid, { sats, inputs, firstSeen: at });
        return { txs, listed: listedNow };
      });
    });
    return () => {
      alive = false;
    };
  }, [listedKey, end]);
  // BlockCypher, only when absolutely needed: past the lease's end, for the
  // payments this page did not see in time that a listed transaction stands for (its own, or one it
  // replaces), while what came in time is not enough and nothing was paid over Lightning; not
  // before what a transaction replaced is told (it may stand for none of its own).
  const toAsk =
    end !== null && now > end && !enough && !lightningPaid
      ? [
          ...new Set(
            transactions
              .filter((tx) => !replacedUnknown(tx.txid))
              .flatMap((tx) =>
                (parts.get(tx.txid) ?? [])
                  .map(({ source }) => source)
                  .filter((source) => partState(source) === "undecided")
              )
          )
        ]
      : [];
  const nextAsk = toAsk.join(",");
  useEffect(() => {
    // Asked until known, the list growing with each transaction to ask (a time read leaves the
    // others' reads as they are); nothing more once none is needed (enough came, or Lightning).
    void Promise.resolve().then(() =>
      setAskKey((asked) => {
        if (nextAsk === "") return "";
        const all = new Set([...asked.split(","), ...nextAsk.split(",")].filter(Boolean));
        return [...all].sort().join(",");
      })
    );
  }, [nextAsk]);

  // The clock of the countdown, while there is one.
  useEffect(() => {
    if (!record || settled) return;
    const timer = setInterval(() => setNow(nowUnix()), 1000);
    return () => clearInterval(timer);
  }, [record, settled]);

  const state = ((): CheckoutState => {
    if (link.status === "newer") return { phase: "newer" };
    // Not a checkout link: the page shows another (src/app/pay.tsx), never this.
    if (link.status !== "link") return { phase: "invalid" };
    if (lookup.status !== "found") return { phase: lookup.status };
    // How it was paid: what proves each part (a preimage, a transaction sent in time).
    const method = methodOf(lightningPaid || restPaid > 0n, inTime.length > 0);
    if (lightningPaid || restsPay || onchainPaid) {
      return {
        phase: "paid",
        record: lookup.record,
        details: {
          createdAt: lookup.record.createdAt,
          method,
          // Paid over Lightning, the address is no longer watched: only what was seen confirmed.
          // Paid on-chain (the watch's "paid"), it still is: each as deep as it is now. Confirmed
          // once the payment counts.
          transactions:
            lightningPaid || restsPay
              ? settledTransactions(inTime, onchain.phase === "paid")
              : watchedTransactions(inTime, true)
        }
      };
    }
    if (enough) {
      const confirmations = Math.min(
        REQUIRED_CONFIRMATIONS,
        ...inTime.map((tx) => tx.confirmations)
      );
      return {
        phase: "unconfirmed",
        record: lookup.record,
        confirmations,
        details: {
          createdAt: lookup.record.createdAt,
          method,
          // Not paid yet: none confirmed, whatever one explorer counts.
          transactions: watchedTransactions(inTime, false)
        }
      };
    }
    // The invoices of the rest not read yet: one may have paid part of it, or all (never the whole
    // amount, nor a rest, to pay then; nor an end before they are told).
    if (!restsKnown) return { phase: "checking" };
    if (lightningFinal && onchainFinal) {
      return received > 0n
        ? {
            phase: "underpaidEnded",
            record: lookup.record,
            received,
            transactions: inTime,
            lightning: restPaid
          }
        : { phase: "expired", record: lookup.record, late: late.length > 0 };
    }
    // Never an invoice to pay, nor one ended, before its checks answered: it may be paid already
    // (a payer who comes back).
    if (firstAnswers) return { phase: "checking" };
    // An invoice of the rest not told yet may have been paid: never the whole invoice to pay then.
    if (restsPending && received === 0n) return { phase: "checking" };
    if (now < lookup.record.expiresAt && received > 0n) {
      const rest = lookup.record.sats - received;
      // The latest invoice of exactly the rest (SPEC.md §31, "The status's rest"), told unpaid and
      // not expired (one its verify URL answers for another invoice never pays the merchant), not
      // ended.
      const restInvoice = rests.reduce<Invoice | null>((latest, invoice, index) => {
        const told = restOutcomes[index];
        const payable =
          invoice.decoded.amountMsat === rest * 1000n &&
          told !== undefined &&
          told.paidAt === null &&
          !told.expired &&
          now < invoice.decoded.timestamp + invoice.decoded.expirySeconds;
        return payable && (latest === null || byRestOrder(latest, invoice) < 0) ? invoice : latest;
      }, null);
      return {
        phase: "underpaid",
        record: lookup.record,
        received,
        rest,
        restInvoice,
        checking: restsPending,
        receipts: [
          ...inTime.map(({ txid, sats, receivedAt }): SaleReceipt => ({
            kind: "onchain",
            txid,
            sats,
            receivedAt
          })),
          // As restPaid counts them, in their order (SPEC.md §31).
          ...rests
            .filter((_, index) => restOutcomes[index]?.paidAt != null)
            .sort(byRestOrder)
            .map((invoice): SaleReceipt => ({
              kind: "lightning",
              paymentHash: invoice.decoded.paymentHash,
              sats: invoice.decoded.amountMsat! / 1000n
            }))
        ]
      };
    }
    if (now < lookup.record.expiresAt) return { phase: "open", record: lookup.record };
    // Past its end, a payment listed and not told in time or late yet: never "Request expired"
    // meanwhile, as a payment link's page (useSharedInvoice's "checking").
    if (undecided > 0) return { phase: "checking" };
    return {
      phase: "ended",
      record: lookup.record,
      lateUntil: lookup.record.expiresAt + EXPIRY_GRACE_SECONDS
    };
  })();

  return {
    state,
    now,
    id: ref?.author ?? null,
    retry: () => {
      setLookup({ status: "loading" });
      setAttempt((a) => a + 1);
    }
  };
}
