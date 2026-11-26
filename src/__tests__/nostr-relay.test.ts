import { AppState, type AppStateStatus } from "react-native";

import { deriveBackupKeys } from "@/lib/backup/keys";
import * as log from "@/lib/log/log";
import * as nostrEvent from "@/lib/nostr/event";
import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import type * as Relay from "@/lib/nostr/relay";
import {
  MAX_EVENTS_PER_QUERY,
  MAX_INVALID_EVENTS,
  MAX_MESSAGE_LENGTH
} from "@/lib/nostr/relay-bounds";
import { QueryClosed, refusesReads } from "@/lib/nostr/relay-errors";
import { encodeWalletSecret } from "@/lib/breez/secret";

/** The client's AppState listener (it follows the app to the background): the tests drive it. */
const appStateListeners = new Set<(state: AppStateStatus) => void>();
jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
  appStateListeners.add(listener);
  return { remove: () => appStateListeners.delete(listener) } as unknown as ReturnType<
    typeof AppState.addEventListener
  >;
});

// jest.setup.ts swaps the client for in-memory relays: this file tests the real one.
const {
  HEARTBEAT_TIMEOUT_MS,
  IDLE_CLOSE_MS,
  MAX_SUBSCRIPTIONS,
  SLOT_WAIT_MAX_MS,
  HEARTBEAT_MS,
  closeRelayConnections,
  publishEvent,
  queryEvents,
  watchEvents
} = jest.requireActual<typeof Relay>("../lib/nostr/relay");

const URL = "wss://relay.example";
const keys = deriveBackupKeys(encodeWalletSecret({ mnemonic: "test test test" }));
const event = signEvent(
  { kind: 30078, created_at: 1790000000, tags: [["d", "x"]], content: "sealed" },
  keys.secretKey
);

type Reply = (message: unknown[]) => void;

/**
 * A call's timeout where a test does not wait for it to run out. The fake relays answer within
 * milliseconds, but a loaded CI runner can leave a test without CPU for longer than a second
 * (1 s ran out on one): what waits on real time leaves room for that.
 */
const TIMEOUT_MS = 5000;

/** Waits until `condition` holds: the fake relay answers over several timer turns. */
async function until(condition: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * A WebSocket whose relay side is `relay`: it gets each message the client sends, and a function
 * to answer it. `open: false` never opens the connection.
 */
function fakeSocket(relay: (message: unknown[], reply: Reply) => void, open = true) {
  const sent: unknown[][] = [];
  let closed = false;
  const socket = {
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as (() => void) | null,
    onclose: null as (() => void) | null,
    send(data: string) {
      const message = JSON.parse(data) as unknown[];
      sent.push(message);
      // Relays answer asynchronously.
      setTimeout(() => relay(message, reply), 0);
    },
    close() {
      closed = true;
    }
  };
  const reply: Reply = (message) =>
    setTimeout(() => socket.onmessage?.({ data: JSON.stringify(message) }), 0);
  if (open) setTimeout(() => socket.onopen?.(), 0);
  return {
    sent,
    isClosed: () => closed,
    socket,
    // A connection of the call's own: what these tests check of each call's socket.
    options: (timeoutMs = TIMEOUT_MS) => ({
      channel: "single" as const,
      timeoutMs,
      authKeys: [keys.secretKey],
      createSocket: () => socket as unknown as WebSocket
    })
  };
}

type FakeConnection = ReturnType<typeof fakeSocket> & { authed: Set<string> };

/**
 * A relay that takes any number of connections: `relay` gets each message with the connection it
 * came on (its keys authenticated in `authed`). Calls given `options` share connections as the app's
 * do (one socket factory).
 */
function fakeRelay(relay: (message: unknown[], reply: Reply, connection: FakeConnection) => void) {
  const connections: FakeConnection[] = [];
  const createSocket = jest.fn((_url: string): WebSocket => {
    const connection: FakeConnection = {
      ...fakeSocket((message, reply) => relay(message, reply, connection)),
      authed: new Set()
    };
    connections.push(connection);
    return connection.socket as unknown as WebSocket;
  });
  return {
    connections,
    createSocket,
    options: (
      channel: Relay.RelayChannel,
      {
        timeoutMs = TIMEOUT_MS,
        signal,
        secretKeys = [keys.secretKey]
      }: {
        timeoutMs?: number;
        signal?: AbortSignal;
        secretKeys?: Uint8Array[];
      } = {}
    ): Relay.RelayOptions => ({
      channel,
      timeoutMs,
      signal,
      authKeys: secretKeys,
      createSocket
    })
  };
}

/** The ids of the subscriptions `sent` opened (REQ) and closed (CLOSE). */
function subscriptions(sent: unknown[][]) {
  return {
    opened: sent.filter(([type]) => type === "REQ").map(([, id]) => id),
    closed: sent.filter(([type]) => type === "CLOSE").map(([, id]) => id)
  };
}

/** Answers each REQ with `events` then EOSE, each event with OK. */
function answering(...events: NostrEvent[]) {
  return (message: unknown[], reply: Reply) => {
    if (message[0] === "REQ") {
      for (const stored of events) reply(["EVENT", message[1], stored]);
      reply(["EOSE", message[1]]);
    } else if (message[0] === "EVENT") {
      reply(["OK", (message[1] as NostrEvent).id, true, ""]);
    }
  };
}

afterEach(() => closeRelayConnections());

describe("Nostr relay client", () => {
  it("publishes an event, then closes the connection", async () => {
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "EVENT") reply(["OK", (message[1] as NostrEvent).id, true, ""]);
    });

    await publishEvent(URL, event, relay.options());

    expect(relay.sent).toEqual([["EVENT", event]]);
    expect(relay.isClosed()).toBe(true);
  });

  it("rejects when the relay refuses the event", async () => {
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "EVENT") reply(["OK", event.id, false, "blocked: no thanks"]);
    });

    await expect(publishEvent(URL, event, relay.options())).rejects.toThrow(/blocked: no thanks/);
    expect(relay.isClosed()).toBe(true);
  });

  it("authenticates when the relay asks for it, then publishes again (NIP-42)", async () => {
    let authenticated = false;
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "EVENT") {
        reply(["OK", event.id, authenticated, authenticated ? "" : "auth-required: sign in"]);
      } else if (message[0] === "AUTH") {
        const auth = message[1] as NostrEvent;
        authenticated = auth.tags.some(([name, value]) => name === "challenge" && value === "c1");
        reply(["OK", auth.id, authenticated, ""]);
      }
    }, false);
    // The relay sends its challenge as soon as the client connects.
    setTimeout(() => {
      relay.socket.onmessage?.({ data: JSON.stringify(["AUTH", "c1"]) });
      relay.socket.onopen?.();
    }, 0);
    await publishEvent(URL, event, relay.options());

    const auth = relay.sent.find(([type]) => type === "AUTH")?.[1] as NostrEvent;
    expect(auth).toMatchObject({
      kind: 22242,
      pubkey: keys.publicKey,
      tags: [
        ["relay", URL],
        ["challenge", "c1"]
      ]
    });
    expect(relay.sent.map(([type]) => type)).toEqual(["EVENT", "AUTH", "EVENT"]);
  });

  it("reads the stored events until EOSE", async () => {
    const other = { ...event, id: "other" };
    const relay = fakeSocket((message, reply) => {
      if (message[0] !== "REQ") return;
      reply(["EVENT", message[1], event]);
      // Another subscription's event, then non-JSON noise: ignored.
      reply(["EVENT", "elsewhere", other]);
      setTimeout(() => relay.socket.onmessage?.({ data: "not json" }), 0);
      reply(["EOSE", message[1]]);
    });
    const filter = { kinds: [30078], authors: [keys.publicKey], "#d": ["x"] };

    await expect(queryEvents(URL, filter, relay.options())).resolves.toEqual([event]);
    expect(relay.sent).toEqual([["REQ", expect.stringMatching(/^[0-9a-f]{16}$/), filter]]);
    expect(relay.isClosed()).toBe(true);
  });

  it("authenticates when a query is closed as auth-required, then asks again", async () => {
    let authenticated = false;
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "REQ") {
        if (!authenticated) {
          reply(["AUTH", "c2"]);
          reply(["CLOSED", message[1], "auth-required: owners only"]);
        } else {
          reply(["EVENT", message[1], event]);
          reply(["EOSE", message[1]]);
        }
      } else if (message[0] === "AUTH") {
        authenticated = true;
        reply(["OK", (message[1] as NostrEvent).id, true, ""]);
      }
    });

    await expect(queryEvents(URL, {}, relay.options())).resolves.toEqual([event]);
    expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "AUTH", "REQ"]);
    // Random subscription ids, a new one for the second query: they tell the relay nothing.
    const [first, second] = relay.sent.filter(([type]) => type === "REQ").map(([, id]) => id);
    expect(first).not.toBe(second);
  });

  it("authenticates when the relay holds events back for an authenticated reader (NIP-67)", async () => {
    const other = { ...event, id: "other" };
    let authenticated = false;
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "REQ") {
        if (authenticated) {
          reply(["EVENT", message[1], other]);
          reply(["EVENT", message[1], event]);
          reply(["EOSE", message[1], ["finish"]]);
        } else {
          // What anyone may read, then the hint: more for an authenticated reader.
          reply(["AUTH", "c7"]);
          reply(["EVENT", message[1], other]);
          reply(["EOSE", message[1], ["auth"]]);
        }
      } else if (message[0] === "AUTH") {
        authenticated = true;
        reply(["OK", (message[1] as NostrEvent).id, true, ""]);
      }
    });

    await expect(queryEvents(URL, {}, relay.options())).resolves.toEqual([other, event]);
    expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "AUTH", "REQ"]);
  });

  it("rejects an answer the relay still holds events back from, never taken for all it holds", async () => {
    const hinting = (challenge: boolean) =>
      fakeSocket((message, reply) => {
        if (message[0] === "REQ") {
          if (challenge) reply(["AUTH", "c8"]);
          reply(["EVENT", message[1], event]);
          reply(["EOSE", message[1], ["auth"]]);
        } else if (message[0] === "AUTH") {
          reply(["OK", (message[1] as NostrEvent).id, true, ""]);
        }
      });
    // Authenticated, the relay still holds some back.
    const still = hinting(true);
    await expect(queryEvents(URL, {}, still.options())).rejects.toThrow(/NIP-67/);
    expect(still.sent.map(([type]) => type)).toEqual(["REQ", "AUTH", "REQ"]);
    // No challenge to answer: nothing to authenticate with.
    const silent = hinting(false);
    await expect(queryEvents(URL, {}, silent.options())).rejects.toThrow(/NIP-67/);
    expect(silent.sent.map(([type]) => type)).toEqual(["REQ"]);
  });

  it("authenticates as each key of the call on one connection, then asks again (NIP-42)", async () => {
    const other = deriveBackupKeys(encodeWalletSecret({ mnemonic: "other other other" }));
    const authed = new Set<string>();
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "REQ") {
        // Each author's events to that author only.
        if (authed.size < 2) {
          reply(["AUTH", "c6"]);
          reply(["CLOSED", message[1], "auth-required: authors only"]);
        } else {
          reply(["EVENT", message[1], event]);
          reply(["EOSE", message[1]]);
        }
      } else if (message[0] === "AUTH") {
        const auth = message[1] as NostrEvent;
        authed.add(auth.pubkey);
        reply(["OK", auth.id, true, ""]);
      }
    });
    const options = relay.options();
    const authKeys = [keys.secretKey, other.secretKey];

    const filter = { authors: [keys.publicKey, other.publicKey] };
    await expect(queryEvents(URL, filter, { ...options, authKeys })).resolves.toEqual([event]);
    expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "AUTH", "AUTH", "REQ"]);
    expect(authed).toEqual(new Set([keys.publicKey, other.publicKey]));
  });

  it("rejects a query the relay closes", async () => {
    const relay = fakeSocket((message, reply) => {
      if (message[0] === "REQ") reply(["CLOSED", message[1], "error: shutting down"]);
    });

    await expect(queryEvents(URL, {}, relay.options())).rejects.toThrow(/shutting down/);
  });

  it("tells a query refused for whom it comes from: restricted, or still unauthenticated", async () => {
    const reasons = ["restricted: authors only", "auth-required: members only", "error: full"];
    const refused = await Promise.all(
      reasons.map(async (reason) => {
        const relay = fakeSocket((message, reply) => {
          if (message[0] === "REQ") reply(["CLOSED", message[1], reason]);
        });
        const error: unknown = await queryEvents(URL, {}, relay.options()).catch((e) => e);
        expect(error).toBeInstanceOf(QueryClosed);
        expect((error as QueryClosed).reason).toBe(reason);
        return refusesReads(error);
      })
    );
    expect(refused).toEqual([true, true, false]);
  });

  it("gives up on a relay that does not answer in time", async () => {
    jest.useFakeTimers();
    try {
      const silent = fakeSocket(() => undefined, false);
      const query = queryEvents(URL, {}, silent.options(5000));
      const failure = expect(query).rejects.toThrow(/no answer in time/);
      await jest.advanceTimersByTimeAsync(5000);
      await failure;
      expect(silent.isClosed()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("closes a connection given up on while it connects, once it opens", async () => {
    jest.useFakeTimers();
    try {
      // As in React Native on Android: close() does nothing until the socket is open.
      let closed = false;
      const socket = {
        readyState: 0,
        onopen: null as (() => void) | null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: () => undefined,
        close() {
          if (socket.readyState === 1) closed = true;
        }
      };
      const query = queryEvents(
        URL,
        {},
        {
          ...fakeSocket(() => undefined, false).options(5000),
          createSocket: () => socket as unknown as WebSocket
        }
      );
      const failure = expect(query).rejects.toThrow(/no answer in time/);
      await jest.advanceTimersByTimeAsync(5000);
      await failure;
      expect(closed).toBe(false);

      // The connection opens late: it is closed right away.
      socket.readyState = 1;
      socket.onopen?.();
      expect(closed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops at once when aborted: rejects and closes the connection", async () => {
    const silent = fakeSocket(() => undefined);
    const controller = new AbortController();
    const query = queryEvents(URL, {}, { ...silent.options(), signal: controller.signal });

    controller.abort();

    await expect(query).rejects.toThrow(/aborted/);
    expect(silent.isClosed()).toBe(true);
  });

  it("does not connect once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const createSocket = jest.fn();

    await expect(
      publishEvent(URL, event, {
        ...fakeSocket(() => undefined).options(),
        createSocket,
        signal: controller.signal
      })
    ).rejects.toThrow(/aborted/);
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("answers no authentication challenge once aborted: the keys may be wiped", async () => {
    const controller = new AbortController();
    const relay = fakeSocket((message) => {
      if (message[0] !== "REQ") return;
      relay.socket.onmessage?.({ data: JSON.stringify(["AUTH", "c3"]) });
      relay.socket.onmessage?.({
        data: JSON.stringify(["CLOSED", message[1], "auth-required: owners only"])
      });
      // Before the client's next step runs.
      controller.abort();
    });
    // A key given at each challenge: never asked for.
    const key = jest.fn(() => keys.secretKey);

    await expect(
      queryEvents(URL, {}, { ...relay.options(), authKeys: [key], signal: controller.signal })
    ).rejects.toThrow(/aborted/);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(key).not.toHaveBeenCalled();
    expect(relay.sent.map(([type]) => type)).toEqual(["REQ"]);
  });

  it("rejects when the connection fails or closes", async () => {
    const failing = fakeSocket(() => undefined, false);
    const failed = publishEvent(URL, event, failing.options());
    failing.socket.onerror?.();
    await expect(failed).rejects.toThrow(/connection failed/);

    const closing = fakeSocket((_message, _reply) => closing.socket.onclose?.());
    await expect(queryEvents(URL, {}, closing.options())).rejects.toThrow(/connection closed/);
  });

  describe("watch", () => {
    it("hands over the stored events, then each one received after EOSE, until aborted", async () => {
      const later = { ...event, id: "later" };
      let subscription = "";
      const relay = fakeSocket((message, reply) => {
        if (message[0] !== "REQ") return;
        subscription = String(message[1]);
        reply(["EVENT", subscription, event]);
        reply(["EOSE", subscription]);
        reply(["EVENT", "another subscription", { ...event, id: "elsewhere" }]);
      });
      const controller = new AbortController();
      const received: unknown[] = [];
      const watch = watchEvents(
        URL,
        { kinds: [30078] },
        { ...relay.options(), signal: controller.signal },
        (value) => {
          received.push(value);
        }
      );
      const ended = expect(watch).rejects.toThrow(/aborted/);
      await until(() => received.length > 0);
      // Past EOSE, nothing ends the watch: it stays open.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(received).toEqual([event]);
      expect(relay.isClosed()).toBe(false);

      // Published later: the relay sends it on the subscription still open.
      relay.socket.onmessage?.({ data: JSON.stringify(["EVENT", subscription, later]) });
      expect(received).toEqual([event, later]);

      controller.abort();
      await ended;
      expect(relay.isClosed()).toBe(true);
      expect(relay.sent).toEqual([["REQ", subscription, { kinds: [30078] }]]);
    });

    it("bounds only the opening with its timeout: an open watch lasts", async () => {
      jest.useFakeTimers();
      try {
        const silent = fakeSocket(() => undefined, false);
        const neverOpen = watchEvents(URL, {}, silent.options(5000), () => undefined);
        const failure = expect(neverOpen).rejects.toThrow(/no answer in time/);
        await jest.advanceTimersByTimeAsync(5000);
        await failure;
        expect(silent.isClosed()).toBe(true);

        // A relay that sends nothing, but answers each request (the heartbeats).
        const quiet = fakeSocket((message, reply) => {
          if (message[0] === "REQ") reply(["EOSE", message[1]]);
        });
        const controller = new AbortController();
        const watch = watchEvents(
          URL,
          {},
          { ...quiet.options(5000), signal: controller.signal },
          () => undefined
        );
        const ended = expect(watch).rejects.toThrow(/aborted/);
        await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(quiet.isClosed()).toBe(false);
        controller.abort();
        await ended;
      } finally {
        jest.useRealTimers();
      }
    });

    it("authenticates when the subscription is closed as auth-required, then subscribes again", async () => {
      let authenticated = false;
      const relay = fakeSocket((message, reply) => {
        if (message[0] === "REQ") {
          if (authenticated) reply(["EVENT", message[1], event]);
          else reply(["CLOSED", message[1], "auth-required: members only"]);
        } else if (message[0] === "AUTH") {
          authenticated = true;
          reply(["OK", (message[1] as NostrEvent).id, true, ""]);
        }
      }, false);
      setTimeout(() => {
        relay.socket.onmessage?.({ data: JSON.stringify(["AUTH", "c4"]) });
        relay.socket.onopen?.();
      }, 0);
      const controller = new AbortController();
      const received: unknown[] = [];
      const watch = watchEvents(
        URL,
        {},
        { ...relay.options(), signal: controller.signal },
        (value) => {
          received.push(value);
        }
      );
      const ended = expect(watch).rejects.toThrow(/aborted/);
      await until(() => received.length > 0);

      expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "AUTH", "REQ"]);
      expect(received).toEqual([event]);
      controller.abort();
      await ended;
    });

    it("authenticates when the relay holds events back (NIP-67), then subscribes again", async () => {
      let authenticated = false;
      const relay = fakeSocket((message, reply) => {
        if (message[0] === "REQ") {
          if (authenticated) {
            reply(["EVENT", message[1], event]);
          } else {
            reply(["AUTH", "c9"]);
            reply(["EOSE", message[1], ["auth"]]);
          }
        } else if (message[0] === "AUTH") {
          authenticated = true;
          reply(["OK", (message[1] as NostrEvent).id, true, ""]);
        }
      });
      const controller = new AbortController();
      const received: unknown[] = [];
      const watch = watchEvents(
        URL,
        {},
        { ...relay.options(), signal: controller.signal },
        (value) => {
          received.push(value);
        }
      );
      const ended = expect(watch).rejects.toThrow(/aborted/);
      await until(() => received.length > 0);

      // The first subscription closed, then the same filter again once authenticated.
      expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "CLOSE", "AUTH", "REQ"]);
      expect(received).toEqual([event]);
      controller.abort();
      await ended;
    });

    it("gives up an authentication the relay never answers, within its timeout", async () => {
      jest.useFakeTimers();
      try {
        const relay = fakeSocket((message, reply) => {
          if (message[0] === "REQ") reply(["CLOSED", message[1], "auth-required: members only"]);
        }, false);
        setTimeout(() => {
          relay.socket.onmessage?.({ data: JSON.stringify(["AUTH", "c5"]) });
          relay.socket.onopen?.();
        }, 0);
        const watch = watchEvents(URL, {}, relay.options(5000), () => undefined);
        const failure = expect(watch).rejects.toThrow(/auth-required/);
        // The wait starts once the relay closed the subscription: a few milliseconds in.
        await jest.advanceTimersByTimeAsync(5000 + 10);
        await failure;
        expect(relay.sent.map(([type]) => type)).toEqual(["REQ", "AUTH"]);
        expect(relay.isClosed()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it("checks every 10 s that the connection answers, and keeps a connection that does", async () => {
      jest.useFakeTimers();
      try {
        const relay = fakeSocket((message, reply) => {
          if (message[0] === "REQ") reply(["EOSE", message[1]]);
        });
        const controller = new AbortController();
        const watch = watchEvents(
          URL,
          { kinds: [30078] },
          { ...relay.options(5000), signal: controller.signal },
          () => undefined
        );
        const ended = expect(watch).rejects.toThrow(/aborted/);
        await jest.advanceTimersByTimeAsync(0);
        expect(relay.sent).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(HEARTBEAT_MS + 1000);
        // A request that matches nothing (no event has this id), closed once answered.
        const [, beat, filter] = relay.sent[1];
        expect(filter).toEqual({ ids: ["0".repeat(64)], limit: 1 });
        expect(relay.sent[2]).toEqual(["CLOSE", beat]);

        await jest.advanceTimersByTimeAsync(10 * HEARTBEAT_MS);
        expect(relay.sent).toHaveLength(1 + 11 * 2);
        expect(relay.isClosed()).toBe(false);

        controller.abort();
        await ended;
        // Nothing more once stopped.
        await jest.advanceTimersByTimeAsync(10 * HEARTBEAT_MS);
        expect(relay.sent).toHaveLength(1 + 11 * 2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("gives up a connection that stopped answering, at its next heartbeat", async () => {
      jest.useFakeTimers();
      try {
        // As a connection cut without a close: the relay no longer gets anything.
        let cut = false;
        const relay = fakeSocket((message, reply) => {
          if (!cut && message[0] === "REQ") reply(["EOSE", message[1]]);
        });
        const watch = watchEvents(URL, {}, relay.options(5000), () => undefined);
        const failure = expect(watch).rejects.toThrow(/no answer to the heartbeat/);
        await jest.advanceTimersByTimeAsync(2 * HEARTBEAT_MS + 1000);
        expect(relay.isClosed()).toBe(false);
        expect(relay.sent.filter(([type]) => type === "CLOSE")).toHaveLength(2);

        // Cut a second after the second heartbeat: the third gets no answer within
        // HEARTBEAT_TIMEOUT_MS.
        cut = true;
        // (The fake socket's answers take a millisecond each: a few of drift.)
        await jest.advanceTimersByTimeAsync(HEARTBEAT_MS - 1000 + HEARTBEAT_TIMEOUT_MS - 100);
        expect(relay.isClosed()).toBe(false);
        await jest.advanceTimersByTimeAsync(200);
        await failure;
        expect(relay.isClosed()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it("rejects when the relay closes the subscription or the connection", async () => {
      const closing = fakeSocket((message, reply) => {
        if (message[0] === "REQ") reply(["CLOSED", message[1], "error: shutting down"]);
      });
      await expect(watchEvents(URL, {}, closing.options(), () => undefined)).rejects.toThrow(
        /shutting down/
      );
      expect(closing.isClosed()).toBe(true);

      const dropping = fakeSocket((message) => {
        if (message[0] === "REQ") setTimeout(() => dropping.socket.onclose?.(), 0);
      });
      await expect(watchEvents(URL, {}, dropping.options(), () => undefined)).rejects.toThrow(
        /connection closed/
      );
    });
  });

  describe("bounds on what a relay sends", () => {
    /** An EVENT message of `subscription` exactly `length` long: `event` with a longer content. */
    function messageOfLength(subscription: string, length: number) {
      const base = JSON.stringify(["EVENT", subscription, { ...event, content: "" }]).length;
      return JSON.stringify([
        "EVENT",
        subscription,
        { ...event, content: "a".repeat(length - base) }
      ]);
    }

    it(`parses a message of ${MAX_MESSAGE_LENGTH} characters, ends the connection of a longer one unparsed`, async () => {
      const failures = jest.spyOn(log, "logFailure").mockImplementation(() => undefined);
      const parse = jest.spyOn(JSON, "parse");
      try {
        const answering = (length: number) => {
          const relay = fakeSocket((message, reply) => {
            if (message[0] !== "REQ") return;
            setTimeout(
              () => relay.socket.onmessage?.({ data: messageOfLength(String(message[1]), length) }),
              0
            );
            reply(["EOSE", message[1]]);
          });
          return relay;
        };

        const longest = answering(MAX_MESSAGE_LENGTH);
        const [received] = await queryEvents(URL, {}, longest.options());
        // Its subscription id: 16 hex characters.
        expect(JSON.stringify(["EVENT", "0".repeat(16), received])).toHaveLength(
          MAX_MESSAGE_LENGTH
        );
        expect(failures).not.toHaveBeenCalled();

        parse.mockClear();
        const tooLong = answering(MAX_MESSAGE_LENGTH + 1);
        await expect(queryEvents(URL, {}, tooLong.options())).rejects.toThrow(/message too long/);
        expect(tooLong.isClosed()).toBe(true);
        // Never parsed: the relay's EOSE, sent after it, is not read either.
        expect(parse.mock.calls.some(([text]) => String(text).length > MAX_MESSAGE_LENGTH)).toBe(
          false
        );
        expect(failures).toHaveBeenCalledWith(
          "A relay sent a message too long: its connection closed"
        );
      } finally {
        parse.mockRestore();
        failures.mockRestore();
      }
    });

    it(`takes ${MAX_EVENTS_PER_QUERY} events for a query, rejects one past it, its subscription closed`, async () => {
      const failures = jest.spyOn(log, "logFailure").mockImplementation(() => undefined);
      const sending = (count: number) =>
        fakeSocket((message, reply) => {
          if (message[0] !== "REQ") return;
          for (let n = 0; n < count; n += 1) reply(["EVENT", message[1], { ...event, id: `${n}` }]);
          reply(["EOSE", message[1]]);
        });

      const full = sending(MAX_EVENTS_PER_QUERY);
      await expect(queryEvents(URL, {}, full.options())).resolves.toHaveLength(
        MAX_EVENTS_PER_QUERY
      );
      expect(failures).not.toHaveBeenCalled();

      const endless = sending(MAX_EVENTS_PER_QUERY + 1);
      await expect(queryEvents(URL, {}, endless.options())).rejects.toThrow(
        `${URL}: more than ${MAX_EVENTS_PER_QUERY} events for one query`
      );
      const { opened, closed } = subscriptions(endless.sent);
      expect(closed).toEqual(opened);
      expect(endless.isClosed()).toBe(true);
      expect(failures).toHaveBeenCalledWith("A relay sent more events than a query takes");
      failures.mockRestore();
    });

    it("hands a watch only the events of its filter, ends a connection that keeps sending what does not check out", async () => {
      const failures = jest.spyOn(log, "logFailure").mockImplementation(() => undefined);
      let subscription = "";
      const relay = fakeSocket((message, reply) => {
        if (message[0] !== "REQ") return;
        subscription = String(message[1]);
        reply(["EOSE", subscription]);
      });
      const filter = { kinds: [30078], authors: [keys.publicKey], "#d": ["x"], since: 1 };
      const received: string[] = [];
      const watch = watchEvents(URL, filter, relay.options(), (value) => {
        received.push((value as NostrEvent).id);
        // The caller's check: a forged signature does not check out.
        return !(value as NostrEvent).id.startsWith("forged");
      });
      const ended = expect(watch).rejects.toThrow(`${URL}: events that do not check out`);
      await until(() => subscription !== "");
      const send = (value: unknown) =>
        relay.socket.onmessage?.({ data: JSON.stringify(["EVENT", subscription, value]) });

      // Outside the filter, each in one way: never handed over.
      const outside: unknown[] = [
        { ...event, kind: 1 },
        { ...event, pubkey: "b".repeat(64) },
        { ...event, tags: [["d", "y"]] },
        { ...event, tags: [] },
        { ...event, created_at: 0 },
        "garbage",
        null
      ];
      for (const value of outside) send(value);
      send(event);
      expect(received).toEqual([event.id]);

      // Forged: handed over, refused by the caller. Below the bound, the watch holds.
      const forged = MAX_INVALID_EVENTS - outside.length - 1;
      for (let n = 0; n < forged; n += 1) send({ ...event, id: `forged ${n}` });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(relay.isClosed()).toBe(false);
      expect(failures).not.toHaveBeenCalled();

      // The bound: the connection ends, nothing more is handed over.
      send({ ...event, id: "forged last" });
      await ended;
      expect(relay.isClosed()).toBe(true);
      expect(received).toHaveLength(1 + forged + 1);
      send({ ...event, id: "after" });
      expect(received).not.toContain("after");
      expect(failures).toHaveBeenCalledWith(
        "A relay sent events that do not check out: its connection closed"
      );
      failures.mockRestore();
    });

    it("ends a shared connection whose watch got too many events that do not check out, its other calls with it", async () => {
      const failures = jest.spyOn(log, "logFailure").mockImplementation(() => undefined);
      // The watch's subscription answered, the query's never: it is still waiting on the connection.
      const relay = fakeRelay((message, reply) => {
        if (message[0] === "REQ" && (message[2] as { ids?: string[] }).ids === undefined) {
          reply(["EOSE", message[1]]);
        }
      });
      const watch = watchEvents(URL, { kinds: [30078] }, relay.options("account"), () => false);
      const pending = queryEvents(URL, { ids: ["0".repeat(64)] }, relay.options("account"));
      // The query, made as the connection opened, ends with it.
      const pendingEnded = expect(pending).rejects.toThrow(/events that do not check out/);
      await until(() => relay.connections[0]?.sent.length === 2);
      const [connection] = relay.connections;
      const [watching] = subscriptions(connection!.sent).opened;
      for (let n = 0; n < MAX_INVALID_EVENTS; n += 1) {
        connection!.socket.onmessage?.({
          data: JSON.stringify(["EVENT", watching, { ...event, id: `forged ${n}` }])
        });
      }
      await expect(watch).rejects.toThrow(/events that do not check out/);
      await pendingEnded;
      expect(connection!.isClosed()).toBe(true);
      expect(failures).toHaveBeenCalledTimes(1);
      failures.mockRestore();
    });
  });

  describe("shared connections", () => {
    const OTHER_URL = "wss://other.example";

    it("shares one connection per relay and channel, each call's subscriptions closed once read", async () => {
      const relay = fakeRelay(answering(event));

      const [first, second] = await Promise.all([
        queryEvents(URL, {}, relay.options("account")),
        queryEvents(URL, { kinds: [30078] }, relay.options("account"))
      ]);
      await publishEvent(URL, event, relay.options("account"));
      await expect(queryEvents(URL, {}, relay.options("account"))).resolves.toEqual([event]);

      expect(first).toEqual([event]);
      expect(second).toEqual([event]);
      expect(relay.createSocket).toHaveBeenCalledTimes(1);
      const [account] = relay.connections;
      // Open past the calls, every subscription closed once answered (NIP-01: open past EOSE).
      expect(account!.isClosed()).toBe(false);
      const { opened, closed } = subscriptions(account!.sent);
      expect(opened).toHaveLength(3);
      expect(new Set(closed)).toEqual(new Set(opened));
      expect(new Set(opened).size).toBe(3);

      // The anonymous channel and another relay: connections of their own.
      await queryEvents(URL, {}, relay.options("anonymous"));
      await queryEvents(OTHER_URL, {}, relay.options("account"));
      await queryEvents(URL, {}, relay.options("anonymous"));
      expect(relay.createSocket).toHaveBeenCalledTimes(3);
      expect(relay.createSocket.mock.calls.map(([url]) => url)).toEqual([URL, URL, OTHER_URL]);

      // An account closes: every shared connection with it.
      closeRelayConnections();
      expect(relay.connections.every((connection) => connection.isClosed())).toBe(true);
      await queryEvents(URL, {}, relay.options("account"));
      expect(relay.createSocket).toHaveBeenCalledTimes(4);
    });

    it("authenticates each key once per connection (NIP-42), and only as the call's keys", async () => {
      const other = deriveBackupKeys(encodeWalletSecret({ mnemonic: "other other other" }));
      const relay = fakeRelay((message, reply, connection) => {
        if (message[0] === "REQ") {
          // Each author's events to that author only.
          const { authors = [] } = message[2] as { authors?: string[] };
          if (authors.some((author) => !connection.authed.has(author))) {
            reply(["AUTH", "c1"]);
            reply(["CLOSED", message[1], "auth-required: authors only"]);
          } else {
            reply(["EVENT", message[1], event]);
            reply(["EOSE", message[1]]);
          }
        } else if (message[0] === "AUTH") {
          const auth = message[1] as NostrEvent;
          connection.authed.add(auth.pubkey);
          reply(["OK", auth.id, true, ""]);
        }
      });
      const mine = { authors: [keys.publicKey] };
      const both = { authors: [keys.publicKey, other.publicKey] };
      const sign = jest.spyOn(nostrEvent, "signEvent");

      await expect(queryEvents(URL, mine, relay.options("account"))).resolves.toEqual([event]);
      // Authenticated already: asked at once.
      await expect(queryEvents(URL, mine, relay.options("account"))).resolves.toEqual([event]);
      // Another key: its authentication alone.
      await expect(
        queryEvents(
          URL,
          both,
          relay.options("account", { secretKeys: [keys.secretKey, other.secretKey] })
        )
      ).resolves.toEqual([event]);

      const [connection] = relay.connections;
      expect(relay.createSocket).toHaveBeenCalledTimes(1);
      expect(connection!.sent.map(([type]) => type)).toEqual([
        ...["REQ", "AUTH", "REQ", "CLOSE"],
        ...["REQ", "CLOSE"],
        ...["REQ", "AUTH", "REQ", "CLOSE"]
      ]);
      const auths = connection!.sent.filter(([type]) => type === "AUTH");
      expect(auths.map(([, auth]) => (auth as NostrEvent).pubkey)).toEqual([
        keys.publicKey,
        other.publicKey
      ]);
      // A key authenticated already is not signed for again (a signature's work each).
      expect(sign.mock.calls.filter(([{ kind }]) => kind === 22242)).toHaveLength(2);
      sign.mockRestore();

      // The anonymous channel's connection was never authenticated as these keys.
      await expect(queryEvents(URL, {}, relay.options("anonymous"))).resolves.toEqual([event]);
      expect(relay.connections[1]!.sent.map(([type]) => type)).toEqual(["REQ", "CLOSE"]);
    });

    it(`keeps at most ${MAX_SUBSCRIPTIONS} subscriptions open at once; the others wait`, async () => {
      const held: unknown[] = [];
      let open = 0;
      let most = 0;
      const relay = fakeRelay((message, reply) => {
        if (message[0] === "REQ") {
          open += 1;
          most = Math.max(most, open);
          held.push(message[1]);
        } else if (message[0] === "CLOSE") {
          open -= 1;
        }
      });
      const release = () => {
        for (const subscription of held.splice(0)) {
          relay.connections[0]!.socket.onmessage?.({
            data: JSON.stringify(["EOSE", subscription])
          });
        }
      };
      const reads = Array.from({ length: MAX_SUBSCRIPTIONS + 2 }, () =>
        queryEvents(URL, {}, relay.options("account"))
      );
      // Should an expectation fail, afterEach rejects those still waiting: this test's failure, not
      // the next test's.
      for (const read of reads) void read.catch(() => undefined);
      await until(() => held.length >= MAX_SUBSCRIPTIONS);
      expect(held).toHaveLength(MAX_SUBSCRIPTIONS);

      release();
      await until(() => held.length >= 2);
      expect(held).toHaveLength(2);
      release();
      await expect(Promise.all(reads)).resolves.toHaveLength(MAX_SUBSCRIPTIONS + 2);
      expect(most).toBe(MAX_SUBSCRIPTIONS);
      expect(relay.createSocket).toHaveBeenCalledTimes(1);
    });

    it("ends an aborted call alone: its subscription closed, the connection kept", async () => {
      const relay = fakeRelay(() => undefined);
      const controller = new AbortController();
      const read = queryEvents(URL, {}, relay.options("account", { signal: controller.signal }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      controller.abort();

      await expect(read).rejects.toThrow(/aborted/);
      const [connection] = relay.connections;
      const { opened, closed } = subscriptions(connection!.sent);
      expect(closed).toEqual(opened);
      expect(connection!.isClosed()).toBe(false);
    });

    it("closes a connection left without a call, once idle long enough", async () => {
      jest.useFakeTimers();
      try {
        const relay = fakeRelay(answering(event));
        const read = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await read;
        const [connection] = relay.connections;

        // A call meanwhile starts the wait over.
        await jest.advanceTimersByTimeAsync(IDLE_CLOSE_MS - 1000);
        const again = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await again;
        await jest.advanceTimersByTimeAsync(IDLE_CLOSE_MS - 1000);
        expect(connection!.isClosed()).toBe(false);
        // Heartbeats while idle, each answered (a quiet connection is checked every 10 s).
        const beats = connection!.sent.filter(
          ([type, , filter]) => type === "REQ" && (filter as { ids?: unknown }).ids
        );
        expect(beats.length).toBeGreaterThan(10);

        await jest.advanceTimersByTimeAsync(1000);
        expect(connection!.isClosed()).toBe(true);
        expect(relay.createSocket).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it("gives up a shared connection that stopped answering its heartbeat, its watches with it", async () => {
      jest.useFakeTimers();
      try {
        let cut = false;
        const relay = fakeRelay((message, reply) => {
          if (!cut) answering()(message, reply);
        });
        const watch = watchEvents(
          URL,
          { kinds: [30078] },
          relay.options("account"),
          () => undefined
        );
        const failure = expect(watch).rejects.toThrow(/no answer to the heartbeat/);
        // Answered: kept.
        await jest.advanceTimersByTimeAsync(3 * HEARTBEAT_MS);
        const [connection] = relay.connections;
        expect(connection!.isClosed()).toBe(false);

        cut = true;
        await jest.advanceTimersByTimeAsync(HEARTBEAT_MS + HEARTBEAT_TIMEOUT_MS + 100);
        await failure;
        expect(connection!.isClosed()).toBe(true);
        // The next call opens a new connection.
        cut = false;
        const read = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await read;
        expect(relay.createSocket).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("checks at once a connection that sent nothing during a call's whole timeout", async () => {
      jest.useFakeTimers();
      try {
        let silent = false;
        const relay = fakeRelay((message, reply) => {
          if (!silent) answering()(message, reply);
        });
        const first = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await first;

        silent = true;
        const read = queryEvents(URL, {}, relay.options("account", { timeoutMs: 3000 }));
        const failure = expect(read).rejects.toThrow(/no answer in time/);
        await jest.advanceTimersByTimeAsync(3000);
        await failure;
        // A heartbeat at once, not HEARTBEAT_MS after the relay last sent something.
        const [connection] = relay.connections;
        expect(connection!.sent.at(-1)).toEqual([
          "REQ",
          expect.any(String),
          { ids: ["0".repeat(64)], limit: 1 }
        ]);
        await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS);
        expect(connection!.isClosed()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it("hands a call over to a new connection once, when the open one ends under it", async () => {
      let drop = false;
      const relay = fakeRelay((message, reply, connection) => {
        if (drop && connection === relay.connections[0] && message[0] === "REQ") {
          // Cut while idle: the relay is gone, the call's request with it.
          connection.socket.onclose?.();
          return;
        }
        answering(event)(message, reply);
      });
      await queryEvents(URL, {}, relay.options("account"));

      drop = true;
      await expect(queryEvents(URL, {}, relay.options("account"))).resolves.toEqual([event]);
      expect(relay.createSocket).toHaveBeenCalledTimes(2);

      // A connection opened for the call that fails: the call's failure, not handed over.
      const failing = fakeRelay(() => undefined);
      const read = queryEvents(URL, {}, failing.options("account"));
      failing.connections[0]!.socket.onerror?.();
      await expect(read).rejects.toThrow(/connection failed/);
      expect(failing.createSocket).toHaveBeenCalledTimes(1);
    });

    it("rejects the calls of connections closed on purpose, never handed over", async () => {
      const relay = fakeRelay((message, reply) => {
        if (message[0] === "REQ" && (message[2] as { kinds?: number[] }).kinds) {
          answering(event)(message, reply);
        }
      });
      await queryEvents(URL, { kinds: [30078] }, relay.options("account"));
      const pending = queryEvents(URL, {}, relay.options("account"));
      const watch = watchEvents(URL, { kinds: [30078] }, relay.options("account"), () => undefined);
      await new Promise((resolve) => setTimeout(resolve, 10));

      closeRelayConnections();

      await expect(pending).rejects.toThrow(/connection closed/);
      await expect(watch).rejects.toThrow(/connection closed/);
      expect(relay.createSocket).toHaveBeenCalledTimes(1);
    });

    it("watches over the shared connection, its subscription closed once stopped", async () => {
      const later = { ...event, id: "later" };
      const relay = fakeRelay(answering(event));
      const controller = new AbortController();
      const received: unknown[] = [];
      const watch = watchEvents(
        URL,
        { kinds: [30078] },
        relay.options("account", { signal: controller.signal }),
        (value) => {
          received.push(value);
        }
      );
      const ended = expect(watch).rejects.toThrow(/aborted/);
      await expect(queryEvents(URL, {}, relay.options("account"))).resolves.toEqual([event]);
      const [connection] = relay.connections;
      const [watching] = subscriptions(connection!.sent).opened;
      connection!.socket.onmessage?.({ data: JSON.stringify(["EVENT", watching, later]) });
      expect(received).toEqual([event, later]);

      controller.abort();
      await ended;
      expect(subscriptions(connection!.sent).closed).toContain(watching);
      expect(connection!.isClosed()).toBe(false);
      expect(relay.createSocket).toHaveBeenCalledTimes(1);
    });

    it("leaves the connections of before the background to their calls: the next go over new ones", async () => {
      jest.useFakeTimers();
      try {
        const relay = fakeRelay(answering(event));
        const first = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await first;
        const held = fakeRelay(() => undefined);
        const pending = queryEvents(URL, {}, held.options("account", { timeoutMs: 200 }));
        // Checked once its timeout ran out.
        void pending.catch(() => undefined);
        await jest.advanceTimersByTimeAsync(10);

        for (const listener of appStateListeners) listener("background");

        // Without a call: closed at once. With one: kept until it is done.
        expect(relay.connections[0]!.isClosed()).toBe(true);
        expect(held.connections[0]!.isClosed()).toBe(false);
        await jest.advanceTimersByTimeAsync(200);
        await expect(pending).rejects.toThrow(/no answer in time/);
        expect(held.connections[0]!.isClosed()).toBe(true);
        const next = queryEvents(URL, {}, relay.options("account"));
        await jest.advanceTimersByTimeAsync(10);
        await next;
        expect(relay.createSocket).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("closes on purpose the connections of before the background too, their calls rejected", async () => {
      const held = fakeRelay(() => undefined);
      const pending = queryEvents(URL, {}, held.options("account", { timeoutMs: 5000 }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const listener of appStateListeners) listener("background");
      expect(held.connections[0]!.isClosed()).toBe(false);

      // An account closes: authenticated as its keys, the retired connection goes with the others.
      closeRelayConnections();

      await expect(pending).rejects.toThrow(/connection closed/);
      expect(held.connections[0]!.isClosed()).toBe(true);
    });

    it("rejects a call whose socket cannot be created, its timer gone with it", async () => {
      jest.useFakeTimers();
      try {
        const failing = jest.fn((): WebSocket => {
          throw new Error("no socket");
        });
        const controller = new AbortController();
        const read = queryEvents(
          URL,
          {},
          {
            channel: "account",
            timeoutMs: 1000,
            signal: controller.signal,
            authKeys: [keys.secretKey],
            createSocket: failing
          }
        );
        await expect(read).rejects.toThrow("no socket");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it("authenticates a call without keys as the connection's own key, once", async () => {
      const relay = fakeRelay((message, reply, connection) => {
        if (message[0] === "REQ") {
          const { authors } = message[2] as { authors?: string[] };
          if (connection.authed.size === 0) {
            reply(["AUTH", "c2"]);
            reply(["CLOSED", message[1], "auth-required: sign in"]);
          } else if (authors?.some((author) => !connection.authed.has(author))) {
            // An author's events to that author only: no key of the connection's will do.
            reply(["CLOSED", message[1], "auth-required: authors only"]);
          } else {
            answering(event)(message, reply);
          }
        } else if (message[0] === "AUTH") {
          const auth = message[1] as NostrEvent;
          connection.authed.add(auth.pubkey);
          reply(["OK", auth.id, true, ""]);
        }
      });
      const anonymous = relay.options("anonymous", { secretKeys: [] });
      const theirs = { authors: [keys.publicKey] };

      await expect(queryEvents(URL, {}, anonymous)).resolves.toEqual([event]);
      await expect(queryEvents(URL, theirs, anonymous)).rejects.toThrow(/authors only/);
      await expect(queryEvents(URL, theirs, anonymous)).rejects.toThrow(/authors only/);
      // One key for the connection, not one per read: a relay keeps no pile of them.
      const [first] = relay.connections;
      expect(first!.sent.filter(([type]) => type === "AUTH")).toHaveLength(1);
      const [own] = [...first!.authed];
      expect(own).not.toBe(keys.publicKey);

      // A new connection, a new key: nothing ties the two.
      closeRelayConnections();
      await expect(queryEvents(URL, {}, anonymous)).resolves.toEqual([event]);
      expect(relay.connections[1]!.authed.size).toBe(1);
      expect(relay.connections[1]!.authed.has(own!)).toBe(false);
    });

    it("does not count the wait for a subscription slot against a call's timeout", async () => {
      jest.useFakeTimers();
      try {
        const relay = fakeRelay((message, reply) => {
          // Watches hold their slots; a read is answered at once.
          if (message[0] === "REQ" && !(message[2] as { kinds?: number[] }).kinds) {
            reply(["EOSE", message[1]]);
          }
        });
        const watching = Array.from({ length: MAX_SUBSCRIPTIONS }, () => {
          const controller = new AbortController();
          const watch = watchEvents(
            URL,
            { kinds: [30078] },
            relay.options("account", { signal: controller.signal }),
            () => undefined
          ).catch(() => undefined);
          return { controller, watch };
        });
        await jest.advanceTimersByTimeAsync(10);

        let outcome: unknown = null;
        const read = queryEvents(URL, {}, relay.options("account", { timeoutMs: 1000 })).then(
          (events) => (outcome = events),
          (error: unknown) => (outcome = error)
        );
        // Five times its timeout waiting for a slot: still waiting, not failed.
        await jest.advanceTimersByTimeAsync(5000);
        expect(outcome).toBeNull();

        // A watch stops: the read goes, and is answered.
        watching[0]!.controller.abort();
        await jest.advanceTimersByTimeAsync(10);
        await read;
        expect(outcome).toEqual([]);

        // Never a slot: given up after SLOT_WAIT_MAX_MS, the time the read waited apart.
        watching[0] = (() => {
          const controller = new AbortController();
          const watch = watchEvents(
            URL,
            { kinds: [30078] },
            relay.options("account", { signal: controller.signal }),
            () => undefined
          ).catch(() => undefined);
          return { controller, watch };
        })();
        await jest.advanceTimersByTimeAsync(10);
        const stuck = queryEvents(URL, {}, relay.options("account", { timeoutMs: 1000 }));
        const failure = expect(stuck).rejects.toThrow(/no subscription slot in time/);
        await jest.advanceTimersByTimeAsync(SLOT_WAIT_MAX_MS - 100);
        let settled = false;
        void stuck.catch(() => (settled = true));
        await jest.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
        await jest.advanceTimersByTimeAsync(200);
        await failure;
        for (const { controller } of watching) controller.abort();
        await Promise.all(watching.map(({ watch }) => watch));
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
