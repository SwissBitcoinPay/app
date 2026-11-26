import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import type { NostrEvent } from "@/lib/nostr/event";
import { deriveKey, nostrKeys, type NostrKeys } from "@/lib/nostr/keys";
import { copyEveryEvent, publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";

import { isUnixSeconds } from "./shared";

/*
 * The export epochs. An assistant's
 * export grant (src/lib/assistant/export-grant.ts) gives the reading keys of the account's records:
 * whoever copied them while the grant was allowed read, before epochs, every record written after
 * the grant was withdrawn too, those keys being derived once for all from the team's root. So, each
 * time a grant ends (withdrawn, or its assistant removed), the account enters a new epoch: the
 * records a grant reads are sealed from then on with keys of that epoch (record.ts, an envelope
 * their former key opens), which the grants still allowed get and the one withdrawn never had.
 * What a copy read before stays readable to it: an epoch protects what is written after it.
 *
 * - The seed of epoch n (1 ≤ n ≤ MAX_EXPORT_EPOCH) comes from the secret the owner's devices share
 *   (ownerDevicesSecret, which till mode keeps): the seed of MAX_EXPORT_EPOCH first, then each
 *   epoch's seed is a hash of the next one's (exportEpochSeed). Whoever holds the seed of epoch n
 *   (a grant written at that epoch) computes those of the epochs before it, never of one after.
 * - A record's key at epoch n: from the seed and the record's own key, its family's
 *   (exportEpochKey). An employee's channel gives it the keys of its own records only.
 * - The registry's reading key at epoch n (exportEpochReader): the registry's declarations are
 *   sealed for it inside, for the reading key of before outside (src/lib/registry/registry.ts).
 * - The epoch itself: a record of the owner's devices on the account's relays (exportEpochEvent),
 *   signed and sealed with keys of the shared secret, so that till mode reads it. An epoch is only
 *   ever raised, the highest one any copy names counts.
 *
 * IRREVERSIBLE once released: the salt, the hash's prefix, MAX_EXPORT_EPOCH, the `info` strings,
 * the record's type, address and format (export-epoch.test.ts locks them with vectors);
 * sattleme/mcp-server derives the same keys from a grant's seed.
 */

/** Domain of the export epochs' keys. */
const SALT = "sattle.me/export-epoch";

/** Prefix of the hash that gives an epoch's seed from the next one's. */
const PREVIOUS_PREFIX = utf8ToBytes("sattle.me/export-epoch/previous/v1");

/**
 * The highest epoch: the seeds hash down from it. One epoch per grant ended: far more than an
 * account ends; at it, a grant that ends raises no epoch (raiseExportEpoch refuses).
 */
export const MAX_EXPORT_EPOCH = 10_000;

const RECORD_TYPE = "export-epoch";

/** 1: the first format. */
const EPOCH_RECORD_VERSION = 1;

/** Per relay, connection included. */
export const EXPORT_EPOCH_TIMEOUT_MS = 10_000;

export function isExportEpoch(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_EXPORT_EPOCH
  );
}

/** The seed of MAX_EXPORT_EPOCH: every other seed hashes down from it. */
function topSeed(shared: Uint8Array): Uint8Array {
  return deriveKey(shared, SALT, "seed/top/v1");
}

/** The seed of the epoch before the one of `seed`. */
export function previousSeed(seed: Uint8Array): Uint8Array {
  return sha256(concatBytes(PREVIOUS_PREFIX, seed));
}

/** The seed of `to` (≤ `from`) from the seed of `from`. */
export function seedDownTo(seed: Uint8Array, from: number, to: number): Uint8Array {
  if (!isExportEpoch(from) || !isExportEpoch(to) || to < 1 || to > from) {
    throw new Error("Invalid export epoch");
  }
  let current = seed;
  for (let epoch = from; epoch > to; epoch -= 1) current = previousSeed(current);
  return current;
}

/** The seed of export epoch `epoch` (1 to MAX_EXPORT_EPOCH), from the owner's devices' secret. */
export function exportEpochSeed(shared: Uint8Array, epoch: number): Uint8Array {
  if (!isExportEpoch(epoch) || epoch < 1) throw new Error("Invalid export epoch");
  return seedDownTo(topSeed(shared), MAX_EXPORT_EPOCH, epoch);
}

/** A record's key at the epoch of `seed`: the record's own key (`base`) gives its family. */
export function exportEpochKey(seed: Uint8Array, base: Uint8Array): Uint8Array {
  return deriveKey(seed, SALT, `record-key/v1/${bytesToHex(base)}`);
}

/** The registry's reading key at the epoch of `seed`. */
export function exportEpochReader(seed: Uint8Array): NostrKeys {
  return nostrKeys(deriveKey(seed, SALT, "registry-reader/v1"));
}

/**
 * The seeds of the epochs up to the one they start from (the shared secret gives every epoch's, a
 * grant's seed those up to its epoch), each computed once: the hashes from MAX_EXPORT_EPOCH down
 * are many (exportEpochSeed).
 */
export class EpochSeeds {
  /** The seeds computed, by epoch: each other one hashes down from the closest one above it. */
  private readonly seeds = new Map<number, Uint8Array>();
  /** The highest epoch these seeds give. */
  readonly highest: number;

  constructor(source: { shared: Uint8Array } | { epoch: number; seed: Uint8Array }) {
    const [epoch, seed] =
      "shared" in source ? [MAX_EXPORT_EPOCH, topSeed(source.shared)] : [source.epoch, source.seed];
    if (!isExportEpoch(epoch) || epoch < 1) throw new Error("Invalid export epoch");
    this.highest = epoch;
    this.seeds.set(epoch, seed);
  }

  /** The seed of `epoch`, null when it is not between 1 and `highest`. */
  seedOf(epoch: number): Uint8Array | null {
    if (!isExportEpoch(epoch) || epoch < 1 || epoch > this.highest) return null;
    const known = this.seeds.get(epoch);
    if (known) return known;
    let from = this.highest;
    for (const computed of this.seeds.keys())
      if (computed > epoch && computed < from) from = computed;
    const seed = seedDownTo(this.seeds.get(from)!, from, epoch);
    this.seeds.set(epoch, seed);
    return seed;
  }

  /** A record's key of `epoch` for the family `base`; null as seedOf. */
  keyOf(epoch: number, base: Uint8Array): Uint8Array | null {
    const seed = this.seedOf(epoch);
    return seed ? exportEpochKey(seed, base) : null;
  }

  /** The registry's reading key of `epoch`; null as seedOf. */
  readerOf(epoch: number): NostrKeys | null {
    const seed = this.seedOf(epoch);
    return seed ? exportEpochReader(seed) : null;
  }
}

/** The keys of the epoch's record, from the shared secret. */
function epochRecordKeys(shared: Uint8Array): {
  nostr: NostrKeys;
  encryptionKey: Uint8Array;
  address: string;
} {
  return {
    nostr: nostrKeys(deriveKey(shared, SALT, "epoch-record/author/v1")),
    encryptionKey: deriveKey(shared, SALT, "epoch-record/encryption-key/v1"),
    address: bytesToHex(deriveKey(shared, SALT, "epoch-record/address/v1"))
  };
}

/**
 * What the record says: the account's epoch, raised at `raisedAt` (kept when the record is signed
 * again), the record dated `updatedAt`.
 */
export type ExportEpochValue = { epoch: number; raisedAt: number; updatedAt: number };

function parseEpochRecord(value: unknown, event: NostrEvent): ExportEpochValue | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > EPOCH_RECORD_VERSION) {
    throw new NewerRecordError();
  }
  if (v.version !== EPOCH_RECORD_VERSION || !isExportEpoch(v.epoch) || v.epoch < 1) return null;
  if (!isUnixSeconds(v.updatedAt) || v.updatedAt !== event.created_at) return null;
  if (!isUnixSeconds(v.raisedAt) || v.raisedAt > v.updatedAt) return null;
  return { epoch: v.epoch, raisedAt: v.raisedAt, updatedAt: v.updatedAt };
}

/** The signed record of `epoch` raised at `raisedAt` (`updatedAt` when absent), dated `updatedAt`. */
export function exportEpochEvent(
  shared: Uint8Array,
  epoch: number,
  updatedAt: number,
  raisedAt: number = updatedAt
): NostrEvent {
  if (!isExportEpoch(epoch) || epoch < 1) throw new Error("Invalid export epoch");
  const keys = epochRecordKeys(shared);
  return sealRecord({
    type: RECORD_TYPE,
    value: { version: EPOCH_RECORD_VERSION, epoch, raisedAt, updatedAt },
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: keys.address,
    createdAt: updatedAt
  });
}

/** What the relays told of the account's epoch. */
export type EpochReading =
  /**
   * A majority of the relays answered: `epoch` is the highest any copy names (0 without one),
   * `raisedAt` when it was raised (-1 without one), `latest` the date of the newest copy (-1).
   */
  | { status: "read"; epoch: number; raisedAt: number; latest: number }
  /** A copy of a newer format: never written over. The rest as "read", of the copies readable. */
  | { status: "newer"; epoch: number; raisedAt: number; latest: number }
  /** Fewer than a majority answered: `epoch` is the highest those that did named (0: none). */
  | { status: "unread"; epoch: number };

/** The account's epoch on `relays`, as the relays that answered hold it. Never rejects. */
export async function readExportEpoch(
  shared: Uint8Array,
  relays: readonly string[],
  timeoutMs: number = EXPORT_EPOCH_TIMEOUT_MS
): Promise<EpochReading> {
  const keys = epochRecordKeys(shared);
  let answers: Map<string, unknown[]>;
  try {
    answers = await queryRelays(
      { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey], "#d": [keys.address] },
      // A relay that serves its author only (NIP-42) gets the record's own author.
      { channel: "account", relays, timeoutMs, authKey: () => keys.nostr.secretKey },
      { quorum: "majority" }
    );
  } catch {
    return { status: "unread", epoch: 0 };
  }
  let epoch = 0;
  let latest = -1;
  let raisedAt = -1;
  let newer = false;
  for (const events of answers.values()) {
    for (const value of events) {
      const opened = openRecord(value, {
        type: RECORD_TYPE,
        encryptionKey: keys.encryptionKey,
        address: keys.address,
        author: keys.nostr.publicKey,
        parse: parseEpochRecord
      });
      if (!opened) continue;
      latest = Math.max(latest, opened.event.created_at);
      if (opened.status === "newer") newer = true;
      else if (
        opened.value.epoch > epoch ||
        (opened.value.epoch === epoch && opened.value.raisedAt > raisedAt)
      ) {
        epoch = opened.value.epoch;
        raisedAt = opened.value.raisedAt;
      }
    }
  }
  if (answers.size < majority(relays.length)) return { status: "unread", epoch };
  return { status: newer ? "newer" : "read", epoch, raisedAt, latest };
}

/** Why raiseExportEpoch did not raise the epoch. */
export class ExportEpochError extends Error {
  constructor(
    readonly reason: "unreachable" | "newer" | "exhausted",
    message: string
  ) {
    super(message);
    this.name = "ExportEpochError";
  }
}

/**
 * Raises the account's epoch on `relays`, once a grant ends: the highest epoch a majority holds,
 * plus one, published to a majority, dated `now` or later. Resolves with the new epoch and its
 * record's date; rejects with ExportEpochError
 * ("unreachable": no majority read or took it; "newer": a copy of a newer format; "exhausted": the
 * epoch is MAX_EXPORT_EPOCH already).
 */
export async function raiseExportEpoch(
  shared: Uint8Array,
  relays: readonly string[],
  now: number,
  timeoutMs: number = EXPORT_EPOCH_TIMEOUT_MS,
  /**
   * The highest epoch known otherwise (this device's, a grant's): raised above it too, so that an
   * epoch's keys never serve twice (relays that lost the record).
   */
  floor: number = 0
): Promise<{ epoch: number; at: number }> {
  const reading = await readExportEpoch(shared, relays, timeoutMs);
  if (reading.status === "unread") {
    throw new ExportEpochError("unreachable", "No majority of the relays gave the export epoch");
  }
  if (reading.status === "newer") {
    throw new ExportEpochError("newer", "The export epoch is of a newer format");
  }
  const highest = Math.max(reading.epoch, floor);
  if (highest >= MAX_EXPORT_EPOCH) {
    throw new ExportEpochError("exhausted", "No export epoch is left");
  }
  const epoch = highest + 1;
  const keys = epochRecordKeys(shared);
  const at = Math.max(now, reading.latest + 1);
  const event = exportEpochEvent(shared, epoch, at);
  const taken = await publishToRelays(
    event,
    { channel: "account", relays, timeoutMs, authKey: () => keys.nostr.secretKey },
    { quorum: "majority" }
  );
  if (taken.length < majority(relays.length)) {
    throw new ExportEpochError("unreachable", "No majority of the relays took the export epoch");
  }
  return { epoch, at };
}

/** The epoch's record is signed again once this old: relays drop old events. */
export const EPOCH_REFRESH_SECONDS = 30 * 24 * 60 * 60;

/**
 * Keeps the record of the account's epoch on `relays`: signed again, dated `now` or later, once its
 * newest copy is EPOCH_REFRESH_SECONDS old, or written at `known` (the highest epoch this device
 * learnt otherwise: one it raised, a grant's, an employee's channel's) when the relays hold a lower
 * one (they lost it), so that an epoch's keys never serve twice. Only from a majority's answers,
 * never over a copy of a newer format. Resolves with whether the relays hold it as they should.
 * Never rejects.
 */
export async function keepExportEpoch(
  shared: Uint8Array,
  relays: readonly string[],
  now: number,
  known: number,
  timeoutMs: number = EXPORT_EPOCH_TIMEOUT_MS
): Promise<boolean> {
  try {
    const reading = await readExportEpoch(shared, relays, timeoutMs);
    if (reading.status !== "read") return reading.status === "newer";
    const epoch = Math.max(reading.epoch, Math.min(known, MAX_EXPORT_EPOCH));
    if (epoch < 1) return true;
    if (reading.epoch >= epoch && now - reading.latest <= EPOCH_REFRESH_SECONDS) return true;
    const keys = epochRecordKeys(shared);
    const at = Math.max(now, reading.latest + 1);
    // Its raise's date kept; written back at an epoch the relays lost: raised now, as they tell.
    const raisedAt = reading.epoch === epoch ? reading.raisedAt : at;
    const event = exportEpochEvent(shared, epoch, at, raisedAt);
    const taken = await publishToRelays(
      event,
      { channel: "account", relays, timeoutMs, authKey: () => keys.nostr.secretKey },
      { quorum: "majority" }
    );
    return taken.length >= majority(relays.length);
  } catch {
    return false;
  }
}

/**
 * Copies the record of the account's epoch from the relays `from` to `to` (a change of the
 * account's relays), as it is: true once a majority of `from` answered and a majority of `to` holds
 * it (or none was found). Never rejects.
 */
export function copyExportEpoch(
  shared: Uint8Array,
  from: readonly string[],
  to: readonly string[],
  timeoutMs: number = EXPORT_EPOCH_TIMEOUT_MS
): Promise<boolean> {
  const keys = epochRecordKeys(shared);
  return copyEveryEvent(
    { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey], "#d": [keys.address] },
    { channel: "account", relays: from, timeoutMs, authKey: () => keys.nostr.secretKey },
    to
  );
}

/** The secret key signing the epoch's record (a relay's NIP-42 authentication, its erasure). */
export function exportEpochAuthor(shared: Uint8Array): NostrKeys {
  return epochRecordKeys(shared).nostr;
}
