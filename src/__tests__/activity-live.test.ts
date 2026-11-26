import {
  LIVE_SETTLE_MS,
  LIVE_SINCE_MARGIN_SECONDS,
  liveAuthors,
  settled,
  watchOwnerActivity,
  type LiveSource
} from "@/features/activity/live";
import { assistantKeysOf } from "@/features/team/assistants";
import type { Roster } from "@/features/team/roster";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import {
  deriveInvoiceKeys,
  deriveMemberKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  ownerDeviceSecret,
  wipeTeamKeys
} from "@/lib/team/keys";

import type * as RelaysFake from "../../jest/nostr-relays";

// The in-memory relays of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const RELAY = "wss://relay.example.com";
const OTHER = "wss://other.example.com";
const NOW = Math.floor(Date.now() / 1000);

const EMPLOYEE = "0123456789abcdef0123456789abcdef";
const DEVICE = "fedcba9876543210fedcba9876543210";
const ASSISTANT = "00112233445566778899aabbccddeeff";
const MUTE_ASSISTANT = "ffeeddccbbaa99887766554433221100";
const INTEGRATION = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const REMOVED_ASSISTANT = "99887766554433221100ffeeddccbbaa";

const roster: Roster = {
  employees: [{ id: EMPLOYEE, name: "Erin Grant", role: "employee", invitedAt: NOW - 1000 }],
  integrations: [{ id: INTEGRATION, name: "Shop", createdAt: NOW - 1000, platform: "woo" }],
  assistants: [
    { id: ASSISTANT, name: "Accounting", createdAt: NOW - 1000 },
    // Makes no invoice: none of its key is watched.
    { id: MUTE_ASSISTANT, name: "Export", createdAt: NOW - 1000, invoicing: false }
  ],
  // Removed: its invoices are the owner's copies, its key is not watched.
  removed: [
    {
      role: "assistant",
      id: REMOVED_ASSISTANT,
      name: "Former",
      since: NOW - 2000,
      removedAt: NOW - 1000
    }
  ]
};

function record(secretKey: Uint8Array, createdAt: number, d = "x"): NostrEvent {
  return signEvent(
    { kind: 30078, created_at: createdAt, tags: [["d", d]], content: "" },
    secretKey
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Wallet live", () => {
  beforeEach(() => relays.resetRelays());

  const team = deriveTeamKeys(new Uint8Array(32).fill(5));
  const employee = deriveMemberKeys(memberSecret(team, EMPLOYEE));
  const device = deriveMemberKeys(ownerDeviceSecret(team, DEVICE));
  const invoices = deriveInvoiceKeys(team);
  const assistant = assistantKeysOf(team, ASSISTANT).invoices;
  const integration = deriveIntegrationKeys(integrationSecretKey(team, INTEGRATION)).seen;

  it("listens to the authors of every read of the list, each for its read", () => {
    const authors = liveAuthors(team, roster, [{ id: DEVICE, addedAt: NOW - 1000 }]);
    const of = (publicKey: string) => authors.find((author) => author.publicKey === publicKey);
    expect(of(employee.nostr.publicKey)?.source).toBe("records");
    expect(of(employee.links.publicKey)?.source).toBe("records");
    expect(of(device.nostr.publicKey)?.source).toBe("records");
    expect(of(device.links.publicKey)?.source).toBe("records");
    expect(of(invoices.nostr.publicKey)?.source).toBe("invoices");
    expect(of(assistant.nostr.publicKey)?.source).toBe("invoices");
    expect(of(assistantKeysOf(team, MUTE_ASSISTANT).invoices.nostr.publicKey)).toBeUndefined();
    expect(of(assistantKeysOf(team, REMOVED_ASSISTANT).invoices.nostr.publicKey)).toBeUndefined();
    expect(of(integration.nostr.publicKey)?.source).toBe("orders");
    expect(authors).toHaveLength(7);
    // Each key for a relay's authentication derives when asked.
    const auth = of(employee.nostr.publicKey)!.authKey as () => Uint8Array;
    expect(auth()).toEqual(employee.nostr.secretKey);
  });

  it("listens to the owner's invoices alone before the roster is read", () => {
    const authors = liveAuthors(team, null, []);
    expect(authors.map(({ publicKey, source }) => [publicKey, source])).toEqual([
      [invoices.nostr.publicKey, "invoices"]
    ]);
  });

  it("refuses a relay's authentication once the account closed", () => {
    const closing = deriveTeamKeys(new Uint8Array(32).fill(6));
    const [author] = liveAuthors(closing, null, []);
    wipeTeamKeys(closing);
    expect(() => (author!.authKey as () => Uint8Array)()).toThrow();
  });

  it("asks a read again for each new record of its authors, once whichever relay sends it", async () => {
    relays.authorReads.add(RELAY);
    const seen: LiveSource[] = [];
    const stop = watchOwnerActivity(
      liveAuthors(team, roster, [{ id: DEVICE, addedAt: NOW - 1000 }]),
      [RELAY, OTHER],
      (source) => seen.push(source),
      NOW
    );
    await tick();
    const call = { channel: "account" as const, timeoutMs: 1000 };
    const sale = record(employee.nostr.secretKey, NOW);
    await relays.publishEvent(RELAY, sale, { ...call, authKeys: [employee.nostr.secretKey] });
    await relays.publishEvent(OTHER, sale, call);
    await relays.publishEvent(OTHER, record(invoices.nostr.secretKey, NOW), call);
    await relays.publishEvent(OTHER, record(integration.nostr.secretKey, NOW), call);
    // Another author's record: nothing.
    await relays.publishEvent(OTHER, record(new Uint8Array(32).fill(9), NOW), call);
    await tick();
    expect(seen).toEqual(["records", "invoices", "orders"]);

    // The relay that gives an author's events to that author only was asked as each of them.
    const watch = relays.calls.find(
      ({ operation, relay }) => operation === "watch" && relay === RELAY
    );
    expect(watch?.channel).toBe("account");

    stop();
    await relays.publishEvent(OTHER, record(employee.links.secretKey, NOW + 1), call);
    await tick();
    expect(seen).toHaveLength(3);
  });

  it("asks for the records of a little before it starts, never older ones", async () => {
    const call = { channel: "account" as const, timeoutMs: 1000 };
    await relays.publishEvent(
      RELAY,
      record(employee.nostr.secretKey, NOW - LIVE_SINCE_MARGIN_SECONDS - 1, "old"),
      call
    );
    await relays.publishEvent(
      RELAY,
      record(employee.nostr.secretKey, NOW - LIVE_SINCE_MARGIN_SECONDS, "recent"),
      call
    );
    const seen: LiveSource[] = [];
    const stop = watchOwnerActivity(
      liveAuthors(team, roster, []),
      [RELAY],
      (source) => seen.push(source),
      NOW
    );
    await tick();
    expect(seen).toEqual(["records"]);
    stop();
  });

  it("watches nothing without an author or a relay", () => {
    const seen: LiveSource[] = [];
    watchOwnerActivity([], [RELAY], (source) => seen.push(source))();
    watchOwnerActivity(liveAuthors(team, null, []), [], (source) => seen.push(source))();
    expect(relays.calls.filter(({ operation }) => operation === "watch")).toHaveLength(0);
  });

  it("makes one read of what comes at the same moment", () => {
    jest.useFakeTimers();
    try {
      const run = jest.fn();
      const ask = settled(run);
      ask.request();
      ask.request();
      jest.advanceTimersByTime(LIVE_SETTLE_MS - 1);
      ask.request();
      expect(run).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledTimes(1);
      // Later, another read.
      ask.request();
      jest.advanceTimersByTime(LIVE_SETTLE_MS);
      expect(run).toHaveBeenCalledTimes(2);
      // Cancelled: none.
      ask.request();
      ask.cancel();
      jest.advanceTimersByTime(LIVE_SETTLE_MS);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
