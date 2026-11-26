/**
 * The registry of Lightning payments (src/lib/registry/) is on the business's relays (the
 * device's list, or the one a payment link names). Every declaration goes to all of them; a
 * declaration counts as published, and a read as conclusive, with a majority of them: any two
 * majorities of one list share a relay, so a reader always meets an earlier declaration of the
 * same payment.
 */

/** More than half of `count` relays: 4 of 7, 1 of 1. */
export function majority(count: number): number {
  return Math.floor(count / 2) + 1;
}

/** Per relay, connection included. */
export const REGISTRY_TIMEOUT_MS = 10_000;
