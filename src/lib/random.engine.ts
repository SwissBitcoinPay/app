import { engineHost } from "./engine/host";
import { uuidV4 } from "./uuid";

/**
 * random.ts in the iOS notification service extension's JavaScript engine (src/lib/engine/): the
 * same API, its bytes from the extension's `SecRandomCopyBytes` (the engine's host,
 * plugins/card-notification-extension/ios/EngineHost.swift). The extension has no expo-crypto.
 */
export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length > 65_536) {
    throw new Error("Invalid length of random bytes");
  }
  const given = engineHost().random(length);
  if (given.length !== length) throw new Error("No secure random source");
  const bytes = Uint8Array.from(given);
  // As random.ts: 16 zero bytes or more from a working source have odds of 2^-128 or less.
  if (length >= 16 && bytes.every((byte) => byte === 0)) {
    throw new Error("No secure random source");
  }
  return bytes;
}

/** A random UUID version 4 (RFC 9562), from secureRandomBytes. */
export function randomUuid(): string {
  return uuidV4(secureRandomBytes(16));
}
