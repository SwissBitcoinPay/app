import { useEffect, useRef, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { fetchBroadcastTime } from "@/lib/onchain/broadcast-time";
import { paymentParts } from "@/lib/onchain/replacement";

import { askUntilTold, stillAskingSince } from "./ask-again";
import type { OnchainTransaction } from "./useOnchainPayment";
import { UNKNOWN_GIVE_UP_MS, useReplacedTxs } from "./useReplacedTxs";

/*
 * When each transaction paying a sale's address counts from: the time it
 * was broadcast, whose hour prices it (useSale.ts), the same hour for every device that asks:
 * mempool.space's first sight while it is in the mempool, BlockCypher's time near a change of point
 * and once it left the mempool (src/lib/onchain/broadcast-time.ts). A replacement (RBF,
 * src/lib/onchain/replacement.ts) keeps the time of the payment it
 * replaces when it pays no more than that payment did: a payer who bumps its fee an hour later, or
 * after the sale's end, pays at the hour it paid. What it pays more was added after: the
 * replacement then counts from its own time, as a payment made then (the sale's on-chain part is
 * priced at the hour of its last payment).
 *
 * The explorers forget a replaced transaction; BlockCypher keeps it, by its txid. Two leads name
 * it: mempool.space's history of the replacements (src/lib/onchain/mempool-rbf.ts), asked once
 * for each transaction listed, which it forgets a day after the last version
 * was mined; and the business's devices' records of each transaction they saw paying the address (a
 * SightingsBook: the point of sale, the devices that settle payment links,
 * src/features/team/sale-sightings.ts), which last. BlockCypher then tells what each transaction
 * named paid, spent and when. A payer's page records nothing: it goes by
 * what it saw itself and by mempool.space's history.
 */

/**
 * Where the transactions seen paying a sale's address are recorded: the device's records, signed
 * by its own keys, read by it and the owner.
 */
export type SightingsBook = {
  /**
   * What it records, when a book does more than the device's records (a sale's declarations too,
   * src/features/team/sale-sightings.ts): a transaction one book recorded is recorded again by
   * another.
   */
  name?: string;
  /** Records that `txid` paid `address`; rejects when it could not (tried again). */
  record: (address: string, txid: string) => Promise<void>;
  /**
   * The transactions recorded paying `address` since `since` (Unix seconds), the earliest first;
   * null when that cannot be told now (tried again).
   */
  read: (address: string, since: number) => Promise<readonly string[] | null>;
};

/**
 * The transactions this device recorded seen (per sale's book, address and start, and txid), once a
 * majority took each: never recorded again in this session, by the sale's screen or its follower
 * (src/features/terminal/SalesFollower.tsx), whose every look follows the sale afresh.
 */
const recordedSightings = new Set<string>();

/** Tests only: nothing recorded yet in this session. */
export function resetRecordedSightings(): void {
  recordedSightings.clear();
}

/** Recording a transaction seen, or reading those recorded, is tried again after this long. */
const SIGHTINGS_RETRY_MS = 30_000;

/**
 * How long a transaction listed in the mempool is asked of mempool.space alone while it does not
 * hold it yet (its server behind the one that pushed it, broadcast-time.ts): then BlockCypher.
 */
export const FIRST_SEEN_WAIT_MS = 60_000;

/** What is known of a transaction: what it pays the address, the coins it spends. */
type Known = { sats: bigint; inputs: string[] };

/**
 * The time each transaction of `listed` (those paying `address` now) counts from, Unix ms, by
 * txid; a txid is absent while its time is not known yet (mempool.space or BlockCypher,
 * mempool.space's history, the recorded ones). With a `book`, while `active`: this device's
 * transactions are recorded, and those recorded since the sale started (`since`, Unix seconds) read
 * (a replacement may stand for one of them).
 */
export function useOnchainTimes({
  address,
  listed,
  book,
  since,
  active
}: {
  address: string | null;
  listed: readonly OnchainTransaction[];
  book: SightingsBook | null;
  since: number;
  active: boolean;
}): ReadonlyMap<string, number> {
  // Every transaction seen paying the address, listed now or not any more (replaced).
  const [seen, setSeen] = useState<{ address: string | null; txs: ReadonlyMap<string, Known> }>(
    () => ({ address, txs: new Map() })
  );
  const seenTxs = seen.address === address ? seen.txs : NOTHING_SEEN;
  // Taken during the render: what is listed now joins what was seen, once.
  const fresh = listed.filter(({ txid }) => !seenTxs.has(txid));
  if (address && (seen.address !== address || fresh.length > 0)) {
    setSeen({
      address,
      txs: new Map([
        ...seenTxs,
        ...fresh.map(({ txid, sats, inputs }) => [txid, { sats, inputs }] as const)
      ])
    });
  }

  // The transactions the business's devices recorded (null: not read yet, or no book).
  const [recorded, setRecorded] = useState<{
    id: string;
    ids: string;
    txids: readonly string[];
  } | null>(null);
  const recordedId = `${book ? (book.name ?? "book") : "none"}|${address}|${since}`;
  const listedIds = listed.map(({ txid }) => txid);
  const idsKey = listedIds.join(",");
  // Read since the explorer listed what it lists now: a read of before may lack the payment a
  // replacement listed since stands for (another device recorded it meanwhile).
  const sightings = recorded?.id === recordedId && recorded.ids === idsKey ? recorded.txids : null;
  useEffect(() => {
    if (!book || !address || !active || idsKey === "") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // This device's own records are not needed to read the others': both at once.
    const record = async (): Promise<boolean> => {
      const missing = idsKey
        .split(",")
        .filter((txid) => !recordedSightings.has(`${recordedId}|${txid}`));
      const done = await Promise.all(
        missing.map(async (txid) => {
          try {
            await book.record(address, txid);
            recordedSightings.add(`${recordedId}|${txid}`);
            return true;
          } catch (error) {
            logFailure("Recording a transaction of the sale failed", error);
            return false;
          }
        })
      );
      return done.every(Boolean);
    };
    const run = async () => {
      const [recordedAll, read] = await Promise.all([
        record(),
        book.read(address, since).catch((error: unknown) => {
          logFailure("Reading the transactions recorded failed", error);
          return null;
        })
      ]);
      if (!alive) return;
      if (read) setRecorded({ id: recordedId, ids: idsKey, txids: read });
      if (!recordedAll || !read) timer = setTimeout(() => void run(), SIGHTINGS_RETRY_MS);
    };
    void run();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // Keyed by the sale's address and start, and what pays it; the book is the device's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedId, idsKey, active]);

  const listedSet = new Set(listedIds);
  // The transactions a listed one replaced, from mempool.space's history and the business's
  // records, as BlockCypher keeps them (useReplacedTxs).
  const replaced = useReplacedTxs({
    address,
    txids: listedIds,
    leads: sightings ?? [],
    known: new Set([...listedIds, ...seenTxs.keys()]),
    enabled: true
  });

  // When each transaction this device saw (listed, or replaced since) was broadcast.
  const [times, setTimes] = useState<{
    address: string | null;
    received: ReadonlyMap<string, number | null>;
  }>(() => ({ address, received: new Map() }));
  const received = times.address === address ? times.received : NO_TIMES;
  const missingKey = [...new Set([...listedIds, ...seenTxs.keys()])]
    .filter((txid) => !received.has(txid))
    .join(",");
  // Those in the mempool now (listed unconfirmed): asked of mempool.space first.
  const mempoolKey = listed
    .filter(({ confirmations }) => confirmations === 0)
    .map(({ txid }) => txid)
    .join(",");
  // When BlockCypher first said it does not know each transaction (Date.now()).
  const unknownSince = useRef(new Map<string, number>());
  // When each transaction was first asked of mempool.space (Date.now()).
  const firstSeenSince = useRef(new Map<string, number>());
  useEffect(() => {
    if (!address || missingKey === "") return;
    const listedNow = new Set(idsKey.split(","));
    const inMempool = new Set(mempoolKey.split(","));
    return askUntilTold(
      missingKey.split(","),
      async (txid, alive) => {
        const time = await fetchBroadcastTime(txid, {
          inMempool: inMempool.has(txid),
          waitForMempool: stillAskingSince(firstSeenSince.current, txid, FIRST_SEEN_WAIT_MS)
        });
        // A transaction just sent is often not known yet: asked again (one listed, until it is).
        // One replaced since that BlockCypher still does not know after UNKNOWN_GIVE_UP_MS stands
        // for nothing.
        if (
          time === null &&
          (listedNow.has(txid) || stillAskingSince(unknownSince.current, txid, UNKNOWN_GIVE_UP_MS))
        ) {
          return true;
        }
        if (alive()) {
          setTimes((last) => ({
            address,
            received: new Map(last.address === address ? last.received : []).set(txid, time)
          }));
        }
        return false;
      },
      (error) => {
        logFailure("Reading when a transaction was broadcast failed", error);
      }
    );
    // Keyed by what is missing and where it is asked; the address is part of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, mempoolKey, address]);

  // Every transaction known, with its time: those this device saw, then the others' (BlockCypher's
  // account of them); a replaced one BlockCypher does not know is left out.
  const nodes = new Map<string, Known & { at: number | null }>();
  for (const [txid, known] of seenTxs) {
    const at = received.get(txid);
    if (at === null && !listedSet.has(txid)) continue;
    nodes.set(txid, { ...known, at: at ?? null });
  }
  for (const [txid, kept] of replaced.details) {
    if (kept && !nodes.has(txid)) nodes.set(txid, { ...kept, at: kept.receivedAt });
  }
  for (const tx of listed) {
    if (!nodes.has(tx.txid)) {
      nodes.set(tx.txid, { sats: tx.sats, inputs: tx.inputs, at: received.get(tx.txid) ?? null });
    }
  }
  // Until the sale's records are read and every transaction named is told, a replacement's time is
  // not known: never a guess.
  const waiting = listed.length > 0 && ((book !== null && sightings === null) || replaced.pending);
  if (waiting) return NO_TIMES_KNOWN;
  // A replaced transaction whose time is not read yet: whatever stands for it waits for it.
  // paymentParts puts a time not known after every known one, where a replacement of it would pass
  // for a payment of its own time: a listed transaction spending one of its coins waits instead.
  const unreadCoins = new Set<string>();
  for (const [txid, known] of seenTxs) {
    if (!listedSet.has(txid) && !received.has(txid)) {
      for (const coin of known.inputs) unreadCoins.add(coin);
    }
  }
  const parts = paymentParts(
    [...nodes].map(([txid, node]) => ({
      txid,
      sats: node.sats,
      inputs: node.inputs,
      at: node.at,
      listed: listedSet.has(txid)
    }))
  );
  const result = new Map<string, number>();
  for (const { txid, inputs } of listed) {
    // Until mempool.space told what it replaced (or was given up on).
    if (!replaced.told(txid)) continue;
    if (inputs.some((coin) => unreadCoins.has(coin))) continue;
    let at = 0;
    let known = true;
    for (const { source } of parts.get(txid) ?? []) {
      const time = nodes.get(source)?.at;
      if (time === null || time === undefined) known = false;
      else at = Math.max(at, time);
    }
    if (known && parts.has(txid)) result.set(txid, at);
  }
  return result;
}

const NOTHING_SEEN: ReadonlyMap<string, Known> = new Map();
const NO_TIMES: ReadonlyMap<string, number | null> = new Map();
const NO_TIMES_KNOWN: ReadonlyMap<string, number> = new Map();
