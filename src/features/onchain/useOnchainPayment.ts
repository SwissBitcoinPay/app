import { useEffect, useState } from "react";

import { ONCHAIN_RESYNC_INTERVAL_MS } from "@/config/onchain";
import { logFailure } from "@/lib/log/log";
import { fetchAddressTxs, fetchTipHeight, type ChainTx } from "@/lib/onchain/esplora";
import { watchAddress } from "@/lib/onchain/mempool-socket";
import { confirmationsOf, onchainStatus } from "@/lib/onchain/payment";

import type { PayerNode } from "@/lib/onchain/node";

import {
  PUBLIC_SOURCES,
  chainSourcesOf,
  deviceChainSources,
  orderedSources,
  readChain,
  type ChainSource
} from "./explorer";

/**
 * A transaction paying the address: the sats it pays to it, its confirmations (0: mempool) and the
 * coins it spends (a replacement, RBF, spends one of the same: src/lib/onchain/replacement.ts).
 */
export type OnchainTransaction = {
  txid: string;
  sats: bigint;
  confirmations: number;
  inputs: string[];
};

/**
 * An invoice's on-chain payment, as the screens show it. `transactions`: those paying the address,
 * as the explorer shows them (explorer.ts).
 */
export type OnchainPayment =
  /** Watched, but the explorer has not answered yet: whether it was paid is not known. */
  | { phase: "unknown" }
  /** Nothing pays the address (yet, or any more: a transaction replaced, RBF). */
  | { phase: "waiting" }
  /** Less than asked: `rest` is missing. */
  | {
      phase: "underpaid";
      received: bigint;
      rest: bigint;
      detectedAt: Date;
      transactions: OnchainTransaction[];
    }
  /** Enough, being confirmed: `confirmations` out of REQUIRED_CONFIRMATIONS. */
  | {
      phase: "unconfirmed";
      received: bigint;
      confirmations: number;
      detectedAt: Date;
      transactions: OnchainTransaction[];
    }
  /** Enough, REQUIRED_CONFIRMATIONS deep. */
  | { phase: "paid"; received: bigint; detectedAt: Date; transactions: OnchainTransaction[] };

const UNKNOWN: OnchainPayment = { phase: "unknown" };
const WAITING: OnchainPayment = { phase: "waiting" };

type Chain = {
  address: string;
  txs: ChainTx[];
  tip: number | null;
  /** When this device first saw something pay the address; null while nothing does. */
  detectedAt: Date | null;
};

/** What useOnchainWatch gives: the payment, and every transaction paying the address. */
export type OnchainWatch = {
  /** The payment, of the transactions that count (`counted`), all of them without. */
  payment: OnchainPayment;
  /** Every transaction paying the address, counted or not; null until the explorer was read. */
  listed: OnchainTransaction[] | null;
};

/**
 * Which explorers a watch reads (explorer.ts): `public`, mempool.space, for a payer's page; `device`,
 * the merchant's own node when the account names one, for the merchant's devices; a node a payment
 * or checkout link names (the owner passed it on to the payers' pages), with its fallback.
 */
export type ExplorerChoice = "public" | "device" | PayerNode;

/** `choice` as a string that changes when it does (an effect's dependency). */
function explorerKey(choice: ExplorerChoice): string {
  return typeof choice === "string" ? choice : `${choice.fallback}|${choice.url}`;
}

/** The explorers of `choice` when known without reading the device; null for `device`. */
function sourcesOfChoice(choice: ExplorerChoice): readonly ChainSource[] | null {
  if (choice === "public") return PUBLIC_SOURCES;
  if (choice === "device") return null;
  return chainSourcesOf({ ...choice, payers: true });
}

/** useOnchainWatch's payment alone, every transaction paying the address counted. */
export function useOnchainPayment(props: {
  address: string | null;
  expected: bigint;
  active: boolean;
  explorer?: ExplorerChoice;
}): OnchainPayment {
  return useOnchainWatch(props).payment;
}

/**
 * Watches the on-chain payment of `expected` sats to `address` while `active` (src/lib/onchain/):
 * the explorer (explorer.ts: mempool.space, or the merchant's own node) pushes what changes over
 * its WebSocket; its REST API gives the state at each (re)connection, after a transaction leaves
 * the mempool, and every minute in case the socket went quiet. A payment counts as made once the
 * explorer shows it REQUIRED_CONFIRMATIONS deep (one explorer).
 */
export function useOnchainWatch({
  address,
  expected,
  active,
  counted = null,
  explorer = "public"
}: {
  address: string | null;
  expected: bigint;
  active: boolean;
  /**
   * Which explorers it reads: mempool.space (a payer's page) unless `device` (the merchant's
   * devices: their own node if any) or the node a payer's link names (PayerNode).
   */
  explorer?: ExplorerChoice;
  /**
   * What counts of each transaction for the payment, by txid (absent: nothing); null: all of each.
   * A checkout link's page counts only what was sent while its address was leased, a replacement
   * (RBF) for what it takes of a payment in time (useCheckoutLink, SPEC.md §31): the rest is
   * listed, never paid with, nor cross-checked.
   */
  counted?: ReadonlyMap<string, bigint> | null;
}): OnchainWatch {
  const [chain, setChain] = useState<Chain | null>(null);
  const choiceKey = explorerKey(explorer);

  useEffect(() => {
    if (!address || !active) return;
    let alive = true;
    // The explorers, once known (the device's choice is read from its storage): until then,
    // nothing is read, nor said.
    let sources: readonly ChainSource[] | null = sourcesOfChoice(explorer);
    const txs = new Map<string, ChainTx>();
    let tip: number | null = null;
    let detectedAt: Date | null = null;
    // Whether the explorer's list was read once: until then, nothing seen does not mean unpaid (the
    // socket's first message, the chain's height, says nothing of the address).
    let read = false;
    // Transactions pushed while a REST read is on its way: newer than its answer.
    let pushedDuring: Map<string, ChainTx> | null = null;

    const publish = () => {
      if (!alive) return;
      const paying = [...txs.values()].filter((tx) => tx.received > 0n);
      if (paying.length === 0 && !read) return;
      if (paying.length === 0) detectedAt = null;
      else detectedAt ??= new Date();
      setChain({ address, txs: paying, tip, detectedAt });
    };
    const raiseTip = (height: number) => {
      tip = tip === null ? height : Math.max(tip, height);
    };

    let resyncing = false;
    // Asked while a read was on its way (a transaction left the mempool, the socket reconnected):
    // read again once it ends, its answer may predate the change.
    let again = false;
    const resync = async () => {
      if (sources === null) return;
      const from = sources;
      if (resyncing) {
        again = true;
        return;
      }
      resyncing = true;
      again = false;
      const pushed = new Map<string, ChainTx>();
      pushedDuring = pushed;
      try {
        // The list and the height from the same explorer: confirmations count against it.
        const [list, height] = await readChain(from, (api) =>
          Promise.all([fetchAddressTxs(api, address), fetchTipHeight(api)])
        );
        if (!alive) return;
        // The explorer's list is the truth (a replaced transaction is gone from it), plus what the
        // socket pushed meanwhile, newer than the answer.
        txs.clear();
        for (const tx of list) txs.set(tx.txid, tx);
        for (const tx of pushed.values()) txs.set(tx.txid, tx);
        read = true;
        raiseTip(height);
        publish();
      } catch (error) {
        logFailure("Reading the address failed", error);
      } finally {
        pushedDuring = null;
        resyncing = false;
        if (again && alive) void resync();
      }
    };

    let stop: () => void = () => undefined;
    const start = (from: readonly ChainSource[]) => {
      if (!alive) return;
      sources = from;
      stop = watchAddress(
        address,
        {
          onOpen: () => void resync(),
          onTransactions: (pushed) => {
            for (const tx of pushed) {
              txs.set(tx.txid, tx);
              pushedDuring?.set(tx.txid, tx);
            }
            publish();
          },
          // Left the mempool: replaced, evicted, or mined (the explorer tells which).
          onRemoved: () => void resync(),
          onTip: (height) => {
            raiseTip(height);
            publish();
          }
        },
        // The same explorers as the REST reads, in the same order (explorer.ts).
        { urls: orderedSources(from).map((source) => source.socket) }
      );
    };
    if (sources !== null) start(sources);
    else {
      deviceChainSources().then(start, (error: unknown) => {
        logFailure("Could not read which explorer to watch the address on", error);
        start(PUBLIC_SOURCES);
      });
    }
    const poll = setInterval(() => void resync(), ONCHAIN_RESYNC_INTERVAL_MS);
    return () => {
      alive = false;
      stop();
      clearInterval(poll);
    };
    // `explorer` as it was when `choiceKey` last changed: the same choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, active, choiceKey]);

  const current = chain && chain.address === address ? chain : null;
  // What counts of each: all of it, or the part `counted` gives.
  const countedOf = (tx: ChainTx): bigint => {
    if (!counted) return tx.received;
    const part = counted.get(tx.txid) ?? 0n;
    return part < tx.received ? part : tx.received;
  };
  const counting = current
    ? current.txs.flatMap((tx) => {
        const part = countedOf(tx);
        return part > 0n ? [{ ...tx, received: part }] : [];
      })
    : null;
  const status = current && counting ? onchainStatus(counting, current.tip, expected) : null;

  if (!current || !counting) {
    return { payment: address && active ? UNKNOWN : WAITING, listed: null };
  }
  const tip = current.tip;
  const listed = current.txs.map((tx): OnchainTransaction => ({
    txid: tx.txid,
    sats: tx.received,
    confirmations: confirmationsOf(tx, tip),
    inputs: tx.inputs
  }));
  if (!status || status.kind === "none" || !current.detectedAt) return { payment: WAITING, listed };
  const detectedAt = current.detectedAt;
  const ids = new Set(counting.map((tx) => tx.txid));
  const transactions = listed.filter((tx) => ids.has(tx.txid));
  switch (status.kind) {
    case "underpaid":
      return {
        payment: {
          phase: "underpaid",
          received: status.received,
          rest: status.rest,
          detectedAt,
          transactions
        },
        listed
      };
    case "unconfirmed":
      return {
        payment: {
          phase: "unconfirmed",
          received: status.received,
          confirmations: status.confirmations,
          detectedAt,
          transactions
        },
        listed
      };
    case "confirmed":
      return {
        payment: { phase: "paid", received: status.received, detectedAt, transactions },
        listed
      };
  }
}
