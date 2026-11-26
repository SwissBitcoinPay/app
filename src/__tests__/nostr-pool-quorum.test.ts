import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import { nostrKeys } from "@/lib/nostr/keys";
import {
  QUORUM_GRACE_MIN_MS,
  copyEvents,
  eachRelayAnswer,
  holdersOf,
  publishAgain,
  publishToRelays,
  queryRelays,
  queryRelaysPaged,
  type Quorum,
  type RelayCall
} from "@/lib/nostr/pool";
import type { RelayFilter, RelayOptions } from "@/lib/nostr/relay";

import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Calls that wait for a majority of their relays at most: a relay that stays connected without
 * answering no longer holds a call up to its timeout.
 */

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const RELAYS = [
  "wss://a.example",
  "wss://b.example",
  "wss://c.example",
  "wss://d.example",
  "wss://e.example"
];
const TIMEOUT_MS = 10_000;
const KEY = new Uint8Array(32).fill(7);
const AUTHOR = nostrKeys(KEY).publicKey;
const FILTER: RelayFilter = { kinds: [30078], authors: [AUTHOR] };
const MAJORITY = { quorum: "majority" } as const;

function call(list: readonly string[] = RELAYS, more: Partial<RelayCall> = {}): RelayCall {
  return { relays: list, channel: "account", timeoutMs: TIMEOUT_MS, authKey: KEY, ...more };
}

/** A record of AUTHOR, signed: the fake relays take only what checks out. */
function record(n: number, createdAt = 1_700_000_000 + n): NostrEvent {
  return signEvent(
    { kind: 30078, created_at: createdAt, tags: [["d", `r${n}`]], content: "" },
    KEY
  );
}

/** Puts `events` on `holders` directly, as if written there before. */
function hold(holders: readonly string[], events: readonly NostrEvent[]) {
  for (const relay of holders)
    relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), ...events]);
}

/** Runs `promise` on fake timers: its value, and how long (fake ms) it took to settle. */
async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = Date.now();
  let settled: { value: T } | null = null;
  void promise.then((value) => {
    settled = { value };
  });
  while (settled === null) {
    if (Date.now() - startedAt > 10 * TIMEOUT_MS) throw new Error("Never settled");
    await jest.advanceTimersByTimeAsync(10);
  }
  return { value: (settled as { value: T }).value, ms: Date.now() - startedAt };
}

const ids = (answers: Map<string, unknown[]>, relay: string) =>
  (answers.get(relay) ?? []).map((event) => (event as NostrEvent).id);

/** Every `size`-relay subset of `list`. */
function subsets(list: readonly string[], size: number): string[][] {
  if (size === 0) return [[]];
  if (list.length < size) return [];
  const [first, ...rest] = list;
  return [...subsets(rest, size - 1).map((subset) => [first, ...subset]), ...subsets(rest, size)];
}

beforeEach(() => {
  jest.useFakeTimers();
  relays.resetRelays();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("reads with a quorum", () => {
  it("do not wait for a relay that stays connected without answering", async () => {
    hold(RELAYS, [record(1)]);
    relays.silent.add(RELAYS[4]);

    const { value, ms } = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    expect([...value.keys()]).toEqual(RELAYS.slice(0, 4));

    const paged = await timed(queryRelaysPaged(FILTER, call(), MAJORITY));
    expect(paged.ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    expect([...paged.value.keys()]).toEqual(RELAYS.slice(0, 4));

    // A majority is the default; "all" ("Test the connection" only) waits for the silent relay.
    const byDefault = await timed(queryRelays(FILTER, call()));
    expect(byDefault.ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    const all = await timed(queryRelays(FILTER, call(), { quorum: "all" }));
    expect(all.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(all.value.size).toBe(4);
  });

  it("find what was written to a majority, whichever relays stay silent", async () => {
    const event = record(1);
    for (const holders of subsets(RELAYS, 3)) {
      for (const quiet of subsets(RELAYS, 2)) {
        relays.resetRelays();
        hold(holders, [event]);
        // One silent at its reads, one that never answers anything.
        relays.silent.add(quiet[0]);
        relays.latency.set(quiet[1], Infinity);

        const { value, ms } = await timed(queryRelays(FILTER, call(), MAJORITY));
        expect(ms).toBeLessThan(TIMEOUT_MS);
        expect(value.size).toBe(3);
        expect([...value.keys()].some((relay) => ids(value, relay).includes(event.id))).toBe(true);
      }
    }
  });

  it("give the relays left as long again as the majority took, and no longer", async () => {
    hold(RELAYS, [record(1)]);
    for (const relay of RELAYS.slice(0, 3)) relays.latency.set(relay, 3000);
    relays.latency.set(RELAYS[3], 5500);
    relays.latency.set(RELAYS[4], Infinity);

    // The majority at 3 s: the others get 3 s more.
    const late = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(late.ms).toBeGreaterThanOrEqual(6000);
    expect(late.ms).toBeLessThan(6100);
    expect([...late.value.keys()]).toEqual(RELAYS.slice(0, 4));

    relays.latency.set(RELAYS[3], 6500);
    const later = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(later.ms).toBeLessThan(6100);
    expect([...later.value.keys()]).toEqual(RELAYS.slice(0, 3));
  });

  it("close the reads of the relays given up", async () => {
    hold(RELAYS, [record(1)]);
    relays.silent.add(RELAYS[4]);
    const signals = new Map<string, AbortSignal | undefined>();
    const real = relays.queryEvents;
    jest
      .spyOn(relays, "queryEvents")
      .mockImplementation((url: string, filter: RelayFilter, options: RelayOptions) => {
        signals.set(url, options.signal);
        return real(url, filter, options);
      });

    await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(signals.get(RELAYS[4])?.aborted).toBe(true);
  });

  it("tell only the relays that answered when no majority can, never more", async () => {
    hold(RELAYS, [record(1)]);
    // Three relays down: out of reach at once, the two others heard all the same.
    for (const relay of RELAYS.slice(2)) relays.unreachable.add(relay);
    const down = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(down.ms).toBeLessThanOrEqual(10);
    expect([...down.value.keys()]).toEqual(RELAYS.slice(0, 2));

    // Down, and the two others slower than that: they get the same grace as after a majority.
    relays.latency.set(RELAYS[0], 600);
    relays.latency.set(RELAYS[1], 1500);
    const slow = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(slow.ms).toBeGreaterThanOrEqual(QUORUM_GRACE_MIN_MS);
    expect(slow.ms).toBeLessThan(QUORUM_GRACE_MIN_MS + 10);
    expect([...slow.value.keys()]).toEqual([RELAYS[0]]);
    relays.latency.clear();

    // Three silent: out of reach once their timeout passed, as nothing tells it before.
    relays.unreachable.clear();
    for (const relay of RELAYS.slice(2)) relays.silent.add(relay);
    const silent = await timed(queryRelays(FILTER, call(), MAJORITY));
    expect(silent.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect([...silent.value.keys()]).toEqual(RELAYS.slice(0, 2));
  });

  it("count a relay that refuses the read (NIP-42) as one that did not answer", async () => {
    hold(RELAYS, [record(1)]);
    // Two relays give an author's events to that author only: a read naming no author is refused.
    relays.authorReads.add(RELAYS[0]);
    relays.authorReads.add(RELAYS[1]);
    relays.silent.add(RELAYS[2]);

    const { value, ms } = await timed(queryRelays({ kinds: [30078] }, call(), MAJORITY));
    expect(ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect([...value.keys()]).toEqual(RELAYS.slice(3));
  });

  it("wait for every relay of a list of one or two: they are its majority", async () => {
    hold(RELAYS, [record(1)]);
    relays.latency.set(RELAYS[1], 4000);

    const two = await timed(queryRelays(FILTER, call(RELAYS.slice(0, 2)), MAJORITY));
    expect(two.ms).toBeGreaterThanOrEqual(4000);
    // Both answered: no wait after that.
    expect(two.ms).toBeLessThan(4100);
    expect(two.value.size).toBe(2);

    const one = await timed(queryRelays(FILTER, call(RELAYS.slice(1, 2)), MAJORITY));
    expect(one.ms).toBeGreaterThanOrEqual(4000);
    expect(one.ms).toBeLessThan(4100);
    expect(one.value.size).toBe(1);

    relays.silent.add(RELAYS[1]);
    const silent = await timed(queryRelays(FILTER, call(RELAYS.slice(0, 2)), MAJORITY));
    expect(silent.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect([...silent.value.keys()]).toEqual([RELAYS[0]]);
  });

  it("stop at once when the call is aborted, with what answered", async () => {
    hold(RELAYS, [record(1)]);
    for (const relay of RELAYS.slice(2)) relays.silent.add(relay);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 500);

    const { value, ms } = await timed(
      queryRelays(FILTER, call(RELAYS, { signal: controller.signal }), MAJORITY)
    );
    expect(ms).toBeGreaterThanOrEqual(500);
    expect(ms).toBeLessThan(600);
    expect([...value.keys()]).toEqual(RELAYS.slice(0, 2));
  });

  it("wait for a majority of each list of a union, not of the union", async () => {
    hold(RELAYS, [record(1)]);
    const lists: Quorum = { lists: [RELAYS.slice(0, 3), RELAYS.slice(2)] };
    relays.silent.add(RELAYS[4]);

    // a, b, c for the first list, c and d for the second.
    const both = await timed(queryRelays(FILTER, call(), { quorum: lists }));
    expect(both.ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    expect(both.value.size).toBe(4);

    // d and e silent: three of five answered, a majority of the union but not of the second list.
    relays.silent.add(RELAYS[3]);
    const second = await timed(queryRelays(FILTER, call(), { quorum: lists }));
    expect(second.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect([...second.value.keys()]).toEqual(RELAYS.slice(0, 3));
  });

  it("wait for a count of relays, for a majority others gave already", async () => {
    hold(RELAYS, [record(1)]);
    relays.latency.set(RELAYS[1], 2000);
    relays.silent.add(RELAYS[2]);

    // Two of three: a at once, b at 2 s; c never.
    const two = await timed(
      queryRelays(FILTER, call(RELAYS.slice(0, 3)), { quorum: { count: 2 } })
    );
    expect(two.ms).toBeGreaterThanOrEqual(2000);
    expect(two.ms).toBeLessThan(TIMEOUT_MS);
    expect([...two.value.keys()]).toEqual(RELAYS.slice(0, 2));

    // Three of three: out of reach once c timed out.
    const three = await timed(
      queryRelays(FILTER, call(RELAYS.slice(0, 3)), { quorum: { count: 3 } })
    );
    expect(three.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(three.value.size).toBe(2);

    // None: at once.
    const none = await timed(
      queryRelays(FILTER, call(RELAYS.slice(1, 3)), { quorum: { count: 0 } })
    );
    expect(none.ms).toBeLessThanOrEqual(10);
  });

  it("count, in a read of whole answers, only the relays that sent every page", async () => {
    // More than a relay sends at once: pages.
    const events = Array.from({ length: 250 }, (_, n) => record(n));
    hold(RELAYS, events);
    const real = relays.queryEvents;
    const pages = new Map<string, number>();
    jest
      .spyOn(relays, "queryEvents")
      .mockImplementation((url: string, filter: RelayFilter, options: RelayOptions) => {
        const page = (pages.get(url) ?? 0) + 1;
        pages.set(url, page);
        // a fails at its second page, b never sends its second.
        if (url === RELAYS[0] && page === 2) return Promise.reject(new Error("timeout"));
        if (url === RELAYS[1] && page === 2) {
          return new Promise((_, reject) =>
            options.signal?.addEventListener("abort", () => reject(new Error("aborted")))
          );
        }
        return real(url, filter, options);
      });

    const { value, ms } = await timed(
      queryRelaysPaged(FILTER, call(), { whole: true, ...MAJORITY })
    );
    expect(ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    expect([...value.keys()]).toEqual(RELAYS.slice(2));
    for (const relay of RELAYS.slice(2)) expect(value.get(relay)).toHaveLength(250);
  });
});

describe("answers handed over as they come, with a quorum", () => {
  it("stop after the grace, the relays given up heard of by neither callback", async () => {
    hold(RELAYS, [record(1)]);
    relays.silent.add(RELAYS[4]);
    relays.unreachable.add(RELAYS[3]);
    const onAnswer = jest.fn();
    const onFailure = jest.fn();
    const { value, ms } = await timed(
      eachRelayAnswer(FILTER, call(), onAnswer, onFailure, MAJORITY)
    );
    expect(value).toBe(3);
    expect(ms).toBeLessThanOrEqual(QUORUM_GRACE_MIN_MS + 10);
    expect(onAnswer.mock.calls.map(([relay]) => relay)).toEqual(RELAYS.slice(0, 3));
    // The relay down failed; the silent one was given up, not failed.
    expect(onFailure.mock.calls.map(([relay]) => relay)).toEqual([RELAYS[3]]);
  });
});

describe("writes with a quorum", () => {
  it("return once a majority took the event, the others taking it in the background", async () => {
    const event = record(1);
    relays.latency.set(RELAYS[3], 5000);
    relays.latency.set(RELAYS[4], Infinity);

    const { value, ms } = await timed(publishToRelays(event, call(), MAJORITY));
    expect(ms).toBeLessThanOrEqual(10);
    expect(value).toEqual(RELAYS.slice(0, 3));
    expect(relays.stored.get(RELAYS[3])).toBeUndefined();

    // The slow relay takes it later; the one that never answers, never.
    await jest.advanceTimersByTimeAsync(5000);
    expect(relays.stored.get(RELAYS[3])?.map(({ id }) => id)).toEqual([event.id]);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(relays.stored.get(RELAYS[4])).toBeUndefined();

    // A majority is the default; "all" waits for every relay to answer or time out.
    const byDefault = await timed(publishToRelays(record(3), call()));
    expect(byDefault.ms).toBeLessThanOrEqual(10);
    const all = await timed(publishToRelays(record(2), call(), { quorum: "all" }));
    expect(all.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(all.value).toEqual(RELAYS.slice(0, 4));
  });

  it("return as soon as no majority can take it, with the relays that did", async () => {
    for (const relay of RELAYS.slice(2)) relays.readOnly.add(relay);
    const refused = await timed(publishToRelays(record(1), call(), MAJORITY));
    expect(refused.ms).toBeLessThanOrEqual(10);
    expect(refused.value).toEqual(RELAYS.slice(0, 2));

    // Out of reach only once the relays that never answer timed out.
    relays.readOnly.clear();
    for (const relay of RELAYS.slice(2)) relays.latency.set(relay, Infinity);
    const silent = await timed(publishToRelays(record(2), call(), MAJORITY));
    expect(silent.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(silent.value).toEqual(RELAYS.slice(0, 2));
  });

  it("count a relay holding a newer copy as one that took it again (publishAgain)", async () => {
    const older = record(1, 1_700_000_000);
    const newer = record(1, 1_700_000_001);
    hold(RELAYS.slice(0, 2), [newer]);
    relays.latency.set(RELAYS[4], Infinity);

    const { value, ms } = await timed(publishAgain(older, call(), MAJORITY));
    expect(ms).toBeLessThanOrEqual(10);
    expect(value).toEqual(RELAYS.slice(0, 3));
  });

  it("wait for both relays of a list of two", async () => {
    relays.latency.set(RELAYS[1], 4000);
    const { value, ms } = await timed(
      publishToRelays(record(1), call(RELAYS.slice(0, 2)), MAJORITY)
    );
    expect(ms).toBeGreaterThanOrEqual(4000);
    expect(ms).toBeLessThan(4100);
    expect(value).toEqual(RELAYS.slice(0, 2));
  });

  it("wait for a majority of each list of a union", async () => {
    const lists: Quorum = { lists: [RELAYS.slice(0, 3), RELAYS.slice(2)] };
    relays.latency.set(RELAYS[3], 3000);
    relays.latency.set(RELAYS[4], Infinity);

    // a, b, c at once: a majority of the union, of the first list only. d takes it at 3 s.
    const { value, ms } = await timed(publishToRelays(record(1), call(), { quorum: lists }));
    expect(ms).toBeGreaterThanOrEqual(3000);
    expect(ms).toBeLessThan(3100);
    expect(value).toEqual(RELAYS.slice(0, 4));
  });

  it("return once a count of relays took it, none at once, the others going on", async () => {
    relays.latency.set(RELAYS[1], 2000);
    const one = await timed(
      publishToRelays(record(1), call(RELAYS.slice(0, 2)), { quorum: { count: 1 } })
    );
    expect(one.ms).toBeLessThanOrEqual(10);
    expect(one.value).toEqual([RELAYS[0]]);

    const none = await timed(
      publishToRelays(record(2), call(RELAYS.slice(1, 2)), { quorum: { count: 0 } })
    );
    expect(none.value).toEqual([]);
    expect(none.ms).toBeLessThanOrEqual(10);
    await jest.advanceTimersByTimeAsync(2000);
    expect(relays.stored.get(RELAYS[1])?.map(({ id }) => id)).toEqual([record(1).id, record(2).id]);
  });

  it("stop the writes left once the call is aborted", async () => {
    const controller = new AbortController();
    relays.latency.set(RELAYS[4], 5000);

    await timed(publishToRelays(record(1), call(RELAYS, { signal: controller.signal }), MAJORITY));
    controller.abort();
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(relays.stored.get(RELAYS[4])).toBeUndefined();
  });

  it("ask each relay once, a list naming one twice included", async () => {
    relays.latency.set(RELAYS[2], 3000);
    // Three relays: a majority of two.
    const { value, ms } = await timed(
      publishToRelays(record(1), call([...RELAYS.slice(0, 3), RELAYS[0]]), MAJORITY)
    );
    expect(ms).toBeLessThanOrEqual(10);
    expect(value).toEqual(RELAYS.slice(0, 2));
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toHaveLength(3);

    const read = await timed(
      queryRelays(FILTER, call([...RELAYS.slice(0, 3), RELAYS[0]]), { quorum: "all" })
    );
    expect([...read.value.keys()]).toEqual(RELAYS.slice(0, 3));
  });
});

describe("copies to another list (a change of relays)", () => {
  const BEFORE = RELAYS.slice(0, 3);
  const NEXT = RELAYS.slice(2);

  it("reach a majority of the new list, the relays already holding them counted", async () => {
    const event = record(1);
    hold(BEFORE, [event]);
    relays.latency.set(RELAYS[4], Infinity);
    // c holds it already, d takes it: a majority of c, d and e; e never answers, not waited for.
    const { value, ms } = await timed(copyEvents(FILTER, call(BEFORE), NEXT));
    expect(value).toBe(1);
    expect(ms).toBeLessThan(TIMEOUT_MS);
    expect(relays.stored.get(RELAYS[3])?.map(({ id }) => id)).toEqual([event.id]);
    // c was not written to again: it sent the event as it is.
    const writes = relays.calls.filter(({ operation }) => operation === "publish");
    expect(writes.map(({ relay }) => relay).sort()).toEqual([RELAYS[3], RELAYS[4]].sort());
  });

  it("never count a relay that sent an altered copy as one holding the event", () => {
    const event = record(1);
    const altered = { ...event, content: "forged" };
    const holders = holdersOf(
      new Map([
        [RELAYS[0], [event]],
        [RELAYS[1], [altered]],
        [RELAYS[2], [{ ...event }]]
      ]),
      [event]
    );
    expect(holders.get(event.id)).toEqual([RELAYS[0], RELAYS[2]]);
  });

  it("tell nothing copied from fewer than a majority of the list left", async () => {
    hold(BEFORE, [record(1)]);
    for (const relay of BEFORE.slice(1)) relays.unreachable.add(relay);
    const { value } = await timed(copyEvents(FILTER, call(BEFORE), NEXT));
    expect(value).toBeNull();
  });
});
