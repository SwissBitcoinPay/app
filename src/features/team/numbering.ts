import { nowUnix } from "@/lib/clock";
import { majority } from "@/config/registry";
import {
  openSharedCounter,
  raiseSharedCounter,
  sharedCounterKeys,
  takeSharedNumber,
  type InvoiceCounter,
  type SharedNumbering
} from "@/lib/invoice/counter";
import type { InvoiceNumber } from "@/lib/invoice/record";
import { logFailure } from "@/lib/log/log";
import { queryRelays, type RelayCall } from "@/lib/nostr/pool";
import { RECORD_KIND, newestRecord } from "@/lib/nostr/record";
import { deriveInvoiceKeys, invoiceCounterKey, type TeamKeys } from "@/lib/team/keys";

import { activeWriterIds, assistantKeysOf, removedWriters } from "./assistants";
import type { Roster } from "./roster";

/*
 * The owner's side of the shared series of the invoices' numbers (src/lib/invoice/counter.ts) with
 * its assistants. An assistant removed within the year is read until the owner's copy holds its
 * last number: then the owner's devices never read it again, and the other assistants' channels
 * no longer name it (channelInvoicingOf): its key's holder could otherwise stop every number of
 * the business for a year.
 *
 * Which removed assistants the owner's copy holds is known from the copy itself (dated after their
 * removal, raiseSharedCounter) and kept here for the open account, in memory only: a device that
 * opens the account learns it again at its first read (syncTeamChannels, a number taken). Not
 * known yet, an assistant is named and read as before: never a number given twice.
 */

let absorbed: { team: TeamKeys; ids: Set<string> } | null = null;

function absorbedOf(team: TeamKeys): Set<string> {
  if (absorbed?.team !== team) absorbed = { team, ids: new Set() };
  return absorbed.ids;
}

/** The removed assistants the owner's copy is known to hold, for the open account `team`. */
export function absorbedWriters(team: TeamKeys): ReadonlySet<string> {
  return absorbedOf(team);
}

/**
 * The owner's numbering in the shared series as `roster` has the team at `now`: the assistants in
 * the team, those removed within the year not known to be held yet, and the call reading them all
 * as their authors (a relay may give an author's events to that author only, NIP-42). Each key
 * derives again at each authentication: refused once the account closes.
 */
function ownerNumbering(
  team: TeamKeys,
  roster: Pick<Roster, "assistants" | "removed">,
  relays: readonly string[],
  timeoutMs: number,
  now: number
): { numbering: SharedNumbering; call: RelayCall; idOf: Map<string, string> } {
  const held = absorbedOf(team);
  const writerKeys = (id: string) => assistantKeysOf(team, id).invoices.nostr;
  const active = activeWriterIds(roster);
  const removed = removedWriters(roster, now).filter(({ id }) => !held.has(id));
  const idOf = new Map(removed.map(({ id }) => [writerKeys(id).publicKey, id]));
  return {
    numbering: {
      own: deriveInvoiceKeys(team),
      shared: sharedCounterKeys(invoiceCounterKey(team)),
      writers: active.map((id) => writerKeys(id).publicKey),
      legacy: true,
      removed: removed.map(({ id, removedAt }) => ({
        author: writerKeys(id).publicKey,
        removedAt
      }))
    },
    call: {
      channel: "account",
      relays,
      timeoutMs,
      authKey: [
        () => deriveInvoiceKeys(team).nostr.secretKey,
        ...[...active, ...removed.map(({ id }) => id)].map((id) => () => writerKeys(id).secretKey)
      ]
    },
    idOf
  };
}

function remember(team: TeamKeys, idOf: Map<string, string>, authors: readonly string[]): void {
  const held = absorbedOf(team);
  for (const author of authors) {
    const id = idOf.get(author);
    if (id !== undefined) held.add(id);
  }
}

/**
 * Takes the owner's next number of `year` (takeSharedNumber) as `roster` has the team, above
 * `floor`. Rejects with an InvoiceCounterError as it does: no number given then.
 */
export async function takeOwnerNumber(
  team: TeamKeys,
  roster: Pick<Roster, "assistants" | "removed">,
  relays: readonly string[],
  timeoutMs: number,
  year: number,
  now: number,
  floor: readonly InvoiceNumber[]
): Promise<InvoiceNumber> {
  const { numbering, call, idOf } = ownerNumbering(team, roster, relays, timeoutMs, now);
  const taken = await takeSharedNumber(numbering, call, year, now, floor);
  remember(team, idOf, taken.absorbed);
  return taken.number;
}

/**
 * Brings the owner's copy over every assistant `roster` names as removed within the year
 * (raiseSharedCounter), in the year of the device's calendar: true once it holds them all (known
 * already, or just read or saved so), false when the relays did not answer or take it. Never
 * rejects: what fails is logged, and tried again at the next sync of the team (syncTeamChannels).
 */
export async function absorbRemovedWriters(
  team: TeamKeys,
  roster: Pick<Roster, "assistants" | "removed">,
  relays: readonly string[],
  timeoutMs: number,
  now: number = nowUnix()
): Promise<boolean> {
  try {
    const { numbering, call, idOf } = ownerNumbering(team, roster, relays, timeoutMs, now);
    if (idOf.size === 0) return true;
    const raised = await raiseSharedCounter(
      numbering,
      call,
      new Date(now * 1000).getFullYear(),
      now
    );
    remember(team, idOf, raised.absorbed);
    return raised.absorbed.length === idOf.size;
  } catch (error) {
    logFailure("Taking a removed assistant's numbers into the owner's counter failed", error);
    return false;
  }
}

/** An assistant's copy of the shared counter, as a majority of the relays give it. */
export type WriterCopy =
  /** None on a majority of the relays: it took no number (or no majority took its copy yet). */
  | { status: "none" }
  | { status: "read"; counter: InvoiceCounter }
  /** Of a newer format, at least as recent as its newest readable one: no number is given over it. */
  | { status: "newer" };

/**
 * The copies of the shared counter of the assistants `ids` ("Wallet"'s warnings,
 * src/features/invoices/assistant-alerts.ts), read by their authors on a majority of `relays`:
 * by id, null when fewer than a majority answered (nothing told then). Never rejects.
 */
export async function readWriterCopies(
  team: TeamKeys,
  ids: readonly string[],
  relays: readonly string[],
  timeoutMs: number
): Promise<Map<string, WriterCopy> | null> {
  if (ids.length === 0) return new Map();
  try {
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    const keysOf = (id: string) => assistantKeysOf(team, id).invoices.nostr;
    const answers = await queryRelays(
      {
        kinds: [RECORD_KIND],
        authors: ids.map((id) => keysOf(id).publicKey),
        "#d": [shared.address]
      },
      {
        channel: "account",
        relays,
        timeoutMs,
        authKey: ids.map((id) => () => keysOf(id).secretKey)
      },
      { quorum: "majority" }
    );
    if (answers.size < majority(relays.length)) return null;
    const copies = new Map<string, WriterCopy>();
    for (const id of ids) {
      const author = keysOf(id).publicKey;
      const { newest, newestUnreadable } = newestRecord(answers, (value) =>
        openSharedCounter(shared, author, value)
      );
      copies.set(
        id,
        newestUnreadable !== null && newestUnreadable >= (newest?.event.created_at ?? 0)
          ? { status: "newer" }
          : newest
            ? { status: "read", counter: newest.value }
            : { status: "none" }
      );
    }
    return copies;
  } catch (error) {
    logFailure("Reading the assistants' copies of the counter failed", error);
    return null;
  }
}

/** Tests only. */
export function resetAbsorbedWriters(): void {
  absorbed = null;
}
