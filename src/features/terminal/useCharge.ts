import { useEffect, useMemo } from "react";

import { saleSightings } from "@/features/team/sale-sightings";
import type { Registry } from "@/lib/registry/registry";

import { INVOICE_EXPIRY_SECONDS } from "./invoice";
import {
  isAddressKeptForLink,
  prepareOnchainAddress,
  recycleOnchainAddress,
  releaseOnchainAddress,
  takeOnchainAddress,
  type AddressPool
} from "./onchain-pool";
import { useSale, type HourRate, type SaleFiat, type SaleState, type Settlement } from "./useSale";

export type { ChargeFailure, PaymentMethod } from "./useSale";
export type ChargeState = SaleState;

/**
 * One sale of the point of sale (useSale.ts): payable for 10 minutes from "Charge"
 * (`startedAt`), each Lightning invoice asked at the point of its hour and ending with that
 * point's period, made again at HH:05 for the time left
 * (src/lib/rates/sources.ts: a point prices from 5 minutes after its hour). With the first
 * invoice, an on-chain address of the device for the same QR (onchain-pool.ts), from 1000 sats
 * (`MIN_ONCHAIN_SATS`): from the pool of the owner's wallet, or from the lot the owner gave an
 * employee's device (src/features/team/member-addresses.ts). An underpayment's rest is payable
 * until the sale's end, an invoice of it at each hour's point; then the sale stays underpaid.
 * A new `attempt` starts over. Leaving the screen stops everything here;
 * an invoice left behind simply expires, its address stays used (unless the sale was shared as a
 * payment link: its final version puts it back, src/features/payment-link/finalize.ts), and a
 * sale with an address is followed out of sight until its verdict is recorded (sale-follow.ts).
 */
export function useCharge({
  pool,
  lightningAddress,
  fiat,
  note,
  attempt,
  tappedAt,
  startedAt,
  rate,
  registry,
  tolerance
}: {
  /** Where the sale's on-chain address comes from; null for none (Lightning only). */
  pool: AddressPool | null;
  lightningAddress: string;
  fiat: SaleFiat;
  note: string;
  attempt: number;
  /** When "Charge" was tapped, on this device's clock (ms): the sale's identity. */
  tappedAt: number;
  /**
   * The same moment in Unix seconds of the issuer's clock (src/lib/clock.ts): it may move once an
   * invoice's date corrects the clock, the sale does not start over.
   */
  startedAt: number;
  /** The point of the current hour, null while it is not known. */
  rate: HourRate | null;
  /**
   * What the sale's invoices are declared with (src/lib/registry/): undefined while the device's
   * registry key is read, null without one (nothing declared).
   */
  registry: Registry | null | undefined;
  /**
   * The sale's tolerance of on-chain underpayments (basis points, src/lib/onchain/tolerance.ts),
   * held for it from its start: a payment short by no more than it pays the sale.
   */
  tolerance: number;
}): {
  state: ChargeState;
  /** What the payments reached, a disputed payment aside (useSale): what the records tell. */
  reached: ChargeState;
  now: number;
  dueNow: bigint | null;
  settlement: Settlement | null;
  /** The proofs of the Lightning payments counted (useSale): the paid record carries them. */
  lightningProofs: { invoice: string; preimage: string }[];
} {
  const key = `${lightningAddress}|${fiat.minor}|${fiat.currency}|${note}|${attempt}|${tappedAt}`;
  // The address the sale would take is checked with the explorer from "Charge" on, while its
  // invoice is asked (onchain-pool.ts).
  useEffect(() => {
    if (pool !== null) prepareOnchainAddress(pool);
  }, [key, pool]);
  const sightings = useMemo(
    () => saleSightings(registry ?? null, { fiat, note }),
    // The sale's: its registry, amount and note are fixed with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, key]
  );
  const { state, reached, now, address, dueNow, onchainRead, settlement, lightningProofs } =
    useSale({
      key,
      fiat,
      rate,
      startsAt: startedAt,
      endsAt: startedAt + INVOICE_EXPIRY_SECONDS,
      takeAddress: pool === null ? undefined : () => takeOnchainAddress(pool),
      releaseAddress:
        pool === null ? undefined : (taken) => void releaseOnchainAddress(pool, taken),
      lightningAddress,
      note,
      own: "all",
      // The point of sale: the merchant's own node when the account names one.
      explorer: "device",
      registry: registry ?? null,
      // The point of sale records what pays its sales (and the owner settling them reads it), and
      // declares it in the registry ("Wallet" tells its deposits' sale for good).
      sightings,
      tolerance,
      // Nothing asked before the device's registry key is read: every invoice declared or none.
      active: registry !== undefined
    });

  // The address of a sale paid over Lightning, with nothing on-chain, goes back to the pool once
  // the explorer confirms nothing paid it (onchain-pool.ts); that of a sale shared as a link, with
  // the link's final version (src/features/payment-link/finalize.ts).
  const recyclable = state.phase === "paid" && state.method === "lightning" && onchainRead;
  useEffect(() => {
    if (!recyclable || !address || pool === null || isAddressKeptForLink(address)) return;
    void recycleOnchainAddress(pool, address);
  }, [recyclable, address, pool]);

  return { state, reached, now, dueNow, settlement, lightningProofs };
}
