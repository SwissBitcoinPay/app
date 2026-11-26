import { getRandomValues } from "expo-crypto";

import { uuidV4 } from "./uuid";

/**
 * Cryptographically secure random bytes (real randomness on every
 * platform), from expo-crypto's `getRandomValues`: `SecRandomCopyBytes` on iOS,
 * `java.security.SecureRandom` on Android, the browser's `crypto.getRandomValues` on the web.
 * Never Math.random, nor expo-crypto's `getRandomBytes` (it falls back to Math.random in
 * development), nor @noble's `randomBytes` (no global `crypto` in Hermes: it throws there).
 */
export function secureRandomBytes(length: number): Uint8Array {
  const bytes = getRandomValues(new Uint8Array(length));
  // A source that wrote nothing leaves zeros: 16 zero bytes or more from a working one have odds
  // of 2^-128 or less.
  if (length >= 16 && bytes.every((byte) => byte === 0)) {
    throw new Error("No secure random source");
  }
  return bytes;
}

/**
 * A random UUID version 4 (RFC 9562), from secureRandomBytes: the idempotency key of a payment
 * sent from the wallet (src/lib/breez/wallet.ts, `sendPrepared`).
 */
export function randomUuid(): string {
  return uuidV4(secureRandomBytes(16));
}
