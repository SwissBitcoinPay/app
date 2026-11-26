import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { secureRandomBytes } from "@/lib/random";
import { hasLoneSurrogate } from "@/lib/text";

/** A signed Nostr event (NIP-01). */
export type NostrEvent = {
  /** Hex SHA-256 of the serialized event. */
  id: string;
  /** Hex x-only public key of the author. */
  pubkey: string;
  /** Unix seconds. */
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  /** Hex BIP-340 signature of `id`. */
  sig: string;
};

export type EventTemplate = Pick<NostrEvent, "created_at" | "kind" | "tags" | "content">;

const HEX_32 = /^[0-9a-f]{64}$/;
const HEX_64 = /^[0-9a-f]{128}$/;

/** The event id: SHA-256 of the NIP-01 serialization. */
function eventHash(pubkey: string, { created_at, kind, tags, content }: EventTemplate) {
  return sha256(utf8ToBytes(JSON.stringify([0, pubkey, created_at, kind, tags, content])));
}

export function signEvent(template: EventTemplate, secretKey: Uint8Array): NostrEvent {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  const hash = eventHash(pubkey, template);
  return {
    ...template,
    id: bytesToHex(hash),
    pubkey,
    // Fresh auxiliary random data, as BIP-340 recommends (src/lib/random.ts).
    sig: bytesToHex(schnorr.sign(hash, secretKey, secureRandomBytes(32)))
  };
}

/**
 * Whether `value` is an event whose id and signature check out. Relays are never trusted. A string
 * of its content or tags holding a lone surrogate never checks out (checkout-spec SPEC.md §11): its
 * UTF-8, which the id hashes, does not exist (TextEncoder would hash U+FFFD in its place).
 */
export function isValidEvent(value: unknown): value is NostrEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== "string" ||
    !HEX_32.test(event.id) ||
    typeof event.pubkey !== "string" ||
    !HEX_32.test(event.pubkey) ||
    typeof event.sig !== "string" ||
    !HEX_64.test(event.sig) ||
    typeof event.created_at !== "number" ||
    !Number.isSafeInteger(event.created_at) ||
    typeof event.kind !== "number" ||
    !Number.isInteger(event.kind) ||
    typeof event.content !== "string" ||
    !Array.isArray(event.tags) ||
    !event.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"))
  ) {
    return false;
  }
  const valid = event as NostrEvent;
  if ([valid.content, ...valid.tags.flat()].some(hasLoneSurrogate)) return false;
  const hash = eventHash(valid.pubkey, valid);
  return (
    bytesToHex(hash) === valid.id &&
    schnorr.verify(hexToBytes(valid.sig), hash, hexToBytes(valid.pubkey))
  );
}
