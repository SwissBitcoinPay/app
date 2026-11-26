import { utf8ToBytes } from "@noble/hashes/utils.js";

import { logFailure } from "@/lib/log/log";
import { epochKeysOf, type EpochSeal } from "./epochs";
import { isValidEvent, signEvent, type NostrEvent } from "./event";
import { UnknownNip44VersionError, nip44Decrypt, nip44Encrypt } from "./nip44";

/*
 * Sealed records: the app's data on Nostr relays, one addressable event each (as the settings
 * backups). Encrypted, signed, and shaped like
 * any client's private data, so that a relay cannot tell them from other apps' events:
 * - kind 30078 (NIP-78, arbitrary app data), which the app's relays keep for years;
 * - an opaque `d` tag (a hash or a key derivative), never a readable name;
 * - NIP-44 v2 content, its plaintext padded with spaces to a multiple of `block` bytes, so that
 *   its size only tells the record's rough size;
 * - an `expiration` tag (NIP-40) for records that end.
 *
 * Inside, the plaintext names what the record is (`t`, checked when it is opened) next to its
 * value (`v`): a record opened with the key of another use is refused.
 *
 * A record of an export epoch (src/lib/team/export-epoch.ts) is
 * sealed twice: its plaintext with the key of its epoch, and that, as the value of an envelope
 * (`{version: EPOCH_ENVELOPE_VERSION, epoch, sealed}`), with the record's own key, as before any
 * epoch. Whoever holds only the record's own key (a copy of a withdrawn export grant) opens the
 * envelope, never what it seals; an app from before epochs reads a version above its own, a record
 * of a newer format, and never writes over it (every reader of these records throws
 * NewerRecordError for a version above its own). Its event looks like any other record.
 */

/** NIP-78: arbitrary app data, addressable (one per author and `d` tag). */
export const RECORD_KIND = 30078;

/**
 * The `version` of an epoch's envelope (sealRecord's `epoch`): above every version a record's value
 * has or will have, so that an app from before epochs takes the envelope for a record of a newer
 * format. IRREVERSIBLE: written in the records (sattleme/mcp-server opens them).
 */
export const EPOCH_ENVELOPE_VERSION = 1_000_000;

/**
 * A record written by a newer version of the app (a format, or a version of its value, that this
 * one cannot read): never write over it, it would be lost.
 */
export class NewerRecordError extends Error {
  constructor() {
    super("Record of a newer format");
    this.name = "NewerRecordError";
  }
}

export type SealOptions = {
  /** What the record is: checked when it is opened. */
  type: string;
  /** Its value: JSON. */
  value: unknown;
  /** Signs the event: its `pubkey` is this key's. */
  signer: Uint8Array;
  /** NIP-44 conversation key (32 bytes). */
  encryptionKey: Uint8Array;
  /** The `d` tag. */
  address: string;
  /** Unix seconds: `created_at`. Relays keep the latest event of an address. */
  createdAt: number;
  /** Unix seconds after which relays drop the record (NIP-40). */
  expiresAt?: number;
  /** More tags, after the `d` tag: opaque ones a reader filters by (an integration's witnesses). */
  tags?: readonly (readonly [string, string])[];
  /** The plaintext is padded to a multiple of this many bytes. */
  block?: number;
  /**
   * The export epoch to seal the record at (epochSealFor of epochs.ts, with `encryptionKey` the
   * record's own key): its plaintext sealed with the epoch's key, inside an envelope sealed with
   * `encryptionKey`. Null or absent: sealed with `encryptionKey` alone, as before any epoch.
   */
  epoch?: EpochSeal | null;
};

const DEFAULT_BLOCK = 256;

/**
 * The largest plaintext of a record sealed at an epoch that stays, sealed twice, under the 64 kB
 * strfry takes by default (sealRecord's `epoch`): a NIP-44 payload is its plaintext padded by up to
 * an eighth, then a third more as base64, twice (28 000 bytes make about 55 kB). The records cut in
 * parts (archive.ts, history-records.ts) cut them at this size when they seal at an epoch.
 */
export const EPOCH_PART_BYTES = 28_000;

/**
 * The largest event a relay takes, as the app counts it (its JSON, UTF-8): a record sealed at an
 * epoch above it is sealed without (sealWithinRelays).
 */
const MAX_EVENT_BYTES = 60_000;

/**
 * `options` sealed at their epoch, or without it when the record would then exceed what a relay
 * takes: a part written before epochs, cut at 40 000 bytes, signed again as it is. What it holds
 * was readable with its own key already; a part written at an epoch is cut to fit
 * (EPOCH_PART_BYTES).
 */
export function sealWithinRelays(options: SealOptions): NostrEvent {
  const event = sealRecord(options);
  if (!options.epoch || utf8ToBytes(JSON.stringify(event)).length <= MAX_EVENT_BYTES) return event;
  logFailure("A record too long to seal at its export epoch was sealed as before");
  return sealRecord({ ...options, epoch: null });
}

/** `text` padded with spaces to a multiple of `block` bytes: ignored when it is parsed. */
function padded(text: string, block: number): string {
  const length = utf8ToBytes(text).length;
  return text + " ".repeat(Math.ceil(length / block) * block - length);
}

/** The signed event of a record. Encryption and signature are randomized. */
export function sealRecord({
  type,
  value,
  signer,
  encryptionKey,
  address,
  createdAt,
  expiresAt,
  tags: more = [],
  block = DEFAULT_BLOCK,
  epoch = null
}: SealOptions): NostrEvent {
  let text = JSON.stringify({ t: type, v: value });
  if (epoch) {
    if (!Number.isSafeInteger(epoch.epoch) || epoch.epoch < 1) throw new Error("Invalid epoch");
    const sealed = nip44Encrypt(padded(text, block), epoch.key);
    text = JSON.stringify({
      t: type,
      v: { version: EPOCH_ENVELOPE_VERSION, epoch: epoch.epoch, sealed }
    });
  }
  const tags = [["d", address], ...more.map(([name, value]) => [name, value])];
  if (expiresAt !== undefined) tags.push(["expiration", String(expiresAt)]);
  return signEvent(
    {
      kind: RECORD_KIND,
      created_at: createdAt,
      tags,
      content: nip44Encrypt(padded(text, block), encryptionKey)
    },
    signer
  );
}

export type OpenOptions<T> = {
  /**
   * The record's type, or the types it may be (records of one author and key, told apart by their
   * type only: opened once, whichever it is, `parse` told which).
   */
  type: string | readonly string[];
  encryptionKey: Uint8Array;
  /**
   * The `d` tag the event must have (one of them), or a check of it: records listed by author
   * have addresses the reader cannot tell in advance (their value can be checked against it).
   */
  address: string | readonly string[] | ((address: string) => boolean);
  /**
   * The author the event must have, or a check of its public key: an event of another author is
   * dropped before its signature is checked.
   */
  author?: string | ((publicKey: string) => boolean);
  /**
   * The record's value, validated (null when invalid), of the type `type`. May throw
   * NewerRecordError for a value of a newer version.
   */
  parse: (value: unknown, event: NostrEvent, type: string) => T | null;
  /**
   * A content of a newer NIP-44 version is no record (null), rather than one of a newer format:
   * for records anybody may write at their `d` tag, where only a value of a newer version, which
   * the record's key seals, is of a newer format (checkout-spec SPEC.md §31, "Opening a lease").
   */
  newerContentIgnored?: boolean;
  /**
   * The key of an export epoch an envelope names (sealRecord's `epoch`), null when the reader has
   * none: the record is then one it cannot read (`newer`), never written over. Absent: the keys of
   * the holders registered on this device (epochKeysOf of epochs.ts), tried in turn.
   */
  epochKey?: (epoch: number) => Uint8Array | null;
};

export type OpenedRecord<T> =
  | { status: "ok"; event: NostrEvent; value: T }
  /** Authentic, but of a newer format: see NewerRecordError. */
  | { status: "newer"; event: NostrEvent };

/**
 * What a relay sent, if it is a record of `options`: kind, author, `d` tag and signature, then a
 * content that opens with the key and holds a valid value of the type. Anything else is null: a
 * relay is never trusted, a damaged copy is ignored. The cheap checks come first (kind, author,
 * `d` tag, then the content's key and type), the signature last, before anything is returned
 * (the owner reads thousands of an employee's records for its links, where a signature checked
 * first for each costs seconds on the device).
 */
export function openRecord<T>(value: unknown, options: OpenOptions<T>): OpenedRecord<T> | null {
  const claimed = value as Partial<NostrEvent> | null | undefined;
  const { author, address } = options;
  const isAddress =
    typeof address === "function"
      ? address
      : (tag: string) => (typeof address === "string" ? tag === address : address.includes(tag));
  if (
    claimed?.kind !== RECORD_KIND ||
    typeof claimed.pubkey !== "string" ||
    typeof claimed.content !== "string" ||
    !Array.isArray(claimed.tags) ||
    (typeof author === "string" ? claimed.pubkey !== author : author && !author(claimed.pubkey)) ||
    !claimed.tags.some(
      (tag) =>
        Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string" && isAddress(tag[1])
    )
  ) {
    return null;
  }
  let content: Content | null = null;
  let newer = false;
  try {
    content = readContent(claimed.content, options);
  } catch (error) {
    if (!(error instanceof NewerRecordError)) return null;
    newer = true;
  }
  // Not a record of this key and type: no signature to check.
  if (!newer && content === null) return null;
  if (!isValidEvent(value)) return null;
  if (newer || content === null) return { status: "newer", event: value };
  try {
    const parsed = options.parse(content.value, value, content.type);
    return parsed === null ? null : { status: "ok", event: value, value: parsed };
  } catch (error) {
    return error instanceof NewerRecordError ? { status: "newer", event: value } : null;
  }
}

/** A record's content, opened: its type and its value. */
type Content = { type: string; value: unknown };

/** The value inside a record's content; null when it does not open or is of another type. */
function readContent(content: string, options: OpenOptions<unknown>): Content | null {
  let text: string;
  try {
    text = nip44Decrypt(content, options.encryptionKey);
  } catch (error) {
    if (error instanceof UnknownNip44VersionError && !options.newerContentIgnored) {
      throw new NewerRecordError();
    }
    return null;
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return null;
  }
  if (envelope === null || typeof envelope !== "object" || !("v" in envelope)) return null;
  const { t, v } = envelope as { t?: unknown; v: unknown };
  const types: readonly string[] = typeof options.type === "string" ? [options.type] : options.type;
  if (typeof t !== "string" || !types.includes(t)) return null;
  return isEpochEnvelope(v) ? openEnvelope(v, t, options) : { type: t, value: v };
}

/** An epoch's envelope (sealRecord's `epoch`). */
type EpochEnvelope = { version: typeof EPOCH_ENVELOPE_VERSION; epoch: unknown; sealed: unknown };

function isEpochEnvelope(value: unknown): value is EpochEnvelope {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === EPOCH_ENVELOPE_VERSION
  );
}

/**
 * What an envelope of type `type` seals, opened with the key of its epoch: null when it is not a
 * whole envelope; NewerRecordError when the reader has no key of that epoch that opens it (never
 * written over: a key of another account's epoch, which a holder of this device gives, is no proof
 * that the record is invalid; its signature, checked after, proves its author).
 */
function openEnvelope(
  envelope: EpochEnvelope,
  type: string,
  options: OpenOptions<unknown>
): Content | null {
  const { epoch, sealed } = envelope;
  if (!Number.isSafeInteger(epoch) || (epoch as number) < 1 || typeof sealed !== "string") {
    return null;
  }
  const given = options.epochKey?.(epoch as number);
  const keys = options.epochKey
    ? given
      ? [given]
      : []
    : epochKeysOf(epoch as number, options.encryptionKey);
  if (keys.length === 0) throw new NewerRecordError();
  let text: string | null = null;
  for (const key of keys) {
    try {
      text = nip44Decrypt(sealed, key);
      break;
    } catch (error) {
      if (error instanceof UnknownNip44VersionError) throw new NewerRecordError();
    }
  }
  if (text === null) throw new NewerRecordError();
  let inner: unknown;
  try {
    inner = JSON.parse(text);
  } catch {
    return null;
  }
  if (inner === null || typeof inner !== "object" || !("v" in inner)) return null;
  const { t, v } = inner as { t?: unknown; v: unknown };
  // The type sealed inside is the envelope's: a record of another family never passes for it.
  if (t !== type || isEpochEnvelope(v)) return null;
  return { type, value: v };
}

/**
 * The date of a record this device signs at `address`: `createdAt`, or later, after the newest one
 * it signed there (`signed`, by address, which it then records). A write returns once a majority
 * took it (or cannot), and a slower relay may take it afterwards: a record of the same date would
 * then tie with it there, and the relays keep the lowest id (NIP-01, newestRecord), not the last.
 */
export function signedAt(signed: Map<string, number>, address: string, createdAt: number): number {
  const at = Math.max(createdAt, (signed.get(address) ?? -1) + 1);
  signed.set(address, at);
  return at;
}

/** The newest of the records relays sent, and what each relay holds. */
export type NewestRecord<T> = {
  /** The newest readable copy, null when none. */
  newest: { event: NostrEvent; value: T } | null;
  /** `created_at` of the newest copy of a newer format, null when none. */
  newestUnreadable: number | null;
  /** The relays that answered, each with the `created_at` of its newest readable copy (null: none). */
  copies: Map<string, number | null>;
};

/**
 * Reads the answers of `queryRelays`: every copy is checked with `open` (identical copies once),
 * the newest by `created_at` wins (on a tie, the lowest event id: the one relays keep, NIP-01).
 */
export function newestRecord<T>(
  answers: Map<string, unknown[]>,
  open: (value: unknown) => OpenedRecord<T> | null
): NewestRecord<T> {
  // One event goes to every relay: identical copies are checked (signature, decryption) once.
  // Keyed by the whole copy, so that an altered one is checked on its own.
  const checked = new Map<string, OpenedRecord<T> | null>();
  const read = (value: unknown) => {
    const key = JSON.stringify(value) ?? "";
    let copy = checked.get(key);
    if (copy === undefined) {
      copy = open(value);
      checked.set(key, copy);
    }
    return copy;
  };
  let newest: NewestRecord<T>["newest"] = null;
  let newestUnreadable: number | null = null;
  const copies = new Map<string, number | null>();
  for (const [relay, events] of answers) {
    let held: number | null = null;
    for (const value of events) {
      const copy = read(value);
      if (!copy) continue;
      const createdAt = copy.event.created_at;
      if (copy.status === "newer") {
        newestUnreadable = Math.max(newestUnreadable ?? -1, createdAt);
        continue;
      }
      held = Math.max(held ?? -1, createdAt);
      if (
        !newest ||
        createdAt > newest.event.created_at ||
        (createdAt === newest.event.created_at && copy.event.id < newest.event.id)
      ) {
        newest = { event: copy.event, value: copy.value };
      }
    }
    copies.set(relay, held);
  }
  return { newest, newestUnreadable, copies };
}
