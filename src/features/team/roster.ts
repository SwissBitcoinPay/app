import { majority } from "@/config/registry";
import { inBatches } from "@/lib/batches";
import { logFailure } from "@/lib/log/log";
import type { NostrEvent } from "@/lib/nostr/event";
import {
  COPIES_AT_ONCE,
  newestEvents,
  publishAgain,
  publishToRelays,
  type RelayCall
} from "@/lib/nostr/pool";
import { unionRelays } from "@/lib/relays/list";
import { deriveRosterKeys, type TeamKeys } from "@/lib/team/keys";
import {
  assistantOf,
  earliestDate,
  fetchRosterAnswers,
  fetchSeatAnswers,
  integrationOf,
  isRemovedSeat,
  memberOf,
  rosterOf,
  seatAddress,
  seatEvent,
  seatKey,
  type Assistant,
  type Integration,
  type RemovedSeat,
  type RosterAnswers,
  type RosterEntry,
  type Seat,
  type TeamMember
} from "@/lib/team/roster";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import type { Repair } from "./repairs";

/*
 * The open account's roster (src/lib/team/roster.ts), as the owner's
 * devices read and write it: what the relays hold, and what this device knows of it since the
 * account opened. Its screens, its background jobs (the channels' sync, the lots of on-chain
 * addresses, the reconciliation of the links) and "Wallet" read it here; owner.ts writes
 * it, under its team lock.
 *
 * What this device knows only grows while the account is open: a seat read or written is never
 * forgotten (a record is never deleted, only replaced by its removal), and a removal is never undone
 * (a later read that missed it, made by relays that did not have it, changes nothing). It is wiped
 * with the account's team keys: another account starts from nothing.
 */

/** A seat's record unchanged for this long is refreshed (refreshRoster): strfry refuses events over 3 years old. */
export const ROSTER_REFRESH_SECONDS = 365 * 24 * 60 * 60;

/** The roster as the screens and the owner's jobs use it. */
export type Roster = {
  /** In the team, in the order they were invited. */
  employees: TeamMember[];
  /** In the team, in the order they were created. */
  integrations: Integration[];
  /** In the team, in the order they were created. */
  assistants: Assistant[];
  /** Removed, the latest removal first. */
  removed: RemovedSeat[];
};

/**
 * The catalogue's epoch (catalogEpochKey): how many employees the team
 * removed, as its roster says. Each removal gives the catalogue a new key.
 */
export function catalogEpochOf(roster: Pick<Roster, "removed">): number {
  return roster.removed.filter(({ role }) => role === "employee").length;
}

/** How much the relays told of the roster. */
export type RosterStatus =
  /** A majority of the relays answered: every seat written since the account exists is in it. */
  | "read"
  /** Fewer did: a seat, or a removal, may be missing. */
  | "partial"
  /** None did: only what this device knew already. */
  | "unread";

export type RosterRead = {
  /** What the relays gave, with what this device knows since the account opened. */
  roster: Roster;
  /** This read's answers: each seat's newest record, newer formats, what each relay holds. */
  answers: RosterAnswers;
  /** The newest copy of each address the relays sent, as it is (of a newer format included). */
  events: NostrEvent[];
  relays: readonly string[];
  status: RosterStatus;
  /** A read of a majority of the account's relays completed since the account opened. */
  everRead: boolean;
  /** Some seat's newest record is of a newer format (a newer app of the owner's): not listed. */
  newerUnreadable: boolean;
};

type Known = {
  team: TeamKeys;
  /** Every seat read or written since the account opened, by seatKey. */
  seats: Map<string, Seat>;
  /** Addresses whose newest record is of a newer format: neither listed nor written. */
  newer: Set<string>;
  /** A read of a majority of the relays completed. */
  everRead: boolean;
  /** The reads running, by relays and timeout: a read asked meanwhile is that one. */
  reads: Map<string, Promise<RosterRead>>;
};

let known: Known | null = null;

/** What this device knows of `team`'s roster: another account's is forgotten. */
function knownOf(team: TeamKeys): Known {
  if (known?.team !== team) {
    known = { team, seats: new Map(), newer: new Set(), everRead: false, reads: new Map() };
  }
  return known;
}

/** Adds a seat read or written: never forgotten, its removal never undone. */
function learn(state: Known, seat: Seat): void {
  const key = seatKey(seat);
  const before = state.seats.get(key);
  if (before && isRemovedSeat(before) && !isRemovedSeat(seat)) return;
  state.seats.set(key, seat);
}

/** The roster of what this device knows: seats of a newer format left out. */
function rosterOfKnown(state: Known): Roster {
  const keys = deriveRosterKeys(state.team);
  const seats = [...state.seats.values()].filter(
    (seat) => !state.newer.has(seatAddress(keys, seat))
  );
  const bySince = (a: Seat, b: Seat) => a.since - b.since || (a.id < b.id ? -1 : 1);
  const active = seats.filter((seat) => !isRemovedSeat(seat)).sort(bySince);
  return {
    employees: active.filter(({ role }) => role === "employee").map(memberOf),
    integrations: active.filter((seat) => seat.role === "integration").map(integrationOf),
    assistants: active.filter((seat) => seat.role === "assistant").map(assistantOf),
    removed: seats
      .filter(isRemovedSeat)
      .sort((a, b) => b.removedAt - a.removedAt || (a.id < b.id ? -1 : 1))
  };
}

/**
 * A call to `relays` as the roster's author: a relay may only take an author's events from that
 * author. Its key derives again at each authentication: refused once the account closes.
 */
export function rosterCall(
  team: TeamKeys,
  relays: readonly string[],
  timeoutMs: number
): RelayCall {
  return {
    channel: "account",
    relays,
    timeoutMs,
    authKey: () => deriveRosterKeys(team).nostr.secretKey
  };
}

/**
 * The roster on `relays` (every seat ever, page by page), with what this device knows of it. One
 * read at a time per list: a read asked while one runs is that one. `whole`: only the relays that
 * answered to the end count (queryRelaysPaged), for a decision that stands for good (the owner's
 * copy, src/features/activity/archive.ts). Rejects only when the account's team keys are wiped
 * (the account closed).
 */
export function readRoster(
  team: TeamKeys,
  relays: readonly string[],
  timeoutMs: number = TEAM_TIMEOUT_MS.background,
  { whole = false }: { whole?: boolean } = {}
): Promise<RosterRead> {
  const state = knownOf(team);
  const id = `${timeoutMs}:${whole}:${JSON.stringify(relays)}`;
  let read = state.reads.get(id);
  if (!read) {
    read = readNow(state, relays, timeoutMs, whole).finally(() => state.reads.delete(id));
    state.reads.set(id, read);
  }
  return read;
}

async function readNow(
  state: Known,
  relays: readonly string[],
  timeoutMs: number,
  whole: boolean
): Promise<RosterRead> {
  const raw = await fetchRosterAnswers(
    deriveRosterKeys(state.team),
    rosterCall(state.team, relays, timeoutMs),
    { whole }
  );
  // Derived again: wiped meanwhile (the account closed), nothing read is kept.
  const answers = rosterOf(deriveRosterKeys(state.team), raw);
  for (const { seat } of answers.seats.values()) learn(state, seat);
  for (const address of answers.newer) state.newer.add(address);
  const status: RosterStatus =
    raw.size === 0 ? "unread" : raw.size >= majority(relays.length) ? "read" : "partial";
  if (status === "read") state.everRead = true;
  return {
    roster: rosterOfKnown(state),
    answers,
    events: raw.size === 0 ? [] : newestEvents(raw),
    relays,
    status,
    everRead: state.everRead,
    newerUnreadable: state.newer.size > 0
  };
}

/**
 * What this device knows of `team`'s roster without reading the relays: null when it knows
 * nothing (no read nor write yet since the account opened). `everRead`: a majority's read completed.
 */
export function knownRoster(team: TeamKeys): { roster: Roster; everRead: boolean } | null {
  const state = knownOf(team);
  if (state.seats.size === 0 && !state.everRead) return null;
  return { roster: rosterOfKnown(state), everRead: state.everRead };
}

/** The seat `seat` names (its role and id) as this device knows it, null when unknown. */
export function knownSeat(team: TeamKeys, seat: Pick<Seat, "role" | "id">): Seat | null {
  const state = knownOf(team);
  const found = state.seats.get(seatKey(seat)) ?? null;
  return found && !state.newer.has(seatAddress(deriveRosterKeys(team), found)) ? found : null;
}

/** Whether this device knows `seat` as removed: nothing active is published for it any more. */
export function isKnownRemoved(team: TeamKeys, seat: Pick<Seat, "role" | "id">): boolean {
  const found = knownOf(team).seats.get(seatKey(seat));
  return found !== undefined && isRemovedSeat(found);
}

/**
 * Publishes the record of `seat`, in the team, dated by its creation (the only date this app gives
 * an active record, src/lib/team/roster.ts), to `relays`: true once a majority took it or holds a
 * newer record at its address (publishAgain: a removal there refuses it, the address holds the
 * seat's state). This device knows it from then on. Never rejects.
 */
export async function publishActiveSeat(
  team: TeamKeys,
  seat: Seat,
  relays: readonly string[],
  { created = false }: { created?: boolean } = {}
): Promise<boolean> {
  if (isRemovedSeat(seat)) throw new Error("Not a seat in the team");
  try {
    const keys = deriveRosterKeys(team);
    const call = rosterCall(team, relays, TEAM_TIMEOUT_MS.background);
    const took = await publishAgain(seatEvent(keys, seat, seat.since), call, {
      quorum: "majority"
    });
    if (took.length >= majority(relays.length)) {
      learn(knownOf(team), seat);
      return true;
    }
    if (created) {
      // A seat just created that is not: its record taken by a minority alone would show it later,
      // never invited nor published (no channel), and creating it again would make a second one.
      // Its removal, dated just after, goes to every relay: the call returned once no majority
      // could take the seat, before the relays that may take it still (in the background), and
      // every reader then sees it removed alike (catalogEpochOf counts it). Waited for on the relays
      // known to hold the seat only, which answered already: a read right after (the owner trying
      // again) finds it removed there, without waiting for a relay that never answers.
      const removed = seatEvent(keys, { ...seat, removedAt: seat.since + 1 }, seat.since + 1);
      await publishToRelays(removed, call, {
        quorum: { lists: [{ relays: took, count: took.length }] }
      });
    }
    return false;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Publishing a seat's record failed", error);
    return false;
  }
}

/**
 * Records `seat`'s removal on `removedAt` (its channel's date): the removal the relays hold already
 * (`held`, its newest record, when it says so: given again as it is), else its record with
 * `removed: true`, dated after `held`. True once a majority of each list of `lists` holds a removal
 * of it (a relay that refused it may hold another one, from another of the owner's devices: asked
 * again). This device knows it as removed from then on. Never rejects.
 */
export async function recordRemoval(
  team: TeamKeys,
  seat: Seat,
  removedAt: number,
  held: RosterEntry | null,
  lists: readonly (readonly string[])[]
): Promise<boolean> {
  try {
    const keys = deriveRosterKeys(team);
    const relays = lists.reduce<string[]>((all, list) => unionRelays(all, list), []);
    const call = rosterCall(team, relays, TEAM_TIMEOUT_MS.background);
    let removed: RemovedSeat;
    let event: NostrEvent;
    if (held && isRemovedSeat(held.seat)) {
      removed = held.seat;
      event = held.event;
    } else {
      removed = { ...seat, removedAt: Math.max(removedAt, seat.since + 1) };
      const createdAt = Math.max(removed.removedAt, (held?.event.created_at ?? 0) + 1);
      event = seatEvent(keys, removed, createdAt);
    }
    const took = new Set(await publishToRelays(event, call, { quorum: { lists } }));
    const holdsOf = () =>
      lists.every(
        (list) => list.filter((relay) => took.has(relay)).length >= majority(list.length)
      );
    const missing = relays.filter((relay) => !took.has(relay));
    if (!holdsOf() && missing.length > 0) {
      // Refused, or not answered: a relay may hold a newer removal of it (dated later by another
      // of the owner's devices). An active copy dated later never counts. Read until each list's
      // majority is made up, or cannot be.
      const answers = await fetchSeatAnswers(
        keys,
        [removed],
        { ...call, relays: missing },
        {
          lists: lists.map((list) => ({
            relays: list.filter((relay) => !took.has(relay)),
            count: majority(list.length) - list.filter((relay) => took.has(relay)).length
          }))
        }
      );
      for (const [relay, events] of answers) {
        const entry = rosterOf(keys, new Map([[relay, events]])).seats.get(seatKey(removed));
        if (entry && isRemovedSeat(entry.seat)) took.add(relay);
      }
    }
    const holds = holdsOf();
    if (holds) learn(knownOf(team), removed);
    return holds;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Recording a seat's removal failed", error);
    return false;
  }
}

/**
 * Of what `read` gave, the records this device dates again (ROSTER_REFRESH_SECONDS unchanged):
 * every removal (final, it replaces nothing it should not), and of the seats in the team only
 * `active` ones, whose channel a majority of the relays gave as active (owner.ts): signed again,
 * dated `now`, to every relay of `read`. Resolves with the records published again. Never rejects.
 */
export async function refreshRoster(
  team: TeamKeys,
  read: RosterRead,
  active: ReadonlySet<string>,
  now: number
): Promise<RosterEntry[]> {
  try {
    const keys = deriveRosterKeys(team);
    const call = rosterCall(team, read.relays, TEAM_TIMEOUT_MS.background);
    const due = [...read.answers.seats.values()].filter(
      ({ seat, event }) =>
        now - event.created_at > ROSTER_REFRESH_SECONDS &&
        (isRemovedSeat(seat) ? true : read.status === "read" && active.has(seatKey(seat))) &&
        // A seat this device removed since the read: its removal is the record.
        (isRemovedSeat(seat) || !isKnownRemoved(team, seat))
    );
    const refreshed = await inBatches(due, COPIES_AT_ONCE, async ({ seat, event }) => {
      const again = seatEvent(keys, seat, Math.max(now, event.created_at + 1, earliestDate(seat)));
      const took = await publishToRelays(again, call, { quorum: "majority" });
      return took.length > 0 ? [{ seat, event: again }] : [];
    });
    return (refreshed ?? []).flat();
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Refreshing the roster failed", error);
    return [];
  }
}

/**
 * What a repair of the roster gives (publishRepairs, after the team's lock): each record `read`
 * gave, as it is, to the relays that answered without it (as the channels' sync does, owner.ts): a
 * relay that lost one, or missed a removal, holds it again. `skip`: seats just published again
 * everywhere. Never throws (none once the account closed).
 */
export function rosterRepairs(
  team: TeamKeys,
  read: RosterRead,
  skip: ReadonlySet<string> = new Set()
): Repair[] {
  try {
    const keys = deriveRosterKeys(team);
    return [...read.answers.seats.entries()].flatMap(([key, entry]) => {
      // Removed since the read (by this device, or recorded from its channel): its removal is
      // the record, never the active copy read before it.
      if (skip.has(key) || (!isRemovedSeat(entry.seat) && isKnownRemoved(team, entry.seat))) {
        return [];
      }
      const address = seatAddress(keys, entry.seat);
      const relays = [...read.answers.held]
        .filter(([, held]) => (held.get(address) ?? -1) < entry.event.created_at)
        .map(([relay]) => relay);
      return relays.length > 0
        ? [{ event: entry.event, call: rosterCall(team, relays, TEAM_TIMEOUT_MS.background) }]
        : [];
    });
  } catch (error) {
    logFailure("Repairing the roster failed", error);
    return [];
  }
}

/**
 * Copies every record `read` gave (each address's newest copy, as it is: of a newer format too) to
 * the relays `next`, for a change of the account's relays: the account reads its team there
 * afterwards. True once a majority of `next` holds each one (those of `read`'s relays that gave it
 * already count), or a newer one at its address. `skip`: records copied already (address and date).
 * Never rejects.
 */
export async function copyRoster(
  team: TeamKeys,
  read: RosterRead,
  next: readonly string[],
  skip: ReadonlyMap<string, number> = new Map()
): Promise<boolean> {
  try {
    const call = rosterCall(team, next, TEAM_TIMEOUT_MS.background);
    const events = read.events.filter((event) => {
      const address = event.tags.find(([name]) => name === "d")?.[1] ?? "";
      return (skip.get(address) ?? -1) < event.created_at;
    });
    const held = await inBatches(events, COPIES_AT_ONCE, async (event) => {
      const address = event.tags.find(([name]) => name === "d")?.[1] ?? "";
      const holding = next.filter(
        (relay) => (read.answers.held.get(relay)?.get(address) ?? -1) >= event.created_at
      );
      const missing = next.filter((relay) => !holding.includes(relay));
      const took =
        missing.length > 0
          ? await publishAgain(
              event,
              { ...call, relays: missing },
              // What the majority of `next` lacks; the others take it in the background.
              { quorum: { count: majority(next.length) - holding.length } }
            )
          : [];
      return holding.length + took.length >= majority(next.length);
    });
    return held !== null && held.every(Boolean);
  } catch (error) {
    // The account closed meanwhile (its team keys wiped).
    logFailure("Copying the roster to the new relays failed", error);
    return false;
  }
}

/** Each address's newest copy in `read`, by address, with its date (copyRoster's `skip`). */
export function copiedOf(read: RosterRead): Map<string, number> {
  return new Map(
    read.events.map((event) => [
      event.tags.find(([name]) => name === "d")?.[1] ?? "",
      event.created_at
    ])
  );
}

/**
 * The record of `seat` on `relays` (its address only), for a decision about it alone (a removal).
 * Null when fewer than a majority of them answered; `newer` when its newest record there is of a
 * newer format (never written over). Never rejects but when the account closed.
 */
export async function readSeat(
  team: TeamKeys,
  seat: Pick<Seat, "role" | "id">,
  relays: readonly string[]
): Promise<{ entry: RosterEntry | null; newer: boolean } | null> {
  const keys = deriveRosterKeys(team);
  const answers = await fetchSeatAnswers(
    keys,
    [seat],
    rosterCall(team, relays, TEAM_TIMEOUT_MS.background)
  );
  if (answers.size < majority(relays.length)) return null;
  const read = rosterOf(deriveRosterKeys(team), answers);
  const entry = read.seats.get(seatKey(seat)) ?? null;
  const state = knownOf(team);
  if (entry) learn(state, entry.seat);
  const newer = read.newer.has(seatAddress(keys, seat));
  if (newer) state.newer.add(seatAddress(keys, seat));
  return { entry, newer };
}
