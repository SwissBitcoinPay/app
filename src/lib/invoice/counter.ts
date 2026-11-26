import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { majority } from "@/config/registry";
import { MAX_NUMBER_JUMP, REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import { publishToQuorum, queryRelays, type RelayCall } from "@/lib/nostr/pool";
import { deriveKey } from "@/lib/nostr/keys";
import {
  NewerRecordError,
  RECORD_KIND,
  newestRecord,
  openRecord,
  sealRecord,
  type NewestRecord,
  type OpenedRecord
} from "@/lib/nostr/record";
import type { InvoiceKeys } from "@/lib/team/keys";

import type { InvoiceNumber } from "./record";

/*
 * The counter of the invoices' numbers: one sealed record on the account's
 * relays, written and read by the owner's devices only (the invoices' author). An invoice takes its
 * number when it is first saved: the counter is read on a majority of the relays, the number after
 * the last one given is taken, and the counter is saved at once on a majority, before the number is
 * used. Any two majorities of one list share a relay: a device reading after another saved its
 * counter finds it. Two of the owner's devices taking a number in the same few seconds could still
 * take the same one; the invoices already saved are counted too (`floor`), never a number below
 * theirs. The numbers start again at 1 each year.
 *
 * A change of the account's relays takes the counter to the new list before it is saved
 * (upkeep.ts): read there, a counter missing would give again the numbers given already.
 *
 * The shared counter (one series for the owner's invoices and its assistants'): every writer of
 * numbers, the owner's devices and each
 * assistant, keeps a copy of its own, signed by its invoices' author and sealed with keys derived
 * from the counter's key (invoiceCounterKey of src/lib/team/keys.ts), at one address. A number is
 * taken over every writer's copy (and the owner's counter of format 1 for the owner), then the
 * writer's own copy is saved on a majority, the owner's counter of format 1 too for the owner: one
 * of its devices still on an app from before reads its own numbers at least. Each writer is read by
 * its author (a relay may hold anyone's events at that address).
 *
 * A removed assistant's copy counts until the owner's copy holds its last number: its key's
 * holder could otherwise stop every number for a year (a copy of a newer
 * format, or near the end of safe integers), and the owner cannot remove another author's event.
 * Removing it, the owner's device takes its copy into the owner's own (raiseSharedCounter): once
 * the owner's copy is dated after its removal (and REMOVED_SEAT_GRACE_SECONDS, the clocks'
 * margin), it is never read again, and the other assistants' channels no longer name it
 * (src/features/team/numbering.ts). Until then it is read leniently: a copy of a newer format is
 * left out (a relay may keep an author's newest event only: the copy holding its last number may
 * be gone, the invoices already saved, `floor`, still count for the owner).
 *
 * Whoever holds a writer's key, removed or not, may still make the numbers jump: a copy, or a
 * number of `floor`, more than MAX_NUMBER_JUMP above the writer's own copies is left out
 * rather than followed, and "Wallet" warns the owner of an assistant whose copy runs ahead
 * of its invoices (src/features/invoices/assistant-alerts.ts). A number past safe integers is never
 * given, its copy never saved. The same limits hold as between two of the owner's devices; and a
 * device on an app from before the shared counter does not read the assistants'.
 */

const RECORD_TYPE = "invoice-counter";
const COUNTER_VERSION = 1;

export type InvoiceCounter = {
  version: typeof COUNTER_VERSION;
  /** The year of the last number given. */
  year: number;
  /** The rank of the last number given in that year. */
  last: number;
};

export class InvoiceCounterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceCounterError";
  }
}

/** The opaque `d` tag of the counter. */
export function counterAddress(keys: InvoiceKeys): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes("invoice-counter")));
}

export function parseInvoiceCounter(value: unknown): InvoiceCounter | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > COUNTER_VERSION) throw new NewerRecordError();
  if (
    v.version !== COUNTER_VERSION ||
    !Number.isSafeInteger(v.year) ||
    (v.year as number) < 2000 ||
    (v.year as number) > 9999 ||
    !Number.isSafeInteger(v.last) ||
    (v.last as number) < 1
  ) {
    return null;
  }
  return { version: COUNTER_VERSION, year: v.year as number, last: v.last as number };
}

export function counterEvent(
  keys: InvoiceKeys,
  counter: InvoiceCounter,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: RECORD_TYPE,
    value: counter,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: counterAddress(keys),
    createdAt
  });
}

/**
 * What a relay sent, if it is the counter of `keys` (openRecord: author, address, decryption, type,
 * signature); null otherwise.
 */
export function openInvoiceCounter(
  keys: InvoiceKeys,
  value: unknown
): OpenedRecord<InvoiceCounter> | null {
  return openRecord(value, {
    type: RECORD_TYPE,
    encryptionKey: keys.encryptionKey,
    address: counterAddress(keys),
    author: keys.nostr.publicKey,
    parse: parseInvoiceCounter
  });
}

/** The number after `counter` in `year`, and above every number of `floor` (the year's). */
export function nextNumber(
  counter: InvoiceCounter | null,
  year: number,
  floor: readonly InvoiceNumber[] = []
): InvoiceNumber {
  return nextNumberOf(counter ? [counter] : [], year, floor);
}

/** The number after every counter of `counters` in `year`, and above every number of `floor`. */
export function nextNumberOf(
  counters: readonly InvoiceCounter[],
  year: number,
  floor: readonly InvoiceNumber[] = []
): InvoiceNumber {
  const counted = counters.reduce(
    (highest, counter) => (counter.year === year ? Math.max(highest, counter.last) : highest),
    0
  );
  const saved = floor.reduce(
    (highest, number) => (number.year === year ? Math.max(highest, number.sequence) : highest),
    0
  );
  return { year, sequence: Math.max(counted, saved) + 1 };
}

/**
 * Takes the next number of `year` (the device's calendar's): the counter read on a majority of
 * the relays of `call`, its next number (nextNumber, above `floor`), the counter saved with it on a
 * majority, dated after the one read. Rejects with an InvoiceCounterError when fewer than a
 * majority answered or took it, or when a newer app wrote the counter: no number is given then.
 */
export async function takeInvoiceNumber(
  keys: InvoiceKeys,
  call: RelayCall,
  year: number,
  now: number,
  floor: readonly InvoiceNumber[] = []
): Promise<InvoiceNumber> {
  const address = counterAddress(keys);
  const quorum = majority(call.relays.length);
  const answers = await queryRelays(
    { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey], "#d": [address] },
    call,
    { quorum: "majority" }
  );
  if (answers.size < quorum) throw new InvoiceCounterError("Too few relays answered");
  const read = newestRecord(answers, (value) => openInvoiceCounter(keys, value));
  if (
    read.newestUnreadable !== null &&
    read.newestUnreadable >= (read.newest?.event.created_at ?? 0)
  ) {
    throw new InvoiceCounterError("The counter is of a newer format");
  }
  const number = nextNumber(read.newest?.value ?? null, year, floor);
  const createdAt = Math.max(now, (read.newest?.event.created_at ?? 0) + 1);
  const counter: InvoiceCounter = {
    version: COUNTER_VERSION,
    year: number.year,
    last: number.sequence
  };
  try {
    await publishToQuorum(counterEvent(keys, counter, createdAt), call, quorum);
  } catch {
    throw new InvoiceCounterError("Too few relays took the counter");
  }
  return number;
}

/** The shared counter's type: never changed (see above). */
const SHARED_RECORD_TYPE = "invoice-counter-shared";

/** Domain of the keys the counter's key gives. Never change it nor the `info` strings. */
const SHARED_SALT = "sattle.me/invoice-counter";

/** What every writer seals and finds its copy of the shared counter with. */
export type SharedCounterKeys = {
  /** NIP-44 key of every copy. */
  encryptionKey: Uint8Array;
  /** The `d` tag of every writer's copy: one address, each writer's own event at it. */
  address: string;
};

/** The keys of the shared counter, from its key (invoiceCounterKey, a channel's `counterKey`). */
export function sharedCounterKeys(counterKey: Uint8Array): SharedCounterKeys {
  if (counterKey.length !== 32) throw new Error("Invalid counter key");
  return {
    encryptionKey: deriveKey(counterKey, SHARED_SALT, "encryption-key/v1"),
    address: bytesToHex(deriveKey(counterKey, SHARED_SALT, "address/v1"))
  };
}

/** A writer's copy of the shared counter, signed by its invoices' author (`signer`). */
export function sharedCounterEvent(
  shared: SharedCounterKeys,
  signer: InvoiceKeys["nostr"],
  counter: InvoiceCounter,
  createdAt: number
): NostrEvent {
  return sealRecord({
    type: SHARED_RECORD_TYPE,
    value: counter,
    signer: signer.secretKey,
    encryptionKey: shared.encryptionKey,
    address: shared.address,
    createdAt
  });
}

/** What a relay sent, if it is the copy of the shared counter of `author`; null otherwise. */
export function openSharedCounter(
  shared: SharedCounterKeys,
  author: string,
  value: unknown
): OpenedRecord<InvoiceCounter> | null {
  return openRecord(value, {
    type: SHARED_RECORD_TYPE,
    encryptionKey: shared.encryptionKey,
    address: shared.address,
    author,
    parse: parseInvoiceCounter
  });
}

/** Whether `read` holds a copy of a newer format at least as recent as its newest readable one. */
function isNewer<T>(read: NewestRecord<T>): boolean {
  return (
    read.newestUnreadable !== null && read.newestUnreadable >= (read.newest?.event.created_at ?? 0)
  );
}

/** A writer removed within the year: its invoices' author (hex), and when its removal was dated. */
export type RemovedWriter = { author: string; removedAt: number };

/** Who takes a number in the shared series, and with what. */
export type SharedNumbering = {
  /** The writer's own invoices' keys: its author signs its copy (and the owner's counter). */
  own: InvoiceKeys;
  /** The shared counter's keys (sharedCounterKeys). */
  shared: SharedCounterKeys;
  /**
   * The other writers' invoices' authors (hex), whose copies count: the owner's, the other
   * assistants' (in the team).
   */
  writers: readonly string[];
  /**
   * The owner's devices only: they also read and save the owner's counter of format 1 (`own`'s),
   * that an app from before the shared counter reads.
   */
  legacy: boolean;
  /**
   * The owner's devices only: the assistants removed within the year (REMOVED_WRITER_SECONDS)
   * whose copy the owner's copy may not hold yet (see above). Read leniently, until the owner's
   * copy is dated after their removal.
   */
  removed?: readonly RemovedWriter[];
};

/** What a take of the shared series gave. */
export type SharedTake = {
  /** The number taken; with raiseSharedCounter, the highest number given (sequence 0: none). */
  number: InvoiceNumber;
  /** The authors of `removed` the owner's copy now holds: dated after them, or saved with them. */
  absorbed: string[];
};

/**
 * Takes the next number of `year` in the shared series (see above): every writer's copy read on a
 * majority of the relays of `call` (by its author), the owner's counter of format 1 too with
 * `legacy`, the number after the highest of them all (nextNumberOf, above `floor`), then the
 * writer's own copy saved with it on a majority, dated after its own copy read, with the owner's
 * counter of format 1 for `legacy`. Rejects with an InvoiceCounterError when fewer than a majority
 * answered or took them, when a copy (but a removed writer's) is of a newer format, or when the
 * number would not be a safe integer: no number is given then.
 */
export async function takeSharedInvoiceNumber(
  numbering: SharedNumbering,
  call: RelayCall,
  year: number,
  now: number,
  floor: readonly InvoiceNumber[] = []
): Promise<InvoiceNumber> {
  return (await takeSharedNumber(numbering, call, year, now, floor)).number;
}

/** takeSharedInvoiceNumber, with the removed writers the owner's copy holds once it is saved. */
export function takeSharedNumber(
  numbering: SharedNumbering,
  call: RelayCall,
  year: number,
  now: number,
  floor: readonly InvoiceNumber[] = []
): Promise<SharedTake> {
  return shareNumbers(numbering, call, year, now, floor, "take");
}

/**
 * The owner's copy (and its counter of format 1 with `legacy`) raised to the highest number of
 * `year` the writers' copies give, without taking one: what a removed writer took goes into it
 * (see above). Saved only while a writer of `removed` is not held yet, dated after its own copy.
 * Rejects as takeSharedInvoiceNumber does.
 */
export function raiseSharedCounter(
  numbering: SharedNumbering,
  call: RelayCall,
  year: number,
  now: number
): Promise<SharedTake> {
  return shareNumbers(numbering, call, year, now, [], "raise");
}

async function shareNumbers(
  { own, shared, writers, legacy, removed = [] }: SharedNumbering,
  call: RelayCall,
  year: number,
  now: number,
  floor: readonly InvoiceNumber[],
  mode: "take" | "raise"
): Promise<SharedTake> {
  const self = own.nostr.publicKey;
  const others = [...new Set(writers)].filter((author) => author !== self);
  const leaving = [...new Map(removed.map((writer) => [writer.author, writer])).values()].filter(
    ({ author }) => author !== self && !others.includes(author)
  );
  const legacyAddress = counterAddress(own);
  const quorum = majority(call.relays.length);
  const answers = await queryRelays(
    {
      kinds: [RECORD_KIND],
      authors: [self, ...others, ...leaving.map(({ author }) => author)],
      "#d": legacy ? [shared.address, legacyAddress] : [shared.address]
    },
    // Every writer's copy is on a majority before its number is used (publishToQuorum, and the
    // assistants' server, sattleme/mcp-server): a majority's answers hold the last.
    call,
    { quorum: "majority" }
  );
  if (answers.size < quorum) throw new InvoiceCounterError("Too few relays answered");
  const copyOf = (author: string) =>
    newestRecord(answers, (value) => openSharedCounter(shared, author, value));
  const mine = copyOf(self);
  const theirs = others.map(copyOf);
  const ownCounter = legacy
    ? newestRecord(answers, (value) => openInvoiceCounter(own, value))
    : null;
  if (isNewer(mine) || theirs.some(isNewer) || (ownCounter !== null && isNewer(ownCounter))) {
    throw new InvoiceCounterError("A counter is of a newer format");
  }
  // A removed writer the owner's copy is dated after (its removal, and the clocks' margin): that
  // copy, or one before it, holds its last number. Never read again.
  const mineAt = mine.newest?.event.created_at ?? null;
  const held = (writer: RemovedWriter) =>
    mineAt !== null && mineAt > writer.removedAt + REMOVED_SEAT_GRACE_SECONDS;
  const pending = leaving.filter((writer) => !held(writer));
  // Its readable copy, whatever a newer format a relay holds (never followed: see above).
  const pendingCopies = pending.map(({ author }) => copyOf(author));
  const ownLasts = [mine, ...(ownCounter ? [ownCounter] : [])].flatMap(({ newest }) =>
    newest && newest.value.year === year ? [newest.value.last] : []
  );
  const ceiling = Math.max(0, ...ownLasts) + MAX_NUMBER_JUMP;
  const counters = [...theirs, ...pendingCopies].flatMap(({ newest }) =>
    newest ? [newest.value] : []
  );
  const within = counters.filter((counter) => counter.year !== year || counter.last <= ceiling);
  const floorWithin = floor.filter((number) => number.year !== year || number.sequence <= ceiling);
  if (within.length < counters.length || floorWithin.length < floor.length) {
    logFailure("A number of the shared counter jumped too far: left out");
  }
  const ownCounters = [mine, ...(ownCounter ? [ownCounter] : [])].flatMap(({ newest }) =>
    newest ? [newest.value] : []
  );
  const next = nextNumberOf([...ownCounters, ...within], year, floorWithin);
  const number = mode === "take" ? next : { year, sequence: next.sequence - 1 };
  if (!Number.isSafeInteger(next.sequence)) {
    throw new InvoiceCounterError("The numbers of the year ran out");
  }
  const absorbed = leaving.map(({ author }) => author);
  // Raising: nothing to save once the owner's copy holds every removed writer, or when no number
  // of the year was given (a copy says at least 1: nothing of this year to hold).
  if (mode === "raise" && (pending.length === 0 || number.sequence === 0)) {
    return { number, absorbed };
  }
  const counter: InvoiceCounter = {
    version: COUNTER_VERSION,
    year,
    last: mode === "take" ? number.sequence : Math.max(number.sequence, ...ownLasts)
  };
  const after = (read: NewestRecord<InvoiceCounter> | null) =>
    Math.max(now, (read?.newest?.event.created_at ?? 0) + 1, (read?.newestUnreadable ?? 0) + 1);
  const events = [
    sharedCounterEvent(shared, own.nostr, counter, after(mine)),
    ...(legacy ? [counterEvent(own, counter, after(ownCounter))] : [])
  ];
  const took = await Promise.allSettled(
    events.map((event) => publishToQuorum(event, call, quorum))
  );
  if (took.some(({ status }) => status === "rejected")) {
    throw new InvoiceCounterError("Too few relays took the counter");
  }
  return { number, absorbed };
}
