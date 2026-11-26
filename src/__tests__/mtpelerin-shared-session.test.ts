import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { walletSecret } from "@/lib/breez/seed";
import { readLog } from "@/lib/log/log";
import { publishToRelays } from "@/lib/nostr/pool";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";
import { MTP_ENVIRONMENTS } from "@/lib/mtpelerin/environment";
import { MAX_PAID, type MtpSessionState } from "@/lib/mtpelerin/session-format";
import { loadMtpSession } from "@/lib/mtpelerin/session-store";
import { mergeSessions, mtpSessionStore } from "@/lib/mtpelerin/session-sync";
import {
  deriveMtpSessionKeys,
  fetchSharedSessions,
  sharedSessionEvent
} from "@/lib/mtpelerin/shared-session";
import { deriveTeamKeys, wipeTeamKeys } from "@/lib/team/keys";

import { TEST_WALLET_ID, testSeed } from "../../jest/account";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The account's Mt Pelerin session shared by its devices through its relays (shared-session.ts,
 * session-sync.ts). A device is the secure store's content: cleared,
 * it is another device of the account (or the same one after "Log out").
 */

/** The test account's session at the fake Mt Pelerin. */
const OWNER = { walletId: TEST_WALLET_ID, environment: "production" } as const;

const relays = jest.requireMock<typeof RelaysFake>("@/lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

const team = () => deriveTeamKeys(walletSecret(testSeed()));
const T0 = 1_790_000_000;

/** A device of the account, its clock at `at` (Unix seconds) unless the test moves it. */
function device(at = { now: T0 }) {
  return mtpSessionStore(
    OWNER,
    { team: team(), relays: () => DEFAULT_RELAYS },
    () => at.now * 1000
  );
}

/** Another device of the account: nothing of this one's storage. */
function otherDevice(at?: { now: number }) {
  secureStore.resetSecureStore();
  return device(at);
}

/** The events the relays hold of the account's session. */
function held() {
  const { nostr } = deriveMtpSessionKeys(team(), "production");
  return [...relays.stored.values()].flat().filter((event) => event.pubkey === nostr.publicKey);
}

const session = (state: Partial<MtpSessionState>): MtpSessionState => ({
  refreshToken: null,
  sessionAt: 0,
  paidValidations: [],
  ...state
});

beforeEach(() => {
  relays.resetRelays();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the account's Mt Pelerin session on its relays", () => {
  it("never changes its keys: every device finds the session by them (salt, info strings)", () => {
    // Computed apart, in Python (HKDF-SHA256 of the team's root, RFC 5869), one record per Mt
    // Pelerin.
    const vectors = {
      test: {
        secretKey: "2356c207ac8d70f0da7024e958536a490dd716a2d529b5e15d43509e5d6b92f3",
        publicKey: "cd8637044099d205305e3b595947dbd31ea37ef09c5621eac6d57c492dc68f88",
        encryptionKey: "5504a37867e9f2f5bd819d72a3eb3c46bca395f8c7b836439b638b23188a5c97",
        address: "0050d43905124825873d0391f4ee18fc13779f7b2e3bccee9db5452b83001088"
      },
      production: {
        secretKey: "fecca021a345a11c6d009683e354a7b4d1751119764108487b2a50af6f73523b",
        publicKey: "ba4fb60402e3b78d19b5e160fc9f3f700190be466af109eabee89a3bb4e2f7a0",
        encryptionKey: "5c251aef8acf2f66d26ed3ce97cfda4a4e9bd03f90f031c2d5c9b066579e8f12",
        address: "9fb47a9c8f9425f639b148efcafe51c561bac9eba73c0a3a914a4081062f47d4"
      }
    };
    for (const environment of MTP_ENVIRONMENTS) {
      const keys = deriveMtpSessionKeys(team(), environment);
      expect({
        secretKey: bytesToHex(keys.nostr.secretKey),
        publicKey: keys.nostr.publicKey,
        encryptionKey: bytesToHex(keys.encryptionKey),
        address: keys.address
      }).toEqual(vectors[environment]);
      // Its own author: not the team's, which employees' devices know.
      expect(keys.nostr.publicKey).not.toBe(team().publicKey);
    }
  });

  it("is sealed: an opaque record of its own author, the same size with or without a token", async () => {
    const store = device();
    await store.keep("fake.refresh-token-of-the-account");
    await store.settled();
    const events = held();
    expect(events.length).toBe(DEFAULT_RELAYS.length);
    const keys = deriveMtpSessionKeys(team(), "production");
    for (const event of events) {
      expect(event.kind).toBe(RECORD_KIND);
      expect(event.tags).toEqual([["d", keys.address]]);
      expect(event.content).not.toContain("fake.");
    }
    const none = sharedSessionEvent(keys, session({}), T0);
    const token = sharedSessionEvent(
      keys,
      session({ refreshToken: `fake.${"x".repeat(900)}`, sessionAt: T0 }),
      T0
    );
    expect(token.content.length).toBe(none.content.length);
    // Shared: nothing left to share at the next opening.
    expect(await loadMtpSession(OWNER)).toMatchObject({ unshared: false });
  });

  it("gives another device of the account the session at its first opening", async () => {
    const first = device();
    await first.keep("fake.first");
    await first.recordPaid({ accountId: "a1", paidAt: T0 * 1000 });
    await first.settled();
    const other = otherDevice();
    await expect(other.load()).resolves.toEqual({
      refreshToken: "fake.first",
      sessionAt: T0,
      paidValidations: [{ accountId: "a1", paidAt: T0 * 1000 }]
    });
    // Kept there from now on, nothing to share again.
    expect(await loadMtpSession(OWNER)).toMatchObject({
      refreshToken: "fake.first",
      unshared: false
    });
  });

  it("keeps the latest token, by its date, a device's clock behind the others' included", async () => {
    const first = device({ now: T0 });
    await first.keep("fake.first");
    await first.settled();
    // Logged in later on a device whose clock is an hour behind: its token still wins.
    const late = otherDevice({ now: T0 - 3600 });
    await late.load();
    await late.keep("fake.later");
    await late.settled();
    const third = otherDevice({ now: T0 });
    await expect(third.load()).resolves.toMatchObject({ refreshToken: "fake.later" });
    // A device that logs in without having read the relays: dated after every copy it then
    // reads, as the latest change it knows of.
    secureStore.resetSecureStore();
    const unread = device({ now: T0 });
    await unread.keep("fake.latest");
    await unread.settled();
    await expect(otherDevice().load()).resolves.toMatchObject({ refreshToken: "fake.latest" });
  });

  it("drops a token refused here only, never on the other devices (one may hold the next)", async () => {
    const first = device();
    await first.keep("fake.first");
    await first.settled();
    const firstDevice = new Map(secureStore.items);
    const other = otherDevice();
    await other.load();
    await expect(other.refused("fake.first")).resolves.toBeNull();
    expect(await loadMtpSession(OWNER)).toMatchObject({ refreshToken: null });
    // Not taken from the relays again: refused already.
    await expect(other.load()).resolves.toMatchObject({ refreshToken: null });
    // The relays and the first device keep theirs.
    const shared = await fetchSharedSessions(team(), "production", DEFAULT_RELAYS);
    expect(shared.copies.map(({ refreshToken }) => refreshToken)).toContain("fake.first");
    secureStore.items.clear();
    for (const [key, value] of firstDevice) secureStore.items.set(key, value);
    await expect(device().load()).resolves.toMatchObject({ refreshToken: "fake.first" });
  });

  it("answers a refused token with the account's newer one, kept by another device since", async () => {
    const first = device({ now: T0 });
    await first.keep("fake.first");
    await first.settled();
    const firstDevice = new Map(secureStore.items);
    const other = otherDevice();
    await other.load();
    const otherDeviceItems = new Map(secureStore.items);
    // The first device rotates it, later.
    secureStore.items.clear();
    for (const [key, value] of firstDevice) secureStore.items.set(key, value);
    const rotating = device({ now: T0 + 60 });
    await rotating.keep("fake.rotated");
    await rotating.settled();
    secureStore.items.clear();
    for (const [key, value] of otherDeviceItems) secureStore.items.set(key, value);
    await expect(other.refused("fake.first")).resolves.toBe("fake.rotated");
    expect(await loadMtpSession(OWNER)).toMatchObject({ refreshToken: "fake.rotated" });
  });

  it('logs every device out: "Log out of Mt Pelerin" is shared', async () => {
    const first = device({ now: T0 });
    await first.keep("fake.first");
    await first.settled();
    const other = otherDevice({ now: T0 + 60 });
    await other.load();
    await other.keep(null);
    await other.settled();
    secureStore.resetSecureStore();
    await expect(device({ now: T0 + 120 }).load()).resolves.toMatchObject({
      refreshToken: null
    });
  });

  it("keeps a change here while most relays are unreachable, then shares it at the next opening", async () => {
    for (const relay of DEFAULT_RELAYS.slice(0, Math.ceil(DEFAULT_RELAYS.length / 2))) {
      relays.unreachable.add(relay);
    }
    const store = device();
    await store.keep("fake.first");
    await store.settled();
    // Fewer than a majority answered the read: nothing published over what they may hold.
    expect(held()).toEqual([]);
    expect(await loadMtpSession(OWNER)).toMatchObject({
      refreshToken: "fake.first",
      unshared: true
    });
    relays.unreachable.clear();
    await expect(store.load()).resolves.toMatchObject({ refreshToken: "fake.first" });
    expect(held().length).toBe(DEFAULT_RELAYS.length);
    expect(await loadMtpSession(OWNER)).toMatchObject({ unshared: false });
  });

  it("never publishes over a session of a newer format (staging gets OTA rollbacks)", async () => {
    const keys = deriveMtpSessionKeys(team(), "production");
    const newer = sealRecord({
      type: "mtpelerin-session",
      value: { version: 2, sessions: [] },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: keys.address,
      createdAt: T0 - 60,
      block: 2048
    });
    await publishToRelays(newer, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
    const store = device();
    await store.keep("fake.first");
    await store.settled();
    expect(held().map(({ id }) => id)).toEqual(DEFAULT_RELAYS.map(() => newer.id));
    // This device's own copy goes on.
    await expect(store.load()).resolves.toMatchObject({ refreshToken: "fake.first" });
    expect(await loadMtpSession(OWNER)).toMatchObject({ unshared: true });
  });

  it("ignores what the account did not write, or wrote wrong", async () => {
    const keys = deriveMtpSessionKeys(team(), "production");
    // Another key at the record's address; a token dated after the record that carries it.
    const forged = sharedSessionEvent(
      {
        ...deriveMtpSessionKeys(deriveTeamKeys(new Uint8Array(32).fill(9)), "production"),
        address: keys.address
      },
      session({ refreshToken: "fake.forged", sessionAt: T0 }),
      T0
    );
    const future = sharedSessionEvent(
      keys,
      session({ refreshToken: "fake.future", sessionAt: T0 + 10 }),
      T0
    );
    for (const event of [forged, future]) {
      await publishToRelays(event, {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: new Uint8Array(32).fill(1)
      });
    }
    await expect(fetchSharedSessions(team(), "production", DEFAULT_RELAYS)).resolves.toMatchObject({
      copies: [],
      conclusive: true
    });
    await expect(device().load()).resolves.toMatchObject({ refreshToken: null });
  });

  it("adds up the invoices paid on each device", async () => {
    const first = device();
    await first.recordPaid({ accountId: "a1", paidAt: T0 * 1000 });
    await first.settled();
    const other = otherDevice();
    await other.recordPaid({ accountId: "a2", paidAt: T0 * 1000 + 1 });
    await other.settled();
    const third = otherDevice();
    await expect(third.load()).resolves.toMatchObject({
      paidValidations: [
        { accountId: "a1", paidAt: T0 * 1000 },
        { accountId: "a2", paidAt: T0 * 1000 + 1 }
      ]
    });
  });

  it("goes through relays that give and take an author's events from that author only", async () => {
    for (const relay of DEFAULT_RELAYS) {
      relays.authorOnly.add(relay);
      relays.authorReads.add(relay);
    }
    const first = device();
    await first.keep("fake.first");
    await first.settled();
    await expect(otherDevice().load()).resolves.toMatchObject({ refreshToken: "fake.first" });
  });

  it("stops once the account closes (its keys wiped), never logging a token", async () => {
    const keys = team();
    const store = mtpSessionStore(
      OWNER,
      { team: keys, relays: () => DEFAULT_RELAYS },
      () => T0 * 1000
    );
    wipeTeamKeys(keys);
    await store.keep("fake.after-close");
    await store.settled();
    expect(held()).toEqual([]);
    // This device's copy is kept: shared at an opening of the account.
    expect(await loadMtpSession(OWNER)).toMatchObject({
      refreshToken: "fake.after-close",
      unshared: true
    });
    await expect(device().load()).resolves.toMatchObject({ refreshToken: "fake.after-close" });
    expect(held().length).toBe(DEFAULT_RELAYS.length);
    const journal = JSON.stringify(readLog());
    expect(journal).toContain("Reading the account's Mt Pelerin session failed");
    expect(journal).not.toContain("fake.");
  });
});

describe("the merge of two copies of the session (mergeSessions)", () => {
  it("keeps the latest token by its date, the first's on a tie", () => {
    const a = session({ refreshToken: "fake.a", sessionAt: 10 });
    expect(mergeSessions(a, session({ refreshToken: "fake.b", sessionAt: 11 }))).toMatchObject({
      refreshToken: "fake.b",
      sessionAt: 11
    });
    expect(mergeSessions(a, session({ refreshToken: null, sessionAt: 10 }))).toMatchObject({
      refreshToken: "fake.a"
    });
    // A logout later than the token wins.
    expect(mergeSessions(a, session({ refreshToken: null, sessionAt: 12 }))).toMatchObject({
      refreshToken: null
    });
  });

  it("adds up the invoices: each account's latest payment, the newest MAX_PAID", () => {
    const paid = (index: number) => ({ accountId: `a${index}`, paidAt: 1000 + index });
    const a = session({ paidValidations: [paid(1), { accountId: "a2", paidAt: 5000 }] });
    const b = session({ paidValidations: [paid(2), paid(3)] });
    expect(mergeSessions(a, b).paidValidations).toEqual([
      paid(1),
      paid(3),
      { accountId: "a2", paidAt: 5000 }
    ]);
    const many = session({
      paidValidations: Array.from({ length: MAX_PAID + 3 }, (_, i) => paid(i))
    });
    const merged = mergeSessions(session({}), many).paidValidations;
    expect(merged).toHaveLength(MAX_PAID);
    expect(merged.at(-1)).toEqual(paid(MAX_PAID + 2));
  });
});
