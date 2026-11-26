/*
 * The owner's tolerance of on-chain underpayments (checkout-spec SPEC.md §31, "The merchant's
 * tolerance"): the share of a sale's amount, in basis points, that its
 * payment in time may miss and still pay it in full, provided something was paid on-chain (an
 * invoice is never paid in part over Lightning). A sale short by more is underpaid as without it:
 * its whole rest is asked, never only what the tolerance would leave.
 *
 * A sale keeps the tolerance of its creation: the point of sale's (src/features/terminal/
 * options.ts), held for the sale; a payment link's, in the records of the device that made it
 * (pending.ts, member-records.ts); an integration's order's, in its lease (registry/onchain.ts).
 * Its payment is judged with it whatever the owner sets later, by every reader of the merchant's
 * side. It is sensitive: a payer who knew it could pay that much less on purpose. It goes to the
 * employees' devices (their channel) and the integrations' servers, never into what a payer
 * reads (a payment link, a checkout link, a final version: final.ts says only that the owner's
 * side accepted the payment).
 *
 * Pure: amounts in sats (bigint), on integers.
 */

/**
 * The highest tolerance, in basis points: 10 %, the bound
 * checkout-spec gives the integrations too (SPEC.md §31: a channel's or a lease's tolerance above
 * it is none). Here rather than in src/config/onchain.ts, which reads the build's network: the
 * stored records' readers (src/lib/terminal/model.ts) load this module. It also bounds what a
 * published final version may say was accepted (src/lib/payment-link/final.ts): raising it makes
 * the apps of before refuse the final versions accepted short by more.
 */
export const MAX_ONCHAIN_TOLERANCE = 1000;

/** Basis points in a whole. */
const SCALE = 10_000n;

/**
 * A tolerance as a channel, a lease or a record writes it: an integer from 0 to
 * MAX_ONCHAIN_TOLERANCE; absent, or anything else, 0 (none: a sale is then judged against its whole
 * amount, never more leniently).
 */
export function toleranceOf(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ONCHAIN_TOLERANCE
    ? value
    : 0;
}

/**
 * The least accepted of `due` with `tolerance`: `due` less the share it allows, rounded down to
 * the whole sat (never more missing than the tolerance). 46 550 of 49 000 at 500 (5 %).
 */
export function leastAccepted(due: bigint, tolerance: number): bigint {
  return due - (due * BigInt(toleranceOf(tolerance))) / SCALE;
}

/**
 * Whether `received` in all pays `due` with `tolerance`, `onchain` of it on-chain: the whole
 * amount, or, something paid on-chain, its least accepted.
 */
export function coversWith(
  received: bigint,
  onchain: bigint,
  due: bigint,
  tolerance: number
): boolean {
  if (received >= due) return true;
  return onchain > 0n && received >= leastAccepted(due, tolerance);
}

/**
 * What is due on-chain of `due` with `tolerance` once `paidOtherwise` was paid over Lightning
 * (SPEC.md §31, "The on-chain payment", step 4): nothing when that pays `due`; else its least
 * accepted less that, a sat at least (something must count on-chain for the tolerance to apply).
 */
export function dueOnchain(due: bigint, tolerance: number, paidOtherwise: bigint): bigint {
  if (paidOtherwise >= due) return 0n;
  const left = leastAccepted(due, tolerance) - paidOtherwise;
  return left > 0n ? left : 1n;
}
