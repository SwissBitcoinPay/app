import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import {
  EXPORT_GRANT_VERSION,
  MAX_GRANT_PARTS,
  MAX_PART_BYTES,
  exportDecisionAddress,
  exportDecisionEvent,
  exportGrantFilter,
  exportGrantOf,
  exportKeysParts,
  exportPartAddress,
  exportPartEvent,
  grantedKeys,
  parseExportKeysPart,
  parseGrantFormat,
  parseGrantSeat,
  type ExportKeys,
  type GrantSeat
} from "@/lib/assistant/export-grant";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { sealRecord } from "@/lib/nostr/record";
import { assistantSecretKey, deriveTeamKeys, usableTeamKeys } from "@/lib/team/keys";

/*
 * The grant of the transactions' export to an assistant (src/lib/assistant/export-grant.ts): its
 * keys and addresses, which never change once released (sattleme/mcp-server reads them), its parts
 * (each under 40 kB, removed seats left out last), and what an assistant reads of it: only the keys
 * of the decision that allows it, whole.
 */

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const signer = usableTeamKeys(team).secretKey;
const ASSISTANT = "0123456789abcdef0123456789abcdef";
const key = assistantSecretKey(team, ASSISTANT);
const keys = deriveAssistantKeys(key).exportGrant;
const RELAYS = ["wss://a.example", "wss://b.example", "wss://c.example"];

const hex = (byte: string) => byte.repeat(64);
const readKeys = (byte: string) => ({
  author: hex(byte),
  encryptionKey: hex(byte),
  addressKey: hex(byte)
});

const ACCOUNT = {
  registryReader: hex("1"),
  invoices: readKeys("2"),
  paymentRates: readKeys("3"),
  walletSends: readKeys("4"),
  archive: readKeys("5"),
  legacyHistory: readKeys("6")
};

const records = { sales: hex("a"), links: hex("b"), encryptionKey: hex("c"), addressKey: hex("d") };

function employee(index: number, removedAt: number | null = null): GrantSeat {
  return {
    role: "employee",
    id: index.toString(16).padStart(32, "0"),
    name: `Employee ${index}`.padEnd(40, "x").slice(0, 40),
    since: 1_790_000_000,
    removedAt,
    records
  };
}

const SEATS: GrantSeat[] = [
  { role: "owner", id: "f".repeat(32), name: null, since: 1_790_000_000, removedAt: null, records },
  employee(1),
  {
    role: "integration",
    id: "e".repeat(32),
    name: "Shop",
    since: 1_790_000_100,
    removedAt: null,
    channelKey: hex("7"),
    seen: { author: hex("8"), addressKey: hex("9") },
    paid: { author: hex("a"), addressKey: hex("b") }
  },
  {
    role: "assistant",
    id: ASSISTANT,
    name: "Carol's assistant",
    since: 1_790_000_200,
    removedAt: null,
    records,
    invoices: readKeys("c")
  },
  employee(2, 1_790_500_000)
];

const FORMAT = { language: "fr", locale: "fr-CH", timeZone: "Europe/Zurich" };

const KEYS: ExportKeys = { account: ACCOUNT, format: FORMAT, seats: SEATS, omitted: 0 };

/** What relays send: each relay the events given. */
function answers(...events: unknown[][]): Map<string, unknown[]> {
  return new Map(events.map((list, index) => [RELAYS[index]!, list]));
}

describe("an export grant's keys and addresses", () => {
  it("never change: they derive from the assistant's key (salt, info strings, subjects)", () => {
    const derive = (info: string) =>
      hkdf(sha256, key, utf8ToBytes("sattle.me/assistant"), utf8ToBytes(info), 32);
    expect(keys).toEqual({
      encryptionKey: derive("export/encryption-key/v1"),
      addressKey: derive("export/address-key/v1")
    });
    const mac = (subject: string) =>
      bytesToHex(hmac(sha256, derive("export/address-key/v1"), utf8ToBytes(subject)));
    expect(exportDecisionAddress(keys)).toBe(mac("decision"));
    expect(exportPartAddress(keys, 0)).toBe(mac("keys/0"));
    expect(exportPartAddress(keys, 15)).toBe(mac("keys/15"));
    expect(EXPORT_GRANT_VERSION).toBe(1);
    expect(MAX_GRANT_PARTS).toBe(16);
    // None of the assistant's other keys: its invoices' and its channel's stay its own.
    const all = deriveAssistantKeys(key);
    expect(keys.encryptionKey).not.toEqual(all.invoices.encryptionKey);
    expect(keys.encryptionKey).not.toEqual(all.member.channel.encryptionKey);
  });

  it("are read by the team's author and every address a grant may have", () => {
    expect(exportGrantFilter(team.publicKey, keys)).toEqual({
      kinds: [30078],
      authors: [team.publicKey],
      "#d": [
        exportDecisionAddress(keys),
        ...Array.from({ length: 16 }, (_, part) => exportPartAddress(keys, part))
      ]
    });
  });
});

describe("an export grant's records", () => {
  it("seal the decision and the keys with the assistant's key, signed by the team", () => {
    const decision = exportDecisionEvent(signer, keys, { allowed: true, updatedAt: 1_791_000_000 });
    expect(decision.pubkey).toBe(team.publicKey);
    expect(decision.created_at).toBe(1_791_000_000);
    expect(decision.tags).toEqual([["d", exportDecisionAddress(keys)]]);
    expect(JSON.parse(nip44Decrypt(decision.content, keys.encryptionKey))).toEqual({
      t: "assistant-export",
      v: { version: 1, allowed: true, updatedAt: 1_791_000_000 }
    });
    const [part] = exportKeysParts(KEYS, 1_791_000_000);
    const event = exportPartEvent(signer, keys, part!, 1_791_000_005);
    expect(event.tags).toEqual([["d", exportPartAddress(keys, 0)]]);
    expect(JSON.parse(nip44Decrypt(event.content, keys.encryptionKey))).toEqual({
      t: "assistant-export-keys",
      v: {
        version: 1,
        grantedAt: 1_791_000_000,
        part: 0,
        parts: 1,
        account: ACCOUNT,
        format: FORMAT,
        omitted: 0,
        seats: SEATS
      }
    });
  });

  it("give the keys only with a decision that allows them, every part of its date", () => {
    const at = 1_791_000_000;
    const allowed = exportDecisionEvent(signer, keys, { allowed: true, updatedAt: at });
    const parts = exportKeysParts(KEYS, at).map((part) => exportPartEvent(signer, keys, part, at));
    const read = exportGrantOf(answers([allowed, ...parts]), team.publicKey, keys);
    expect(grantedKeys(read)).toEqual(KEYS);

    // Withdrawn later: nothing, whatever the keys still say.
    const withdrawn = exportDecisionEvent(signer, keys, { allowed: false, updatedAt: at + 10 });
    expect(
      grantedKeys(exportGrantOf(answers([allowed, withdrawn, ...parts]), team.publicKey, keys))
    ).toBeNull();
    // Allowed again later: keys written for the earlier decision are not this one's.
    const again = exportDecisionEvent(signer, keys, { allowed: true, updatedAt: at + 20 });
    expect(grantedKeys(exportGrantOf(answers([again, ...parts]), team.publicKey, keys))).toBeNull();
    // No decision, no keys.
    expect(grantedKeys(exportGrantOf(answers(parts), team.publicKey, keys))).toBeNull();
    // Cleared keys.
    const cleared = exportPartEvent(signer, keys, { grantedAt: null, part: 0 }, at + 1);
    expect(
      grantedKeys(exportGrantOf(answers([allowed, ...parts, cleared]), team.publicKey, keys))
    ).toBeNull();
  });

  it("never come from another author, nor from a record sealed for another assistant", () => {
    const at = 1_791_000_000;
    const stranger = deriveTeamKeys(new Uint8Array(32).fill(7));
    const other = deriveAssistantKeys(assistantSecretKey(team, "f".repeat(32))).exportGrant;
    const forged = [
      exportDecisionEvent(usableTeamKeys(stranger).secretKey, keys, {
        allowed: true,
        updatedAt: at
      }),
      ...exportKeysParts(KEYS, at).map((part) =>
        exportPartEvent(usableTeamKeys(stranger).secretKey, keys, part, at)
      )
    ];
    expect(grantedKeys(exportGrantOf(answers(forged), team.publicKey, keys))).toBeNull();
    const elsewhere = [
      exportDecisionEvent(signer, other, { allowed: true, updatedAt: at }),
      ...exportKeysParts(KEYS, at).map((part) => exportPartEvent(signer, other, part, at))
    ];
    expect(grantedKeys(exportGrantOf(answers(elsewhere), team.publicKey, keys))).toBeNull();
  });

  it("is not read past a decision of a newer format", () => {
    const at = 1_791_000_000;
    const allowed = exportDecisionEvent(signer, keys, { allowed: true, updatedAt: at });
    const parts = exportKeysParts(KEYS, at).map((part) => exportPartEvent(signer, keys, part, at));
    // A newer app's decision, sealed as this one's but of version 2.
    const newer = sealedDecision({ version: 2, allowed: true, updatedAt: at + 5 }, at + 5);
    const read = exportGrantOf(answers([allowed, newer, ...parts]), team.publicKey, keys);
    expect(read.decision.newestUnreadable).toBe(at + 5);
    expect(grantedKeys(read)).toBeNull();
  });
});

/** A decision record holding `value` as it is (a newer app's). */
function sealedDecision(value: unknown, createdAt: number) {
  // exportDecisionEvent writes this version's value only: sealed by hand.
  return sealRecord({
    type: "assistant-export",
    value,
    signer,
    encryptionKey: keys.encryptionKey,
    address: exportDecisionAddress(keys),
    createdAt
  });
}

describe("an export grant's parts", () => {
  const many = (count: number, removedFrom = Number.POSITIVE_INFINITY): GrantSeat[] =>
    Array.from({ length: count }, (_, index) =>
      employee(index + 1, index >= removedFrom ? 1_790_900_000 - index : null)
    );

  it("stay under MAX_PART_BYTES each, the account in the first, the seats in their order", () => {
    const seats = many(400);
    const parts = exportKeysParts(
      { account: ACCOUNT, format: null, seats, omitted: 0 },
      1_791_000_000
    );
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      const value = parseExportKeysPart(JSON.parse(JSON.stringify(partJson(part))), part.part);
      expect(value).toEqual(part);
      expect(new TextEncoder().encode(JSON.stringify(partJson(part))).length).toBeLessThanOrEqual(
        MAX_PART_BYTES
      );
    }
    expect(parts.flatMap((part) => (part.grantedAt === null ? [] : part.seats))).toEqual(seats);
    expect(parts.every((part) => part.grantedAt !== null && part.parts === parts.length)).toBe(
      true
    );
  });

  it("leave out the oldest removed seats beyond MAX_GRANT_PARTS, counted, never one in the team", () => {
    const seats = many(2_000, 200);
    const parts = exportKeysParts(
      { account: ACCOUNT, format: null, seats, omitted: 0 },
      1_791_000_000
    );
    expect(parts).toHaveLength(MAX_GRANT_PARTS);
    const kept = parts.flatMap((part) => (part.grantedAt === null ? [] : part.seats));
    expect(kept).toEqual(seats.slice(0, kept.length));
    const first = parts[0]!;
    expect(first.grantedAt !== null && first.omitted).toBe(seats.length - kept.length);
    expect(() =>
      exportKeysParts(
        { account: ACCOUNT, format: null, seats: many(2_000), omitted: 0 },
        1_791_000_000
      )
    ).toThrow();
  });
});

/** A part's value as exportPartEvent writes it. */
function partJson(part: ReturnType<typeof exportKeysParts>[number]) {
  const event = exportPartEvent(signer, keys, part, 1_791_000_000);
  return (JSON.parse(nip44Decrypt(event.content, keys.encryptionKey)) as { v: unknown }).v;
}

describe("a seat of a grant", () => {
  it("is read whole, or not at all", () => {
    for (const seat of SEATS)
      expect(parseGrantSeat(JSON.parse(JSON.stringify(seat)))).toEqual(seat);
    const [owner, member, integration] = SEATS as [GrantSeat, GrantSeat, GrantSeat];
    // An owner's device has no name and is never removed.
    expect(parseGrantSeat({ ...owner, name: "Me" })).toBeNull();
    expect(parseGrantSeat({ ...owner, removedAt: 1 })).toBeNull();
    // Keys in upper case, short, or missing.
    expect(parseGrantSeat({ ...member, records: { ...records, sales: hex("A") } })).toBeNull();
    expect(parseGrantSeat({ ...member, records: { ...records, addressKey: "ab" } })).toBeNull();
    expect(parseGrantSeat({ ...integration, paid: undefined })).toBeNull();
    // Another role, an id that is not one, a name too long.
    expect(parseGrantSeat({ ...member, role: "device" })).toBeNull();
    expect(parseGrantSeat({ ...member, id: "not an id" })).toBeNull();
    expect(parseGrantSeat({ ...member, name: "x".repeat(41) })).toBeNull();
  });

  it("makes a part invalid when one of its seats is", () => {
    const part = { ...(partJson(exportKeysParts(KEYS, 1)[0]!) as object) };
    expect(parseExportKeysPart(part, 0)).not.toBeNull();
    expect(parseExportKeysPart({ ...part, seats: [...SEATS, { role: "owner" }] }, 0)).toBeNull();
    // The part it says it is, the parts it says there are.
    expect(parseExportKeysPart(part, 1)).toBeNull();
    expect(parseExportKeysPart({ ...part, parts: 17 }, 0)).toBeNull();
    // The account in part 0 only.
    expect(parseExportKeysPart({ ...part, account: undefined }, 0)).toBeNull();
    // Format 2 (an export epoch) names the epoch in its account: without, invalid.
    expect(parseExportKeysPart({ ...part, version: 2 }, 0)).toBeNull();
    expect(() => parseExportKeysPart({ ...part, version: 3 }, 0)).toThrow();
  });
});

describe("the format a grant names", () => {
  it("is read leniently: anything but a whole format is none, the keys kept", () => {
    const part = partJson(exportKeysParts(KEYS, 1)[0]!) as Record<string, unknown>;
    expect(parseExportKeysPart(part, 0)).toMatchObject({ format: FORMAT });
    for (const format of [
      undefined,
      null,
      "fr-CH",
      { ...FORMAT, language: "FR" },
      { ...FORMAT, locale: "fr CH" },
      { ...FORMAT, timeZone: 3 },
      { ...FORMAT, timeZone: "Europe/Zurich;" }
    ]) {
      expect(parseExportKeysPart({ ...part, format }, 0)).toMatchObject({
        format: null,
        account: ACCOUNT
      });
    }
    expect(parseGrantFormat({ ...FORMAT, timeZone: null })).toEqual({ ...FORMAT, timeZone: null });
    // In part 0 only.
    const second = partJson(exportKeysParts({ ...KEYS, seats: many400() }, 1)[1]!) as Record<
      string,
      unknown
    >;
    expect(parseExportKeysPart(second, 1)).not.toBeNull();
    expect(parseExportKeysPart({ ...second, format: FORMAT }, 1)).toBeNull();
  });
});

function many400(): GrantSeat[] {
  return Array.from({ length: 400 }, (_, index) => employee(index + 1));
}
