import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { getAccountTeamKeys } from "@/features/account/session";
import { DEVICE_SIGHTINGS } from "@/features/team/sale-sightings";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { deriveMemberKeys, memberSecret } from "@/lib/team/keys";
import { sealRecord } from "@/lib/nostr/record";
import { nostrKeys } from "@/lib/nostr/keys";
import { declareOnchainPayment, ownerOnchainPaymentsOf } from "@/lib/registry/onchain-payments";
import { saleRegistry } from "@/lib/registry/registry";
import {
  copyMemberDeclarations,
  fetchMemberRecords,
  fetchSaleTxs,
  publishMemberRecord,
  publishSaleTx,
  saleTxAddress
} from "@/lib/team/member-records";
import { saveMembership } from "@/lib/team/membership-store";
import { clearTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { publishMember } from "../../jest/roster";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * The transactions the business's devices saw paying their sales' addresses (RBF): signed by the
 * device's own keys (member-records.ts, "team-sale-tx"), never by a payer's page, read by the
 * device and by the owner (src/features/team/sale-sightings.ts).
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const ADDRESS = taprootAddress(1);
const NOW = Math.floor(Date.now() / 1000);
const txid = (n: number) => n.toString(16).padStart(64, "0");

beforeEach(async () => {
  relays.resetRelays();
  await clearTerminalProfile();
  resetTerminalProfileCache();
});

describe("a device's records of the transactions it saw", () => {
  const keys = deriveMemberKeys(new Uint8Array(32).fill(5));

  it("are at an address of the member's record key, the address and the transaction", () => {
    // Never change once released: HMAC(records.addressKey, "sale-tx:<address>:<txid>").
    expect(
      saleTxAddress(
        keys,
        "bc1px22v5j99gdwhxqyelg2p6tdcfajjd3njhzn22c2gura2dvxg2xlqw2wte4",
        "ab".repeat(32)
      )
    ).toBe(VECTOR);
  });

  it("are read back, the earliest first, those of another address or author left out", async () => {
    const other = deriveMemberKeys(new Uint8Array(32).fill(6));
    await publishSaleTx(keys, ADDRESS, txid(2), NOW + 10, DEFAULT_RELAYS);
    await publishSaleTx(keys, ADDRESS, txid(1), NOW, DEFAULT_RELAYS);
    await publishSaleTx(keys, taprootAddress(2), txid(3), NOW, DEFAULT_RELAYS);
    await publishSaleTx(other, ADDRESS, txid(4), NOW, DEFAULT_RELAYS);

    await expect(fetchSaleTxs([keys], ADDRESS, "bc", NOW - 60, DEFAULT_RELAYS)).resolves.toEqual([
      txid(1),
      txid(2)
    ]);
    await expect(
      fetchSaleTxs([keys, other], ADDRESS, "bc", NOW - 60, DEFAULT_RELAYS)
    ).resolves.toEqual([txid(1), txid(4), txid(2)]);
    // Recorded before the sale started: not read.
    await expect(fetchSaleTxs([keys], ADDRESS, "bc", NOW + 5, DEFAULT_RELAYS)).resolves.toEqual([
      txid(2)
    ]);
  });

  it('come with the member\'s sales and links ("Wallet"), each once, its latest date', async () => {
    const other = deriveMemberKeys(new Uint8Array(32).fill(6));
    await publishSaleTx(keys, ADDRESS, txid(1), NOW, DEFAULT_RELAYS);
    // Recorded again later (its sale followed after its screen): the latest version.
    await publishSaleTx(keys, ADDRESS, txid(1), NOW + 30, DEFAULT_RELAYS);
    await publishSaleTx(keys, ADDRESS, txid(2), NOW + 10, DEFAULT_RELAYS);
    await publishSaleTx(other, ADDRESS, txid(3), NOW, DEFAULT_RELAYS);
    // One whose `d` tag is not its own (copied from another address), and one of another network.
    const forged = (address: string, d: string) =>
      sealRecord({
        type: "team-sale-tx",
        value: { version: 1, address, txid: txid(4) },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.records.encryptionKey,
        address: d,
        createdAt: NOW
      });
    await publishMemberRecord(keys, forged(ADDRESS, saleTxAddress(keys, ADDRESS, txid(9))));
    await publishMemberRecord(
      keys,
      forged(taprootAddress(3, "tb"), saleTxAddress(keys, taprootAddress(3, "tb"), txid(4)))
    );
    const records = await fetchMemberRecords(keys, NOW - 60, DEFAULT_RELAYS);
    expect([...(records?.sightings ?? [])].sort((a, b) => (a.txid < b.txid ? -1 : 1))).toEqual([
      { address: ADDRESS, txid: txid(1), at: NOW + 30 },
      { address: ADDRESS, txid: txid(2), at: NOW + 10 }
    ]);
  });

  it("take their sales' declarations of on-chain payments along at a change of relays", async () => {
    const OLD = DEFAULT_RELAYS.slice(0, 3);
    const NEW = ["wss://relay.example.org", "wss://relay.example.net", DEFAULT_RELAYS[0]!];
    const registryKey = new Uint8Array(32).fill(7);
    const reader = nostrKeys(new Uint8Array(32).fill(9));
    const registry = saleRegistry(
      { key: registryKey, reader: reader.publicKey, owner: reader.publicKey },
      new Uint8Array(32).fill(1)
    );
    await publishSaleTx(keys, ADDRESS, txid(1), NOW, OLD);
    await declareOnchainPayment(
      registry,
      { txid: txid(1), address: ADDRESS },
      { fiat: { minor: 200, digits: 2, currency: "CHF" }, note: "" },
      { relays: OLD }
    );
    const copy = await copyMemberDeclarations(keys, registryKey, "bc", NOW - 60, OLD, NEW);
    expect(copy).toEqual({ found: 1, held: 1, unread: 0 });
    const read = await ownerOnchainPaymentsOf({ key: registryKey, reader }, [txid(1)], "bc", {
      relays: NEW
    });
    expect(read?.declared.get(txid(1))?.map(({ author }) => author)).toEqual([
      registry.saleKeys.nostr.publicKey
    ]);
  });

  it("cannot be told without a majority of the relays, nor recorded", async () => {
    for (const relay of DEFAULT_RELAYS.slice(1)) relays.unreachable.add(relay);
    await expect(fetchSaleTxs([keys], ADDRESS, "bc", NOW, DEFAULT_RELAYS)).resolves.toBeNull();
    await expect(publishSaleTx(keys, ADDRESS, txid(1), NOW, DEFAULT_RELAYS)).rejects.toBeDefined();
  });
});

describe("this device's book (DEVICE_SIGHTINGS)", () => {
  it("records and reads nothing on a device without keys", async () => {
    await DEVICE_SIGHTINGS.record(ADDRESS, txid(1));
    expect(relays.calls.filter(({ operation }) => operation === "publish")).toEqual([]);
    await expect(DEVICE_SIGHTINGS.read(ADDRESS, NOW - 60)).resolves.toEqual([]);
  });

  it("records an employee's with its keys, which the owner reads", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const member = {
      id: "0a".repeat(16),
      name: "Alice",
      role: "employee" as const,
      invitedAt: NOW - 3600
    };
    await publishMember(team, member);
    const secret = memberSecret(team, member.id);

    // On Alice's device.
    await saveMembership({
      version: 1,
      team: team.publicKey,
      secret: bytesToHex(secret),
      name: "Alice",
      deviceId: "0b".repeat(16),
      joinedAt: NOW - 600
    });
    await saveTerminalProfile({
      version: 3,
      team: team.publicKey,
      memberName: "Alice",
      lightningAddress: "sattleme@breez.tips",
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    resetTerminalProfileCache();
    await DEVICE_SIGHTINGS.record(ADDRESS, txid(1));
    await expect(DEVICE_SIGHTINGS.read(ADDRESS, NOW - 60)).resolves.toEqual([txid(1)]);
    // Signed by Alice's keys, at the address of her records.
    const alice = deriveMemberKeys(secret);
    const place = saleTxAddress(alice, ADDRESS, txid(1));
    const published = relays.calls.find(
      ({ operation, event }) =>
        operation === "publish" &&
        event?.tags.some(([name, value]) => name === "d" && value === place)
    );
    expect(published?.event?.pubkey).toBe(alice.nostr.publicKey);

    // On the owner's device, its account open: every device's records of the business.
    await clearTerminalProfile();
    resetTerminalProfileCache();
    await openTestAccount({ usage: "merchant", signUp: "done" });
    await expect(DEVICE_SIGHTINGS.read(ADDRESS, NOW - 60)).resolves.toEqual([txid(1)]);
  });
});

/** saleTxAddress of the first test, computed once (HMAC-SHA256, see its comment). */
const VECTOR = "0b2f02588127d2ea7ef719541b5b075292435f4b2187ce5ab18c5dd85a8c19b6";
