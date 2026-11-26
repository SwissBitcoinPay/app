import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { publishToQuorum, publishToRelays, queryRelays } from "@/lib/nostr/pool";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord
} from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";
import { secureRandomBytes } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";
import { unionRelays } from "@/lib/relays/list";

/*
 * Images on Nostr: the business's logo and the employees' photos, each
 * one sealed record (src/lib/nostr/record.ts) on the relays, like the app's other data. What names
 * an image is its reference (`ImageRef`): a random key, from which its address, its author and its
 * encryption key derive, and the SHA-256 of its bytes. Whoever holds the reference (the owner's
 * settings, an employee's channel, a member's profile) reads the image; the relays see an opaque
 * address, a key used for nothing else, and a size.
 *
 * The author derives from the key, so that any holder of the reference can publish the image
 * again (to new relays, after a change of list) without keeping a secret of its own; holding it,
 * one could also publish other bytes at its address, which readers refuse: the bytes must have the
 * reference's hash. An image never changes: a new one gets a new reference. The old one stays on
 * the relays (no relay guarantees a deletion, NIP-09).
 */

/** What the record is (record.ts). */
const RECORD_TYPE = "image";

/** Format of the record's value. */
const IMAGE_VERSION = 1;

/** Domain of the keys an image's key gives (src/lib/nostr/keys.ts). Never change it. */
const IMAGE_SALT = "sattle.me/image";

/** Prefix of the hash that gives an image's address. Never change it. */
const ADDRESS_PREFIX = utf8ToBytes("sattle.me/image/address/v1");

/** The only format written and read: JPEG, which every platform decodes and draws. */
export const IMAGE_MIME = "image/jpeg";

/**
 * Largest image a record holds, in bytes, written and read: its record (base64 in JSON, padded,
 * NIP-44, base64 again) stays near 55 KB, under the 64 KB strfry takes by default for an event
 * (`maxEventSize`, not checked against the relays' live configuration). Measured:
 * 30 000 bytes make an event of 55 113 bytes, 32 000 one of 66 037. An article's photo goes up to
 * it (512 px when it fits, src/features/media/pick-image.ts).
 */
export const MAX_IMAGE_BYTES = 30_000;

/**
 * Largest logo or person's photo written: older apps read them and refuse an image over 24 000
 * bytes (their MAX_IMAGE_BYTES). A 256 px square JPEG fits.
 */
export const MAX_AVATAR_BYTES = 24_000;

/** Plaintexts are padded to multiples of this: the size tells little of the image. */
const BLOCK = 4096;

/** Per relay, connection included. */
export const IMAGE_TIMEOUT_MS = 10_000;

/** An image as the records that show it name it. */
export type ImageRef = {
  /** Hex, 32 bytes: its address, author and encryption key derive from it. */
  key: string;
  /** Hex: the SHA-256 of its bytes. */
  hash: string;
};

const HEX_32 = /^[0-9a-f]{64}$/;

export function parseImageRef(value: unknown): ImageRef | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || !HEX_32.test(v.key)) return null;
  if (typeof v.hash !== "string" || !HEX_32.test(v.hash)) return null;
  return { key: v.key, hash: v.hash };
}

/** An optional reference: null, or a valid one (undefined: not a valid value). */
export function parseOptionalImageRef(value: unknown): ImageRef | null | undefined {
  if (value === null) return null;
  return parseImageRef(value) ?? undefined;
}

export function sameImageRef(a: ImageRef | null, b: ImageRef | null): boolean {
  return a === b || (a !== null && b !== null && a.key === b.key && a.hash === b.hash);
}

type ImageKeys = { nostr: NostrKeys; encryptionKey: Uint8Array; address: string };

function imageKeys(ref: ImageRef): ImageKeys {
  const key = hexToBytes(ref.key);
  return {
    nostr: nostrKeys(deriveKey(key, IMAGE_SALT, "nostr-secret-key/v1")),
    encryptionKey: deriveKey(key, IMAGE_SALT, "encryption-key/v1"),
    address: bytesToHex(sha256(concatBytes(ADDRESS_PREFIX, key)))
  };
}

/** The author of `ref`'s record: only a holder of the reference signs as it ("Delete account"). */
export function imageAuthor(ref: ImageRef): NostrKeys {
  return imageKeys(ref).nostr;
}

/** Where relays hold `ref`'s record: its author's, at its address. */
export function imageFilter(ref: ImageRef): RelayFilter {
  const keys = imageKeys(ref);
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey], "#d": [keys.address] };
}

type ImageValue = { version: typeof IMAGE_VERSION; mime: typeof IMAGE_MIME; data: string };

/** The image's record and its reference, for `bytes` (a JPEG of MAX_IMAGE_BYTES at most). */
export function createImage(
  bytes: Uint8Array,
  createdAt: number
): { ref: ImageRef; event: NostrEvent } {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image too large");
  const ref: ImageRef = {
    key: bytesToHex(secureRandomBytes(32)),
    hash: bytesToHex(sha256(bytes))
  };
  const keys = imageKeys(ref);
  const value: ImageValue = {
    version: IMAGE_VERSION,
    mime: IMAGE_MIME,
    data: bytesToBase64(bytes)
  };
  const event = sealRecord({
    type: RECORD_TYPE,
    value,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: keys.address,
    createdAt,
    block: BLOCK
  });
  return { ref, event };
}

function parseImageValue(value: unknown, ref: ImageRef): Uint8Array | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > IMAGE_VERSION) throw new NewerRecordError();
  if (v.version !== IMAGE_VERSION || v.mime !== IMAGE_MIME || typeof v.data !== "string") {
    return null;
  }
  const bytes = base64ToBytes(v.data);
  if (!bytes || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  return bytesToHex(sha256(bytes)) === ref.hash ? bytes : null;
}

export type ImageLookup =
  | { status: "found"; bytes: Uint8Array; event: NostrEvent; holders: string[] }
  /** A majority of the relays answered, none with the image. */
  | { status: "notFound" }
  /** Fewer than a majority answered in time, none with the image. */
  | { status: "unreachable" };

/**
 * The image `ref` names, from `relays`, read until a majority answered (every image is published to
 * a majority, publishImageToMajority): the bytes of the reference's hash only. Found from any valid
 * copy (an image never changes); not found only once a majority answered without one. Never
 * rejects.
 */
export async function fetchImage(
  ref: ImageRef,
  relays: readonly string[] = currentRelays()
): Promise<ImageLookup> {
  const keys = imageKeys(ref);
  const answers = await queryRelays(
    imageFilter(ref),
    // As its author, whose key the reference gives: a relay may give an author's events to that
    // author only (NIP-42).
    { channel: "account", relays, timeoutMs: IMAGE_TIMEOUT_MS, authKey: keys.nostr.secretKey },
    { quorum: "majority" }
  );
  if (answers.size === 0) return { status: "unreachable" };
  const { newest, copies } = newestRecord(answers, (value) =>
    openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: keys.address,
      author: keys.nostr.publicKey,
      parse: (payload) => parseImageValue(payload, ref)
    })
  );
  if (!newest) {
    return { status: answers.size >= majority(relays.length) ? "notFound" : "unreachable" };
  }
  // Any valid copy will do: the bytes are the reference's.
  const holders = [...copies].filter(([, held]) => held !== null).map(([relay]) => relay);
  return { status: "found", bytes: newest.value, event: newest.event, holders };
}

/**
 * Publishes an image's record to `relays`, as `ref`'s author. Resolves with those that took it once
 * a majority did, or could not (the others go on in the background).
 */
export function publishImage(
  event: NostrEvent,
  ref: ImageRef,
  relays: readonly string[] = currentRelays()
): Promise<string[]> {
  return publishToRelays(event, imageCall(ref, relays), { quorum: "majority" });
}

/**
 * Publishes an image's record to `relays`, as `ref`'s author. Resolves once a majority of them took
 * it, rejects as soon as they no longer can: an article's photo is saved with the article, on a
 * majority of the relays, and a logo or an employee's photo with "Settings" (once a majority of
 * the relays took it).
 */
export function publishImageToMajority(
  event: NostrEvent,
  ref: ImageRef,
  relays: readonly string[]
): Promise<void> {
  return publishToQuorum(event, imageCall(ref, relays), majority(relays.length));
}

function imageCall(ref: ImageRef, relays: readonly string[]) {
  return {
    channel: "account" as const,
    relays,
    timeoutMs: IMAGE_TIMEOUT_MS,
    authKey: imageKeys(ref).nostr.secretKey
  };
}

/**
 * Relays whose last read of an image (copyImageTo) got no answer: asked last by the next copies,
 * so that a relay out of reach does not cost every image of a catalogue its timeout. Forgotten as
 * soon as such a relay answers again.
 */
const unanswered = new Set<string>();

/**
 * Makes sure the relays of `relays` hold the image `ref` names, read there or on `from` (the relays
 * it was on before a change of list) and given as it is to the others. Downloaded once (read on
 * every relay at once, each photo of a catalogue would come once per relay holding it, 55 KB at
 * the most): the relays are asked one after the other, `relays` first, those that
 * gave no answer lately last, until one gives a valid copy. Any copy will do, an image never
 * changes: its bytes are the reference's. It then goes to every relay of `relays` but that one: a
 * relay asked before answered without it, one not asked takes it again as it is ("duplicate").
 * Resolves with whether it was found. Never rejects.
 */
export async function copyImageTo(
  ref: ImageRef,
  relays: readonly string[],
  from: readonly string[] = []
): Promise<boolean> {
  try {
    const asked = unionRelays(relays, from);
    const order = [
      ...asked.filter((relay) => !unanswered.has(relay)),
      ...asked.filter((relay) => unanswered.has(relay))
    ];
    for (const relay of order) {
      const found = await fetchImage(ref, [relay]);
      if (found.status === "unreachable") {
        unanswered.add(relay);
        continue;
      }
      unanswered.delete(relay);
      if (found.status !== "found") continue;
      const lacking = relays.filter((target) => target !== relay);
      if (lacking.length > 0) await publishImage(found.event, ref, lacking);
      return true;
    }
    return false;
  } catch (error) {
    logFailure("Copying an image to the relays failed", error);
    return false;
  }
}
