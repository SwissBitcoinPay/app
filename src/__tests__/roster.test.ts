import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { changeRelays } from "@/features/settings/account-settings";
import {
  createIntegration,
  loadIntegrations,
  removeIntegration,
  syncTeamChannels
} from "@/features/team/owner";
import { ROSTER_REFRESH_SECONDS, recordRemoval } from "@/features/team/roster";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { walletSecret } from "@/lib/breez/seed";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import type { NostrEvent } from "@/lib/nostr/event";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { publishToRelays } from "@/lib/nostr/pool";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { channelEvent } from "@/lib/team/channel";
import {
  deriveCatalogKeys,
  deriveMemberKeys,
  deriveRosterKeys,
  deriveTeamKeys,
  integrationSecretKey,
  memberSecret,
  wipeTeamKeys
} from "@/lib/team/keys";
import { fetchLinks, linkEvent, publishMemberRecord } from "@/lib/team/member-records";
import {
  assistantOf,
  assistantSeat,
  makesInvoices,
  employeeSeat,
  fetchRosterAnswers,
  integrationSeat,
  parseSeat,
  rosterOf,
  seatAddress,
  seatEvent,
  type Assistant,
  type Integration,
  type Seat,
  type TeamMember
} from "@/lib/team/roster";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { publishSeat, rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveRosterKeys(team);
const ID = "0123456789abcdef0123456789abcdef";
const NOW = 1_790_000_000;
const alice: TeamMember = { id: ID, name: "Alice", role: "employee", invitedAt: NOW };
const shop: Integration = {
  id: "fe".repeat(16),
  name: "Shop",
  createdAt: NOW,
  platform: "node"
};
const call = {
  relays: DEFAULT_RELAYS,
  channel: "account" as const,
  timeoutMs: 1000,
  authKey: keys.nostr.secretKey
};

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

/** What the relays hold of the roster, as any of the owner's devices reads it. */
async function read(list: readonly string[] = DEFAULT_RELAYS) {
  return rosterOf(keys, await fetchRosterAnswers(keys, { ...call, relays: list }));
}

/** The clear text of a record: `{"t": …, "v": …}` and its padding. */
function plaintext(event: NostrEvent): string {
  return nip44Decrypt(event.content, keys.encryptionKey);
}

describe("roster keys", () => {
  it("never change: every account's team derives from them (salt, info strings, addresses)", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.nostr.secretKey).toEqual(derive("roster/author/v1"));
    expect(keys.encryptionKey).toEqual(derive("roster/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("roster/address-key/v1"));
    expect(keys.nostr.publicKey).toBe(bytesToHex(schnorr.getPublicKey(derive("roster/author/v1"))));
    // Computed apart, with Python's hmac and hashlib (HKDF of RFC 5869), from the same root.
    expect(bytesToHex(team.root)).toBe(
      "ed7a2364464bf2bc9ed3a7cf99f32af7896b55ba09f0fc1674c6c5ed64df7077"
    );
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "a7e6d35c344e7cae93b75c33504f0499c97699b8bf2eb6f55d05409ccabccdf2"
    );
    expect(keys.nostr.publicKey).toBe(
      "a24a093fe5e413c4c85030b3c96b75e30432eb901c1b4b8ec4b6b9d6ceb52d30"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "8734fdea48e3d42f244aa317d6b99a21fccea00871a0437c598cb782daba5979"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "cfe6e5faf24f8333d3ffc8ab047733ff2166c862099430d3038a674c9304f96a"
    );
    // HMAC-SHA256(address key, "seat/<role>/<id>"): an employee's and an integration's never meet.
    expect(seatAddress(keys, { role: "employee", id: ID })).toBe(
      "b761411f1957258aff6c35e126b527c6efa77c72d4ac67f930f2ce57c5fa8c8c"
    );
    expect(seatAddress(keys, { role: "integration", id: ID })).toBe(
      "7db77feabfa5dc8c518fa1cf47fefa20182935e2709fa7a87f7aedf6adc7726c"
    );
    expect(seatAddress(keys, { role: "employee", id: ID })).toBe(
      bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`seat/employee/${ID}`)))
    );
    // Its own author: a read by author lists the seats alone, not the channels nor the articles.
    expect(keys.nostr.publicKey).not.toBe(team.publicKey);
    expect(keys.nostr.publicKey).not.toBe(deriveCatalogKeys(team).nostr.publicKey);
  });

  it("are refused once the account closes", () => {
    const closing = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
    wipeTeamKeys(closing);
    expect(() => deriveRosterKeys(closing)).toThrow();
  });
});

describe("a seat's record (format 1)", () => {
  it("never changes: its type, its fields and their order, padded to 256 bytes", () => {
    const active = seatEvent(keys, employeeSeat(alice), NOW);
    expect(active).toMatchObject({
      kind: 30078,
      pubkey: keys.nostr.publicKey,
      created_at: NOW,
      tags: [["d", seatAddress(keys, alice)]]
    });
    const text = plaintext(active);
    expect(text.length % 256).toBe(0);
    expect(text.trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":1,"role":"employee","id":"${ID}","name":"Alice","invitedAt":${NOW}}}`
    );
    const removed = seatEvent(keys, { ...employeeSeat(alice), removedAt: NOW + 60 }, NOW + 60);
    expect(plaintext(removed).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":1,"role":"employee","id":"${ID}","name":"Alice","invitedAt":${NOW},"removed":true,"removedAt":${NOW + 60}}}`
    );
  });

  it("accepts only a valid seat, dated no earlier than what it tells", () => {
    const value = { version: 1, role: "employee", id: ID, name: "Alice", invitedAt: NOW };
    expect(parseSeat(value, NOW)).toEqual(employeeSeat(alice));
    // Dated later: a record refreshed for relays that drop old events.
    expect(parseSeat(value, NOW + 400 * 86_400)).toEqual(employeeSeat(alice));
    expect(parseSeat(value, NOW - 1)).toBeNull();
    const removal = { ...value, removed: true, removedAt: NOW + 60 };
    expect(parseSeat(removal, NOW + 60)).toEqual({ ...employeeSeat(alice), removedAt: NOW + 60 });
    expect(parseSeat(removal, NOW + 9_999)).toEqual({
      ...employeeSeat(alice),
      removedAt: NOW + 60
    });
    // A removal dated before itself, or not after the creation, is no removal.
    expect(parseSeat(removal, NOW + 59)).toBeNull();
    expect(parseSeat({ ...removal, removedAt: NOW }, NOW)).toBeNull();
    expect(parseSeat({ ...removal, removed: false }, NOW + 60)).toBeNull();
    expect(parseSeat({ ...value, removedAt: NOW + 60 }, NOW + 60)).toBeNull();
    const invalid: unknown[] = [
      null,
      "seat",
      { ...value, version: 0 },
      { ...value, role: "owner" },
      { ...value, id: "A".repeat(32) },
      { ...value, name: " " },
      { ...value, name: "J".repeat(41) },
      { ...value, invitedAt: -1 },
      // An employee's date is `invitedAt`.
      { ...value, invitedAt: undefined, createdAt: NOW },
      // An integration's seat is of format 2, with its platform.
      { ...value, role: "integration" },
      { ...value, role: "integration", createdAt: NOW },
      { ...value, role: "integration", createdAt: NOW, platform: "node" }
    ];
    for (const seat of invalid) expect(parseSeat(seat, NOW)).toBeNull();
    // Format 3 is an assistant's: an employee's there is not one.
    expect(parseSeat({ ...value, version: 3 }, NOW)).toBeNull();
    expect(() => parseSeat({ ...value, version: 5 }, NOW)).toThrow(NewerRecordError);
    // Never signed before what it tells: a reader would refuse it.
    expect(() => seatEvent(keys, employeeSeat(alice), NOW - 1)).toThrow();
    expect(() => seatEvent(keys, { ...employeeSeat(alice), removedAt: NOW + 60 }, NOW)).toThrow();
  });
});

describe("a seat's record (format 2)", () => {
  const node: Integration = { ...shop, platform: "node" };

  it("never changes: an integration's with its platform, after its date", () => {
    expect(integrationSeat(node)).toEqual({ ...integrationSeat(shop), platform: "node" });
    const active = seatEvent(keys, integrationSeat(node), NOW);
    // At the same address as in format 1.
    expect(active.tags).toEqual([["d", seatAddress(keys, { role: "integration", id: shop.id })]]);
    expect(plaintext(active).length % 256).toBe(0);
    expect(plaintext(active).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":2,"role":"integration","id":"${shop.id}","name":"Shop","createdAt":${NOW},"platform":"node"}}`
    );
    // Its removal keeps it: "Wallet" shows the logo for the sales paid before.
    const removed = seatEvent(keys, { ...integrationSeat(node), removedAt: NOW + 60 }, NOW + 60);
    expect(plaintext(removed).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":2,"role":"integration","id":"${shop.id}","name":"Shop","createdAt":${NOW},"platform":"node","removed":true,"removedAt":${NOW + 60}}}`
    );
  });

  it("is written for an integration's seat: an employee's stays in format 1", () => {
    const formatOf = (seat: Seat) =>
      (
        JSON.parse(plaintext(seatEvent(keys, seat, seat.removedAt ?? seat.since))) as {
          v: { version: number };
        }
      ).v.version;
    expect(formatOf(employeeSeat(alice))).toBe(1);
    expect(formatOf({ ...employeeSeat(alice), removedAt: NOW + 60 })).toBe(1);
    expect(formatOf(integrationSeat(shop))).toBe(2);
    expect(formatOf({ ...integrationSeat(shop), removedAt: NOW + 60 })).toBe(2);
  });

  it("reads its platform, of a newer app's catalogue too, and refuses anything else", () => {
    const value = {
      version: 2,
      role: "integration",
      id: shop.id,
      name: "Shop",
      createdAt: NOW,
      platform: "node"
    };
    expect(parseSeat(value, NOW)).toEqual(integrationSeat(node));
    expect(parseSeat({ ...value, removed: true, removedAt: NOW + 60 }, NOW + 60)).toEqual({
      ...integrationSeat(node),
      removedAt: NOW + 60
    });
    // An option this build does not know: kept as it is, written again as it is.
    const newer = parseSeat({ ...value, platform: "shop-x2" }, NOW);
    expect(newer).toEqual({ ...integrationSeat(shop), platform: "shop-x2" });
    expect(plaintext(seatEvent(keys, newer!, NOW))).toContain(`"platform":"shop-x2"`);
    const invalid: unknown[] = [
      // Format 2 is an integration's, with its platform.
      { ...value, platform: undefined },
      { ...value, platform: null },
      { ...value, platform: 7 },
      { ...value, platform: "" },
      { ...value, platform: "Node" },
      { ...value, platform: "node.js" },
      { ...value, platform: "node js" },
      { ...value, platform: "-node" },
      { ...value, platform: "node-" },
      { ...value, platform: "no--de" },
      { ...value, platform: "n".repeat(33) },
      { ...value, role: "employee", createdAt: undefined, invitedAt: NOW },
      // Format 1's rules hold.
      { ...value, name: " " },
      { ...value, createdAt: undefined },
      { ...value, removed: true, removedAt: NOW }
    ];
    for (const seat of invalid) expect(parseSeat(seat, NOW)).toBeNull();
    expect(parseSeat({ ...value, platform: "n".repeat(32) }, NOW)).toMatchObject({
      platform: "n".repeat(32)
    });
    // Format 1 is an employee's, whose `platform` is left out, as the apps before format 2 do; an
    // integration's there is not one.
    expect(parseSeat({ ...value, version: 1 }, NOW)).toBeNull();
    expect(
      parseSeat(
        { version: 1, role: "employee", id: ID, name: "Alice", invitedAt: NOW, platform: "node" },
        NOW
      )
    ).toEqual(employeeSeat(alice));
    // Format 3 is an assistant's: an integration's there is not one.
    expect(parseSeat({ ...value, version: 3 }, NOW)).toBeNull();
    expect(() => parseSeat({ ...value, version: 5 }, NOW)).toThrow(NewerRecordError);
  });

  it("is never signed with a platform its readers would refuse", () => {
    const employee = { ...employeeSeat(alice), platform: "node" } as unknown as Seat;
    expect(() => seatEvent(keys, employee, NOW)).toThrow();
    expect(() => seatEvent(keys, { ...integrationSeat(shop), platform: "Node" }, NOW)).toThrow();
    expect(() => seatEvent(keys, { ...integrationSeat(shop), platform: "" }, NOW)).toThrow();
  });
});

describe("a seat's record (format 3)", () => {
  const claude: Assistant = { id: "ab".repeat(16), name: "Carol's assistant", createdAt: NOW };

  it("never changes: an assistant's, with its date of creation, without a platform", () => {
    const active = seatEvent(keys, assistantSeat(claude), NOW);
    expect(active.tags).toEqual([["d", seatAddress(keys, { role: "assistant", id: claude.id })]]);
    expect(plaintext(active).length % 256).toBe(0);
    expect(plaintext(active).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":3,"role":"assistant","id":"${claude.id}","name":"Carol's assistant","createdAt":${NOW}}}`
    );
    const removed = seatEvent(keys, { ...assistantSeat(claude), removedAt: NOW + 60 }, NOW + 60);
    expect(plaintext(removed).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":3,"role":"assistant","id":"${claude.id}","name":"Carol's assistant","createdAt":${NOW},"removed":true,"removedAt":${NOW + 60}}}`
    );
    expect(assistantOf(assistantSeat(claude))).toEqual(claude);
  });

  it("has an address of its own: never an employee's nor an integration's of the same id", () => {
    const address = seatAddress(keys, { role: "assistant", id: ID });
    expect(address).not.toBe(seatAddress(keys, { role: "employee", id: ID }));
    expect(address).not.toBe(seatAddress(keys, { role: "integration", id: ID }));
    expect(address).toBe(
      bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes(`seat/assistant/${ID}`)))
    );
  });

  it("reads an assistant's seat only, and refuses anything else", () => {
    const value = {
      version: 3,
      role: "assistant",
      id: claude.id,
      name: "Carol's assistant",
      createdAt: NOW
    };
    expect(parseSeat(value, NOW)).toEqual(assistantSeat(claude));
    expect(parseSeat({ ...value, removed: true, removedAt: NOW + 60 }, NOW + 60)).toEqual({
      ...assistantSeat(claude),
      removedAt: NOW + 60
    });
    const invalid: unknown[] = [
      { ...value, platform: "node" },
      { ...value, platform: null },
      { ...value, version: 1 },
      { ...value, version: 2 },
      { ...value, createdAt: undefined, invitedAt: NOW },
      { ...value, role: "integration" },
      { ...value, role: "employee" },
      { ...value, name: "" },
      { ...value, id: "AB".repeat(16) },
      { ...value, removed: true, removedAt: NOW },
      { ...value, removed: true, removedAt: NOW + 60 }
    ];
    for (const seat of invalid) expect(parseSeat(seat, NOW)).toBeNull();
    // Dated before its creation: refused.
    expect(parseSeat(value, NOW - 1)).toBeNull();
    expect(() => parseSeat({ ...value, version: 5 }, NOW)).toThrow(NewerRecordError);
  });

  it("is never signed with a platform", () => {
    const withPlatform = { ...assistantSeat(claude), platform: "node" } as unknown as Seat;
    expect(() => seatEvent(keys, withPlatform, NOW)).toThrow();
  });
});

describe("a seat's record (format 4)", () => {
  // An assistant created without invoices, for good.
  const accountant: Assistant = {
    id: "cd".repeat(16),
    name: "Accountant",
    createdAt: NOW,
    invoicing: false
  };

  it("never changes: an assistant's that makes no invoices", () => {
    expect(makesInvoices(accountant)).toBe(false);
    expect(makesInvoices({ ...accountant, invoicing: undefined })).toBe(true);
    const active = seatEvent(keys, assistantSeat(accountant), NOW);
    // Its address is an assistant's: the format says what it may do, never where it is.
    expect(active.tags).toEqual([
      ["d", seatAddress(keys, { role: "assistant", id: accountant.id })]
    ]);
    expect(plaintext(active).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":4,"role":"assistant","id":"${accountant.id}","name":"Accountant","createdAt":${NOW},"invoicing":false}}`
    );
    const removed = seatEvent(
      keys,
      { ...assistantSeat(accountant), removedAt: NOW + 60 },
      NOW + 60
    );
    expect(plaintext(removed).trimEnd()).toBe(
      `{"t":"team-seat","v":{"version":4,"role":"assistant","id":"${accountant.id}","name":"Accountant","createdAt":${NOW},"invoicing":false,"removed":true,"removedAt":${NOW + 60}}}`
    );
    expect(assistantOf(assistantSeat(accountant))).toEqual(accountant);
  });

  it("reads an assistant without invoices only, and refuses anything else", () => {
    const value = {
      version: 4,
      role: "assistant",
      id: accountant.id,
      name: "Accountant",
      createdAt: NOW,
      invoicing: false
    };
    expect(parseSeat(value, NOW)).toEqual(assistantSeat(accountant));
    expect(parseSeat({ ...value, removed: true, removedAt: NOW + 60 }, NOW + 60)).toEqual({
      ...assistantSeat(accountant),
      removedAt: NOW + 60
    });
    const invalid: unknown[] = [
      { ...value, invoicing: undefined },
      { ...value, invoicing: true },
      { ...value, invoicing: "false" },
      { ...value, platform: "node" },
      { ...value, role: "employee", invitedAt: NOW },
      { ...value, role: "integration", platform: "node" }
    ];
    for (const seat of invalid) expect(parseSeat(seat, NOW)).toBeNull();
    // Format 3 says nothing of it: the assistant makes invoices.
    expect(parseSeat({ ...value, version: 3 }, NOW)).toEqual(
      assistantSeat({ ...accountant, invoicing: undefined })
    );
  });

  it("is never signed for another seat than an assistant's", () => {
    const employee = { ...employeeSeat(alice), invoicing: false } as unknown as Seat;
    expect(() => seatEvent(keys, employee, NOW)).toThrow();
  });
});

describe("the roster on the relays", () => {
  it("gives each seat's newest record, a removal replacing its active one for good", async () => {
    await publishSeat(team, employeeSeat(alice));
    await publishSeat(team, integrationSeat(shop));
    expect([...(await read()).seats.values()].map(({ seat }) => seat)).toEqual([
      employeeSeat(alice),
      integrationSeat(shop)
    ]);
    const removed: Seat = { ...employeeSeat(alice), removedAt: NOW + 60 };
    await publishSeat(team, removed);
    // A device that did not see it publishes Alice again, dated by her invitation: refused by every
    // relay holding the removal (strfry: "replaced: have newer event").
    await expect(publishSeat(team, employeeSeat(alice))).resolves.toEqual([]);
    const roster = await read();
    expect(roster.seats.get(`employee:${ID}`)?.seat).toEqual(removed);
    expect(roster.seats.get(`integration:${shop.id}`)?.seat).toEqual(integrationSeat(shop));
    // Each relay that answered holds its newest copy.
    for (const relay of DEFAULT_RELAYS) {
      expect(roster.held.get(relay)?.get(seatAddress(keys, alice))).toBe(NOW + 60);
    }
  });

  it("ignores other authors, records at another seat's address and other records", async () => {
    const other = deriveRosterKeys(
      deriveTeamKeys(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }))
    );
    const at = (address: string, signer: Uint8Array, encryptionKey = keys.encryptionKey) =>
      publishToRelays(
        sealRecord({
          type: "team-seat",
          value: { version: 1, role: "employee", id: ID, name: "Fake", invitedAt: NOW },
          signer,
          encryptionKey,
          address,
          createdAt: NOW
        }),
        { ...call, authKey: signer }
      );
    // Another account's roster, and a record of Alice moved to another seat's address.
    await at(seatAddress(other, alice), other.nostr.secretKey, other.encryptionKey);
    await at(seatAddress(keys, { role: "employee", id: "ab".repeat(16) }), keys.nostr.secretKey);
    // The catalogue's records, of another author and type.
    const catalog = deriveCatalogKeys(team);
    await publishToRelays(
      sealRecord({
        type: "catalog-article",
        value: { version: 1 },
        signer: catalog.nostr.secretKey,
        encryptionKey: catalog.encryptionKey,
        address: "cd".repeat(32),
        createdAt: NOW
      }),
      { ...call, authKey: catalog.nostr.secretKey }
    );
    expect((await read()).seats.size).toBe(0);
  });

  it("never shows nor writes over a seat a newer app wrote, and says so", async () => {
    await publishSeat(team, employeeSeat(alice));
    await publishSeat(team, integrationSeat(shop));
    // A newer version of the app changed Alice's record since.
    await publishToRelays(
      sealRecord({
        type: "team-seat",
        value: { version: 5, role: "employee", id: ID },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: seatAddress(keys, alice),
        createdAt: NOW + 30
      }),
      call
    );
    const roster = await read();
    expect([...roster.seats.keys()]).toEqual([`integration:${shop.id}`]);
    expect([...roster.newer]).toEqual([seatAddress(keys, alice)]);
  });

  it("is not hidden by garbage a relay sends under a real record's id", async () => {
    await publishSeat(team, employeeSeat(alice));
    const [first, ...others] = DEFAULT_RELAYS;
    const real = relays.stored.get(others[0]!)![0]!;
    relays.stored.set(first!, [{ ...real, content: "garbage" }]);
    expect((await read()).seats.get(`employee:${ID}`)?.seat).toEqual(employeeSeat(alice));
  });

  it("is read past what a relay sends for one filter, every seat ever", async () => {
    const count = relays.MAX_EVENTS_PER_FILTER + 50;
    for (let n = 0; n < count; n += 1) {
      const id = n.toString(16).padStart(32, "0");
      await publishSeat(
        team,
        { role: "employee", id, name: `Employee ${n}`, since: NOW + n, removedAt: NOW + n + 1 },
        { relays: DEFAULT_RELAYS.slice(0, 1) }
      );
    }
    expect((await read(DEFAULT_RELAYS.slice(0, 1))).seats.size).toBe(count);
  });
});

describe("the account's roster", () => {
  const ADDRESS = "sattleme02c6047f94@breez.tips";
  const accountTeam = deriveTeamKeys(walletSecret(testSeed()));

  /** The owner's device: its account open (done), its point of sale prepared. */
  async function ownerDevice(): Promise<void> {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const profile: SavedTerminalProfile = {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    };
    await saveTerminalProfile(profile);
    resetTerminalProfileCache();
  }

  /** The newest record of `integration` each relay of `list` holds, as its event. */
  async function recordsOf(integration: Integration, list: readonly string[] = DEFAULT_RELAYS) {
    const roster = deriveRosterKeys(accountTeam);
    const address = seatAddress(roster, { role: "integration", id: integration.id });
    return list.map((relay) =>
      relays.stored.get(relay)?.find((event) => event.tags.some(([, d]) => d === address))
    );
  }

  it("dates a year-old record again, from what most relays hold of it and of its channel", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shop", "node");
    const later = integration.createdAt + ROSTER_REFRESH_SECONDS + 1;
    // Fewer than a majority answer: an active record is never dated again (a removal on the others
    // could be replaced).
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await syncTeamChannels(() => later);
    relays.unreachable.clear();
    for (const event of await recordsOf(integration)) {
      expect(event?.created_at).toBe(integration.createdAt);
    }
    await syncTeamChannels(() => later);
    for (const event of await recordsOf(integration)) expect(event?.created_at).toBe(later);
    // Its value unchanged: created when it was.
    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [integration] });
  });

  it("dates a year-old removal again, whatever answered", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shop", "node");
    await removeIntegration(integration);
    const [removal] = await recordsOf(integration);
    const later = removal!.created_at + ROSTER_REFRESH_SECONDS + 1;
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await syncTeamChannels(() => later);
    relays.unreachable.clear();
    const dated = await recordsOf(integration, DEFAULT_RELAYS.slice(3));
    expect(dated.map((event) => event?.created_at)).toEqual([later, later]);
    // Still the same removal, from its first date.
    expect((await rosterOn(accountTeam, DEFAULT_RELAYS.slice(3))).removed).toEqual([
      expect.objectContaining({ id: integration.id, removedAt: removal!.created_at })
    ]);
  });

  it("records again a removal that a record dated later replaced", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shop", "node");
    const seat = integrationSeat(integration);
    // Another of the owner's devices removed it (its channel), while a third refreshed its record,
    // dated after that removal on its own clock: the relays keep the refreshed copy.
    const removedAt = integration.createdAt + 500;
    await publishToRelays(
      channelEvent(accountTeam, deriveIntegrationKeys(integrationSecretKey(accountTeam, seat.id)), {
        version: 1,
        status: "removed",
        updatedAt: removedAt
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: accountTeam.secretKey
      }
    );
    await publishSeat(accountTeam, seat, { createdAt: integration.createdAt + 1000 });
    await syncTeamChannels();
    const { active, removed } = await rosterOn(accountTeam);
    expect(active).toEqual([]);
    expect(removed).toEqual([{ ...seat, removedAt }]);
    for (const event of await recordsOf(integration)) {
      expect(event!.created_at).toBeGreaterThan(integration.createdAt + 1000);
    }
  });

  it("never undoes a removal this device knows, when relays that missed it answer", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shop", "node");
    await removeIntegration(integration);
    // The relays lost it (pruned, replaced): they give the active record alone.
    relays.resetRelays();
    await publishSeat(accountTeam, integrationSeat(integration));
    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [] });
  });

  it("goes with a change of relays, removals included, before it is saved", async () => {
    await ownerDevice();
    const OWN = ["wss://relay.bakery.example"];
    const { integration: kept } = await createIntegration("Shop", "node");
    const { integration: gone } = await createIntegration("Old shop", "node");
    await removeIntegration(gone);
    // The new relay takes nothing: the move is refused, nothing saved.
    relays.readOnly.add(OWN[0]!);
    await expect(changeRelays(OWN)).rejects.toMatchObject({ code: "unreachable" });
    expect(getAccountSettings()?.relays).toEqual(DEFAULT_RELAYS);
    relays.readOnly.clear();
    await changeRelays(OWN);
    expect(getAccountSettings()?.relays).toEqual(OWN);
    const moved = await rosterOn(accountTeam, OWN);
    expect(moved.active).toEqual([integrationSeat(kept)]);
    expect(moved.removed).toEqual([expect.objectContaining({ id: gone.id })]);
    await expect(loadIntegrations()).resolves.toMatchObject({ integrations: [kept] });
  });

  it("takes every holder's payment links to the new relays, of any date", async () => {
    await ownerDevice();
    const OWN = ["wss://relay.bakery.example"];
    // Alice, removed since: the record of her link of a year ago is on the list left alone (her
    // device copies its records from a change on only), where the owner's copy of that month
    // looks for it (src/features/activity/archive.ts).
    await publishSeat(accountTeam, { ...employeeSeat(alice), removedAt: NOW + 60 });
    const keys = deriveMemberKeys(memberSecret(accountTeam, alice.id));
    const link = "ab".repeat(32);
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link,
        saleKey: "cd".repeat(32),
        createdAt: NOW - 400 * 24 * 3600,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      }),
      DEFAULT_RELAYS
    );
    await changeRelays(OWN);
    expect(getAccountSettings()?.relays).toEqual(OWN);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await fetchLinks(keys, 0, OWN))?.length) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect((await fetchLinks(keys, 0, OWN))?.map((record) => record.link)).toEqual([link]);
  });
});

describe("the roster, with relays that stay connected without answering", () => {
  // No call waits for every relay.
  const pairs = DEFAULT_RELAYS.flatMap((a, i) =>
    DEFAULT_RELAYS.slice(i + 1).map((b): [string, string] => [a, b])
  );
  /** A relay given 10 s to answer: none is waited for that long when a majority answers. */
  const slow = { ...call, timeoutMs: 10_000 };

  /** Runs `promise` on fake timers: its value, and how long (fake ms) it took to settle. */
  async function timed<T>(promise: Promise<T>): Promise<{ value: T; ms: number }> {
    const startedAt = Date.now();
    let settled: { value: T } | null = null;
    void promise.then((value) => {
      settled = { value };
    });
    while (settled === null) {
      if (Date.now() - startedAt > 100_000) throw new Error("Never settled");
      await jest.advanceTimersByTimeAsync(10);
    }
    return { value: (settled as { value: T }).value, ms: Date.now() - startedAt };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("finds a removal a majority took, whichever two relays stay quiet, without their timeout", async () => {
    await timed(publishSeat(team, employeeSeat(alice)));
    const removed: Seat = { ...employeeSeat(alice), removedAt: NOW + 60 };
    await timed(publishSeat(team, removed, { relays: DEFAULT_RELAYS.slice(2) }));
    for (const [silent, mute] of pairs) {
      relays.silent.clear();
      relays.latency.clear();
      relays.silent.add(silent);
      relays.latency.set(mute, Infinity);
      const { value, ms } = await timed(fetchRosterAnswers(keys, slow));
      expect(value.size).toBeGreaterThanOrEqual(3);
      expect(ms).toBeLessThan(2000);
      expect(rosterOf(keys, value).seats.get(`employee:${ID}`)?.seat).toEqual(removed);
    }
  });

  it("is no majority's read with three relays silent", async () => {
    await timed(publishSeat(team, employeeSeat(alice)));
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.silent.add(relay);
    const { value, ms } = await timed(fetchRosterAnswers(keys, slow));
    expect(value.size).toBe(2);
    expect(ms).toBeGreaterThanOrEqual(10_000);
  });

  it("holds a removal over two lists only once each list's majority took it", async () => {
    const seat = employeeSeat(alice);
    await timed(publishSeat(team, seat));
    const before = DEFAULT_RELAYS.slice(0, 3);
    const next = DEFAULT_RELAYS.slice(2);
    // e never answers: c and d make the second list's majority, a, b and c the first's.
    relays.latency.set(DEFAULT_RELAYS[4], Infinity);
    const recorded = await timed(recordRemoval(team, seat, NOW + 60, null, [before, next]));
    expect(recorded.value).toBe(true);
    expect(recorded.ms).toBeLessThan(TEAM_TIMEOUT_MS.background);

    // d silent too: the second list holds it on c alone, whatever the first list holds.
    relays.latency.set(DEFAULT_RELAYS[3], Infinity);
    const other = employeeSeat({ ...alice, id: "ab".repeat(16) });
    await timed(publishSeat(team, other, { relays: DEFAULT_RELAYS.slice(0, 3) }));
    const unsaved = await timed(recordRemoval(team, other, NOW + 60, null, [before, next]));
    expect(unsaved.value).toBe(false);
  });
});
