import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { encodeWalletSecret } from "@/lib/breez/secret";
import type { CardMovement } from "@/lib/card/card-movement";
import {
  MAX_PART_BYTES,
  PARTS_PER_READ,
  deriveMonthPartKeys,
  monthCopy,
  monthCopyOf,
  monthPartAddress,
  monthPartAddresses,
  monthPartEvent,
  monthPartValue,
  monthPartsFilters,
  parseMonthPart
} from "@/lib/card/history-months";
import {
  deriveHistoryRecordKeys,
  historyFilter,
  historyOf,
  historyValue,
  monthHeadAddress,
  monthHeadEvent,
  type HistoryCopy,
  type MovementCopy
} from "@/lib/card/history-records";
import { deriveCardRoot } from "@/lib/card/keys";
import {
  MAX_MONTH_PARTS,
  monthEnd,
  monthHeadValue,
  monthOf,
  monthSet,
  parseMonthHead,
  type MonthEntry
} from "@/lib/card/month-head";
import type { CardPaymentEntry } from "@/lib/card/payment-entry";
import { NewerRecordError, RECORD_KIND, sealRecord } from "@/lib/nostr/record";

/*
 * The copies of a card's history, month by month (the whole history kept): a head read with the
 * history, parts of an author of their own, read by address.
 */

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const historyKeys = deriveHistoryRecordKeys(root);
const keys = deriveMonthPartKeys(root);
const CARD = "0123456789abcdef0123456789abcdef";
/** The card's wallet whose months the tests copy (its first), and its next one. */
const WALLET = { cardId: CARD, walletGeneration: 1 };
const NEXT_WALLET = { cardId: CARD, walletGeneration: 2 };
const MONTH = "2026-08";
const AUGUST = Date.UTC(2026, 7, 1);

/** The bytes of `value`'s JSON (UTF-8), as a relay counts an event. */
function jsonBytes(value: unknown): number {
  return utf8ToBytes(JSON.stringify(value)).length;
}

function tap(id: string, at: number, fields: Partial<CardPaymentEntry> = {}): HistoryCopy {
  return {
    entry: {
      id,
      ...WALLET,
      at,
      amountSats: 3_400n,
      paymentHash: id.padStart(64, "0"),
      description: "Lakeside Coffee",
      outcome: "sent",
      reason: null,
      pr: `lnbc34u1${"q".repeat(400)}`,
      payee: {
        status: "approved",
        name: "Lakeside Coffee",
        metadata: `[["text/plain","Lakeside Coffee"],["text/identifier","sattleme01@breez.tips"]]`,
        verify: `https://breez.tips/lnurlp/verify/${"a".repeat(64)}`,
        verifyAnswer: `{"status":"OK","settled":true,"preimage":"${"b".repeat(64)}","pr":"lnbc"}`
      },
      preimage: "c".repeat(64),
      value: { minor: 289, digits: 2, currency: "CHF", hour: Math.floor(at / 3_600_000) * 3600 },
      ...fields
    },
    revision: 1
  };
}

function movement(id: string, at: number): MovementCopy {
  const moved: CardMovement = {
    id,
    ...WALLET,
    kind: "recharge",
    way: "main",
    at,
    amountSats: 20_000n,
    feeSats: 0n,
    txid: null,
    description: null,
    value: null
  };
  return { movement: moved, revision: 0 };
}

describe("a month of a card's history", () => {
  it("is the UTC month of a time, over at the first instant of the next", () => {
    expect(monthOf(Date.UTC(2026, 7, 31, 23, 59, 59, 999))).toBe("2026-08");
    expect(monthOf(Date.UTC(2026, 8, 1))).toBe("2026-09");
    expect(monthEnd("2026-08")).toBe(Date.UTC(2026, 8, 1));
    expect(monthEnd("2026-12")).toBe(Date.UTC(2027, 0, 1));
  });

  it("names its entries by a hash every device works out the same, whatever their order", () => {
    const entries: MonthEntry[] = [
      ["t", "a1", 1],
      ["m", `${CARD}/m1`, 0]
    ];
    expect(monthSet(entries)).toBe(monthSet([...entries].reverse()));
    expect(monthSet(entries)).not.toBe(monthSet([["t", "a1", 2], entries[1]]));
    expect(monthSet(entries)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the copy's keys and addresses", () => {
  // Computed once, then checked against Node's own HKDF (crypto.hkdfSync) from the card root.
  it("keep their derivations", () => {
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "71dfa26071e074ef2c89235973ca2b07a18d01005028f7486c5ff02593a770d6"
    );
    expect(keys.nostr.publicKey).toBe(
      "543c41fe0b67e53824f8b5288038ef48c6e84baa47afbbdd5bfd04653b33fd70"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "132eeadd7e2dfb6a3f754e2dbbb42f1c44adacb19a1225cebe4423978e64936b"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "2dc3186ddc3ceff60cc55e68510af2bd5fd025a967e0da9814d16b8351862e5e"
    );
    expect(monthHeadAddress(historyKeys, { ...WALLET, month: MONTH })).toBe(
      "7ab31635f0a2ea4f39877e1482b0dde037b2f380add4fab2a807e9fc423ad6f1"
    );
    expect(monthPartAddress(keys, { ...WALLET, month: MONTH, set: "ab".repeat(32), part: 0 })).toBe(
      "56de3d8e2484e16f53171d785ce985e4bc106987fac072ea1c87a5841017101c"
    );
    // The card added again: its months' copies are its own, at addresses of their own.
    expect(monthHeadAddress(historyKeys, { ...NEXT_WALLET, month: MONTH })).toBe(
      "ca6ef358cc6513a6909aa2bad40fb627438ca976ea6c7609dc2ecfb6e05c3c57"
    );
  });

  it("put the parts under an author no read of the history fetches", () => {
    expect(keys.nostr.publicKey).not.toBe(historyKeys.nostr.publicKey);
    expect(historyFilter(historyKeys).authors).toEqual([historyKeys.nostr.publicKey]);
  });
});

describe("a month's copy", () => {
  it("holds a small month in one part, its head naming its entries by their hash", () => {
    const taps = [tap("a1", AUGUST + 3_600_000), tap("a2", AUGUST + 60_000)];
    const movements = [movement("m1", AUGUST + 120_000)];
    const { head, parts } = monthCopy(WALLET, MONTH, taps, movements);
    expect(head).toMatchObject({ cardId: CARD, walletGeneration: 1, month: MONTH, parts: 1 });
    expect(head.set).toBe(
      monthSet([
        ["m", `${CARD}/m1`, 0],
        ["t", "a1", 1],
        ["t", "a2", 1]
      ])
    );
    // In time order.
    expect(parts[0].taps.map(({ entry }) => entry.id)).toEqual(["a2", "a1"]);
    expect(parseMonthHead(monthHeadValue(head))).toEqual(head);
    expect(parseMonthPart(monthPartValue(parts[0]))).toEqual(parts[0]);
  });

  it("cuts a busy month in parts, each under the bound, the same on every device", () => {
    const taps = Array.from({ length: 120 }, (_, n) => tap(n.toString(16), AUGUST + n * 60_000));
    const { head, parts } = monthCopy(WALLET, MONTH, taps, []);
    expect(head.parts).toBeGreaterThan(2);
    expect(parts).toHaveLength(head.parts);
    for (const part of parts) {
      expect(jsonBytes(monthPartValue(part))).toBeLessThanOrEqual(MAX_PART_BYTES);
      // Sealed: under what strfry takes by default.
      expect(jsonBytes(monthPartEvent(keys, part, 1_790_000_000))).toBeLessThan(64_000);
    }
    expect(parts.flatMap((part) => part.taps)).toEqual(taps);
    expect(monthCopy(WALLET, MONTH, [...taps].reverse(), [])).toEqual({ head, parts });
  });

  it("keeps every sealed part within what a relay takes, whatever the script of its names", () => {
    // Two bytes a character in Cyrillic, three in Japanese (a part counted in characters would go
    // past the 65,536 bytes strfry takes, and its month would never be copied).
    const name = "Кофейня Пушкин на Арбате";
    const taps = Array.from({ length: 90 }, (_, n) =>
      tap(n.toString(16), AUGUST + n * 60_000, {
        description: `${name} · 朝のコーヒーとケーキ`,
        payee: {
          status: "approved",
          name,
          metadata: JSON.stringify([
            ["text/plain", `${name}, кофе и выпечка с утра до вечера`],
            ["text/identifier", "sattleme01@breez.tips"]
          ]),
          verify: `https://breez.tips/lnurlp/verify/${"a".repeat(64)}`,
          verifyAnswer: `{"status":"OK","settled":true,"preimage":"${"b".repeat(64)}","pr":"lnbc"}`
        }
      })
    );
    const { head, parts } = monthCopy(WALLET, MONTH, taps, []);
    expect(head.parts).toBeGreaterThan(1);
    for (const part of parts) {
      expect(jsonBytes(monthPartValue(part))).toBeLessThanOrEqual(MAX_PART_BYTES);
      expect(jsonBytes(monthPartEvent(keys, part, 1_790_000_000))).toBeLessThan(65_536);
    }
    expect(parts.flatMap((part) => part.taps)).toEqual(taps);
  });

  it("keeps a month's head small, however many entries the month holds", () => {
    // A head listing every entry would go over the 65,536 bytes a relay takes past some 950 taps:
    // it names them by their hash only, the parts holding them.
    const taps = Array.from({ length: 5_000 }, (_, n) => tap(n.toString(16), AUGUST + n * 500));
    const { head, parts } = monthCopy(WALLET, MONTH, taps, []);
    expect(Object.keys(monthHeadValue(head)).sort()).toEqual(
      ["cardId", "month", "parts", "set", "version", "walletGeneration"].sort()
    );
    expect(jsonBytes(monthHeadEvent(historyKeys, head, 1_790_000_000))).toBeLessThan(2_000);
    expect(parts.length).toBeGreaterThan(10);
  });

  it("refuses a head or part out of shape, and tells a newer one", () => {
    const { head, parts } = monthCopy(WALLET, MONTH, [tap("a1", AUGUST)], []);
    const value = monthHeadValue(head);
    for (const fields of [
      { set: "x" },
      { parts: 0 },
      { parts: MAX_MONTH_PARTS + 1 },
      { month: "2026-13" },
      { cardId: "card" },
      { walletGeneration: 0 },
      { walletGeneration: undefined }
    ]) {
      expect(parseMonthHead({ ...value, ...fields })).toBeNull();
    }
    expect(parseMonthHead({ ...value, version: 2 })).toBe("newer");
    const part = monthPartValue(parts[0]);
    for (const fields of [
      { part: 1 },
      { parts: 0 },
      { set: "x" },
      { walletGeneration: 0 },
      { taps: [{ ...historyValue(tap("a2", AUGUST)), cardId: "f".repeat(32) }] },
      // A tap of the card's next wallet: not this copy's.
      { taps: [{ ...historyValue(tap("a2", AUGUST)), walletGeneration: 2 }] }
    ]) {
      expect(parseMonthPart({ ...part, ...fields })).toBeNull();
    }
    expect(parseMonthPart({ ...part, version: 2 })).toBe("newer");
    expect(() =>
      parseMonthPart({ ...part, taps: [{ ...historyValue(tap("a2", AUGUST)), version: 3 }] })
    ).toThrow(NewerRecordError);
  });
});

describe("a month's copy read back", () => {
  const taps = Array.from({ length: 60 }, (_, n) => tap(n.toString(16), AUGUST + n * 60_000));
  const { head, parts } = monthCopy(WALLET, MONTH, taps, [movement("m1", AUGUST)]);
  const events = parts.map((part) => monthPartEvent(keys, part, 1_790_000_000));

  it("is whole with every part its head names", () => {
    expect(head.parts).toBeGreaterThan(1);
    expect(monthPartsFilters(keys, [head])).toEqual([
      {
        kinds: [RECORD_KIND],
        authors: [keys.nostr.publicKey],
        "#d": parts.map((part) =>
          monthPartAddress(keys, { ...WALLET, month: MONTH, set: head.set, part: part.part })
        )
      }
    ]);
    const read = monthCopyOf(
      keys,
      head,
      new Map([
        ["wss://a", events.slice(1)],
        ["wss://b", events]
      ])
    );
    expect(read).toMatchObject({ complete: true, oldestAt: 1_790_000_000, newer: false });
    expect(read.taps).toHaveLength(60);
    expect(read.movements).toHaveLength(1);
  });

  it("is read by address, PARTS_PER_READ addresses a read, whatever the heads", () => {
    // Its parts share one second: a read by date could not page past what a relay sends of it.
    const big = { ...head, parts: 70 };
    const other = { ...head, month: "2026-07", parts: 40 };
    const filters = monthPartsFilters(keys, [big, other]);
    expect(filters.map((filter) => filter["#d"]!.length)).toEqual([PARTS_PER_READ, 50, 10]);
    expect(filters.flatMap((filter) => filter["#d"])).toEqual([
      ...monthPartAddresses(keys, big),
      ...monthPartAddresses(keys, other)
    ]);
    expect(monthPartsFilters(keys, [])).toEqual([]);
  });

  it("is not whole with a part missing, nor with a part of another copy, card, wallet or month", () => {
    expect(monthCopyOf(keys, head, new Map([["wss://a", events.slice(1)]])).complete).toBe(false);
    const other = monthCopy(WALLET, MONTH, taps.slice(1), []);
    const foreign = monthPartEvent(keys, other.parts[0], 1_790_000_000);
    const misplaced = sealRecord({
      type: "card-history-month-part",
      value: monthPartValue(parts[0]),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: monthPartAddress(keys, { ...WALLET, month: "2026-07", set: head.set, part: 0 }),
      createdAt: 1_790_000_000
    });
    // The same entries copied for the card's next wallet (the card added again): not this copy.
    const nextTaps = taps.map((copy) => ({ ...copy, entry: { ...copy.entry, ...NEXT_WALLET } }));
    const next = monthCopy(NEXT_WALLET, MONTH, nextTaps, [movement("m1", AUGUST)]);
    const ofNext = monthPartEvent(keys, next.parts[0], 1_790_000_000);
    expect(next.head.set).toBe(head.set);
    const read = monthCopyOf(
      keys,
      head,
      new Map([["wss://a", [foreign, misplaced, ofNext, ...events.slice(1)]]])
    );
    expect(read.complete).toBe(false);
    expect(read.taps.map(({ entry }) => entry.id)).not.toContain(taps[0].entry.id);
  });

  it("names its head among the history's records, the newest signed", () => {
    const older = monthHeadEvent(historyKeys, head, 1_790_000_000);
    const newer = monthHeadEvent(historyKeys, head, 1_790_000_500);
    const read = historyOf(
      historyKeys,
      new Map([
        ["wss://a", [older]],
        ["wss://b", [newer]]
      ])
    );
    expect(read.heads).toEqual(
      new Map([[`${CARD}/1/${MONTH}`, { head, createdAt: 1_790_000_500 }]])
    );
    expect(read.copies.size).toBe(0);
  });
});
