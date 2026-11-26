import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS as TEAM_RELAYS } from "@/config/relays";
import { ASSISTANT_LOT_SIZE, INVITE_VALIDITY_SECONDS, MEMBER_LOT_SIZE } from "@/config/team";
import { closeAccount, getAccountTeamKeys, updateAccount } from "@/features/account/session";
import { EMPTY_LOT_READ_MS, readEmptyLot } from "@/features/team/member";
import {
  applyLot,
  forgetMemberLot,
  lotAddresses,
  lotTag,
  resetUsedPublications,
  returnToLot,
  syncMemberLot,
  takeFromLot
} from "@/features/team/member-addresses";
import { assistantKeysOf } from "@/features/team/assistants";
import { syncEmployeeAddresses } from "@/features/team/owner-addresses";
import { releaseOnchainAddress, takeOnchainAddress } from "@/features/terminal/onchain-pool";
import { WalletError } from "@/lib/breez/errors";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  newDepositAddress,
  subscribeWallet
} from "@/lib/breez/wallet";
import { sealRecord } from "@/lib/nostr/record";
import type { TeamMember } from "@/lib/team/roster";
import {
  deriveIssueKey,
  deriveMemberKeys,
  memberSecret,
  newMemberId,
  recordAddress,
  type MemberKeys,
  type TeamKeys
} from "@/lib/team/keys";
import { MEMBERSHIP_VERSION } from "@/lib/team/membership";
import { saveMembership } from "@/lib/team/membership-store";
import { deviceEvent, publishMemberRecord } from "@/lib/team/member-records";
import {
  fetchLot,
  fetchLotStates,
  isIssuedAddress,
  issueTag,
  lotEvent,
  lotRecordAddress,
  usedEvent
} from "@/lib/team/onchain-lot";
import { loadMemberLot } from "@/lib/team/member-lot-store";

import { openTestAccount } from "../../jest/account";
import { publishAssistant, publishMember } from "../../jest/roster";
import { taprootAddress } from "../../jest/bitcoin";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * Employees' on-chain addresses: each employee's lot, given
 * by the owner's wallet at the owner's login or unlock, and once the employee is invited,
 * filled up to MEMBER_LOT_SIZE as soon as one is missing; the employee's device
 * takes its sales' addresses from it, reads it again when a sale finds none left, and tells the
 * owner which it used.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletConnectionId: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  subscribeWallet: jest.fn()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const NOW = Math.floor(Date.now() / 1000);

/** The fake wallet: connected or not, handing out taprootAddress(1), (2), … */
const wallet = { connected: false, next: 0, failAfter: Infinity, busyFor: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  closeAccount();
  relays.resetRelays();
  resetUsedPublications();
  Object.assign(wallet, { connected: false, next: 0, failAfter: Infinity, busyFor: 0 });
  jest.mocked(connectWallet).mockImplementation(async () => {
    if (wallet.busyFor > 0) {
      wallet.busyFor -= 1;
      throw new WalletError("alreadyConnected", "A wallet is already connected");
    }
    wallet.connected = true;
  });
  jest.mocked(disconnectWallet).mockImplementation(async () => {
    wallet.connected = false;
  });
  jest.mocked(getWalletConnectionId).mockImplementation(() => (wallet.connected ? 1 : null));
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  // The busy wallet frees itself at once.
  jest.mocked(subscribeWallet).mockImplementation((listener) => {
    const timer = setTimeout(listener, 0);
    return () => clearTimeout(timer);
  });
  jest.mocked(newDepositAddress).mockImplementation(async () => {
    if (!wallet.connected) throw new WalletError("notConnected", "No wallet is connected");
    if (wallet.next >= wallet.failAfter) throw new WalletError("requestFailed", "Exhausted");
    wallet.next += 1;
    return taprootAddress(wallet.next);
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

function member(name: string, invitedAt = NOW): TeamMember {
  return { id: newMemberId(), name, role: "employee", invitedAt };
}

/** The owner's account open, with `members`; returns its team keys. */
async function ownerWith(members: TeamMember[]): Promise<TeamKeys> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const team = getAccountTeamKeys()!;
  // Invited from another of the owner's devices: their records on the account's relays.
  for (const of of members) await publishMember(team, of);
  return team;
}

function keysOf(team: TeamKeys, of: TeamMember): MemberKeys {
  return deriveMemberKeys(memberSecret(team, of.id));
}

/** The device of `of` joined: its record is on the relays. */
async function joined(team: TeamKeys, of: TeamMember) {
  const keys = keysOf(team, of);
  await publishMemberRecord(
    keys,
    deviceEvent(keys, { version: 1, deviceId: "f".repeat(32), platform: "ios", joinedAt: NOW })
  );
}

const fills = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => taprootAddress(from + i));

/** Any tag of the owner's shape: the employee's device never checks it, the owner does. */
const TAG = "0f".repeat(8);

/** A lot of `addresses`, dated `updatedAt`. */
function lot(addresses: string[], updatedAt: number) {
  return { version: 1 as const, addresses, tags: addresses.map(() => TAG), updatedAt };
}

describe("the employees' lots, at the owner's login or unlock", () => {
  it("give each employee who joined, or still may, its own 20 addresses of the wallet", async () => {
    // Invited one after the other: the lots are filled in the roster's order, by invitation.
    const alice = member("Alice", NOW - 20);
    const bob = member("Bob", NOW - 10);
    const late = member("Erin", NOW - INVITE_VALIDITY_SECONDS - 60);
    const team = await ownerWith([alice, bob, late]);
    await joined(team, alice);

    await syncEmployeeAddresses();

    const given = await fetchLot(team.publicKey, keysOf(team, alice), "mainnet");
    expect(given?.addresses).toEqual(fills(1, 20));
    // Each with the owner's tag: only the owner's issue key makes it, for this employee.
    const issueKey = deriveIssueKey(team);
    expect(given?.tags).toEqual(
      fills(1, 20).map((address) => issueTag(issueKey, alice.id, address))
    );
    expect(isIssuedAddress(issueKey, bob.id, taprootAddress(1), given!.tags[0])).toBe(false);
    // Invited, not joined yet: its lot is ready for its first sale.
    expect((await fetchLot(team.publicKey, keysOf(team, bob), "mainnet"))?.addresses).toEqual(
      fills(21, 40)
    );
    // An invitation ended unused: nothing (nor to a removed employee, no longer in the team).
    expect(await fetchLot(team.publicKey, keysOf(team, late), "mainnet")).toBeNull();
    // The wallet connected for that only.
    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(wallet.connected).toBe(false);
  });

  it("give none to an employee who left the business", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    const keys = keysOf(team, alice);
    await publishMemberRecord(
      keys,
      deviceEvent(keys, {
        version: 1,
        deviceId: "f".repeat(32),
        platform: "ios",
        joinedAt: NOW - 60,
        leftAt: NOW
      })
    );

    await syncEmployeeAddresses();

    expect(await fetchLot(team.publicKey, keys, "mainnet")).toBeNull();
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("drop the addresses used and fill the lot up as soon as one is missing", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    await syncEmployeeAddresses();
    const keys = keysOf(team, alice);

    // Full: nothing to do, the wallet stays disconnected.
    await syncEmployeeAddresses();
    expect(connectWallet).toHaveBeenCalledTimes(1);

    // The employee's device used one: 19 left, filled up again at the next unlock.
    const lotAt = (await fetchLot(team.publicKey, keys, "mainnet"))!.updatedAt;
    await publishMemberRecord(
      keys,
      usedEvent(keys, { version: 1, used: [taprootAddress(1)], lotAt, updatedAt: NOW })
    );
    await syncEmployeeAddresses();
    expect((await fetchLot(team.publicKey, keys, "mainnet"))?.addresses).toEqual([
      ...fills(2, 20),
      taprootAddress(21)
    ]);
    expect(connectWallet).toHaveBeenCalledTimes(2);
  });

  it("never fill a lot from a copy older than the one the device holds", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    await syncEmployeeAddresses();
    const keys = keysOf(team, alice);
    const address = recordAddress(keys, "onchain-lot");
    const lotOn = (relay: string) =>
      (relays.stored.get(relay) ?? []).find((event) =>
        event.tags.some(([name, value]) => name === "d" && value === address)
      )!;
    const first = lotOn(TEAM_RELAYS[0]);
    const firstAt = first.created_at;

    // Address 1 used: the next lot drops it, but only three relays took that one.
    await publishMemberRecord(
      keys,
      usedEvent(keys, { version: 1, used: [taprootAddress(1)], lotAt: firstAt, updatedAt: NOW })
    );
    await syncEmployeeAddresses();
    const second = lotOn(TEAM_RELAYS[0]);
    for (const relay of TEAM_RELAYS.slice(3)) {
      relays.stored.set(relay, [
        ...(relays.stored.get(relay) ?? []).filter((event) => event.id !== second.id),
        first
      ]);
    }
    // The device holds it, and no longer keeps address 1 as used (it is not in its lot any more);
    // it used address 2 since.
    await publishMemberRecord(
      keys,
      usedEvent(keys, {
        version: 1,
        used: [taprootAddress(2)],
        lotAt: second.created_at,
        updatedAt: NOW + 1
      })
    );

    // At the next unlock, only the relays that missed it answer: the lot is left as it is.
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await syncEmployeeAddresses();
    relays.unreachable.clear();
    const newest = await fetchLot(team.publicKey, keys, "mainnet");
    expect(newest?.updatedAt).toBe(second.created_at);
    expect(newest?.addresses).not.toContain(taprootAddress(1));
  });

  it("wait for a busy wallet, and give what the wallet gave", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    // The activation still holds the wallet at login, then the wallet stops answering.
    wallet.busyFor = 2;
    wallet.failAfter = 7;

    await syncEmployeeAddresses();

    expect(connectWallet).toHaveBeenCalledTimes(3);
    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 7)
    );
    expect(wallet.connected).toBe(false);
  });

  it("keep asking the wallet for as long as it takes: no time limit", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    // From its second address on, the wallet answers ten minutes after the filling began.
    const start = Date.now();
    const clock = jest.spyOn(Date, "now");
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next >= 1) {
        clock.mockReturnValue(start + 10 * 60 * 1000);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    try {
      await syncEmployeeAddresses();
    } finally {
      clock.mockRestore();
    }

    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 20)
    );
    expect(wallet.connected).toBe(false);
  });

  it("stop once the wallet hands an address out again, never giving it twice", async () => {
    // Filled in the roster's order, by invitation: Alice's lot first.
    const alice = member("Alice", NOW - 20);
    const bob = member("Bob", NOW - 10);
    const team = await ownerWith([alice, bob]);
    await joined(team, alice);
    // Its fourth address is its third again: the wallet gives no new one now.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      wallet.next += 1;
      return taprootAddress(Math.min(wallet.next, 3));
    });

    await syncEmployeeAddresses();

    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 3)
    );
    expect(await fetchLot(team.publicKey, keysOf(team, bob), "mainnet")).toBeNull();
    expect(wallet.next).toBe(4);
    expect(wallet.connected).toBe(false);
  });

  it("stop once a wallet screen takes the connection, and give what the wallet gave", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    // After five addresses, a wallet screen connects the wallet again, for itself.
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      wallet.next += 1;
      if (wallet.next === 5) jest.mocked(getWalletConnectionId).mockReturnValue(2);
      return taprootAddress(wallet.next);
    });

    await syncEmployeeAddresses();

    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 5)
    );
    // Its connection stays: the filling does not disconnect it.
    expect(disconnectWallet).not.toHaveBeenCalled();
  });

  it("never read a lot signed by another key, nor one out of shape", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    const keys = keysOf(team, alice);
    // Signed by the employee's own key: only the team gives addresses.
    await publishMemberRecord(
      keys,
      sealRecord({
        type: "team-onchain-lot",
        value: { version: 1, addresses: [taprootAddress(99)], updatedAt: NOW },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: recordAddress(keys, "onchain-lot"),
        createdAt: NOW
      })
    );
    expect(await fetchLot(team.publicKey, keys, "mainnet")).toBeNull();
    // Of another network, or too long: refused.
    for (const addresses of [
      [taprootAddress(1, "bcrt")],
      fills(1, MEMBER_LOT_SIZE + 1),
      [taprootAddress(1), taprootAddress(1)]
    ]) {
      relays.resetRelays();
      await publishMemberRecord(
        keys,
        lotEvent(team, keys, {
          version: 1,
          addresses,
          tags: addresses.map(() => TAG),
          updatedAt: NOW
        })
      );
      expect(await fetchLot(team.publicKey, keys, "mainnet")).toBeNull();
    }
    // Readable by the employee and the owner only: nothing of it shows on the relays.
    relays.resetRelays();
    await publishMemberRecord(keys, lotEvent(team, keys, lot([taprootAddress(1)], NOW)));
    expect(JSON.stringify(relays.stored.get(TEAM_RELAYS[0]))).not.toContain(taprootAddress(1));
    const states = await fetchLotStates(team, [{ id: alice.id, keys }], "mainnet", team.secretKey);
    expect(states?.get(alice.id)).toEqual({
      lot: lot([taprootAddress(1)], NOW),
      used: null,
      newer: false
    });
    // Where relays give an author's events to that author only: each read as its authors.
    for (const relay of TEAM_RELAYS) relays.authorReads.add(relay);
    await expect(
      fetchLotStates(team, [{ id: alice.id, keys }], "mainnet", team.secretKey)
    ).resolves.toEqual(states);
    relays.authorReads.clear();
    // A tag out of shape: refused.
    relays.resetRelays();
    await publishMemberRecord(
      keys,
      lotEvent(team, keys, { ...lot([taprootAddress(1)], NOW), tags: ["zz"] })
    );
    expect(await fetchLot(team.publicKey, keys, "mainnet")).toBeNull();
  });
});

describe("an assistant's lot", () => {
  const ASSISTANT = { id: "0123456789abcdef0123456789abcdef", name: "Claude", createdAt: NOW };

  /** The owner's account open, with `members` and the assistant; returns its team keys. */
  async function ownerWithAssistant(members: TeamMember[] = []): Promise<TeamKeys> {
    const team = await ownerWith(members);
    await publishAssistant(team, ASSISTANT);
    return team;
  }

  /** The assistant's lot and used addresses, as the owner reads them. */
  async function stateOf(team: TeamKeys) {
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    const states = await fetchLotStates(
      team,
      [{ id: ASSISTANT.id, keys }],
      "mainnet",
      team.secretKey
    );
    return states!.get(ASSISTANT.id)!;
  }

  /** A record of the assistant's, of type `type` and value `value`, as its MCP server writes it. */
  function assistantUsed(team: TeamKeys, value: object, createdAt: number) {
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    return publishMemberRecord(
      keys,
      sealRecord({
        type: "team-onchain-used",
        value: { ...value, updatedAt: createdAt },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.records.encryptionKey,
        address: recordAddress(keys, "onchain-used"),
        createdAt
      })
    );
  }

  it("holds 100 addresses, in the lot's version 2, an employee's 20 in its version 1", async () => {
    const alice = member("Alice");
    const team = await ownerWithAssistant([alice]);
    await joined(team, alice);

    await syncEmployeeAddresses();

    // The emptiest first, the roster's order between equals: the employee, then the assistant.
    expect(await fetchLot(team.publicKey, keysOf(team, alice), "mainnet")).toMatchObject({
      version: 1,
      addresses: fills(1, MEMBER_LOT_SIZE)
    });
    const { lot } = await stateOf(team);
    expect(lot?.version).toBe(2);
    expect(lot?.addresses).toEqual(fills(21, 20 + ASSISTANT_LOT_SIZE));
    // Each with the owner's tag of it, for the assistant.
    const issueKey = deriveIssueKey(team);
    expect(lot?.tags).toEqual(lot?.addresses.map((a) => issueTag(issueKey, ASSISTANT.id, a)));
    // An employee's device never takes a lot of version 2 (its secure store keeps 20 at most).
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    expect(await fetchLot(team.publicKey, keys, "mainnet")).toBeNull();
    expect(connectWallet).toHaveBeenCalledTimes(1);
    expect(wallet.connected).toBe(false);
  });

  // "On-chain payments" is the point of sale's only; an
  // assistant's invoices always offer an on-chain address (its channel says so, owner.ts).
  it("is filled while the point of sale takes Lightning only; the employees' lots are not", async () => {
    const alice = member("Alice");
    const team = await ownerWithAssistant([alice]);
    await joined(team, alice);
    // The account's settings stay on the device from one test to the next: back on after.
    await updateAccount({ onchainPayments: false });
    try {
      await syncEmployeeAddresses();

      expect(await fetchLot(team.publicKey, keysOf(team, alice), "mainnet")).toBeNull();
      const { lot } = await stateOf(team);
      expect(lot?.version).toBe(2);
      expect(lot?.addresses).toEqual(fills(1, ASSISTANT_LOT_SIZE));
      expect(connectWallet).toHaveBeenCalledTimes(1);
      expect(wallet.connected).toBe(false);
    } finally {
      await updateAccount({ onchainPayments: true });
    }
  });

  it("is none for an assistant created without invoices: it would never use it", async () => {
    // An assistant that only exports takes no address.
    const team = await ownerWith([]);
    await publishAssistant(team, { ...ASSISTANT, invoicing: false });

    await syncEmployeeAddresses();

    expect(await stateOf(team)).toMatchObject({ lot: null });
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("fills a lot of version 1 (made before) up to 100 in version 2, its addresses left first", async () => {
    const team = await ownerWithAssistant();
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    await publishMemberRecord(keys, lotEvent(team, keys, lot(fills(1, 20), NOW - 60)));
    // Its MCP server used the first one (a used record of version 1, as before).
    await assistantUsed(team, { version: 1, used: [taprootAddress(1)], lotAt: NOW - 60 }, NOW - 30);
    wallet.next = 20;

    await syncEmployeeAddresses();

    const { lot: filled } = await stateOf(team);
    expect(filled?.version).toBe(2);
    expect(filled?.addresses).toEqual([...fills(2, 20), ...fills(21, 101)]);
    expect(filled?.updatedAt).toBeGreaterThan(NOW - 60);
  });

  it("drops what its MCP server used, beyond 20 addresses (used addresses of version 2)", async () => {
    const team = await ownerWithAssistant();
    await syncEmployeeAddresses();
    const lotAt = (await stateOf(team)).lot!.updatedAt;
    await assistantUsed(team, { version: 2, used: fills(1, 30), lotAt }, lotAt + 1);
    // 21 used addresses: of version 2 only.
    expect((await stateOf(team)).used?.used).toHaveLength(30);

    await syncEmployeeAddresses();

    expect((await stateOf(team)).lot?.addresses).toEqual(fills(31, 130));
  });

  it("never reads more addresses than its version holds", async () => {
    const team = await ownerWithAssistant();
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    for (const [version, addresses, readable] of [
      [2, fills(1, ASSISTANT_LOT_SIZE), true],
      [2, fills(1, ASSISTANT_LOT_SIZE + 1), false],
      [1, fills(1, MEMBER_LOT_SIZE + 1), false]
    ] as const) {
      relays.resetRelays();
      await publishMemberRecord(
        keys,
        lotEvent(team, keys, {
          version,
          addresses: [...addresses],
          tags: addresses.map(() => TAG),
          updatedAt: NOW
        })
      );
      expect((await stateOf(team)).lot !== null).toBe(readable);
    }
    for (const [version, used, readable] of [
      [2, fills(1, 21), true],
      [2, fills(1, ASSISTANT_LOT_SIZE + 1), false],
      [1, fills(1, MEMBER_LOT_SIZE + 1), false]
    ] as const) {
      relays.resetRelays();
      await assistantUsed(team, { version, used, lotAt: NOW }, NOW);
      expect((await stateOf(team)).used !== null).toBe(readable);
    }
  });

  it("leaves a lot, or used addresses, of a newer format as they are", async () => {
    const team = await ownerWithAssistant();
    const keys = assistantKeysOf(team, ASSISTANT.id).member;
    // A newer app of the owner's wrote the lot in a version this one does not know.
    await publishMemberRecord(
      keys,
      sealRecord({
        type: "team-onchain-lot",
        value: { version: 3, addresses: [taprootAddress(7)], tags: [TAG], updatedAt: NOW },
        signer: team.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: lotRecordAddress(keys),
        createdAt: NOW
      })
    );
    expect(await stateOf(team)).toEqual({ lot: null, used: null, newer: true });

    await syncEmployeeAddresses();

    expect(connectWallet).not.toHaveBeenCalled();
    expect(await stateOf(team)).toEqual({ lot: null, used: null, newer: true });

    // A lot it reads, but used addresses of a newer format: left as it is all the same.
    relays.resetRelays();
    await publishMemberRecord(keys, lotEvent(team, keys, lot(fills(1, 2), NOW - 60)));
    await assistantUsed(team, { version: 3, used: [taprootAddress(1)], lotAt: NOW - 60 }, NOW);
    await syncEmployeeAddresses();
    expect(connectWallet).not.toHaveBeenCalled();
    expect((await stateOf(team)).lot).toEqual(lot(fills(1, 2), NOW - 60));
  });

  it("is published as it fills: its MCP server takes addresses before it is full", async () => {
    const team = await ownerWithAssistant();
    // The wallet waits before its 16th address.
    const resume = gate();
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next === 15) await resume.opened;
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    const filling = syncEmployeeAddresses();
    await until(() => jest.mocked(newDepositAddress).mock.calls.length === 16);

    await waitFor(async () => expect((await stateOf(team)).lot?.addresses).toEqual(fills(1, 10)));
    resume.open();
    await filling;
    expect((await stateOf(team)).lot?.addresses).toEqual(fills(1, ASSISTANT_LOT_SIZE));
  });
});

describe("the lot of an employee just invited", () => {
  it("is filled at once, before its device joins", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);

    // "Employees", once the invitation shows (EmployeesScreen).
    await syncEmployeeAddresses({ again: true });

    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 20)
    );
    expect(wallet.connected).toBe(false);
  });

  it("is filled after the filling running, which read the roster before it", async () => {
    const alice = member("Alice", NOW - 20);
    const team = await ownerWith([alice]);
    await joined(team, alice);
    // The wallet waits before its 6th address.
    const resume = gate();
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      if (wallet.next === 5) await resume.opened;
      wallet.next += 1;
      return taprootAddress(wallet.next);
    });
    const filling = syncEmployeeAddresses();
    await until(() => jest.mocked(newDepositAddress).mock.calls.length === 6);

    // Invited meanwhile.
    const bob = member("Bob");
    await publishMember(team, bob);
    const again = syncEmployeeAddresses({ again: true });
    // A login or unlock meanwhile shares the filling running; a second invitation, the next one.
    expect(syncEmployeeAddresses()).toBe(filling);
    expect(syncEmployeeAddresses({ again: true })).toBe(again);
    resume.open();
    await again;

    expect((await fetchLot(team.publicKey, keysOf(team, alice), "mainnet"))?.addresses).toEqual(
      fills(1, 20)
    );
    expect((await fetchLot(team.publicKey, keysOf(team, bob), "mainnet"))?.addresses).toEqual(
      fills(21, 40)
    );
    expect(wallet.connected).toBe(false);
  });
});

describe("the employee's lot, on its device", () => {
  /** An employee's device that joined `team` as `of`. */
  async function employeeDevice(team: TeamKeys, of: TeamMember) {
    await saveMembership({
      version: MEMBERSHIP_VERSION,
      team: team.publicKey,
      secret: bytesToHex(memberSecret(team, of.id)),
      name: of.name,
      deviceId: "e".repeat(32),
      joinedAt: NOW
    });
    return keysOf(team, of);
  }

  it("takes its sales' addresses from its lot, and tells the owner which it used", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    await joined(team, alice);
    await syncEmployeeAddresses();
    const keys = await employeeDevice(team, alice);

    await syncMemberLot(team.publicKey, keys);
    expect(await lotAddresses(team.publicKey)).toEqual(fills(1, 20));
    // Paid already (a code kept since): skipped, used all the same.
    mempool.pay(taprootAddress(1), 5_000n);
    const pool = { kind: "team" as const, team: team.publicKey };
    await expect(takeOnchainAddress(pool)).resolves.toEqual({
      address: taprootAddress(2),
      unavailable: null
    });
    expect(await lotAddresses(team.publicKey)).toEqual(fills(3, 20));
    // Its tag, for the records of the sale and of its link: the owner's own.
    const tag = issueTag(deriveIssueKey(team), alice.id, taprootAddress(2));
    expect(await lotTag(team.publicKey, taprootAddress(2))).toBe(tag);

    // The owner sees both used, and fills the lot up at its next unlock.
    await waitFor(async () => {
      const states = await fetchLotStates(
        team,
        [{ id: alice.id, keys }],
        "mainnet",
        team.secretKey
      );
      expect(states?.get(alice.id)?.used?.used).toEqual([taprootAddress(1), taprootAddress(2)]);
    });
    await syncEmployeeAddresses();
    await syncMemberLot(team.publicKey, keys);
    expect(await lotAddresses(team.publicKey)).toEqual([...fills(3, 20), ...fills(21, 22)]);
    expect((await loadMemberLot("mainnet"))?.used).toEqual([]);
    // Gone from the lot, the tag of an address a sale of this launch took stays at hand (its link
    // may be shared later).
    expect(await lotTag(team.publicKey, taprootAddress(2))).toBe(tag);
    // At most 20 entries with their tags: below the Keychain's 2 KB.
    expect(
      new TextEncoder().encode(JSON.stringify(await loadMemberLot("mainnet"))).length
    ).toBeLessThan(1800);
  });

  it("reads its lot again once a sale finds none left: the next sale has an address", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    const keys = await employeeDevice(team, alice);
    // Joined before the owner's filling of its lot ended: the device read none.
    await syncMemberLot(team.publicKey, keys);
    await syncEmployeeAddresses({ again: true });
    const pool = { kind: "team" as const, team: team.publicKey };

    await expect(takeOnchainAddress(pool)).resolves.toEqual({
      address: null,
      unavailable: "empty"
    });

    await waitFor(async () => {
      expect(await lotAddresses(team.publicKey)).toEqual(fills(1, 20));
    });
    await expect(takeOnchainAddress(pool)).resolves.toEqual({
      address: taprootAddress(1),
      unavailable: null
    });
  });

  it("reads an empty lot again at most every EMPTY_LOT_READ_MS, and only its own team's", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    const keys = await employeeDevice(team, alice);
    const address = lotRecordAddress(keys);
    const reads = () =>
      relays.calls.filter(
        ({ operation, filter }) => operation === "query" && filter?.["#d"]?.includes(address)
      ).length;
    const start = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(start);
    try {
      await readEmptyLot(team.publicKey);
      const once = reads();
      expect(once).toBeGreaterThan(0);
      // Sales meanwhile find it empty too: not read again before EMPTY_LOT_READ_MS.
      clock.mockReturnValue(start + EMPTY_LOT_READ_MS - 1);
      await readEmptyLot(team.publicKey);
      expect(reads()).toBe(once);
      clock.mockReturnValue(start + EMPTY_LOT_READ_MS);
      await readEmptyLot(team.publicKey);
      expect(reads()).toBe(2 * once);
      // Another team's: nothing read with this member's keys.
      clock.mockReturnValue(start + 2 * EMPTY_LOT_READ_MS);
      await readEmptyLot("ab".repeat(32));
      expect(reads()).toBe(2 * once);
      // The device's clock set back an hour: read again, not held back until it catches up.
      clock.mockReturnValue(start - 3_600_000);
      await readEmptyLot(team.publicKey);
      expect(reads()).toBe(3 * once);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps an address used while the owner's lot still holds it, and puts one back once", async () => {
    const alice = member("Alice");
    const team = await ownerWith([alice]);
    const keys = await employeeDevice(team, alice);
    await applyLot(team.publicKey, lot(fills(1, 3), NOW));
    expect(await takeFromLot(team.publicKey, taprootAddress(1))).toBe(true);
    expect(await takeFromLot(team.publicKey, taprootAddress(1))).toBe(false);

    // A newer lot the owner made before it saw the address used: still used here.
    expect(await applyLot(team.publicKey, lot(fills(1, 4), NOW + 1))).toBe(true);
    expect(await lotAddresses(team.publicKey)).toEqual(fills(2, 4));
    // An older one never replaces it.
    expect(await applyLot(team.publicKey, lot(fills(9, 9), NOW))).toBe(false);

    // Nothing reached it (an invoice paid over Lightning): back, last, once.
    await releaseOnchainAddress({ kind: "team", team: team.publicKey }, taprootAddress(1));
    await returnToLot(team.publicKey, taprootAddress(1));
    expect(await lotAddresses(team.publicKey)).toEqual([...fills(2, 4), taprootAddress(1)]);
    // An address the lot no longer holds never comes back.
    await takeFromLot(team.publicKey, taprootAddress(2));
    await applyLot(team.publicKey, lot(fills(3, 4), NOW + 2));
    await returnToLot(team.publicKey, taprootAddress(2));
    expect(await lotAddresses(team.publicKey)).toEqual(fills(3, 4));
    // Another team's lot counts as none, and leaving the team forgets it.
    expect(await lotAddresses("ab".repeat(32))).toEqual([]);
    await forgetMemberLot();
    expect(await lotAddresses(team.publicKey)).toEqual([]);
    expect(keys).toBeDefined();
  });
});

/** A promise the test resolves when it chooses (`open`). */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Resolves once `condition` holds, checked every few milliseconds. */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; !condition(); tries += 1) {
    if (tries > 1000) throw new Error("The condition never held");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitFor(check: () => Promise<void>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await check();
      return;
    } catch (error) {
      if (attempt >= 50) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
