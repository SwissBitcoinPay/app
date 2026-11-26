import type { RelayFilter } from "./relay";

/*
 * What a relay may send before the client gives up on it: a
 * relay of the list, or one an employee's or an assistant's link names (the owner's device reads
 * it), is never trusted. Without bounds, one relay could hold the app's JavaScript thread or fill
 * its memory: a message of any size parsed at once, a query answered by events without end, a
 * watch fed events whose id checks out but not their signature (each one a full secp256k1
 * verification in JavaScript, about 1.3 ms in Node, more on Hermes, which has no JIT).
 */

/**
 * The longest message a relay may send, in UTF-16 code units (a string's length): longer, it is
 * not parsed and its connection ends. Twice the largest `max_message_length` the default relays
 * publish (their NIP-11: relay.coinos.io, 2 097 152; the others 131 072 to 1 048 576); the
 * app's largest record (an image) makes an event of about 55 000 bytes (src/lib/media/image.ts).
 */
export const MAX_MESSAGE_LENGTH = 4 * 1024 * 1024;

/**
 * At most this many events answer one query (one REQ): past it, the query fails for that relay,
 * as one that did not answer (a partial answer is never taken for all the relay holds). Four
 * times the most the default relays send for a filter without `limit` (as measured: 500,
 * relay.coinos.io 200); a read that may match more pages through them (queryRelaysPaged).
 */
export const MAX_EVENTS_PER_QUERY = 2000;

/**
 * A watch whose relay sent this many events that do not check out (outside its filter, or whose
 * signature fails) ends its connection: the relay is then connected again later, waiting longer
 * each time (watchRelays). The same bound leaves the rest of a relay's answers unchecked in
 * newestEvents. A sound relay sends none: it checks signatures before it stores an event.
 */
export const MAX_INVALID_EVENTS = 10;

/**
 * Whether what a relay sent, unchecked, is an event `filter` asks for (NIP-01): its kind, author,
 * id, date and `#d` / `#a` tags. Cheap, before any signature is checked: a relay that sends what
 * the filter excludes is lying.
 */
export function matchesFilter(value: unknown, filter: RelayFilter): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { id, pubkey, kind, created_at: createdAt, tags } = value as Record<string, unknown>;
  if (filter.ids && !(typeof id === "string" && filter.ids.includes(id))) return false;
  if (filter.authors && !(typeof pubkey === "string" && filter.authors.includes(pubkey))) {
    return false;
  }
  if (filter.kinds && !(typeof kind === "number" && filter.kinds.includes(kind))) return false;
  if (filter.since !== undefined || filter.until !== undefined) {
    if (typeof createdAt !== "number") return false;
    if (filter.since !== undefined && createdAt < filter.since) return false;
    if (filter.until !== undefined && createdAt > filter.until) return false;
  }
  return hasTag(tags, "d", filter["#d"]) && hasTag(tags, "a", filter["#a"]);
}

/** Whether `tags` hold a tag `name` whose value is one of `values` (none asked: true). */
function hasTag(tags: unknown, name: string, values: readonly string[] | undefined): boolean {
  if (!values) return true;
  return (
    Array.isArray(tags) &&
    tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === name &&
        typeof tag[1] === "string" &&
        values.includes(tag[1])
    )
  );
}
