import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { secureRandomBytes } from "@/lib/random";

/** A Nostr identity: a BIP-340 secret key and its x-only public key. */
export type NostrKeys = {
  secretKey: Uint8Array;
  /** Hex: the `pubkey` of the events it signs. */
  publicKey: string;
};

/** The identity of `secretKey`. Throws for the 0 or ≥ n keys BIP-340 refuses. */
export function nostrKeys(secretKey: Uint8Array): NostrKeys {
  return { secretKey, publicKey: bytesToHex(schnorr.getPublicKey(secretKey)) };
}

/** A new random identity (src/lib/random.ts), for a key used once (a payment link's). */
export function randomNostrKeys(): NostrKeys {
  // An invalid key has odds below 2^-127.
  return nostrKeys(secureRandomBytes(32));
}

/**
 * A key derived from `secret` for one use (HKDF-SHA256, RFC 5869): `salt` names the domain of the
 * keys (one per feature), `info` the use. Never change either once released: every key derived
 * from them, and what they open or sign, would be lost.
 */
export function deriveKey(
  secret: Uint8Array,
  salt: string,
  info: string,
  length: number = 32
): Uint8Array {
  return hkdf(sha256, secret, utf8ToBytes(salt), utf8ToBytes(info), length);
}
