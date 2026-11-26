import { useEffect, useRef, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { fetchTxDetails } from "@/lib/onchain/blockcypher";
import { fetchReplacedTxids } from "@/lib/onchain/mempool-rbf";

import { askUntilTold, stillAskingSince } from "./ask-again";

/*
 * The transactions that transactions paying an address replaced (RBF, src/lib/onchain/replacement.ts),
 * which the explorers forget: the one place the app finds them, for the point of sale and payment
 * links (useOnchainTimes) and the checkout page (useCheckoutLink).
 *
 * mempool.space's history names them (src/lib/onchain/mempool-rbf.ts), asked once for each
 * transaction given; the caller may add leads of its own (the business's records). BlockCypher, which
 * keeps a replaced transaction, then tells what each paid the address, the coins it spent and when
 * it received it: the time every payment is judged by (src/config/onchain.ts). A transaction named
 * counts only where it shares a coin with a later one (paymentParts): mempool.space cannot move a
 * payment's time.
 */

/** How long a history or a transaction not told is asked again before it is given up on. */
export const UNKNOWN_GIVE_UP_MS = 10 * 60 * 1000;

/** What BlockCypher keeps of a transaction named. */
export type ReplacedTx = {
  /** What it paid the address. */
  sats: bigint;
  /** The coins it spent (`<txid>:<vout>`). */
  inputs: string[];
  /** When BlockCypher received it (Unix ms). */
  receivedAt: number;
};

export type ReplacedTxs = {
  /** What BlockCypher keeps of each transaction named, by txid; null when it does not know one. */
  details: ReadonlyMap<string, ReplacedTx | null>;
  /** Whether the history of `txid` (one of `txids`) was told: what it replaced is known. */
  told: (txid: string) => boolean;
  /** A transaction named is still asked about: what stands for it is not known yet. */
  pending: boolean;
};

/**
 * The transactions `txids` (paying `address`) replaced, and `leads` besides, as BlockCypher keeps
 * them; those of `known` (the caller's own) are never asked. Asked while `enabled`; what was told
 * stays. A history that fails, or a lead BlockCypher does not know yet, is asked again
 * (askUntilTold) for UNKNOWN_GIVE_UP_MS, then taken for none: never a guess meanwhile.
 */
export function useReplacedTxs({
  address,
  txids,
  leads = [],
  known,
  enabled
}: {
  address: string | null;
  txids: readonly string[];
  leads?: readonly string[];
  known: ReadonlySet<string>;
  enabled: boolean;
}): ReplacedTxs {
  const [state, setState] = useState<{
    address: string | null;
    history: ReadonlyMap<string, readonly string[]>;
    details: ReadonlyMap<string, ReplacedTx | null>;
  }>(() => ({ address, history: new Map(), details: new Map() }));
  const history = state.address === address ? state.history : NO_HISTORY;
  const details = state.address === address ? state.details : NO_DETAILS;
  const active = enabled && address !== null;

  // When each history or transaction was first not told (Date.now()), by kind and txid.
  const askingSince = useRef(new Map<string, number>());
  // What was told for the address (by kind and txid), as the state holds it: the effects below are
  // keyed by what is wanted, not by what is missing, so that an answer does not restart them (a
  // restart would ask the next item again while its first request runs).
  const told = useRef<{ address: string | null; keys: Set<string> }>({
    address: null,
    keys: new Set()
  });
  const toldFor = (at: string): Set<string> => {
    if (told.current.address !== at) told.current = { address: at, keys: new Set() };
    return told.current.keys;
  };

  const historyKey = active ? [...new Set(txids)].join(",") : "";
  useEffect(() => {
    if (!address || historyKey === "") return;
    const done = toldFor(address);
    const items = historyKey.split(",").filter((txid) => !done.has(`history:${txid}`));
    if (items.length === 0) return;
    return askUntilTold(
      items,
      async (txid, alive) => {
        let replaced: readonly string[];
        try {
          replaced = await fetchReplacedTxids(txid);
        } catch (error) {
          if (stillAskingSince(askingSince.current, `history:${txid}`, UNKNOWN_GIVE_UP_MS)) {
            throw error;
          }
          replaced = [];
        }
        if (alive()) {
          done.add(`history:${txid}`);
          setState((last) => ({
            ...last,
            address,
            history: new Map(last.address === address ? last.history : []).set(txid, replaced),
            details: last.address === address ? last.details : new Map()
          }));
        }
        return false;
      },
      (error) => {
        logFailure("Reading a transaction's replacements failed", error);
      }
    );
    // Keyed by what is wanted, not by what is told (above).
  }, [historyKey, address]);

  const named = new Set([...leads, ...txids.flatMap((txid) => history.get(txid) ?? [])]);
  const wanted = [...named].filter((txid) => !known.has(txid));
  const wantedKey = active ? wanted.join(",") : "";
  const leadsKey = [...new Set(leads)].join(",");
  useEffect(() => {
    if (!address || wantedKey === "") return;
    const done = toldFor(address);
    const ownLeads = new Set(leadsKey.split(","));
    const items = wantedKey.split(",").filter((txid) => !done.has(`details:${txid}`));
    if (items.length === 0) return;
    return askUntilTold(
      items,
      async (txid, alive) => {
        const kept = await fetchTxDetails(txid, address);
        // A caller's lead (a record) may be named seconds after its broadcast: BlockCypher may not
        // know it yet. One only mempool.space's history names was replaced before what replaced
        // it: one BlockCypher does not know is none, at once (never ten minutes of requests for
        // what a mistaken or lying answer names).
        if (
          kept === null &&
          ownLeads.has(txid) &&
          stillAskingSince(askingSince.current, `details:${txid}`, UNKNOWN_GIVE_UP_MS)
        ) {
          return true;
        }
        if (alive()) {
          done.add(`details:${txid}`);
          setState((last) => ({
            ...last,
            address,
            history: last.address === address ? last.history : new Map(),
            details: new Map(last.address === address ? last.details : []).set(txid, kept)
          }));
        }
        return false;
      },
      (error) => {
        logFailure("Reading a replaced transaction at BlockCypher failed", error);
      }
    );
    // Keyed by what is wanted, not by what is told (above).
  }, [wantedKey, leadsKey, address]);

  return {
    details,
    told: (txid) => history.has(txid),
    pending: active && wanted.some((txid) => !details.has(txid))
  };
}

const NO_HISTORY: ReadonlyMap<string, readonly string[]> = new Map();
const NO_DETAILS: ReadonlyMap<string, ReplacedTx | null> = new Map();
