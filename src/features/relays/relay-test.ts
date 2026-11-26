import { useSyncExternalStore } from "react";

import { LOCAL_NETWORK_PROMPT_TIMEOUT_MS, RELAY_TEST_TIMEOUT_MS } from "@/config/relays";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { askLocalNetworkAccess } from "@/lib/nostr/local-network";
import {
  localNetworkPermission,
  recordLocalNetworkPermission,
  subscribeLocalNetworkPermission,
  type LocalNetworkPermission
} from "@/lib/nostr/local-network-permission";
import { eachRelayAnswer } from "@/lib/nostr/pool";
import { refusesReads } from "@/lib/nostr/relay-errors";
import { RECORD_KIND } from "@/lib/nostr/record";
import { mayBeOnLocalNetwork } from "@/lib/relays/list";

/*
 * "Test the connection": each relay of a list is
 * asked for nothing (the records of a key made for the test), and counts as reachable once it
 * answered (NIP-01 EOSE, after its authentication when it asks for one). The light of each relay:
 * green reachable, yellow not tested or being tested, red unreachable or restricted; and how long
 * it took. Kept in memory for the launch, so
 * that the lists shown elsewhere show the last test.
 *
 * Restricted: the relay answered, but refused the query for whom it comes
 * from (refusesReads). The call authenticates with a key of its own, not the test key's, as a
 * point of sale reads the catalogue, an employee's device its channel, a payer a link or the
 * registry: with keys that never signed what they read. A relay that gives an author's events to
 * that author only (NIP-42 lets a relay restrict reads so), or to the keys it lets in, refuses it,
 * as it would refuse them. Nothing announces it beforehand (NIP-11 tells restricted writes and
 * required authentication, never restricted reads): only such a query shows it.
 */

export type RelayStatus = "untested" | "testing" | "reachable" | "unreachable" | "restricted";

export type RelayTest = {
  status: RelayStatus;
  /**
   * Once tested: the milliseconds from the test's start to the relay's answer or failure,
   * connection included (the test opens a connection of its own, relay.ts: what the app's first
   * call to the relay costs). Null before.
   */
  elapsedMs: number | null;
};

const UNTESTED: RelayTest = { status: "untested", elapsedMs: null };
const TESTING: RelayTest = { status: "testing", elapsedMs: null };

let tests: ReadonlyMap<string, RelayTest> = new Map();
/** Each relay's latest test, so that an earlier one ending later never overwrites its light. */
const runs = new Map<string, symbol>();
const listeners = new Set<() => void>();

function set(next: ReadonlyMap<string, RelayTest>) {
  tests = next;
  for (const listener of listeners) listener();
}

/**
 * `relays` "testing" from now on: a test of them still under way no longer changes their lights
 * (testRelaysAskingAccess, while the browser asks: an earlier test ending then would show its
 * outcome as this one's).
 */
function setTesting(relays: readonly string[]) {
  for (const relay of relays) runs.delete(relay);
  set(new Map([...tests, ...relays.map((relay) => [relay, TESTING] as const)]));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The status of `relay`: the last test's, "untested" before any. */
export function relayStatus(relay: string): RelayStatus {
  return relayTest(relay).status;
}

/** The last test of `relay`: its status and how long it took. */
export function relayTest(relay: string): RelayTest {
  return tests.get(relay) ?? UNTESTED;
}

/** The tests of the relays, followed: the editor shows their lights and how long they took. */
export function useRelayTests(): (relay: string) => RelayTest {
  const current = useSyncExternalStore(subscribe, () => tests);
  return (relay) => current.get(relay) ?? UNTESTED;
}

/** The statuses of the relays, followed: the screens show their lights. */
export function useRelayStatuses(): (relay: string) => RelayStatus {
  const test = useRelayTests();
  return (relay) => test(relay).status;
}

/** Unreachable because it did not answer within RELAY_TEST_TIMEOUT_MS (not a failure sooner). */
export function timedOut(test: RelayTest): boolean {
  return (
    test.status === "unreachable" &&
    test.elapsedMs !== null &&
    test.elapsedMs >= RELAY_TEST_TIMEOUT_MS
  );
}

/**
 * The browser's local network permission as the last request for it left it ("Test the
 * connection", or a connection to a relay it may count as local), followed: null in the apps.
 */
export function useLocalNetworkPermission(): LocalNetworkPermission | null {
  return useSyncExternalStore(subscribeLocalNetworkPermission, localNetworkPermission);
}

/**
 * Tests the relays of `relays`, in parallel, each within RELAY_TEST_TIMEOUT_MS: they are "testing"
 * meanwhile, then each "reachable", "restricted" or "unreachable" as soon as it answered, refused
 * or failed, without waiting for the others (else the lights would change all at
 * once, with the slowest relay), with the time it took (RelayTest). Resolves with whether all of
 * them answered. Never rejects.
 */
export async function testRelays(relays: readonly string[]): Promise<boolean> {
  if (relays.length === 0) return true;
  setTesting(relays);
  const run = Symbol("relay test");
  for (const relay of relays) runs.set(relay, run);
  // The monotonic clock: a change of the device's clock during the test changes nothing. Read
  // again right before the relays' calls start their timers (the test key made first), so that a
  // relay timed out is the one past RELAY_TEST_TIMEOUT_MS (timedOut).
  let started = performance.now();
  const settle = (relay: string, status: "reachable" | "unreachable" | "restricted") => {
    if (runs.get(relay) !== run) return;
    runs.delete(relay);
    const elapsedMs = Math.max(0, Math.round(performance.now() - started));
    set(new Map([...tests, [relay, { status, elapsedMs }]]));
  };
  let answered = 0;
  try {
    const filter = { kinds: [RECORD_KIND], authors: [randomNostrKeys().publicKey], limit: 1 };
    // A relay that asks to authenticate gets the connection's own key (relay.ts).
    const call = { channel: "single" as const, relays, timeoutMs: RELAY_TEST_TIMEOUT_MS };
    started = performance.now();
    answered = await eachRelayAnswer(
      filter,
      call,
      (relay) => settle(relay, "reachable"),
      (relay, error) => settle(relay, refusesReads(error) ? "restricted" : "unreachable"),
      // Every relay: the test tells each one's light, as soon as it is known (the only call of the
      // app that waits for every relay: nothing is decided on it).
      { quorum: "all" }
    );
  } catch {
    // Not expected (it never rejects; the test key cannot be made): a relay still "testing" turns
    // red below.
  }
  for (const relay of relays) settle(relay, "unreachable");
  return answered === relays.length;
}

/**
 * "Test the connection": on the web, when `list` holds a relay the
 * browser may count as one of the local network (mayBeOnLocalNetwork: a Tailscale name, a name of
 * the local network), first asks the browser for local network access (askLocalNetworkAccess, which
 * waits for the merchant's answer), so that the test can reach it; then tests `list` (testRelays).
 * The relays are "testing" meanwhile. Nothing is asked in the apps, nor without such a relay.
 */
export async function testRelaysAskingAccess(list: readonly string[]): Promise<boolean> {
  const local = list.filter(mayBeOnLocalNetwork);
  if (local.length > 0) {
    setTesting(list);
    let permission: LocalNetworkPermission | null = null;
    try {
      permission = await askLocalNetworkAccess(local, LOCAL_NETWORK_PROMPT_TIMEOUT_MS);
    } catch {
      // Never expected (it never rejects): the test goes on.
    }
    recordLocalNetworkPermission(permission);
  }
  return testRelays(list);
}

/** Tests only: forgets the statuses. */
export function resetRelayStatuses(): void {
  runs.clear();
  set(new Map());
  recordLocalNetworkPermission(null);
}
