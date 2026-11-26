import * as eventModule from "@/lib/nostr/event";
import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import {
  MAX_PAGES,
  PAGE_FLOOR,
  WATCH_RETRY_MAX_MS,
  WATCH_RETRY_MIN_MS,
  copyEvents,
  copyEveryEvent,
  newestEvents,
  queryRelays,
  queryRelaysPaged,
  watchRelays
} from "@/lib/nostr/pool";
import { MAX_INVALID_EVENTS } from "@/lib/nostr/relay-bounds";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const RELAY = "wss://relay.example.com";
const AUTHOR = "a".repeat(64);
const CALL = {
  relays: [RELAY],
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: new Uint8Array(32).fill(1)
};

/** `count` events of AUTHOR, the n-th dated `createdAt(n)`. */
function store(count: number, createdAt: (n: number) => number) {
  const events = Array.from({ length: count }, (_, n): NostrEvent => ({
    id: n.toString(16).padStart(64, "0"),
    pubkey: AUTHOR,
    created_at: createdAt(n),
    kind: 30078,
    tags: [["d", n.toString(16)]],
    content: "",
    sig: "0".repeat(128)
  }));
  relays.stored.set(RELAY, events);
  return events;
}

const ids = (events: unknown[] | undefined) =>
  new Set((events ?? []).map((event) => (event as NostrEvent).id));

beforeEach(() => {
  relays.resetRelays();
  jest.restoreAllMocks();
});

describe("paged reads", () => {
  it("get every event past what a relay sends for one filter, page after page", async () => {
    const events = store(250, (n) => 1_000_000 + n);
    const filter = { kinds: [30078], authors: [AUTHOR] };

    // One filter: the relay's cap, the newest.
    const once = await queryRelays(filter, CALL);
    expect(once.get(RELAY)).toHaveLength(relays.MAX_EVENTS_PER_FILTER);

    const paged = await queryRelaysPaged(filter, CALL);
    expect(ids(paged.get(RELAY))).toEqual(ids(events));
    expect(paged.get(RELAY)).toHaveLength(250);
  });

  it("keep the filter's own bounds on every page", async () => {
    store(250, (n) => 1_000_000 + n);
    const paged = await queryRelaysPaged(
      { kinds: [30078], authors: [AUTHOR], since: 1_000_050, until: 1_000_199 },
      CALL
    );
    expect(paged.get(RELAY)).toHaveLength(150);
  });

  it("go on past a second that holds more events than a page, missing only its rest", async () => {
    // 150 events of one second, between older and newer ones.
    const events = store(260, (n) =>
      n < 60 ? 1_000_000 + n : n < 210 ? 1_000_100 : 1_000_200 + n
    );
    const paged = await queryRelaysPaged({ kinds: [30078], authors: [AUTHOR] }, CALL);
    const read = ids(paged.get(RELAY));
    // Every event of another second, and as many of that second as the relay sends at once.
    for (const { id, created_at } of events) {
      if (created_at !== 1_000_100) expect(read.has(id)).toBe(true);
    }
    expect(read.size).toBe(60 + relays.MAX_EVENTS_PER_FILTER + 50);
  });

  it("stop after an empty page, and after MAX_PAGES pages of a relay that never ends", async () => {
    store(5, (n) => 1_000_000 + n);
    await queryRelaysPaged({ kinds: [30078], authors: [AUTHOR] }, CALL);
    // The page, the second of its oldest event again, then the empty page before it.
    expect(relays.calls.filter(({ operation }) => operation === "query")).toHaveLength(3);

    relays.resetRelays();
    const fake = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
    let page = 0;
    jest.spyOn(fake, "queryEvents").mockImplementation(async () => {
      page += 1;
      // A new event at each page, always of the same second.
      return [
        {
          id: page.toString(16).padStart(64, "0"),
          pubkey: AUTHOR,
          created_at: 1_000_000,
          kind: 30078,
          tags: [],
          content: "",
          sig: "0".repeat(128)
        }
      ];
    });
    const endless = await queryRelaysPaged({ kinds: [30078] }, CALL);
    expect(endless.get(RELAY)).toHaveLength(MAX_PAGES);
  });

  it("keep the pages a relay sent before it stopped answering, and leave out one that never did", async () => {
    store(250, (n) => 1_000_000 + n);
    const fake = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
    const real = fake.queryEvents;
    let calls = 0;
    jest.spyOn(fake, "queryEvents").mockImplementation((url, filter, options) => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("timeout")) : real(url, filter, options);
    });
    const paged = await queryRelaysPaged({ kinds: [30078], authors: [AUTHOR] }, CALL);
    expect(paged.get(RELAY)).toHaveLength(relays.MAX_EVENTS_PER_FILTER);

    relays.unreachable.add(RELAY);
    expect((await queryRelaysPaged({ kinds: [30078] }, CALL)).size).toBe(0);
  });

  describe("of whole answers only", () => {
    const FILTER = { kinds: [30078], authors: [AUTHOR] };
    const WHOLE = { whole: true };
    const fake = () => jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

    it("keep a relay that answered to the end, one second shorter than PAGE_FLOOR included", async () => {
      const events = store(250, (n) => 1_000_000 + n);
      expect(ids((await queryRelaysPaged(FILTER, CALL, WHOLE)).get(RELAY))).toEqual(ids(events));

      // Five events of one second: the page, then the same five again, shorter than PAGE_FLOOR.
      relays.resetRelays();
      const few = store(5, () => 1_000_000);
      expect(ids((await queryRelaysPaged(FILTER, CALL, WHOLE)).get(RELAY))).toEqual(ids(few));
      expect(PAGE_FLOOR).toBeLessThanOrEqual(relays.MAX_EVENTS_PER_FILTER);
    });

    it("keep a second shorter than the longest page the relay sent: it was not cut", async () => {
      // A relay that sends 300 events at once: 200 of their own seconds, then 150 of one second.
      const events = store(350, (n) => (n < 150 ? 1_000_000 : 1_000_000 + n));
      jest.spyOn(fake(), "queryEvents").mockImplementation(async (_, filter) =>
        events
          .filter(({ created_at }) => filter.until === undefined || created_at <= filter.until)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 300)
      );
      const paged = await queryRelaysPaged(FILTER, CALL, WHOLE);
      expect(ids(paged.get(RELAY))).toEqual(ids(events));
    });

    it("leave out a relay whose second may hold more events than it sends at once", async () => {
      // 150 events of one second, between older and newer ones: a page cannot hold them all.
      store(260, (n) => (n < 60 ? 1_000_000 + n : n < 210 ? 1_000_100 : 1_000_200 + n));
      expect((await queryRelaysPaged(FILTER, CALL)).get(RELAY)?.length).toBeGreaterThan(0);
      expect((await queryRelaysPaged(FILTER, CALL, WHOLE)).size).toBe(0);
    });

    it("leave out a relay that failed after its first page, sent what cannot be paged, or never ended", async () => {
      store(250, (n) => 1_000_000 + n);
      const real = fake().queryEvents;
      let calls = 0;
      const spy = jest.spyOn(fake(), "queryEvents").mockImplementation((url, filter, options) => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error("timeout")) : real(url, filter, options);
      });
      expect((await queryRelaysPaged(FILTER, CALL, WHOLE)).size).toBe(0);

      // A second page of nothing but what has neither id nor date.
      calls = 0;
      spy.mockImplementation((url, filter, options) => {
        calls += 1;
        // What a relay sends is unchecked: anything may come.
        const junk = [{ junk: true }] as unknown as NostrEvent[];
        return calls === 2 ? Promise.resolve(junk) : real(url, filter, options);
      });
      expect((await queryRelaysPaged(FILTER, CALL)).get(RELAY)).toHaveLength(100);
      calls = 0;
      expect((await queryRelaysPaged(FILTER, CALL, WHOLE)).size).toBe(0);

      // A new event at each page, always of the same second: MAX_PAGES pages and more.
      let page = 0;
      spy.mockImplementation(async () => {
        page += 1;
        return [
          {
            id: page.toString(16).padStart(64, "0"),
            pubkey: AUTHOR,
            created_at: 1_000_000,
            kind: 30078,
            tags: [],
            content: "",
            sig: "0".repeat(128)
          }
        ];
      });
      expect((await queryRelaysPaged(FILTER, CALL, WHOLE)).size).toBe(0);
    });
  });
});

describe("copies to other relays", () => {
  const FROM = ["wss://old-a.example.com", "wss://old-b.example.com"];
  const TO = "wss://new.example.com";
  const key = new Uint8Array(32).fill(7);
  const sign = (d: string, createdAt: number) =>
    signEvent({ kind: 30078, created_at: createdAt, tags: [["d", d]], content: d }, key);

  it("give the newest copy of each address, as it is, and nothing that does not check out", async () => {
    const older = sign("profile", 1_000_000);
    const newer = sign("profile", 1_000_100);
    const sale = sign("sale", 1_000_050);
    const forged = { ...sign("forged", 1_000_200), content: "altered" };
    relays.stored.set(FROM[0], [older, sale]);
    relays.stored.set(FROM[1], [newer, sale, forged]);
    const author = older.pubkey;

    const copied = await copyEvents(
      { kinds: [30078], authors: [author] },
      { relays: FROM, channel: "account", timeoutMs: 1000, authKey: key },
      [TO]
    );
    expect(copied).toBe(2);
    expect(new Set(relays.stored.get(TO)?.map(({ id }) => id))).toEqual(
      new Set([newer.id, sale.id])
    );
    // Again: the relay holds them already, nothing is lost.
    await expect(
      copyEvents(
        { kinds: [30078], authors: [author] },
        { relays: FROM, channel: "account", timeoutMs: 1000, authKey: key },
        [TO]
      )
    ).resolves.toBe(2);
  });

  it("give an event a relay sent altered under its id, from the relays that sent it whole", async () => {
    const sale = sign("sale", 1_000_050);
    // The first relay answers first, with the same id over another content.
    relays.stored.set(FROM[0], [{ ...sale, content: "altered" }]);
    relays.stored.set(FROM[1], [sale]);
    await expect(
      copyEvents(
        { kinds: [30078], authors: [sale.pubkey] },
        { relays: FROM, channel: "account", timeoutMs: 1000, authKey: key },
        [TO]
      )
    ).resolves.toBe(1);
    expect(relays.stored.get(TO)?.map(({ id, content }) => [id, content])).toEqual([
      [sale.id, "sale"]
    ]);
  });

  it("say whether the copy is whole: every event on a majority, from a majority's answers", async () => {
    const sale = sign("sale", 1_000_050);
    relays.stored.set(FROM[0], [sale]);
    relays.stored.set(FROM[1], [sale]);
    const filter = { kinds: [30078], authors: [sale.pubkey] };
    const from = { relays: FROM, channel: "account" as const, timeoutMs: 1000, authKey: key };
    // The relay to copy to refuses it: not whole.
    relays.readOnly.add(TO);
    await expect(copyEveryEvent(filter, from, [TO])).resolves.toBe(false);
    relays.readOnly.delete(TO);
    await expect(copyEveryEvent(filter, from, [TO])).resolves.toBe(true);
    // Fewer than a majority of the relays to copy from answered: what the others hold is unknown.
    for (const relay of FROM) relays.unreachable.add(relay);
    await expect(copyEveryEvent(filter, from, [TO])).resolves.toBe(false);
  });

  it("leave unchecked the rest of what a relay sent once it sent too much that does not check out", () => {
    const signedBy = (secret: number, d: string) =>
      signEvent(
        { kind: 30078, created_at: 1_790_000_000, tags: [["d", d]], content: "" },
        new Uint8Array(32).fill(secret)
      );
    const forged = Array.from({ length: MAX_INVALID_EVENTS + 20 }, (_, n) => ({
      ...signedBy(3, `forged ${n}`),
      sig: "0".repeat(128)
    }));
    const kept = signedBy(3, "kept");
    const elsewhere = signedBy(4, "elsewhere");
    const checks = jest.spyOn(eventModule, "isValidEvent");
    const events = newestEvents(
      new Map<string, unknown[]>([
        // Below the bound, a relay's valid events still count.
        [FROM[0]!, [...forged.slice(0, MAX_INVALID_EVENTS - 1), kept]],
        [FROM[1]!, [...forged, signedBy(3, "too late")]],
        [TO, [elsewhere]]
      ])
    );
    expect(events.map(({ tags }) => tags[0]![1])).toEqual(["kept", "elsewhere"]);
    expect(checks).toHaveBeenCalledTimes(MAX_INVALID_EVENTS - 1 + 1 + MAX_INVALID_EVENTS + 1);
  });

  it("say when no relay to copy from answered", async () => {
    for (const relay of FROM) relays.unreachable.add(relay);
    await expect(
      copyEvents(
        { kinds: [30078] },
        { relays: FROM, channel: "account", timeoutMs: 1000, authKey: key },
        [TO]
      )
    ).resolves.toBeNull();
    expect(relays.stored.get(TO)).toBeUndefined();
  });
});

describe("watches", () => {
  const SECRET = new Uint8Array(32).fill(7);
  const signed = (d: string, createdAt = 1_790_000_000) =>
    signEvent({ kind: 30078, created_at: createdAt, tags: [["d", d]], content: "" }, SECRET);
  const OTHER = "wss://other.example.com";
  const watches = () => relays.calls.filter(({ operation }) => operation === "watch");

  afterEach(() => {
    jest.useRealTimers();
  });

  it("hand over what each relay holds, then each event it takes, checked, until stopped", async () => {
    const held = signed("held");
    relays.stored.set(RELAY, [held, { ...signed("forged"), sig: "0".repeat(128) }]);
    const received: [string, string][] = [];
    const stop = watchRelays(
      { kinds: [30078] },
      { ...CALL, relays: [RELAY, OTHER] },
      (event, relay) => received.push([event.tags[0][1], relay])
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([["held", RELAY]]);

    // Published later: each relay that takes it sends it at once.
    await relays.publishEvent(OTHER, signed("later"), {
      channel: "account",
      timeoutMs: 1000
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([
      ["held", RELAY],
      ["later", OTHER]
    ]);

    stop();
    expect(relays.watches.size).toBe(0);
    await relays.publishEvent(OTHER, signed("after", 1_790_000_001), {
      channel: "account",
      timeoutMs: 1000
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toHaveLength(2);
  });

  it("connect a relay again after a lost connection, waiting longer each time, up to a minute", async () => {
    jest.useFakeTimers();
    relays.unreachable.add(RELAY);
    const stop = watchRelays({}, CALL, () => undefined);
    await jest.advanceTimersByTimeAsync(0);
    expect(watches()).toHaveLength(1);

    // 1 s, 2 s, 4 s… then a minute at most between two attempts.
    const delays: number[] = [];
    let last = Date.now();
    while (delays.length < 9) {
      await jest.advanceTimersByTimeAsync(1000);
      if (watches().length > delays.length + 1) {
        delays.push(Date.now() - last);
        last = Date.now();
      }
    }
    expect(delays).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60].map((s) => s * 1000));
    expect(WATCH_RETRY_MIN_MS).toBe(1000);
    expect(WATCH_RETRY_MAX_MS).toBe(60_000);

    // Back: the watch holds; a connection lost after a long while is tried again within a second.
    relays.unreachable.delete(RELAY);
    await jest.advanceTimersByTimeAsync(WATCH_RETRY_MAX_MS);
    expect(relays.watches.size).toBe(1);
    const count = watches().length;
    await jest.advanceTimersByTimeAsync(10 * WATCH_RETRY_MAX_MS);
    relays.dropWatches(RELAY);
    await jest.advanceTimersByTimeAsync(WATCH_RETRY_MIN_MS);
    expect(watches()).toHaveLength(count + 1);
    expect(relays.watches.size).toBe(1);

    // Stopped: no connection left, none tried again.
    stop();
    expect(relays.watches.size).toBe(0);
    await jest.advanceTimersByTimeAsync(10 * WATCH_RETRY_MAX_MS);
    expect(watches()).toHaveLength(count + 1);
  });

  it("hand over each event once, whichever relays send it and however often", async () => {
    const held = signed("held");
    relays.stored.set(RELAY, [held]);
    relays.stored.set(OTHER, [held]);
    const received: string[] = [];
    const stop = watchRelays({ kinds: [30078] }, { ...CALL, relays: [RELAY, OTHER] }, (event) =>
      received.push(event.id)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([held.id]);
    stop();
  });

  it("check no signature outside the filter, and give up for a while a relay that sends what does not check out", async () => {
    jest.useFakeTimers();
    const author = signed("x").pubkey;
    const filter = { kinds: [30078], authors: [author] };
    const checks = jest.spyOn(eventModule, "isValidEvent");
    const received: [string, string][] = [];
    const stop = watchRelays(filter, { ...CALL, relays: [RELAY, OTHER] }, (event, relay) =>
      received.push([event.tags[0]![1]!, relay])
    );
    await jest.advanceTimersByTimeAsync(0);
    const watchesOf = (relay: string) => watches().filter((call) => call.relay === relay).length;

    // Signed, by another author: outside the filter, never checked.
    const stranger = signEvent(
      { kind: 30078, created_at: 1_790_000_000, tags: [["d", "stranger"]], content: "" },
      new Uint8Array(32).fill(9)
    );
    relays.sendToWatches(RELAY, [stranger]);
    expect(checks).not.toHaveBeenCalled();

    // Its id right, its signature forged: each a full check, as many as the bound allows.
    const forged = (n: number) => ({ ...signed(`forged ${n}`), sig: "0".repeat(128) });
    relays.sendToWatches(
      RELAY,
      Array.from({ length: MAX_INVALID_EVENTS + 20 }, (_, n) => forged(n))
    );
    expect(checks).toHaveBeenCalledTimes(MAX_INVALID_EVENTS - 1);
    expect(watchesOf(RELAY)).toBe(1);
    expect([...relays.watches].map(({ relay }) => relay)).toEqual([OTHER]);

    // The other relay goes on.
    await relays.publishEvent(OTHER, signed("sound"), { channel: "account", timeoutMs: 1000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(received).toEqual([["sound", OTHER]]);

    // Connected again later, as after a lost connection: the same lies cost the same bound again.
    await jest.advanceTimersByTimeAsync(WATCH_RETRY_MIN_MS);
    expect(watchesOf(RELAY)).toBe(2);
    checks.mockClear();
    relays.sendToWatches(
      RELAY,
      Array.from({ length: MAX_INVALID_EVENTS + 20 }, (_, n) => forged(n))
    );
    expect(checks).toHaveBeenCalledTimes(MAX_INVALID_EVENTS);
    await jest.advanceTimersByTimeAsync(WATCH_RETRY_MIN_MS);
    expect(watchesOf(RELAY)).toBe(2);
    await jest.advanceTimersByTimeAsync(WATCH_RETRY_MIN_MS);
    expect(watchesOf(RELAY)).toBe(3);
    stop();
  });

  it("stop with the call's signal", async () => {
    const controller = new AbortController();
    watchRelays({}, { ...CALL, signal: controller.signal }, () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(relays.watches.size).toBe(1);
    controller.abort();
    expect(relays.watches.size).toBe(0);
  });
});
