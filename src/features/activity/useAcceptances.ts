import { useEffect, useMemo, useRef, useState } from "react";

import { logFailure } from "@/lib/log/log";
import type { AcceptanceRead } from "@/lib/registry/sale-acceptance";

import {
  acceptanceKey,
  acceptanceTargets,
  applyAcceptances,
  readAcceptances,
  subscribeAcceptances,
  type AcceptanceReader,
  type OrderRead
} from "./acceptance";
import type { ActivityItem } from "./model";

/** How often the acceptances of the rows "Underpaid" are read again (another device's). */
export const ACCEPTANCES_REFRESH_MS = 60_000;

const NO_READS: ReadonlyMap<string, AcceptanceRead | OrderRead> = new Map();

/**
 * `items` with the owner's acceptances of their rows "Underpaid" (acceptance.ts): read when such a
 * row comes, again every ACCEPTANCES_REFRESH_MS while `active` (an acceptance made on another
 * device) and when `refresh` is called (one made here). Without `reader` (not known yet), or before
 * a read gave them a majority's answer, the rows stay as their payments tell them. Null items:
 * null.
 */
export function useAcceptances(
  items: readonly ActivityItem[] | null,
  reader: AcceptanceReader | null,
  active: boolean,
  /** The rows hold the wallet's payments (applyAcceptances): the owner's list. */
  wallet: boolean = true
): { items: readonly ActivityItem[] | null; refresh: () => void } {
  const [reads, setReads] = useState(NO_READS);
  const [tick, setTick] = useState(0);
  const targets = items ? acceptanceTargets(items) : [];
  const targetsKey = targets.map(acceptanceKey).sort().join(",");
  const latest = useRef({ targets, reader });
  useEffect(() => {
    latest.current = { targets, reader };
  });
  const readerKey = reader
    ? `${reader.owner}|${reader.relays.join(",")}|${reader.team !== null}`
    : "";

  useEffect(() => {
    if (!active || targetsKey === "" || readerKey === "") return;
    let alive = true;
    // One read at a time: a read waits for the slowest relay.
    let reading = false;
    const read = () => {
      const { targets: asked, reader: by } = latest.current;
      if (reading || !by || asked.length === 0) return;
      reading = true;
      readAcceptances(asked, by)
        .then(
          (found) => {
            if (alive && found.size > 0) setReads((known) => new Map([...known, ...found]));
          },
          (error: unknown) => {
            logFailure("Reading the owner's acceptances failed", error);
          }
        )
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, ACCEPTANCES_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, targetsKey, readerKey, tick]);

  // An acceptance made on this device (a row's details, an invoice's): read again at once.
  useEffect(() => subscribeAcceptances(() => setTick((count) => count + 1)), []);

  // One list per read and per list of rows: its readers keep it by identity (invoices' rows).
  const accepted = useMemo(
    () => (items === null ? null : applyAcceptances(items, reads, { wallet })),
    [items, reads, wallet]
  );
  return {
    items: accepted,
    refresh: () => setTick((count) => count + 1)
  };
}
