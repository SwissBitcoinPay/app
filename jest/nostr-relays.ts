/**
 * In-memory fake of the Nostr relays of the app's records for Jest, standing in for
 * src/lib/nostr/relay.ts (jest.setup.ts): tests never reach a real relay. Same API; each relay
 * keeps, like a real one, the latest event of each address (NIP-01 addressable events) and
 * refuses events whose signature does not check out. As strfry (the app's relays run it, per their
 * NIP-11; events.cpp, RelayWriter.cpp, RelayIngester.cpp), it refuses an event older
 * than the one it holds at its address, or as old with a higher id ("replaced: have newer event"),
 * and one whose NIP-40 expiration has passed ("invalid: event expired"); the very event it holds is
 * accepted again ("duplicate:"). A deletion request (NIP-09, kind 5) deletes, as strfry does, the
 * events of its own author it names by id (`e`), and at each address it names (`a`) the versions up
 * to its date, which the relay then refuses ("deleted: user requested deletion"), as it refuses an
 * id deleted; the request itself is kept. A watch (watchEvents) gets the events a relay holds, then
 * each one it takes later, as a real subscription does, and what a lying relay sends
 * (`sendToWatches`), bounded as the real client bounds it (relay-bounds.ts). Each call names its
 * channel (`calls`), as the real client needs; connections are not modelled. nostr-relay.test.ts
 * covers the real protocol.
 */
import { isValidEvent, type NostrEvent } from "../src/lib/nostr/event";
import { nostrKeys } from "../src/lib/nostr/keys";
import { secureRandomBytes } from "../src/lib/random";
import { MAX_INVALID_EVENTS, matchesFilter } from "../src/lib/nostr/relay-bounds";
import { QueryClosed, RelayRefusal } from "../src/lib/nostr/relay-errors";
import type { RelayChannel, RelayFilter, RelayOptions } from "../src/lib/nostr/relay";

/** Stored events, by relay URL. */
export const stored = new Map<string, NostrEvent[]>();
/**
 * What each relay's deletion requests deleted (strfry's `Event__deletion` and `replaceDeletion`):
 * the ids (`id:pubkey`), and of each address the date up to which its versions are refused.
 */
const deleted = new Map<string, { ids: Set<string>; addresses: Map<string, number> }>();
/** Relays that do not answer: their calls reject, like a timeout. */
export const unreachable = new Set<string>();
/**
 * Relays that never answer a query: it rejects once the call's `timeoutMs` passed (or at once when
 * aborted), as the real client does with a relay that keeps silent.
 */
export const silent = new Set<string>();
/**
 * By relay, the authors (public keys) whose events it never sends: a query naming one of them is
 * left unanswered, as `silent` leaves them all, while its other queries answer (one read late).
 */
export const silentAuthors = new Map<string, Set<string>>();
/**
 * By relay, the `d` tags whose query fails at once, as an unreachable relay's, while its other
 * queries answer: one read of a relay cut short (a test reads one kind of record from a minority).
 */
export const failingTags = new Map<string, Set<string>>();
/**
 * By relay, how long (ms) it takes to answer each call, query or publication alike, once the call
 * reached it: a relay that is slow, or that stays connected without answering. Past the call's
 * `timeoutMs` the call rejects at its timeout instead (`Infinity`: a relay that never answers, its
 * writes included, where `silent` covers queries only); an aborted call rejects at once. Drive it
 * with fake timers.
 */
export const latency = new Map<string, number>();
/**
 * By relay, how long (ms) it takes to answer a publication, its queries answered as usual: a relay
 * whose writes queue up (tens of seconds) or stopped (`Infinity`). Past the
 * call's `timeoutMs` the call rejects at its timeout, and a finite delay's relay takes the event
 * then all the same (its queue reached it), as it would have in time. Drive it with fake timers.
 */
export const writeLatency = new Map<string, number>();
/** Relays that answer queries but refuse every event (a full disk, a write policy). */
export const readOnly = new Set<string>();
/**
 * Relays that take an event only once its author authenticated (NIP-42 lets a relay restrict
 * writes to authenticated keys: these take an author's events from that author only). The
 * challenge is answered with the call's `signAuth`, as the real client does after an
 * "auth-required:" refusal: every key it signs with is authenticated (NIP-42).
 */
export const authorOnly = new Set<string>();
/**
 * Relays that give an author's events to that author only (NIP-42 lets a relay restrict reads so):
 * a query must name its authors, each of them a key that answered the challenge.
 */
export const authorReads = new Set<string>();
/**
 * Authors (public keys) whose events every relay refuses: a test cuts a write short between two
 * records of different authors.
 */
export const refusedAuthors = new Set<string>();

/**
 * The keys that answered `url`'s challenge (NIP-42: as many as the call brings; none, the
 * connection's own random key), as the real client signs with them; null when one refuses (wiped)
 * or is not a key.
 */
function authenticated(_url: string, options: RelayOptions): Set<string> | null {
  const keys = options.authKeys ?? [];
  if (keys.length === 0) return new Set([nostrKeys(secureRandomBytes(32)).publicKey]);
  try {
    return new Set(keys.map((key) => nostrKeys(typeof key === "function" ? key() : key).publicKey));
  } catch {
    // Refused: a key is wiped.
    return null;
  }
}

/**
 * The JSON of the events that checked out, since the test's start: the same event is published to
 * every relay of the list, and its signature's check (secp256k1, in JavaScript) is slow, so each
 * event is checked once. A check is a function of the event alone, and an event's JSON names all
 * of it.
 */
const validEvents = new Set<string>();

/** Whether `event` checks out (isValidEvent), each event checked once. */
function checksOut(event: NostrEvent): boolean {
  const json = JSON.stringify(event);
  if (validEvents.has(json)) return true;
  if (!isValidEvent(event)) return false;
  validEvents.add(json);
  return true;
}

/** At most this many events answer a filter, the newest: like a real relay's cap. */
export const MAX_EVENTS_PER_FILTER = 100;

/** The largest event a relay takes, in bytes of its JSON: strfry's default (65 536). */
export const MAX_EVENT_BYTES = 65_536;
/** Every call, in order: its channel, a publication's event, a query's filter. */
export const calls: {
  relay: string;
  operation: "publish" | "query" | "watch";
  channel: RelayChannel;
  event?: NostrEvent;
  filter?: RelayFilter;
  /** A publication's bound (RelayOptions.timeoutMs). */
  timeoutMs?: number;
}[] = [];

const CHANNELS: readonly RelayChannel[] = ["account", "anonymous", "single"];

/** The call's channel, as the real client needs one (relay.ts, connectionFor). */
function channelOf(options: RelayOptions): RelayChannel {
  if (!CHANNELS.includes(options.channel)) throw new Error(`No relay channel: ${options.channel}`);
  return options.channel;
}

/** How many times the shared connections were closed (closeRelayConnections). */
export let connectionsClosed = 0;

/** As the real client: the shared connections closed (here, only counted). */
export function closeRelayConnections() {
  connectionsClosed += 1;
}

type Watch = {
  relay: string;
  filter: RelayFilter;
  /** Hands `value` over as the real client does (watchEvents): its filter, then its bound. */
  deliver: (value: unknown) => void;
  end: (error: Error) => void;
};

/** The subscriptions open (watchEvents), until they end. */
export const watches = new Set<Watch>();

/**
 * Sends `values` as they are to each subscription open on `relay`, as a relay that lies (forged
 * signatures, events outside the filter, garbage): each goes through what the real client checks
 * (watchEvents), the subscription ended at the bound of relay-bounds.ts.
 */
export function sendToWatches(relay: string, values: readonly unknown[]) {
  for (const watch of [...watches]) {
    if (watch.relay !== relay) continue;
    for (const value of values) if (watches.has(watch)) watch.deliver(value);
  }
}

/** Ends every subscription open on `relay` (all relays without one), as a lost connection. */
export function dropWatches(relay?: string) {
  for (const watch of [...watches]) {
    if (relay === undefined || watch.relay === relay) {
      watch.end(new Error(`${watch.relay}: connection closed`));
    }
  }
}

export function resetRelays() {
  queriesHeld = null;
  publishesHeld = null;
  // Forgotten, not ended: a watch left by a test would otherwise connect again in the next one.
  watches.clear();
  stored.clear();
  validEvents.clear();
  deleted.clear();
  unreachable.clear();
  silent.clear();
  silentAuthors.clear();
  failingTags.clear();
  latency.clear();
  writeLatency.clear();
  readOnly.clear();
  authorOnly.clear();
  authorReads.clear();
  refusedAuthors.clear();
  calls.length = 0;
  connectionsClosed = 0;
}

function matches(event: NostrEvent, filter: RelayFilter): boolean {
  return (
    (!filter.kinds || filter.kinds.includes(event.kind)) &&
    (!filter.authors || filter.authors.includes(event.pubkey)) &&
    (filter.since === undefined || event.created_at >= filter.since) &&
    (filter.until === undefined || event.created_at <= filter.until) &&
    (!filter["#d"] ||
      event.tags.some(([name, value]) => name === "d" && filter["#d"]?.includes(value))) &&
    (!filter["#a"] ||
      event.tags.some(([name, value]) => name === "a" && filter["#a"]?.includes(value)))
  );
}

function address(event: NostrEvent): string {
  const d = event.tags.find(([name]) => name === "d")?.[1] ?? "";
  // A kind 5 has no `d` tag: each request of an author is an event of its own, as on a relay.
  return event.kind === 5 ? `5:${event.id}` : `${event.kind}:${event.pubkey}:${d}`;
}

/** Whether `url` deleted `event` (its id, or its address up to then): strfry refuses it. */
function wasDeleted(url: string, event: NostrEvent): boolean {
  const done = deleted.get(url);
  if (!done) return false;
  if (done.ids.has(`${event.id}:${event.pubkey}`)) return true;
  const until = done.addresses.get(address(event));
  return until !== undefined && event.created_at <= until;
}

/** What the deletion request `request` deletes on `url`, as strfry does (events.cpp). */
function applyDeletion(url: string, request: NostrEvent): void {
  const done = deleted.get(url) ?? { ids: new Set<string>(), addresses: new Map<string, number>() };
  deleted.set(url, done);
  let events = stored.get(url) ?? [];
  for (const [name, value] of request.tags) {
    if (name === "e") {
      done.ids.add(`${value}:${request.pubkey}`);
      events = events.filter((event) => !(event.id === value && event.pubkey === request.pubkey));
    } else if (name === "a") {
      const [kind, pubkey] = value.split(":");
      if (pubkey !== request.pubkey || Number(kind) < 30000 || Number(kind) >= 40000) continue;
      done.addresses.set(value, Math.max(done.addresses.get(value) ?? 0, request.created_at));
      events = events.filter(
        (event) => !(address(event) === value && event.created_at <= request.created_at)
      );
    }
  }
  stored.set(url, events);
}

/**
 * Waits `latency` of `url` (none: nothing), as the real client waits for the relay's answer:
 * rejects at the call's `timeoutMs` when the relay takes longer, at once when the call is aborted.
 */
async function answerDelay(
  url: string,
  options: RelayOptions,
  delay: number = latency.get(url) ?? 0
): Promise<void> {
  const answered = await new Promise<boolean>((resolve) => {
    if (options.signal?.aborted) {
      resolve(false);
      return;
    }
    const late = delay >= options.timeoutMs;
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(
      () => {
        options.signal?.removeEventListener("abort", abort);
        resolve(!late);
      },
      late ? options.timeoutMs : delay
    );
    options.signal?.addEventListener("abort", abort);
  });
  if (!answered) {
    throw new Error(`${url}: ${options.signal?.aborted ? "aborted" : "no answer in time"}`);
  }
}

export async function publishEvent(url: string, event: NostrEvent, options: RelayOptions) {
  calls.push({
    relay: url,
    operation: "publish",
    channel: channelOf(options),
    event,
    timeoutMs: options.timeoutMs
  });
  if (publishesHeld) await publishesHeld;
  // Like the real client, an aborted call rejects without reaching the relay.
  if (options.signal?.aborted) throw new Error(`${url}: aborted`);
  if (unreachable.has(url)) throw new Error(`${url}: no answer in time`);
  // Only for a relay given one: the others answer as soon as before (no tick more).
  if (latency.has(url)) await answerDelay(url, options);
  const writeDelay = writeLatency.get(url);
  if (writeDelay !== undefined) {
    if (writeDelay >= options.timeoutMs && Number.isFinite(writeDelay)) {
      // Its queue reaches the event once the client stopped waiting: what it answers reaches no one.
      setTimeout(() => {
        try {
          take(url, event, options);
        } catch {
          // Refused: as it would have been in time.
        }
      }, writeDelay);
    }
    await answerDelay(url, options, writeDelay);
  }
  take(url, event, options);
}

/** What `url` does of `event` once it reads it: stored, or refused (RelayRefusal). */
function take(url: string, event: NostrEvent, options: RelayOptions): void {
  if (readOnly.has(url)) throw new RelayRefusal(url, "blocked: not accepting events");
  if (refusedAuthors.has(event.pubkey)) throw new RelayRefusal(url, "blocked: pubkey not admitted");
  if (!checksOut(event)) throw new RelayRefusal(url, "invalid: bad signature");
  // strfry's default `relay.maxEventSize`: the event's JSON, in bytes.
  if (new TextEncoder().encode(JSON.stringify(event)).length > MAX_EVENT_BYTES) {
    throw new RelayRefusal(url, "invalid: event too large");
  }
  if (authorOnly.has(url)) {
    const keys = authenticated(url, options);
    if (!keys) throw new RelayRefusal(url, "auth-required: authentication failed");
    if (!keys.has(event.pubkey)) {
      throw new RelayRefusal(url, "restricted: only the author may publish its events");
    }
  }
  const expiration = Number(event.tags.find(([name]) => name === "expiration")?.[1] ?? 0);
  if (expiration > 1 && expiration <= Math.floor(Date.now() / 1000)) {
    throw new RelayRefusal(url, "invalid: event expired");
  }
  if (event.kind === 5) {
    // strfry: an `a` tag of another author's address fails the whole event.
    for (const [name, value] of event.tags) {
      if (name === "a" && value.split(":")[1] !== event.pubkey) {
        throw new RelayRefusal(url, "invalid: can't delete other user's events");
      }
    }
  }
  const events = stored.get(url) ?? [];
  const previous = events.find((other) => address(other) === address(event));
  if (previous?.id === event.id) return;
  if (wasDeleted(url, event)) throw new RelayRefusal(url, "deleted: user requested deletion");
  // The latest event of an address wins; at the same time, the lowest id (NIP-01).
  if (
    previous &&
    (previous.created_at > event.created_at ||
      (previous.created_at === event.created_at && previous.id < event.id))
  ) {
    throw new RelayRefusal(url, "replaced: have newer event");
  }
  stored.set(url, [...events.filter((other) => other !== previous), event]);
  if (event.kind === 5) applyDeletion(url, event);
  // Sent to the open subscriptions it matches, after the relay's answer, as a real relay does.
  for (const watch of watches) {
    if (watch.relay === url && matches(event, watch.filter)) {
      void Promise.resolve().then(() => {
        if (watches.has(watch)) watch.deliver(event);
      });
    }
  }
}

/** Publications held until released (holdPublishes): a test looks at what shows meanwhile. */
let publishesHeld: Promise<void> | null = null;

/**
 * Holds every publication until the returned function is called: a test looks at what shows while
 * events are on their way (each is then taken, or refused, as the relay holds things once
 * released).
 */
export function holdPublishes(): () => void {
  let release!: () => void;
  publishesHeld = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    publishesHeld = null;
    release();
  };
}

/** Queries held until released (holdQueries): what a test does meanwhile comes first. */
let queriesHeld: Promise<void> | null = null;

/**
 * Holds every query until the returned function is called: a test makes something happen while
 * the relays are being read (each query answers as the relay holds things once released).
 */
export function holdQueries(): () => void {
  let release!: () => void;
  queriesHeld = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    queriesHeld = null;
    release();
  };
}

export async function queryEvents(url: string, filter: RelayFilter, options: RelayOptions) {
  calls.push({ relay: url, operation: "query", channel: channelOf(options), filter });
  if (queriesHeld) await queriesHeld;
  if (options.signal?.aborted) throw new Error(`${url}: aborted`);
  if (unreachable.has(url)) throw new Error(`${url}: no answer in time`);
  if (filter["#d"]?.some((tag) => failingTags.get(url)?.has(tag))) {
    throw new Error(`${url}: no answer in time`);
  }
  // Only for a relay given one: the others answer as soon as before (no tick more).
  if (latency.has(url)) await answerDelay(url, options);
  if (silent.has(url) || filter.authors?.some((author) => silentAuthors.get(url)?.has(author))) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, options.timeoutMs);
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    throw new Error(`${url}: no answer in time`);
  }
  if (authorReads.has(url)) {
    const keys = authenticated(url, options);
    if (!keys) throw new QueryClosed(url, "auth-required: authentication failed");
    if (!filter.authors?.length || filter.authors.some((author) => !keys.has(author))) {
      throw new QueryClosed(url, "restricted: an author's events to that author only");
    }
  }
  const matching = (stored.get(url) ?? []).filter((event) => matches(event, filter));
  // `limit`: the newest events (NIP-01); without one, the relay's own cap (strfry: 500 events per
  // filter by default, smaller here), as a real relay answers.
  return [...matching]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, Math.min(filter.limit ?? MAX_EVENTS_PER_FILTER, MAX_EVENTS_PER_FILTER));
}

export function watchEvents(
  url: string,
  filter: RelayFilter,
  options: RelayOptions,
  onEvent: (value: unknown) => boolean | void
): Promise<never> {
  calls.push({ relay: url, operation: "watch", channel: channelOf(options), filter });
  if (options.signal?.aborted) return Promise.reject(new Error(`${url}: aborted`));
  if (unreachable.has(url)) return Promise.reject(new Error(`${url}: no answer in time`));
  return new Promise<never>((_, reject) => {
    const abort = () => watch.end(new Error(`${url}: aborted`));
    let invalid = 0;
    const watch: Watch = {
      relay: url,
      filter,
      deliver: (value) => {
        if (matchesFilter(value, filter) && onEvent(value) !== false) return;
        invalid += 1;
        // As the real client: the connection ends (connections are not modelled here).
        if (invalid >= MAX_INVALID_EVENTS)
          watch.end(new Error(`${url}: events that do not check out`));
      },
      end: (error) => {
        if (!watches.delete(watch)) return;
        options.signal?.removeEventListener("abort", abort);
        reject(error);
      }
    };
    watches.add(watch);
    options.signal?.addEventListener("abort", abort);
    const held = (stored.get(url) ?? [])
      .filter((event) => matches(event, filter))
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, Math.min(filter.limit ?? MAX_EVENTS_PER_FILTER, MAX_EVENTS_PER_FILTER));
    void Promise.resolve().then(() => {
      for (const event of held) if (watches.has(watch)) watch.deliver(event);
    });
  });
}
