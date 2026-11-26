import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { NostrEvent } from "@/lib/nostr/event";
import { queryRelays, queryRelaysPaged, type Quorum, type RelayCall } from "@/lib/nostr/pool";
import { NewerRecordError, RECORD_KIND, openRecord, sealRecord } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import type { MemberRole } from "./channel";
import { isMemberId, type RosterKeys } from "./keys";
import { isName, isUnixSeconds } from "./shared";

/*
 * The team's roster: one sealed record per employee, per integration and per assistant
 * (src/lib/nostr/record.ts), signed by the roster's author (deriveRosterKeys), on the account's
 * relays. Written and read by the owner's devices only, never by an employee nor an integration
 * (their channel, channel.ts, tells them what they need). Listed by author, as the catalogue
 * (src/lib/catalog/article.ts): a reader asks for that author's events, then checks each `d` tag
 * against the seat's role and id. They left the account's settings so that two of the owner's
 * devices changing the team at once lose nothing (the settings do not merge: the newest copy wins
 * whole), and so that the removals it keeps have no limit (a relay refuses an event over 64 kB).
 *
 * A seat's record is published once at its invitation (an employee) or its creation (an
 * integration), dated then; its removal publishes the same record again, at the same address, with
 * `removed: true` and the date of its channel's removal, never a NIP-09 deletion. Its name stays:
 * "Wallet" names a removed seat for its sales paid before its removal.
 *
 * A removal is final: an active record is dated by its creation (also when it is shown again or
 * copied), its removal after it, so that a relay holding the removal refuses any active copy,
 * whatever the device that sends it. Relays drop or refuse old events (strfry: those over 3 years
 * old), so a record unchanged for a year is signed again, dated then (refreshRoster,
 * src/features/team/roster.ts): a removal at any time, an active record only from what a majority of
 * the relays hold of it and of its channel, which a removal always changes first (owner.ts); a
 * removal a refresh replaced is published again from its channel. A reader accepts these later dates
 * (an active record dated after its creation, a removal after its date).
 *
 * Never change the record's type, its format nor its address once released: every account's team
 * is there.
 */

const RECORD_TYPE = "team-seat";

/** Format of a seat's value. */
const SEAT_VERSION = 1;

/**
 * Format 2: format 1 and, for an integration, the platform it was created
 * for (`platform`). An integration's seat is written in it, an employee's still in format 1, which
 * an app before format 2 (a staging app rolled back, another of the owner's devices not updated
 * yet) lists as before. Such an app neither lists nor writes over a record of format 2 (rosterOf's
 * `newer`): it would write it again without its platform. An integration's seat of format 1 (one
 * created before format 2) is not one.
 */
const PLATFORM_SEAT_VERSION = 2;

/**
 * Format 3: an assistant's seat, with
 * its `createdAt`. Only an assistant's is written in it, the others still in theirs: an app before
 * format 3 neither lists nor writes over an assistant (rosterOf's `newer`), so that it never
 * writes its channel without what an assistant needs to make invoices, nor counts it as an
 * integration.
 */
const ASSISTANT_SEAT_VERSION = 3;

/**
 * Format 4: format 3 with `invoicing: false`, an assistant created
 * without the right to make invoices (one that only exports the transactions, for the
 * accountant). Chosen at its creation, for good. An assistant that makes invoices is still written
 * in format 3. An app before format 4 neither lists nor writes over it (rosterOf's `newer`): it
 * never writes its channel with what makes invoices (channel.ts), nor names it among the writers
 * of numbers.
 */
const NO_INVOICING_SEAT_VERSION = 4;

/** Plaintexts are padded to multiples of this: the size tells little of the name. */
const BLOCK = 256;

/** Who has a seat in the team besides the owner: an employee, an integration or an assistant. */
export type SeatRole = MemberRole;

/** An employee of the account, from the invitation on. Its keys derive from its id and the root. */
export type TeamMember = {
  /** 32 hex digits, random: its secret, and so all its keys, derive from it. */
  id: string;
  /** As the owner typed it. */
  name: string;
  role: "employee";
  /**
   * Unix seconds: the invitation is valid from then until the end its record says (48 hours,
   * INVITE_VALIDITY_SECONDS).
   */
  invitedAt: number;
};

/** One of the account's integrations (docs/integrations.md). Its keys derive from its id. */
export type Integration = {
  /** 32 hex digits, random: its secret key, and so all its keys, derive from it (and the root). */
  id: string;
  /**
   * As the owner typed it, required: "Wallet" shows it for the
   * sales it created. At most MEMBER_NAME_MAX_LENGTH characters, as an employee's.
   */
  name: string;
  /** Unix seconds: when the owner created it. */
  createdAt: number;
  /**
   * The platform it was created for: the id of the shop or the language picked in "New
   * integration" (src/config/integration-catalog.ts), whose logo shows where its avatar goes.
   * Kept as its record names it (isPlatform): an id of a newer app's catalogue, which this build
   * does not know, is written again as it is.
   */
  platform: string;
};

/**
 * One of the account's assistants: an MCP server (local or
 * hosted) that makes the business's invoices with its secret key (src/lib/assistant/keys.ts). Its keys derive from its
 * id and the root.
 */
export type Assistant = {
  /** 32 hex digits, random: its secret key, and so all its keys, derive from it (and the root). */
  id: string;
  /**
   * As the owner typed it, required: "Wallet" shows it for the invoices it made. At most
   * MEMBER_NAME_MAX_LENGTH characters, as an employee's.
   */
  name: string;
  /** Unix seconds: when the owner created it. */
  createdAt: number;
  /**
   * False: created without the right to make invoices (format 4, chosen at its creation for good):
   * its channel gives nothing that numbers or makes them, and "Wallet" lists none of its.
   * Absent: it makes invoices (format 3).
   */
  invoicing?: false;
};

/** Whether the assistant `assistant` makes invoices (Assistant.invoicing). */
export function makesInvoices(assistant: { invoicing?: false }): boolean {
  return assistant.invoicing !== false;
}

/**
 * An integration's platform as its record names it: an option's id, lower case letters and digits,
 * maybe joined by hyphens, at most 32 characters (a newer app's options included).
 */
export function isPlatform(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 32 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

/** A seat as its record holds it, in the team or removed from it. */
export type Seat = {
  /** 32 hex digits: `TeamMember.id` or `Integration.id`. */
  id: string;
  /** Filled, at most MEMBER_NAME_MAX_LENGTH characters. */
  name: string;
  /**
   * Unix seconds: an employee's invitation (`invitedAt`), an integration's or an assistant's
   * creation (`createdAt`).
   */
  since: number;
  /** Unix seconds: its removal (its channel's, src/features/team/owner.ts), after `since`; null in the team. */
  removedAt: number | null;
} & (
  | { role: "employee"; platform?: undefined; invoicing?: undefined }
  /** An integration's platform (`Integration.platform`). */
  | { role: "integration"; platform: string; invoicing?: undefined }
  /** Whether an assistant makes invoices (`Assistant.invoicing`). */
  | { role: "assistant"; platform?: undefined; invoicing?: false }
);

/** A seat removed from the team. */
export type RemovedSeat = Seat & { removedAt: number };

export function isRemovedSeat(seat: Seat): seat is RemovedSeat {
  return seat.removedAt !== null;
}

export function employeeSeat(member: TeamMember): Extract<Seat, { role: "employee" }> {
  return {
    role: "employee",
    id: member.id,
    name: member.name,
    since: member.invitedAt,
    removedAt: null
  };
}

export function integrationSeat(integration: Integration): Extract<Seat, { role: "integration" }> {
  return {
    role: "integration",
    id: integration.id,
    name: integration.name,
    since: integration.createdAt,
    removedAt: null,
    platform: integration.platform
  };
}

export function assistantSeat(assistant: Assistant): Extract<Seat, { role: "assistant" }> {
  return {
    role: "assistant",
    id: assistant.id,
    name: assistant.name,
    since: assistant.createdAt,
    removedAt: null,
    ...(assistant.invoicing === false ? { invoicing: false as const } : {})
  };
}

export function memberOf(seat: Seat): TeamMember {
  return { id: seat.id, name: seat.name, role: "employee", invitedAt: seat.since };
}

export function integrationOf(seat: Extract<Seat, { role: "integration" }>): Integration {
  return { id: seat.id, name: seat.name, createdAt: seat.since, platform: seat.platform };
}

export function assistantOf(seat: Extract<Seat, { role: "assistant" }>): Assistant {
  return {
    id: seat.id,
    name: seat.name,
    createdAt: seat.since,
    ...(seat.invoicing === false ? { invoicing: false as const } : {})
  };
}

/** A seat's key in maps and sets: the ids of seats of different roles never meet. */
export function seatKey(seat: Pick<Seat, "role" | "id">): string {
  return `${seat.role}:${seat.id}`;
}

/** The opaque `d` tag of a seat's record: a relay cannot tell it from any other record. */
export function seatAddress(keys: RosterKeys, seat: Pick<Seat, "role" | "id">): string {
  return bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`seat/${seat.role}/${seat.id}`)));
}

/** The format a seat's record is written in: its role's, an assistant's as it makes invoices. */
function versionOf(seat: Seat): number {
  if (seat.role === "employee") return SEAT_VERSION;
  if (seat.role === "integration") return PLATFORM_SEAT_VERSION;
  return seat.invoicing === false ? NO_INVOICING_SEAT_VERSION : ASSISTANT_SEAT_VERSION;
}

/**
 * The value a seat's record holds: `invitedAt` for an employee (format 1), `createdAt` then its
 * `platform` for an integration (format 2), `createdAt` for an assistant (format 3), with
 * `invoicing: false` for one that makes none (format 4), then `removed` and `removedAt` once it is
 * removed.
 */
function seatValue(seat: Seat): Record<string, unknown> {
  const value = {
    version: versionOf(seat),
    role: seat.role,
    id: seat.id,
    name: seat.name,
    ...(seat.role === "employee"
      ? { invitedAt: seat.since }
      : seat.role === "integration"
        ? { createdAt: seat.since, platform: seat.platform }
        : seat.invoicing === false
          ? { createdAt: seat.since, invoicing: false }
          : { createdAt: seat.since })
  };
  return seat.removedAt === null ? value : { ...value, removed: true, removedAt: seat.removedAt };
}

/**
 * The seat a record's value holds, dated `createdAt` (its event's): null when invalid, or dated
 * before what it tells (an active record before its creation, a removal before its date). Throws
 * NewerRecordError for a newer version.
 */
export function parseSeat(value: unknown, createdAt: number): Seat | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version === "number" && v.version > NO_INVOICING_SEAT_VERSION) {
    throw new NewerRecordError();
  }
  if (!isMemberId(v.id) || !isName(v.name)) return null;
  // An employee's in format 1 (a `platform` there is left out, as by the apps before format 2); an
  // integration's in format 2, naming its platform; an assistant's in format 3, without one, or in
  // format 4, which says it makes no invoices.
  const platform = isPlatform(v.platform) ? v.platform : null;
  const employee = v.role === "employee" && v.version === SEAT_VERSION;
  const integration =
    v.role === "integration" && v.version === PLATFORM_SEAT_VERSION && platform !== null;
  const noInvoicing = v.version === NO_INVOICING_SEAT_VERSION;
  const assistant =
    v.role === "assistant" &&
    v.platform === undefined &&
    (v.version === ASSISTANT_SEAT_VERSION || (noInvoicing && v.invoicing === false));
  if (!employee && !integration && !assistant) return null;
  const since = employee ? v.invitedAt : v.createdAt;
  if (!isUnixSeconds(since)) return null;
  let removedAt: number | null = null;
  if (v.removed === undefined && v.removedAt === undefined) {
    if (createdAt < since) return null;
  } else if (
    v.removed !== true ||
    !isUnixSeconds(v.removedAt) ||
    v.removedAt <= since ||
    createdAt < v.removedAt
  ) {
    return null;
  } else {
    removedAt = v.removedAt;
  }
  const seat = { id: v.id, name: v.name, since, removedAt };
  if (employee) return { ...seat, role: "employee" };
  if (assistant) {
    return noInvoicing
      ? { ...seat, role: "assistant", invoicing: false }
      : { ...seat, role: "assistant" };
  }
  return platform === null ? null : { ...seat, role: "integration", platform };
}

/** The earliest date a record of `seat` may have: its creation, or its removal. */
export function earliestDate(seat: Seat): number {
  return seat.removedAt ?? seat.since;
}

/**
 * The signed record of `seat`, dated `createdAt`: its creation for an active one (this app never
 * dates one later, see above), its removal or later for a removal. Throws for an earlier date, an
 * integration's platform that is not one (isPlatform), an employee's or an assistant's platform, or
 * `invoicing` on another seat than an assistant's: a reader would refuse it.
 */
export function seatEvent(keys: RosterKeys, seat: Seat, createdAt: number): NostrEvent {
  if (createdAt < earliestDate(seat) || (seat.removedAt !== null && seat.removedAt <= seat.since)) {
    throw new Error("A seat's record dated before what it tells");
  }
  if (seat.role === "integration" ? !isPlatform(seat.platform) : seat.platform !== undefined) {
    throw new Error("A seat's platform its readers would refuse");
  }
  if (seat.role !== "assistant" && seat.invoicing !== undefined) {
    throw new Error("A seat's invoicing its readers would refuse");
  }
  return sealRecord({
    type: RECORD_TYPE,
    value: seatValue(seat),
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: seatAddress(keys, seat),
    createdAt,
    block: BLOCK
  });
}

/** What relays hold of the roster of `keys` (queryRelaysPaged). */
export function rosterFilter(keys: RosterKeys): RelayFilter {
  return { kinds: [RECORD_KIND], authors: [keys.nostr.publicKey] };
}

/** A seat's newest readable record. */
export type RosterEntry = { seat: Seat; event: NostrEvent };

export type RosterAnswers = {
  /**
   * By seatKey, each seat's newest readable record. Left out: a seat whose address holds a newer
   * record of a newer format (a newer app of the owner's wrote it): shown as it was, then written,
   * it would replace what that app wrote.
   */
  seats: Map<string, RosterEntry>;
  /** Addresses (`d` tags) whose newest record is of a newer format: never written over. */
  newer: Set<string>;
  /**
   * Per relay that answered, the date of the newest copy it holds of each address (readable or of
   * a newer format): a relay lacking a seat's newest copy gets it again.
   */
  held: Map<string, Map<string, number>>;
};

type Opened =
  { status: "ok"; event: NostrEvent; seat: Seat } | { status: "newer"; event: NostrEvent };

function addressOf(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === "d")?.[1];
}

/**
 * The seats among the events relays sent (queryRelaysPaged's answers): each copy is checked
 * (openRecord: author, decryption, type, `d` tag against its role and id, signature, once per
 * event); of a seat on several relays, the newest copy (then the lowest id, as relays keep).
 */
export function rosterOf(
  keys: RosterKeys,
  answers: ReadonlyMap<string, readonly unknown[]>
): RosterAnswers {
  // Each event once, but only once valid: a relay that sent garbage under a real event's id must
  // not hide the real one other relays sent (as articlesOf).
  const opened = new Map<string, Opened>();
  const open = (value: unknown): Opened | null => {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === "string") {
      const known = opened.get(id);
      if (known) return known;
    }
    const result = openRecord(value, {
      type: RECORD_TYPE,
      encryptionKey: keys.encryptionKey,
      address: () => true,
      author: keys.nostr.publicKey,
      parse: (payload, event) => {
        const seat = parseSeat(payload, event.created_at);
        return seat && addressOf(event) === seatAddress(keys, seat) ? seat : null;
      }
    });
    if (!result) return null;
    const read: Opened =
      result.status === "ok"
        ? { status: "ok", event: result.event, seat: result.value }
        : { status: "newer", event: result.event };
    opened.set(result.event.id, read);
    return read;
  };
  const newest = new Map<string, RosterEntry>();
  const newerAt = new Map<string, number>();
  const held = new Map<string, Map<string, number>>();
  for (const [relay, events] of answers) {
    const ofRelay = new Map<string, number>();
    held.set(relay, ofRelay);
    for (const value of events) {
      const read = open(value);
      if (!read) continue;
      const address = addressOf(read.event);
      if (address === undefined) continue;
      ofRelay.set(address, Math.max(ofRelay.get(address) ?? -1, read.event.created_at));
      if (read.status === "newer") {
        newerAt.set(address, Math.max(newerAt.get(address) ?? -1, read.event.created_at));
        continue;
      }
      const key = seatKey(read.seat);
      const known = newest.get(key);
      if (
        !known ||
        read.event.created_at > known.event.created_at ||
        (read.event.created_at === known.event.created_at && read.event.id < known.event.id)
      ) {
        newest.set(key, { seat: read.seat, event: read.event });
      }
    }
  }
  const seats = new Map<string, RosterEntry>();
  // An address whose newest record is of a newer format, whether an older copy is readable or not.
  const newer = new Set(newerAt.keys());
  for (const [key, entry] of newest) {
    const address = addressOf(entry.event)!;
    const at = newerAt.get(address);
    if (at !== undefined && at >= entry.event.created_at) continue;
    newer.delete(address);
    seats.set(key, entry);
  }
  return { seats, newer, held };
}

/**
 * The roster's records the relays of `call` hold, read page by page (one author, every seat ever,
 * past what a relay sends for one filter); `whole`: whole answers only (queryRelaysPaged). Read
 * until a majority answered (every seat and removal is written to one). Never rejects: relays that
 * did not answer are left out.
 */
export function fetchRosterAnswers(
  keys: RosterKeys,
  call: RelayCall,
  { whole = false }: { whole?: boolean } = {}
): Promise<Map<string, unknown[]>> {
  return queryRelaysPaged(rosterFilter(keys), call, { whole, quorum: "majority" });
}

/**
 * The records the relays of `call` hold at the addresses of `seats` (one query, for a decision
 * about these seats alone: a removal), read until `quorum` (a majority by default). Never rejects.
 */
export function fetchSeatAnswers(
  keys: RosterKeys,
  seats: readonly Pick<Seat, "role" | "id">[],
  call: RelayCall,
  quorum: Quorum = "majority"
): Promise<Map<string, unknown[]>> {
  return queryRelays(
    { ...rosterFilter(keys), "#d": seats.map((seat) => seatAddress(keys, seat)) },
    call,
    { quorum }
  );
}
