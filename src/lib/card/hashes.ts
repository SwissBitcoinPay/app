import { sha256 } from "@noble/hashes/sha2.js";

import { bytesToBase64Url } from "@/lib/base64";

import { sealPushToken } from "./push-seal";
import { MAX_COUNTER, sunMac } from "./sun";

/*
 * Tap hashes: what a relay knows of a card's future taps (relay contract v2). The phone computes
 * the `c` of the card's next taps (it holds K2 and the UID) and leaves their hashes on the relay in
 * advance; a point of sale's request whose `c` hashes to one of them is that card's tap, and the
 * relay wakes the phone. The relay learns neither the key nor the UID. A hash keeps `c` behind
 * its 64 bits only: a relay may find a coming `c` by trying them all against every hash it keeps.
 * It cannot make the `p` that goes with it (K1): every check of a tap opens `p` (tap.ts,
 * card-pass.ts), never `c` alone.
 *
 * IRREVERSIBLE: the relay computes the same hash of what a point of sale sends; never change it
 * (vectors in card-sun.test.ts).
 */

/** Bytes of SHA-256 a hash keeps. */
const HASH_BYTES = 16;

/**
 * The hash of a tap's `c`: base64url (no padding) of the first 16 bytes of SHA-256 over its 8 raw
 * bytes, never over its hex (readers differ in case).
 */
export function tapHash(c: Uint8Array): string {
  if (c.length !== 8) throw new Error("A tap MAC has 8 bytes");
  return bytesToBase64Url(sha256(c).slice(0, HASH_BYTES));
}

/**
 * The hashes of the card's taps of counters `first`, `first + 1`, …: `count` of them, fewer when
 * the counter's 3 bytes end first. In counter order, as the relay numbers them: a tap there drops
 * every hash left before its own.
 */
export function tapHashes(k2: Uint8Array, uid: Uint8Array, first: number, count: number): string[] {
  if (!Number.isInteger(first) || first < 0 || !Number.isInteger(count) || count < 0) {
    throw new Error("Invalid range of counters");
  }
  const hashes: string[] = [];
  for (let counter = first; counter < first + count && counter <= MAX_COUNTER; counter++) {
    hashes.push(tapHash(sunMac(k2, uid, counter)));
  }
  return hashes;
}

/**
 * What the relay keeps of one of the card's next taps (contract v2, sealed tokens): its hash, and
 * the phone's push token sealed with that tap's `c` (push-seal.ts), absent without one (Android,
 * whose card socket wakes it; notifications off): that tap then reaches the phone by its card
 * socket, or in open-app mode only.
 */
export type TapEntry = { h: string; t?: string };

/**
 * The entries of the card's taps of counters `first`, `first + 1`, … (as tapHashes), each with
 * `pushToken` sealed for it, or none when null.
 */
export function tapEntries(
  k2: Uint8Array,
  uid: Uint8Array,
  first: number,
  count: number,
  pushToken: string | null
): TapEntry[] {
  if (!Number.isInteger(first) || first < 0 || !Number.isInteger(count) || count < 0) {
    throw new Error("Invalid range of counters");
  }
  const entries: TapEntry[] = [];
  for (let counter = first; counter < first + count && counter <= MAX_COUNTER; counter++) {
    const c = sunMac(k2, uid, counter);
    try {
      entries.push(
        pushToken === null ? { h: tapHash(c) } : { h: tapHash(c), t: sealPushToken(c, pushToken) }
      );
    } finally {
      c.fill(0);
    }
  }
  return entries;
}
