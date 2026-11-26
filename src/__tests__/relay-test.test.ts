import { RELAY_TEST_TIMEOUT_MS } from "@/config/relays";
import {
  relayStatus,
  relayTest,
  resetRelayStatuses,
  testRelays,
  testRelaysAskingAccess,
  timedOut
} from "@/features/relays/relay-test";
import * as localNetwork from "@/lib/nostr/local-network";
import { QueryClosed } from "@/lib/nostr/relay-errors";

import type * as RelaysFake from "../../jest/nostr-relays";

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

/*
 * "Test the connection": each relay's light changes as soon as that relay answered or failed, not
 * once the slowest one did.
 */

const FAST = "wss://fast.example.com";
const SLOW = "wss://slow.example.com";
const DOWN = "wss://down.example.com";

/** Lets the pending promises run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Holds the next query of each relay of `held` until the returned function is called. */
function holdQueries(...relaysHeld: string[]): () => void {
  const held = new Set(relaysHeld);
  let release = () => undefined as void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const query = relays.queryEvents;
  const spy = jest.spyOn(relays, "queryEvents").mockImplementation(async (url, ...args) => {
    if (held.delete(url)) await released;
    return query(url, ...args);
  });
  return () => {
    release();
    spy.mockRestore();
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  resetRelayStatuses();
  relays.resetRelays();
});

describe("testing the relays", () => {
  it("shows each relay's outcome as soon as it is known", async () => {
    relays.unreachable.add(DOWN);
    const release = holdQueries(SLOW);
    const test = testRelays([FAST, SLOW, DOWN]);
    expect([FAST, SLOW, DOWN].map(relayStatus)).toEqual(["testing", "testing", "testing"]);

    await settle();
    // The slow relay has not answered yet: the others already show theirs.
    expect([FAST, SLOW, DOWN].map(relayStatus)).toEqual(["reachable", "testing", "unreachable"]);

    release();
    await expect(test).resolves.toBe(false);
    expect([FAST, SLOW, DOWN].map(relayStatus)).toEqual(["reachable", "reachable", "unreachable"]);
  });

  it("tells a relay that gives an author's records to that author only from an unreachable one", async () => {
    // It answers, but closes the test's query ("restricted:"): the test reads a key's records as
    // another key, as a point of sale, an employee's device or a payer reads the app's records.
    relays.authorReads.add(SLOW);
    relays.unreachable.add(DOWN);
    await expect(testRelays([FAST, SLOW, DOWN])).resolves.toBe(false);
    expect([FAST, SLOW, DOWN].map(relayStatus)).toEqual(["reachable", "restricted", "unreachable"]);
    expect(relayTest(SLOW).elapsedMs).not.toBeNull();
    expect(timedOut(relayTest(SLOW))).toBe(false);
  });

  it("counts a relay that still asks to authenticate once the test did as restricted", async () => {
    jest
      .spyOn(relays, "queryEvents")
      .mockRejectedValue(new QueryClosed(SLOW, "auth-required: members only"));
    await testRelays([SLOW]);
    expect(relayStatus(SLOW)).toBe("restricted");
  });

  it("counts a relay that closed the query for another reason as unreachable", async () => {
    jest
      .spyOn(relays, "queryEvents")
      .mockRejectedValue(new QueryClosed(SLOW, "rate-limited: slow down"));
    await testRelays([SLOW]);
    expect(relayStatus(SLOW)).toBe("unreachable");
  });

  it("resolves with whether every relay answered", async () => {
    await expect(testRelays([FAST, SLOW])).resolves.toBe(true);
    relays.unreachable.add(SLOW);
    await expect(testRelays([FAST, SLOW])).resolves.toBe(false);
  });

  it("never lets an earlier test that ends later overwrite a relay's light", async () => {
    const release = holdQueries(SLOW);
    const first = testRelays([SLOW]);
    await settle();
    // Tested again meanwhile, out of reach now: red, whatever the first test finds after.
    relays.unreachable.add(SLOW);
    await testRelays([SLOW]);
    expect(relayStatus(SLOW)).toBe("unreachable");

    relays.unreachable.delete(SLOW);
    release();
    await first;
    expect(relayStatus(SLOW)).toBe("unreachable");
  });

  it("keeps a relay testing while the browser is asked, whatever an earlier test finds", async () => {
    const LOCAL = "wss://umbrel-1.example.ts.net:8443";
    const release = holdQueries(LOCAL);
    const first = testRelays([LOCAL]);
    await settle();
    let answer = (_: null) => undefined as void;
    jest
      .spyOn(localNetwork, "askLocalNetworkAccess")
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const second = testRelaysAskingAccess([LOCAL]);
    expect(relayStatus(LOCAL)).toBe("testing");

    // The earlier test ends while the browser asks: not this test's outcome.
    release();
    await first;
    expect(relayStatus(LOCAL)).toBe("testing");

    relays.unreachable.add(LOCAL);
    answer(null);
    await expect(second).resolves.toBe(false);
    expect(relayStatus(LOCAL)).toBe("unreachable");
  });

  // How long each relay took, on the monotonic clock.
  it("measures how long each relay took to answer or fail", async () => {
    relays.unreachable.add(DOWN);
    const release = holdQueries(SLOW, DOWN);
    let clock = 1_000;
    jest.spyOn(performance, "now").mockImplementation(() => clock);
    const test = testRelays([FAST, SLOW, DOWN]);
    expect(relayTest(SLOW)).toEqual({ status: "testing", elapsedMs: null });
    await settle();
    expect(relayTest(FAST)).toEqual({ status: "reachable", elapsedMs: 0 });

    clock += RELAY_TEST_TIMEOUT_MS;
    release();
    await test;
    expect(relayTest(SLOW)).toEqual({ status: "reachable", elapsedMs: RELAY_TEST_TIMEOUT_MS });
    expect(relayTest(DOWN)).toEqual({ status: "unreachable", elapsedMs: RELAY_TEST_TIMEOUT_MS });
    // Unreachable for want of an answer in time, not for a failure sooner.
    expect(timedOut(relayTest(DOWN))).toBe(true);
    expect(timedOut(relayTest(SLOW))).toBe(false);
    expect(timedOut({ status: "unreachable", elapsedMs: 120 })).toBe(false);
    expect(relayTest("wss://never.example.com")).toEqual({ status: "untested", elapsedMs: null });
  });
});
