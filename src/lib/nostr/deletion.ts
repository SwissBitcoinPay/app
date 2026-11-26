import { isValidEvent, signEvent, type NostrEvent } from "./event";
import { nostrKeys } from "./keys";

/*
 * Deletion requests (NIP-09, kind 5), for "Delete account": each
 * one is signed by the author of the events it names (a relay deletes only an author's own events),
 * and names each of them twice: its id (`e`, which every version of strfry deletes) and, for an
 * addressable event, its address (`a`, which deletes every version up to the request's date and
 * keeps the relay from taking an older one again: strfry's events.cpp, `replaceDeletion`). The app's
 * relays run strfry (its NIP-11: NIP-09 supported, NIP-62 not), which keeps the requests
 * themselves for good, as NIP-09 asks: their content is empty, they say nothing but what they name.
 *
 * A request to vanish (NIP-62, kind 62) is not sent: none of the relays the app starts with
 * supports it, and strfry stores a kind it does not know as any other event: it would stay there.
 */

/** NIP-09: a deletion request. */
export const DELETION_KIND = 5;

/**
 * Events named by one request at most: two tags each (`e`, `a`), within strfry's limits (2 000 tags,
 * 64 KiB per event: about 230 bytes per event named).
 */
export const DELETION_CHUNK = 100;

/** A request is dated at most this long after `createdAt` (deletionRequests). */
const MAX_AHEAD_SECONDS = 600;

/** NIP-01: kinds whose events are addressable (one per author, kind and `d` tag). */
function isAddressable(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/** `kind:pubkey:d`, the address of an addressable event (NIP-01), as an `a` tag names it. */
export function eventAddress(kind: number, pubkey: string, d: string): string {
  return `${kind}:${pubkey}:${d}`;
}

function dTagOf(event: NostrEvent): string {
  return event.tags.find(([name]) => name === "d")?.[1] ?? "";
}

/**
 * The deletion requests of `events`, signed by `secretKey`: only the events of its own public key
 * (another author's would not be deleted), deletion requests left out (NIP-09: deleting one does
 * nothing), DELETION_CHUNK at most per request. `addresses` are addresses (`kind:pubkey:d`, of
 * this author) named besides, whether a relay sent their event or not (an employee's channel: its
 * device reads the request as the business deleted, src/features/team/member.ts). `createdAt`:
 * the requests' date, or the newest event's when later (a request deletes the versions up to its
 * date), MAX_AHEAD_SECONDS later at most. `byIdOnly`: the events named by their ids only, never by
 * their addresses, which would delete another version there up to the request's date (another
 * device's, signed meanwhile: a copy of a card's month replaced, history-copies.ts).
 */
export function deletionRequests(
  secretKey: Uint8Array,
  events: readonly NostrEvent[],
  createdAt: number,
  addresses: readonly string[] = [],
  { byIdOnly = false }: { byIdOnly?: boolean } = {}
): NostrEvent[] {
  const { publicKey } = nostrKeys(secretKey);
  const own = events.filter((event) => event.pubkey === publicKey && event.kind !== DELETION_KIND);
  const ids = [...new Set(own.map((event) => event.id))];
  const named = new Set(addresses.filter((address) => address.split(":")[1] === publicKey));
  for (const event of own) {
    if (isAddressable(event.kind) && !byIdOnly) {
      named.add(eventAddress(event.kind, publicKey, dTagOf(event)));
    }
  }
  const kinds = new Set(own.map((event) => event.kind));
  for (const address of named) kinds.add(Number(address.split(":")[0]));
  // Not past what strfry takes (`rejectEventsNewerThanSeconds`, 900 s by default): an event dated
  // later (a device's clock ahead) is still deleted by its id.
  // A loop, not Math.max(...): an author may have signed more events than a call takes arguments.
  let newest = createdAt;
  for (const event of own) newest = Math.max(newest, event.created_at);
  const date = Math.min(newest, createdAt + MAX_AHEAD_SECONDS);
  // One request per chunk of ids, then of addresses: each request names its events' kinds (`k`).
  const tags: string[][] = [
    ...ids.map((id) => ["e", id]),
    ...[...named].map((address) => ["a", address])
  ];
  const requests: NostrEvent[] = [];
  for (let start = 0; start < tags.length; start += DELETION_CHUNK * 2) {
    const chunk = tags.slice(start, start + DELETION_CHUNK * 2);
    requests.push(
      signEvent(
        {
          kind: DELETION_KIND,
          created_at: date,
          tags: [...chunk, ...[...kinds].sort((a, b) => a - b).map((kind) => ["k", String(kind)])],
          content: ""
        },
        secretKey
      )
    );
  }
  return requests;
}

/**
 * Whether `value` is a deletion request (NIP-09) of `author` naming `address` (`kind:author:d`),
 * its signature checked: what a relay sends is never trusted.
 */
export function isDeletionOf(value: unknown, author: string, address: string): boolean {
  const claimed = value as Partial<NostrEvent> | null | undefined;
  if (claimed?.kind !== DELETION_KIND || claimed.pubkey !== author) return false;
  if (!Array.isArray(claimed.tags)) return false;
  if (!claimed.tags.some((tag) => Array.isArray(tag) && tag[0] === "a" && tag[1] === address)) {
    return false;
  }
  return isValidEvent(value);
}
