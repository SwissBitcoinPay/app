import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { encodeWalletSecret } from "@/lib/breez/secret";
import { legacyRowRef, type LegacyHistoryRow } from "@/lib/legacy-v2/history";
import {
  MAX_PART_BYTES,
  historyMonth,
  historyMonths,
  historyOf,
  historyPartAddress,
  historyPartEvent,
  historyParts,
  historyStateAddress,
  historyStateEvent,
  parseHistoryPart,
  parseHistoryState
} from "@/lib/legacy-v2/history-records";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";
import { deriveArchiveKeys, deriveLegacyHistoryKeys, deriveTeamKeys } from "@/lib/team/keys";

import { MAX_EVENT_BYTES } from "../../jest/nostr-relays";

/*
 * The history copied from the v2 account on the relays (history-records.ts): its keys and
 * addresses (IRREVERSIBLE: every migrated account's copies are there), its parts under 64 kB, a
 * month read only whole, a newer format never read nor written over.
 */

/** BIP-39 test mnemonic (all-zero entropy), never a real wallet's: the team's vector root. */
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveLegacyHistoryKeys(team);

/** 3 October 2026, 13:10:30 UTC. */
const AT = 1_791_033_030;

function row(n: number, fields: Partial<LegacyHistoryRow> = {}): LegacyHistoryRow {
  return {
    ref: legacyRowRef(`id-${n}`),
    kind: "sale",
    channel: "pos",
    at: AT + n,
    sats: BigInt(1_000 + n),
    fiat: { minor: 500 + n, digits: 2, currency: "CHF" },
    note: `Sale ${n}`,
    rate: { price: 61_234.5, currency: "CHF" },
    ...fields
  };
}

/** What relays would answer: each event as a relay sends it. */
function answers(...events: unknown[]): Map<string, unknown[]> {
  return new Map([["wss://relay.example", events]]);
}

describe("the history's keys and addresses", () => {
  it("never change: every migrated account's copies derive from them", () => {
    const derive = (info: string) =>
      hkdf(sha256, team.root, utf8ToBytes("sattle.me/team"), utf8ToBytes(info), 32);
    expect(keys.nostr.secretKey).toEqual(derive("legacy-history/author/v1"));
    expect(keys.encryptionKey).toEqual(derive("legacy-history/encryption-key/v1"));
    expect(keys.addressKey).toEqual(derive("legacy-history/address-key/v1"));
    expect(keys.nostr.publicKey).toBe(
      bytesToHex(schnorr.getPublicKey(derive("legacy-history/author/v1")))
    );
    // Computed apart, with Python's hmac and hashlib (HKDF of RFC 5869), from the root of
    // archive.test.ts (whose own vector the same computation gives).
    expect(bytesToHex(team.root)).toBe(
      "ed7a2364464bf2bc9ed3a7cf99f32af7896b55ba09f0fc1674c6c5ed64df7077"
    );
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "4c71c70afc1f3e97efcdebfa89e631cc84a2ea23b8fecd0afa720c0a930fe322"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "cdb5b41752c95b9ba604d7cb3a34e4a57f59b893b6807605e390ab06a1ec5a9f"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "eff35792dcdb896cf698fefc082a7ef764de7608368f48c9475f708705efc483"
    );
    // Its own author: a read by author never lists the owner's other copies.
    expect(keys.nostr.publicKey).not.toBe(deriveArchiveKeys(team).nostr.publicKey);
    expect(historyPartAddress(keys, "2026-10", 0)).toBe(
      bytesToHex(hmac(sha256, keys.addressKey, utf8ToBytes("history/2026-10/0")))
    );
    expect(historyStateAddress(keys)).not.toBe(historyPartAddress(keys, "2026-10", 0));
  });

  it("refs a v2 payment by a hash of its id, never the id itself", () => {
    expect(legacyRowRef("0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b")).toBe(
      bytesToHex(
        sha256(utf8ToBytes("sattle.me/legacy-v2/payment/0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b"))
      )
    );
  });
});

describe("a month's copy", () => {
  it("is cut in parts every relay takes, and read back whole", () => {
    // Notes at their longest: a month of a busy business.
    const rows = Array.from({ length: 1_500 }, (_, n) => row(n, { note: "ü".repeat(200) }));
    const parts = historyParts("2026-10", rows);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      const event = historyPartEvent(keys, part, AT);
      expect(new TextEncoder().encode(JSON.stringify(event)).length).toBeLessThan(MAX_EVENT_BYTES);
      // A note's own words ("Sale 12"), space included: NIP-44 content is base64, which holds no
      // space, while its 1.3 million characters hold any 4 letters ("Sale") by chance once in 13.
      expect(event.content).not.toContain("Sale ");
    }
    expect(MAX_PART_BYTES).toBe(40_000);
    const read = historyOf(keys, answers(...parts.map((part) => historyPartEvent(keys, part, AT))));
    const month = historyMonth(keys, "2026-10", read.parts, read.newer);
    expect(month.copied).toBe(true);
    expect(month.rows).toHaveLength(1_500);
    expect([...month.rows].sort((a, b) => a.at - b.at)[0]).toEqual(
      row(0, { note: "ü".repeat(200) })
    );
    expect(historyMonths(read.parts)).toEqual(["2026-10"]);
  });

  it("is never read half: a part missing, or of another copy, hides the whole month", () => {
    const rows = Array.from({ length: 1_500 }, (_, n) => row(n, { note: "ü".repeat(200) }));
    const parts = historyParts("2026-10", rows);
    const events = parts.map((part) => historyPartEvent(keys, part, AT));
    const lacking = historyOf(keys, answers(...events.slice(1)));
    expect(historyMonth(keys, "2026-10", lacking.parts, lacking.newer)).toMatchObject({
      copied: false,
      rows: []
    });
    // The first part of another copy (one row more): its set differs from the other parts'.
    const other = historyParts("2026-10", [...rows, row(9_999)]);
    const mixed = historyOf(
      keys,
      answers(historyPartEvent(keys, other[0]!, AT + 1), ...events.slice(1))
    );
    expect(historyMonth(keys, "2026-10", mixed.parts, mixed.newer).copied).toBe(false);
  });

  it("keeps each row once, by its ref, and writes no part for a month without rows", () => {
    const parts = historyParts("2026-10", [row(1), row(1, { note: "Again" }), row(2)]);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.rows.map(({ ref }) => ref)).toEqual(
      [legacyRowRef("id-1"), legacyRowRef("id-2")].sort()
    );
    expect(historyParts("2026-10", [])).toEqual([]);
    expect(() => historyParts("2026-13", [row(1)])).toThrow();
  });

  it("keeps a payout, a fee, a deposit and a row without a price as they are", () => {
    const rows = [
      row(1, { kind: "withdraw", channel: null, fiat: null }),
      row(2, { kind: "referral", channel: null, fiat: null, rate: null }),
      row(3, { kind: "receipt", channel: null })
    ];
    const read = historyOf(
      keys,
      answers(...historyParts("2026-10", rows).map((part) => historyPartEvent(keys, part, AT)))
    );
    const month = historyMonth(keys, "2026-10", read.parts, read.newer);
    expect([...month.rows].sort((a, b) => a.at - b.at)).toEqual(rows);
  });
});

describe("reading the copies", () => {
  it("refuses another author's events, a part at another address, a row out of shape", () => {
    const [part] = historyParts("2026-10", [row(1)]);
    const otherKeys = deriveArchiveKeys(team);
    const forged = historyPartEvent(otherKeys, part!, AT);
    expect(historyOf(keys, answers(forged)).parts.size).toBe(0);
    // Sealed right, but at the address of another month.
    const moved = sealRecord({
      type: "legacy-history-month",
      value: { version: 1, month: "2026-10", part: 0, parts: 1, set: part!.set, rows: [] },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyPartAddress(keys, "2026-09", 0),
      createdAt: AT
    });
    expect(historyOf(keys, answers(moved)).parts.size).toBe(0);
    const value = (rows: unknown[]) => ({
      version: 1,
      month: "2026-10",
      part: 0,
      parts: 1,
      set: part!.set,
      rows
    });
    const good = {
      ref: legacyRowRef("id-1"),
      kind: "sale",
      channel: "pos",
      at: AT,
      sats: 1_000,
      fiat: null,
      note: "",
      rate: null
    };
    expect(parseHistoryPart(value([good]))).not.toBeNull();
    for (const broken of [
      { ...good, sats: 1.5 },
      { ...good, sats: -1 },
      { ...good, kind: "refund" },
      { ...good, channel: null },
      { ...good, kind: "withdraw" },
      { ...good, kind: "receipt" },
      { ...good, fiat: { minor: 1.2, digits: 2, currency: "CHF" } },
      { ...good, rate: { price: 0, currency: "CHF" } },
      { ...good, rate: { price: 61_000, currency: "chf" } },
      { ...good, note: "x".repeat(201) }
    ]) {
      expect(parseHistoryPart(value([broken]))).toBeNull();
    }
  });

  it("never reads nor writes over a copy of a newer format, and reads the state", () => {
    const newer = sealRecord({
      type: "legacy-history-month",
      value: { version: 2, month: "2026-10", part: 0, parts: 1 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyPartAddress(keys, "2026-10", 0),
      createdAt: AT
    });
    expect(() => parseHistoryPart({ version: 2 })).toThrow(NewerRecordError);
    const read = historyOf(keys, answers(newer, historyStateEvent(keys, { done: AT }, AT)));
    expect(read.newer.has(historyPartAddress(keys, "2026-10", 0))).toBe(true);
    expect(historyMonth(keys, "2026-10", read.parts, read.newer)).toMatchObject({
      copied: false,
      newer: true
    });
    expect(read.state?.state).toEqual({ done: AT });
  });

  it("reads a copy started, not finished, and refuses a state out of shape", () => {
    expect(parseHistoryState({ version: 1, done: null })).toEqual({ done: null });
    expect(parseHistoryState({ version: 1, done: AT })).toEqual({ done: AT });
    for (const broken of [{ version: 1 }, { version: 1, done: -1 }, { version: 1, done: "1" }]) {
      expect(parseHistoryState(broken)).toBeNull();
    }
    expect(() => parseHistoryState({ version: 2, done: null })).toThrow(NewerRecordError);
    const read = historyOf(keys, answers(historyStateEvent(keys, { done: null }, AT)));
    expect(read.state?.state).toEqual({ done: null });
  });
});
