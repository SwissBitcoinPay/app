import { majority } from "@/config/registry";

import { isValidEvent, type NostrEvent } from "./event";
import {
  publishEvent,
  queryEvents,
  watchEvents,
  type AuthKey,
  type RelayChannel,
  type RelayFilter,
  type RelayOptions
} from "./relay";
import { MAX_INVALID_EVENTS } from "./relay-bounds";
import { holdsNewer } from "./relay-errors";

/*
 * Calls to several relays at once: every event of the app goes to all the relays of its list, and
 * every read asks all of them, so that one relay down, or one that dropped an event, loses nothing.
 *
 * No call waits for every relay of its list: a relay that stays connected without answering would
 * hold each call up to its timeout. A call waits for a majority at
 * most (`quorum`), the rest of a write going on in the background; a read stops there as long as
 * what it must find was written to a majority of the same list (any two majorities of a list share
 * a relay): every record of the app is written so. A majority is the default; "all" is for
 * "Test the connection" alone, a light per relay (relay-quorum.test.ts checks it).
 */

/**
 * The relays a call waits for:
 * - "majority", the default: a majority of the call's relays (majority, src/config/registry.ts);
 * - "all": every relay of the call, each until it answers or its timeout passes ("Test the
 *   connection" only: each relay's own light, no decision waits for it);
 * - `lists`: a majority of each of these lists, for a call over their union (the lists a change of
 *   relays leaves and goes to): a majority of a union is not one of each list; or, for a part
 *   `{ relays, count }`, that many of those relays (what a list's majority still lacks). A relay of
 *   a list that is not among the call's relays counts as one that never answers;
 * - `count`: that many of the call's relays, for a call that completes a majority others gave
 *   already (the relays of a list that hold a record before it is copied there); none: at once.
 * A call's outcome is known once its quorum is reached or out of reach: a write returns then, a
 * read after a short grace (QUORUM_GRACE_MIN_MS).
 */
export type Quorum = "all" | "majority" | { lists: readonly QuorumPart[] } | { count: number };

/** A part of a quorum of `lists`: a majority of a list, or `count` of `relays`. */
export type QuorumPart = readonly string[] | { relays: readonly string[]; count: number };

/**
 * Once a read's quorum was reached or went out of reach, the relays left get as long again as the
 * read took so far, and at least this, before they are given up (their subscriptions closed):
 * enough for a sound relay a little slower than the others, which callers repairing late relays,
 * or telling how many relays answered, count on. Measured on the default relays (900 reads): once
 * three of five
 * answered, the other two answered within a second in 58 to 60 rounds of 60.
 */
export const QUORUM_GRACE_MIN_MS = 1000;

/**
 * Where a call stands with `quorum` (never "all"), `answered` relays having answered and
 * `failed` having failed: reached, out of reach, or still to be seen.
 */
function quorumState(
  quorum: Exclude<Quorum, "all">,
  relays: readonly string[],
  answered: ReadonlySet<string>,
  failed: ReadonlySet<string>
): "reached" | "unreachable" | "open" {
  const asked = new Set(relays);
  const parts: readonly QuorumPart[] =
    quorum === "majority"
      ? [relays]
      : "count" in quorum
        ? [{ relays, count: quorum.count }]
        : quorum.lists;
  let reached = true;
  for (const part of parts) {
    const list = "count" in part ? part.relays : part;
    const members = [...new Set(list)];
    const needed = "count" in part ? part.count : majority(members.length);
    const have = members.filter((relay) => answered.has(relay)).length;
    const possible = members.filter(
      (relay) => asked.has(relay) && !failed.has(relay) && !answered.has(relay)
    ).length;
    if (have + possible < needed) return "unreachable";
    if (have < needed) reached = false;
  }
  return reached ? "reached" : "open";
}

export type { AuthKey } from "./relay";

export type RelayCall = {
  relays: readonly string[];
  /**
   * The connections the call goes over (relay.ts, RelayChannel): "account" for what is read and
   * written as the account's keys, "anonymous" for the registry and the payment links.
   */
  channel: RelayChannel;
  /** Per relay, connection included. */
  timeoutMs: number;
  /**
   * The keys a relay that asks gets the authentication of (NIP-42), each once per connection: the
   * author's key when publishing (a relay may only take events of the authenticated key); when
   * reading, the key of each author read that the caller holds (a relay may give an author's
   * events to that author only). None: the connection's own key (relay.ts), for a read that needs
   * no key of its authors'.
   */
  authKey?: AuthKey | readonly AuthKey[];
  /** Aborting it stops every relay's call at once (relay.ts): the account closes. */
  signal?: AbortSignal;
};

function relayOptions({ channel, timeoutMs, authKey, signal }: RelayCall): RelayOptions {
  const authKeys =
    authKey === undefined
      ? []
      : authKey instanceof Uint8Array || typeof authKey === "function"
        ? [authKey]
        : authKey;
  return { channel, timeoutMs, signal, authKeys };
}

/** How long a call waits (Quorum): a majority when not said. */
export type QuorumOption = { quorum?: Quorum };

/**
 * Publishes `event` to every relay, in parallel: the relays whose answer `held` accepts. With a
 * quorum, resolves once it is reached or out of reach, with the relays that took it by then; the
 * others go on in the background (until `call.signal` aborts them).
 */
function publishEach(
  event: NostrEvent,
  call: RelayCall,
  held: (result: PromiseSettledResult<unknown>) => boolean,
  quorum: Quorum
): Promise<string[]> {
  const options = relayOptions(call);
  // Each relay once, a list naming one twice included.
  const relays = [...new Set(call.relays)];
  return new Promise((resolve) => {
    const took = new Set<string>();
    const failed = new Set<string>();
    let settled = false;
    const settle = () => {
      if (settled) return;
      const done = took.size + failed.size >= relays.length;
      if (done || (quorum !== "all" && quorumState(quorum, relays, took, failed) !== "open")) {
        settled = true;
        resolve(relays.filter((relay) => took.has(relay)));
      }
    };
    settle();
    for (const relay of relays) {
      publishEvent(relay, event, options).then(
        (value: unknown) => {
          (held({ status: "fulfilled", value }) ? took : failed).add(relay);
          settle();
        },
        (reason: unknown) => {
          (held({ status: "rejected", reason }) ? took : failed).add(relay);
          settle();
        }
      );
    }
  });
}

/**
 * Publishes `event` to every relay, in parallel. Resolves with those that took it: all of them
 * having answered, or as soon as `quorum` is reached or out of reach (QuorumOption).
 */
export function publishToRelays(
  event: NostrEvent,
  call: RelayCall,
  { quorum = "majority" }: QuorumOption = {}
): Promise<string[]> {
  return publishEach(event, call, (result) => result.status === "fulfilled", quorum);
}

/**
 * Publishes a record again to every relay, in parallel. Resolves with those that took it, or
 * already hold a newer one at its address (holdsNewer): signed again, a record of the same date
 * gets another id, which a relay holding the first one refuses half of the time. As
 * publishToRelays, as soon as `quorum` is reached or out of reach.
 */
export function publishAgain(
  event: NostrEvent,
  call: RelayCall,
  { quorum = "majority" }: QuorumOption = {}
): Promise<string[]> {
  return publishEach(
    event,
    call,
    (result) => result.status === "fulfilled" || holdsNewer(result.reason),
    quorum
  );
}

/**
 * Publishes a record again to every relay, in parallel, as publishAgain (a relay holding a newer
 * one at its address counts as one that took it). Resolves with true once `quorum` relays took it
 * (the others go on in the background), with false as soon as they no longer can: a relay that
 * does not answer costs no wait once a quorum took it. Never rejects.
 */
export function publishAgainToQuorum(
  event: NostrEvent,
  call: RelayCall,
  quorum: number
): Promise<boolean> {
  const options = relayOptions(call);
  return new Promise((resolve) => {
    let taken = 0;
    let failures = 0;
    const settle = () => {
      if (taken >= quorum) resolve(true);
      else if (call.relays.length - failures < quorum) resolve(false);
    };
    settle();
    for (const relay of call.relays) {
      publishEvent(relay, event, options).then(
        () => {
          taken += 1;
          settle();
        },
        (error: unknown) => {
          if (holdsNewer(error)) taken += 1;
          else failures += 1;
          settle();
        }
      );
    }
  });
}

/**
 * Publishes `event` to every relay, in parallel. Resolves once `quorum` relays have taken it (the
 * others go on in the background), rejects as soon as they no longer can.
 */
export function publishToQuorum(event: NostrEvent, call: RelayCall, quorum: number): Promise<void> {
  const options = relayOptions(call);
  return new Promise((resolve, reject) => {
    let taken = 0;
    let failures = 0;
    const settle = () => {
      if (taken >= quorum) resolve();
      else if (call.relays.length - failures < quorum) {
        reject(new Error(`Fewer than ${quorum} relays took the event`));
      }
    };
    settle();
    for (const relay of call.relays) {
      publishEvent(relay, event, options).then(
        () => {
          taken += 1;
          settle();
        },
        () => {
          failures += 1;
          settle();
        }
      );
    }
  });
}

/**
 * Runs `read` on every relay of `call` in parallel: what each relay that answered gave. With a
 * quorum, stops QUORUM_GRACE_MIN_MS (or as long again as the call took, when longer) after the
 * quorum was reached or went out of reach, or once every relay answered or failed: the relays
 * still reading are then given up (their calls aborted, their subscriptions closed), what they
 * send later is not read. Never rejects.
 */
function readEach<T>(
  call: RelayCall,
  quorum: Quorum,
  read: (relay: string, options: RelayOptions) => Promise<T>
): Promise<Map<string, T>> {
  // The relays given up are aborted with this, which the caller's own signal aborts too.
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (call.signal?.aborted) stop();
  call.signal?.addEventListener("abort", stop);
  const options = relayOptions({ ...call, signal: controller.signal });
  // Each relay once, a list naming one twice included.
  const relays = [...new Set(call.relays)];
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const answers = new Map<string, T>();
    const failed = new Set<string>();
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(grace);
      call.signal?.removeEventListener("abort", stop);
      // Kept in the call's order, as the relays were asked.
      const events = new Map<string, T>();
      for (const relay of relays) {
        if (answers.has(relay)) events.set(relay, answers.get(relay)!);
      }
      resolve(events);
      controller.abort();
    };
    const settle = () => {
      if (settled) return;
      if (answers.size + failed.size >= relays.length) {
        finish();
        return;
      }
      if (quorum === "all" || grace !== undefined) return;
      // Its outcome known, reached or out of reach: the relays left get their grace all the same,
      // for what callers tell of the relays that answered (none, or some: "offline").
      const state = quorumState(quorum, relays, new Set(answers.keys()), failed);
      // Reached before any relay answered (a `count` of none): nothing to wait for.
      if (state === "reached" && answers.size === 0) finish();
      else if (state !== "open") {
        grace = setTimeout(finish, Math.max(QUORUM_GRACE_MIN_MS, Date.now() - startedAt));
      }
    };
    settle();
    for (const relay of relays) {
      read(relay, options).then(
        (value) => {
          if (settled) return;
          answers.set(relay, value);
          settle();
        },
        () => {
          if (settled) return;
          failed.add(relay);
          settle();
        }
      );
    }
  });
}

/**
 * What every relay holds that matches `filter`, in parallel: the events of each relay that
 * answered, unchecked (see record.ts). Relays that did not answer in time, or that were given up
 * once `quorum` was reached or out of reach (QuorumOption, readEach), are left out. Never rejects.
 */
export function queryRelays(
  filter: RelayFilter,
  call: RelayCall,
  { quorum = "majority" }: QuorumOption = {}
): Promise<Map<string, unknown[]>> {
  return readEach(call, quorum, (relay, options) => queryEvents(relay, filter, options));
}

/**
 * At most this many pages per relay (queryRelaysPaged), so that a relay cannot keep a reader
 * forever: 25 000 events at strfry's default cap.
 */
export const MAX_PAGES = 50;

/**
 * A relay sends at least this many events of one filter, as the registry's reads assume (an answer
 * shorter than the `limit` asked is whole, src/lib/registry/registry.ts): in a read of whole
 * answers only (queryRelaysPaged), a page this short that brought nothing new held every event of
 * its second. Nothing else tells it (NIP-67's hint is optional, and the app does not read it).
 */
export const PAGE_FLOOR = 100;

/** The `id` and `created_at` of what a relay sent, unchecked; null when it has neither. */
function pageEntry(value: unknown): { id: string; createdAt: number } | null {
  const v = value as { id?: unknown; created_at?: unknown } | null;
  return typeof v?.id === "string" && Number.isSafeInteger(v.created_at)
    ? { id: v.id, createdAt: v.created_at as number }
    : null;
}

/**
 * What every relay holds that matches `filter`, page after page (NIP-01 `until`), in parallel:
 * relays cap what they send for a filter (strfry: 500 events by default), so a filter that may
 * match more (one author's records over a month) gets the rest from older pages. Each page asks
 * for the events up to the oldest second of the one before, that second included (its events
 * already sent are skipped). A page that brings nothing new held that second's events only: the
 * next page starts just before it; if the second held more than the relay sends at once, their
 * rest is out of reach. A relay is through once a page is empty, or after MAX_PAGES pages. A relay
 * that stops answering after its first page keeps what it sent.
 *
 * `whole`, for a decision that stands for good (the owner's copy, src/features/activity/archive.ts):
 * only whole answers count. A relay is left out when a page after its first fails, when it still
 * sends after MAX_PAGES pages, when a page holds nothing it can page through, or when a second may
 * hold more events than it sends at once: a page that brought nothing new, as long as the longest
 * it sent before and of PAGE_FLOOR events or more (its cap is at least its longest page: a shorter
 * one was not cut). With `quorum` (QuorumOption, readEach), a relay counts once its pages are
 * through (with `whole`, all of them); one given up before is left out, the pages it sent included.
 * Never rejects.
 */
export function queryRelaysPaged(
  filter: RelayFilter,
  call: RelayCall,
  { whole = false, quorum = "majority" }: { whole?: boolean } & QuorumOption = {}
): Promise<Map<string, unknown[]>> {
  const pages = async (relay: string, options: RelayOptions) => {
    const events: unknown[] = [];
    const seen = new Set<string>();
    let until = filter.until;
    let longest = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let answer: unknown[];
      try {
        answer = await queryEvents(
          relay,
          until === undefined ? filter : { ...filter, until },
          options
        );
      } catch (error) {
        if (page === 0 || whole) throw error;
        return events;
      }
      let oldest: number | null = null;
      let fresh = false;
      const sent = new Set<string>();
      for (const value of answer) {
        const entry = pageEntry(value);
        if (!entry) continue;
        sent.add(entry.id);
        oldest = oldest === null ? entry.createdAt : Math.min(oldest, entry.createdAt);
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        events.push(value);
        fresh = true;
      }
      if (oldest === null) {
        if (whole && answer.length > 0) throw new Error(`${relay}: a page without events`);
        return events;
      }
      if (whole && !fresh && sent.size >= Math.max(longest, PAGE_FLOOR)) {
        throw new Error(`${relay}: a second holds more events than a page`);
      }
      longest = Math.max(longest, sent.size);
      until = fresh ? oldest : oldest - 1;
      if (filter.since !== undefined && until < filter.since) return events;
    }
    if (whole) throw new Error(`${relay}: more than ${MAX_PAGES} pages`);
    return events;
  };
  return readEach(call, quorum, pages);
}

/** Events copied at once (copyEvents): each one is published to every relay. */
export const COPIES_AT_ONCE = 5;

/**
 * Of the events relays sent (queryRelays, queryRelaysPaged), those whose id and signature check
 * out (isValidEvent; relays are never trusted), and of an addressable event the newest copy only:
 * what a relay keeps (NIP-01). For a copy to other relays (copyEvents, publishCopies). Once a relay
 * sent MAX_INVALID_EVENTS that do not check out, the rest of what it sent is left out unchecked
 * (relay-bounds.ts: each check is a signature's).
 */
export function newestEvents(answers: ReadonlyMap<string, readonly unknown[]>): NostrEvent[] {
  // One event goes to every relay: each valid id is checked once. Only once valid: a relay that
  // sent garbage under a real event's id must not hide the real one other relays sent.
  const seen = new Set<string>();
  const newest = new Map<string, NostrEvent>();
  for (const values of answers.values()) {
    let invalid = 0;
    for (const value of values) {
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) continue;
      if (!isValidEvent(value)) {
        invalid += 1;
        if (invalid >= MAX_INVALID_EVENTS) break;
        continue;
      }
      seen.add(value.id);
      const d = value.tags.find(([name]) => name === "d")?.[1];
      const address = d === undefined ? value.id : `${value.kind}:${value.pubkey}:${d}`;
      const known = newest.get(address);
      // The copy relays keep (NIP-01): the newest, and of two as old the lowest id.
      if (
        !known ||
        value.created_at > known.created_at ||
        (value.created_at === known.created_at && value.id < known.id)
      ) {
        newest.set(address, value);
      }
    }
  }
  return [...newest.values()];
}

/** The fields of an event that make it: equal for two copies of the same event only. */
function canonical(value: unknown): string {
  const v = value as Partial<NostrEvent> | null;
  return JSON.stringify([v?.id, v?.pubkey, v?.created_at, v?.kind, v?.tags, v?.content, v?.sig]);
}

/**
 * By event id, the relays of `answers` (queryRelays, queryRelaysPaged) that sent `events` as they
 * are: a relay that sent a copy equal to the checked event holds that event (an id, or a signature,
 * alone proves nothing of what a relay holds). For a copy (publishCopies).
 */
export function holdersOf(
  answers: ReadonlyMap<string, readonly unknown[]>,
  events: readonly NostrEvent[]
): Map<string, string[]> {
  const wanted = new Map(events.map((event) => [canonical(event), event.id]));
  const holders = new Map<string, string[]>();
  for (const [relay, values] of answers) {
    for (const value of values) {
      const id = wanted.get(canonical(value));
      if (id !== undefined && !holders.get(id)?.includes(relay)) {
        holders.set(id, [...(holders.get(id) ?? []), relay]);
      }
    }
  }
  return holders;
}

/**
 * Publishes `events` as they are, signed by their authors, to the relays of the list `to` that do
 * not hold them (`holders`, by event id: holdersOf), as `from` would (its timeout, its
 * authentication key: the authors' key), COPIES_AT_ONCE events at a time: each until a majority of
 * `to` holds it, those that held it included (the others take it in the background), for a reader
 * of `to` that stops at a majority. Resolves with how many a majority of `to` holds (or holds
 * newer). Never rejects.
 */
export async function publishCopies(
  events: readonly NostrEvent[],
  from: RelayCall,
  to: readonly string[],
  holders: ReadonlyMap<string, readonly string[]> = new Map()
): Promise<number> {
  const list = [...new Set(to)];
  const quorum = majority(list.length);
  let copied = 0;
  for (let start = 0; start < events.length; start += COPIES_AT_ONCE) {
    const held = await Promise.all(
      events.slice(start, start + COPIES_AT_ONCE).map(async (event) => {
        const holding = list.filter((relay) => holders.get(event.id)?.includes(relay));
        const missing = list.filter((relay) => !holding.includes(relay));
        const took =
          missing.length === 0
            ? []
            : await publishAgain(
                event,
                { ...from, relays: missing },
                { quorum: { count: quorum - holding.length } }
              );
        return holding.length + took.length >= quorum;
      })
    );
    copied += held.filter(Boolean).length;
  }
  return copied;
}

/**
 * Copies to the list `to` what the relays of `from` hold that matches `filter`, read page by page
 * (queryRelaysPaged) until a majority of them answered (what it holds was written to a majority),
 * for a change of relays: each event as it is (newestEvents), published as `from` would to the
 * relays of `to` that did not send it, until a majority of `to` holds it (publishCopies). Resolves
 * with how many events a majority of `to` holds; null when fewer than a majority of `from`
 * answered. Never rejects.
 */
export async function copyEvents(
  filter: RelayFilter,
  from: RelayCall,
  to: readonly string[]
): Promise<number | null> {
  return (await copyCounted(filter, from, to))?.held ?? null;
}

/**
 * As copyEvents: whether a majority of `from` answered and a majority of `to` holds each event it
 * gave (true when it gave none), for a copy made again until it is whole (copyMovedRecords). Never
 * rejects.
 */
export async function copyEveryEvent(
  filter: RelayFilter,
  from: RelayCall,
  to: readonly string[]
): Promise<boolean> {
  const counted = await copyCounted(filter, from, to);
  return counted !== null && counted.held === counted.total;
}

/** copyEvents: how many events a majority of `to` holds, of how many; null as there. */
async function copyCounted(
  filter: RelayFilter,
  from: RelayCall,
  to: readonly string[]
): Promise<{ held: number; total: number } | null> {
  const answers = await queryRelaysPaged(filter, from, { quorum: "majority" });
  if (answers.size < majority(new Set(from.relays).size)) return null;
  const events = newestEvents(answers);
  return {
    held: await publishCopies(events, from, to, holdersOf(answers, events)),
    total: events.length
  };
}

export type RelayLookup<T> =
  | { status: "found"; value: T }
  /** A majority of the relays answered, none with a valid event. */
  | { status: "notFound" }
  /** Fewer did, none with a valid event. */
  | { status: "unreachable" };

/**
 * Asks every relay in parallel and hands each answer to `onAnswer` as it comes, for a reader that
 * shows the first copy at once and a better one later (a payment link, then its final version).
 * `onFailure`, when given, hears of each relay that failed or timed out, and why, as it does
 * ("Test the connection": each relay's light as soon as it is known). Resolves with how many
 * relays answered once all did or failed, or, with a quorum, once it was reached or went out of
 * reach and its grace passed (readEach): the relays then given up are heard of by neither
 * callback. Never rejects.
 */
export async function eachRelayAnswer(
  filter: RelayFilter,
  call: RelayCall,
  onAnswer: (relay: string, events: unknown[]) => void,
  onFailure?: (relay: string, error: unknown) => void,
  { quorum = "majority" }: QuorumOption = {}
): Promise<number> {
  // Given up by the quorum (readEach aborts them): not the caller's abort, nor a failure.
  const givenUp = (options: RelayOptions) =>
    options.signal?.aborted === true && call.signal?.aborted !== true;
  const answers = await readEach(call, quorum, (relay, options) =>
    queryEvents(relay, filter, options).then(
      (events) => {
        if (!givenUp(options)) onAnswer(relay, events);
        return events;
      },
      (error: unknown) => {
        if (!givenUp(options)) onFailure?.(relay, error);
        throw error;
      }
    )
  );
  return answers.size;
}

/** A watch connects a relay again after this, then twice as long each time (watchRelays). */
export const WATCH_RETRY_MIN_MS = 1_000;
/** At most this between two connections of a watch; a connection open this long resets it. */
export const WATCH_RETRY_MAX_MS = 60_000;

/**
 * Keeps a subscription open on every relay of `call.relays` (relay.ts, watchEvents): each event
 * matching `filter` a relay holds, then each one it receives later, goes to `onEvent` as soon as
 * the first relay sends it, once its id and signature check out (isValidEvent), and only once.
 * An event outside the filter is dropped before its signature is checked, and a relay that sends
 * MAX_INVALID_EVENTS that do not check out has its connection ended (watchEvents, relay-bounds.ts).
 * `call.timeoutMs` bounds each connection's opening. A relay whose connection
 * fails or ends is connected again after WATCH_RETRY_MIN_MS, then twice as long each time, up to
 * WATCH_RETRY_MAX_MS. Lasts until the returned function is called (or `call.signal` aborts): every
 * connection is then closed, nothing more is handed over.
 */
export function watchRelays(
  filter: RelayFilter,
  call: RelayCall,
  onEvent: (event: NostrEvent, relay: string) => void
): () => void {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (call.signal?.aborted) stop();
  call.signal?.addEventListener("abort", stop);
  const options = relayOptions({ ...call, signal: controller.signal });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  controller.signal.addEventListener("abort", () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    call.signal?.removeEventListener("abort", stop);
  });

  // Each event once, whichever relay sends it, and however often (each connection sends what the
  // relay holds again): only once valid, so that garbage under a real event's id hides nothing.
  const seen = new Set<string>();
  const watch = (relay: string, delay: number) => {
    if (controller.signal.aborted) return;
    const startedAt = Date.now();
    watchEvents(relay, filter, options, (value) => {
      if (controller.signal.aborted) return true;
      const id = (value as { id?: unknown } | null)?.id;
      if (typeof id === "string" && seen.has(id)) return true;
      // Counted by watchEvents: a relay that keeps sending such events is given up.
      if (!isValidEvent(value)) return false;
      seen.add(value.id);
      onEvent(value, relay);
      return true;
    }).catch(() => {
      if (controller.signal.aborted) return;
      const next = Date.now() - startedAt >= WATCH_RETRY_MAX_MS ? WATCH_RETRY_MIN_MS : delay;
      const timer = setTimeout(() => {
        timers.delete(timer);
        watch(relay, Math.min(next * 2, WATCH_RETRY_MAX_MS));
      }, next);
      timers.add(timer);
    });
  };
  for (const relay of call.relays) watch(relay, WATCH_RETRY_MIN_MS);
  return stop;
}
