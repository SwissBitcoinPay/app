import { useEffect, useMemo, useRef } from "react";

import type { InvoiceProof } from "@/features/terminal/invoice";
import type { SightingsBook } from "@/features/onchain/useOnchainTimes";
import { DEVICE_SIGHTINGS } from "@/features/team/sale-sightings";
import { useRate } from "@/features/terminal/useRate";
import { useSale, type SaleState, type Settlement } from "@/features/terminal/useSale";
import type { SharedSale } from "@/lib/payment-link/payload";
import { nowUnix } from "@/lib/rates/snapshot";
import { saleRegistry } from "@/lib/registry/registry";

/** How long a sale is followed, at most, to find whether it is settled: then the next one. */
export const SETTLE_TIMEOUT_MS = 60_000;

/** What following a sale for a moment found. */
export type SettleResult =
  /**
   * Paid, expired, or underpaid past its end: what its final version proves it with (its
   * `finalFrom` may be ahead).
   */
  | { kind: "settled"; settlement: Settlement }
  /** Not settled within the time allowed: its phase then (underpaid, being confirmed, checking). */
  | { kind: "pending"; phase: SaleState["phase"] };

/**
 * What following a sale needs of it: its link's sale (SharedSale), or a point of sale's sale kept
 * for its verdict (src/features/terminal/sale-follow.ts), as its link would carry it.
 */
export type SettledSale = Pick<
  SharedSale,
  | "fiat"
  | "note"
  | "startsAt"
  | "endsAt"
  | "onchainAddress"
  | "lightningAddress"
  | "registryReader"
  | "registryEpoch"
  | "owner"
  | "taker"
> & {
  /**
   * The business's registry key (the sale's declarations); null for a point of sale's sale charged
   * on a device without it: then nothing tells its Lightning payments here.
   */
  registryKey: Uint8Array | null;
};

/**
 * Follows a sale for a moment, out of sight, as the point of sale and the payer's page do
 * (useSale), without asking any invoice: through the invoices declared for it (src/lib/registry/),
 * its on-chain address and the points of its hours. Calls `onDone` once with what it found: the
 * sale settled (paid, expired, or underpaid past its end), or still pending. Renders nothing.
 *
 * A sale that still lasts (a sale paid in full is settled at once, whatever
 * its end, an invoice's months away) is pending as soon as nothing can have paid it: no invoice
 * declared for it (on a majority of the relays) and its address, if any, read unpaid. Otherwise it is
 * followed as long as an ended one, for its invoices' payments to be checked.
 */
export function SaleSettler({
  sale,
  saleKey,
  relays,
  proof = null,
  tolerance,
  sightings = DEVICE_SIGHTINGS,
  onDone
}: {
  sale: SettledSale;
  saleKey: Uint8Array;
  /** The relays of the sale's link (its declarations are there); unset: the device's. */
  relays?: readonly string[];
  /** Tells its invoices' payments instead of LUD-21 (the owner's wallet: useSale). */
  proof?: InvoiceProof | null;
  /**
   * The sale's tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts):
   * the one its link was made with, which the device that made it keeps (pending.ts) and its record
   * tells the owner (member-records.ts).
   */
  tolerance: number;
  /**
   * Where the transactions seen paying its address are recorded and read: the device's records
   * (DEVICE_SIGHTINGS); for a point of sale's sale, declared in the registry too (saleSightings).
   */
  sightings?: SightingsBook;
  onDone: (result: SettleResult) => void;
}) {
  const rate = useRate(sale.fiat.currency);
  const registry = useMemo(
    () =>
      sale.registryKey === null
        ? null
        : saleRegistry(
            {
              key: sale.registryKey,
              reader: sale.registryReader,
              owner: sale.owner,
              ...(sale.registryEpoch ? { readerEpoch: sale.registryEpoch } : {})
            },
            saleKey,
            relays,
            sale.taker
          ),
    [sale, saleKey, relays]
  );
  const { state, settlement, declaredCount, onchainRead } = useSale({
    key: `settle|${sale.endsAt}|${sale.lightningAddress}`,
    fiat: sale.fiat,
    rate:
      rate.rate !== undefined && rate.hour !== undefined
        ? { hour: rate.hour, rate: rate.rate }
        : null,
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    address: sale.onchainAddress,
    lightningAddress: sale.lightningAddress,
    note: sale.note,
    own: "none",
    // One of the business's devices: the merchant's own node when the account names one.
    explorer: "device",
    registry,
    // The transactions the business's devices saw paying its address, and those it sees.
    sightings,
    proof,
    tolerance
  });

  const done = useRef(false);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });
  const report = (result: SettleResult) => {
    if (done.current) return;
    done.current = true;
    finish.current(result);
  };

  // Settled as soon as it is; otherwise what it looked like when the time ran out (an underpayment
  // may still turn out paid by an invoice whose check has not answered yet: never cut short).
  const phase = useRef<SaleState["phase"]>(state.phase);
  useEffect(() => {
    phase.current = state.phase;
  });
  useEffect(() => {
    // Reported once; `report` reads the latest callback.
    if (settlement) report({ kind: "settled", settlement });
  }, [settlement]);

  // Still lasting, and nothing can have paid it: pending, without waiting for the time allowed.
  const unpaid =
    !settlement &&
    nowUnix() < sale.endsAt &&
    declaredCount === 0 &&
    (sale.onchainAddress === null || onchainRead);
  useEffect(() => {
    if (unpaid) report({ kind: "pending", phase: phase.current });
  }, [unpaid]);

  useEffect(() => {
    const timer = setTimeout(
      () => report({ kind: "pending", phase: phase.current }),
      SETTLE_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, []);

  return null;
}
