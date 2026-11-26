import { bytesToHex } from "@noble/hashes/utils.js";

import { base64ToBytes } from "@/lib/base64";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { cardStatesFilter, deriveCardRecordKeys } from "@/lib/card/card-record";
import type { CardMovement, CardWithdrawalNote } from "@/lib/card/card-movement";
import {
  HISTORY_FORMAT_VERSION,
  deriveHistoryRecordKeys,
  historyAddress,
  historyEvent,
  historyFilter,
  historyOf,
  historyValue,
  movementAddress,
  movementEvent,
  movementValue,
  parseHistoryValue,
  parseMovementCopy,
  parseWithdrawalValue,
  withdrawalAddress,
  withdrawalEvent,
  withdrawalValue,
  type HistoryCopy,
  type MovementCopy
} from "@/lib/card/history-records";
import { deriveCardRoot } from "@/lib/card/keys";
import { derivePayeeRecordKeys, payeesFilter } from "@/lib/card/payee-records";
import { CARD_PAYMENTS_KEPT_MS, type CardPaymentEntry } from "@/lib/card/payment-entry";
import type { NostrEvent } from "@/lib/nostr/event";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";

/*
 * The card payments on the account's relays: one sealed record per tap,
 * each write of the phone's log dated after the one before, dropped with the log's entry.
 */

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherRoot = deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));
const keys = deriveHistoryRecordKeys(root);
const AT = Date.UTC(2026, 9, 15, 9, 0, 0, 500);

const ENTRY: CardPaymentEntry = {
  id: "1a2b3c",
  cardId: "0123456789abcdef0123456789abcdef",
  walletGeneration: 1,
  at: AT,
  amountSats: 12_500n,
  paymentHash: "ab".repeat(32),
  description: "Croissants",
  outcome: "sent",
  reason: null,
  pr: "lnbc125u1fake",
  payee: {
    status: "approved",
    name: "Lakeside Bakery",
    metadata: '[["text/plain","Lakeside Bakery"],["text/identifier","sattleme01@breez.tips"]]',
    verify: `https://breez.tips/lnurlp/verify/${"a".repeat(64)}`,
    verifyAnswer: '{"status":"OK","settled":true,"preimage":null,"pr":"lnbc125u1fake"}'
  },
  preimage: "cd".repeat(32),
  value: null
};
const COPY: HistoryCopy = { entry: ENTRY, revision: 2 };

const MOVEMENT: CardMovement = {
  id: "4f7a9c62-1d3e-4b8a-9c71-2f5e6d8a0b13",
  cardId: "0123456789abcdef0123456789abcdef",
  walletGeneration: 1,
  kind: "recharge",
  way: "onchain",
  at: AT,
  amountSats: 29_901n,
  feeSats: 99n,
  txid: "7f3a9c".padEnd(64, "1"),
  description: null,
  value: { minor: 2540, digits: 2, currency: "CHF", hour: 1_792_054_800 }
};
const MOVEMENT_COPY: MovementCopy = { movement: MOVEMENT, revision: 1 };

const NOTE: CardWithdrawalNote = {
  cardId: MOVEMENT.cardId,
  walletGeneration: 1,
  id: MOVEMENT.id,
  way: "spark"
};

/**
 * What a relay reads of `event` in clear: every field but its content, its id and its signature.
 * Those are random (base64, a hash, a signature): a short word turns up in them by chance (the
 * movement's "CHF": 24 events of 5000, as settings-backup.test.ts found of the
 * backup's), which says nothing of what the event shows. The content is checked to be a NIP-44 v2
 * payload instead, whose alphabet holds no JSON; the test's read then proves it opens with the
 * record's key only.
 */
function inClear(event: NostrEvent): string {
  expect(event.content).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  expect(base64ToBytes(event.content)?.[0]).toBe(2);
  return JSON.stringify({ ...event, content: "", id: "", sig: "" });
}

describe("the history's record keys", () => {
  // Computed once, then checked against Node's own HKDF (crypto.hkdfSync) from the card root.
  it("keep the released derivations", () => {
    expect(bytesToHex(root)).toBe(
      "ba08cfc99b326a2467148c18acd3aa8d0cd46b30a01c97dabcd4f7cd026d22ec"
    );
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "bcef27f538c329ec3e95fe80c871baa77c5e2e4d007182a4867052f56cdd3a7e"
    );
    expect(keys.nostr.publicKey).toBe(
      "34d46c5ef55ac48fc03f19cd07bb817a17911483c3810fc2924abf8c6ad0ed25"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "8a6071fd568dd3672329e50532dd36ddff665531392c91f6df3192767b561478"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "dc95deeede073c2d1be22610f9cd2a3bd0bb478db0885a044aae322e13496624"
    );
    expect(historyAddress(keys, "1a2b3c")).toBe(
      "d775d8465440d37f98bd4b7f9a1f67b888fbe0c25a49df51c1e3e484e459d3ab"
    );
    // A card's movement, by card and wallet payment.
    expect(movementAddress(keys, MOVEMENT)).toBe(
      "1b9d8de5ca74732f47d905dce011e8f458574e207688ef42f7eb68f1d5fb445b"
    );
    // A withdrawal's note, by card and wallet payment: another address.
    expect(withdrawalAddress(keys, NOTE)).toBe(
      "e8be3c3b2f3d91fe6707c1886230a65e301533d4d78338653919c6204228e46c"
    );
  });

  it("are another wallet's for another wallet, and neither the cards' nor the payees' author", () => {
    const other = deriveHistoryRecordKeys(otherRoot);
    expect(other.nostr.publicKey).not.toBe(keys.nostr.publicKey);
    expect(historyAddress(other, ENTRY.id)).not.toBe(historyAddress(keys, ENTRY.id));
    const authors = historyFilter(keys).authors;
    expect(authors).not.toEqual(cardStatesFilter(deriveCardRecordKeys(root)).authors);
    expect(authors).not.toEqual(payeesFilter(derivePayeeRecordKeys(root)).authors);
  });
});

describe("a tap's record", () => {
  it("holds the entry whole, dated by its revision, dropped with the log's entry", () => {
    const event = historyEvent(keys, COPY);
    expect(event.kind).toBe(RECORD_KIND);
    expect(event.created_at).toBe(Math.floor(AT / 1000) + 2);
    expect(event.tags).toEqual([
      ["d", historyAddress(keys, ENTRY.id)],
      ["expiration", String(Math.floor((AT + CARD_PAYMENTS_KEPT_MS) / 1000))]
    ]);
    // Nothing of the payment in clear: card, amount, merchant, invoice.
    const text = inClear(event);
    for (const secret of [ENTRY.cardId, "12500", "Bakery", "breez.tips", "lnbc", ENTRY.id]) {
      expect(text).not.toContain(secret);
    }
    expect(historyOf(keys, new Map([["wss://a", [event]]]))).toEqual({
      copies: new Map([[ENTRY.id, COPY]]),
      movements: new Map(),
      heads: new Map(),
      withdrawals: new Map(),
      newerAt: new Set(),
      newer: false,
      answered: 1
    });
  });

  it("goes through its value and back, checked whole", () => {
    expect(parseHistoryValue(historyValue(COPY))).toEqual(COPY);
    expect(historyValue(COPY)).toMatchObject({
      version: HISTORY_FORMAT_VERSION,
      amountSats: 12_500
    });
    const refused: Record<string, unknown>[] = [
      { revision: -1 },
      { revision: 1.5 },
      { version: 0 },
      { amountSats: 0 },
      { cardId: "card" },
      { walletGeneration: undefined },
      { walletGeneration: 0 },
      { pr: null },
      { pr: undefined },
      { preimage: "X".repeat(64) },
      { payee: { status: "trusted" } }
    ];
    for (const fields of refused) {
      expect(parseHistoryValue({ ...historyValue(COPY), ...fields })).toBeNull();
    }
    expect(parseHistoryValue({ ...historyValue(COPY), version: 3 })).toBe("newer");
    expect(parseHistoryValue(null)).toBeNull();
  });

  it("keeps the payment's value (format 2), and refuses a copy of format 1", () => {
    const value = { minor: 1062, digits: 2, currency: "CHF", hour: 1_792_054_800 };
    const valued: HistoryCopy = { entry: { ...ENTRY, value }, revision: 3 };
    expect(historyValue(valued)).toMatchObject({ version: 2, value });
    expect(parseHistoryValue(historyValue(valued))).toEqual(valued);
    // Out of shape: not a record.
    for (const wrong of [
      { ...value, minor: -1 },
      { ...value, currency: "chf" },
      { ...value, hour: value.hour + 1 },
      { ...value, digits: 5 },
      "10.62 CHF"
    ]) {
      expect(parseHistoryValue({ ...historyValue(valued), value: wrong })).toBeNull();
    }
    // Format 1 (no value, nor the card's wallet) is no longer read, whatever it holds.
    const { value: _value, walletGeneration: _generation, ...v1 } = historyValue(COPY);
    expect(parseHistoryValue({ ...v1, version: 1 })).toBeNull();
    expect(parseHistoryValue({ ...historyValue(COPY), version: 1 })).toBeNull();
    // Of the card's next wallet: said so (format 2).
    const next: HistoryCopy = { entry: { ...ENTRY, walletGeneration: 2 }, revision: 1 };
    expect(parseHistoryValue(historyValue(next))).toEqual(next);
  });

  it("keeps the latest write of each tap, whatever the order relays send", () => {
    const sending: HistoryCopy = {
      entry: { ...ENTRY, outcome: "sending", preimage: null },
      revision: 0
    };
    const other: HistoryCopy = { entry: { ...ENTRY, id: "ff" }, revision: 0 };
    const read = historyOf(
      keys,
      new Map([
        ["wss://a", [historyEvent(keys, COPY), historyEvent(keys, other)]],
        ["wss://b", [historyEvent(keys, sending)]]
      ])
    );
    expect(read.copies).toEqual(
      new Map([
        [ENTRY.id, COPY],
        ["ff", other]
      ])
    );
    expect(read.answered).toBe(2);
  });

  it("drops what is not one: another wallet's, another address, a date not its revision's", () => {
    const misplaced = sealRecord({
      type: "card-payment",
      value: historyValue(COPY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyAddress(keys, "ff"),
      createdAt: Math.floor(AT / 1000) + 2
    });
    const misdated = sealRecord({
      type: "card-payment",
      value: historyValue(COPY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyAddress(keys, ENTRY.id),
      createdAt: Math.floor(AT / 1000) + 3
    });
    const tampered = { ...historyEvent(keys, COPY), created_at: Math.floor(AT / 1000) + 9 };
    const read = historyOf(
      keys,
      new Map([
        [
          "wss://a",
          [historyEvent(deriveHistoryRecordKeys(otherRoot), COPY), misplaced, misdated, tampered, 7]
        ]
      ])
    );
    expect(read.copies.size).toBe(0);
    expect(read.newer).toBe(false);
  });

  it("says when one is of a newer format", () => {
    const newer = sealRecord({
      type: "card-payment",
      value: { ...historyValue(COPY), version: 3 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: historyAddress(keys, ENTRY.id),
      createdAt: Math.floor(AT / 1000) + 2
    });
    const read = historyOf(keys, new Map([["wss://a", [newer]]]));
    expect(read.newer).toBe(true);
    expect(read.copies.size).toBe(0);
  });
});

describe("a card movement's record", () => {
  const KEY = `${MOVEMENT.cardId}/${MOVEMENT.id}`;

  it("holds the movement whole, dated by its revision, dropped as a tap's", () => {
    const event = movementEvent(keys, MOVEMENT_COPY);
    expect(event.created_at).toBe(Math.floor(AT / 1000) + 1);
    expect(event.tags).toEqual([
      ["d", movementAddress(keys, MOVEMENT)],
      ["expiration", String(Math.floor((AT + CARD_PAYMENTS_KEPT_MS) / 1000))]
    ]);
    // Padded as a tap's: a relay cannot tell them apart.
    expect(event.content.length).toBe(historyEvent(keys, COPY).content.length);
    const text = inClear(event);
    for (const secret of [MOVEMENT.cardId, MOVEMENT.id, "29901", MOVEMENT.txid!, "CHF"]) {
      expect(text).not.toContain(secret);
    }
    const read = historyOf(keys, new Map([["wss://a", [event, historyEvent(keys, COPY)]]]));
    expect(read.movements).toEqual(new Map([[KEY, MOVEMENT_COPY]]));
    expect(read.copies).toEqual(new Map([[ENTRY.id, COPY]]));
  });

  it("goes through its value and back, a newer version said so", () => {
    expect(parseMovementCopy(movementValue(MOVEMENT_COPY))).toEqual(MOVEMENT_COPY);
    expect(parseMovementCopy({ ...movementValue(MOVEMENT_COPY), version: 3 })).toBe("newer");
    expect(parseMovementCopy({ ...movementValue(MOVEMENT_COPY), revision: -1 })).toBeNull();
    expect(parseMovementCopy({ ...movementValue(MOVEMENT_COPY), version: 0 })).toBeNull();
  });

  it("keeps the latest write, and drops one at another movement's address or date", () => {
    const first: MovementCopy = { movement: { ...MOVEMENT, value: null }, revision: 0 };
    const misplaced = sealRecord({
      type: "card-movement",
      value: movementValue(MOVEMENT_COPY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: movementAddress(keys, { ...MOVEMENT, cardId: "f".repeat(32) }),
      createdAt: Math.floor(AT / 1000) + 1
    });
    const misdated = sealRecord({
      type: "card-movement",
      value: movementValue(MOVEMENT_COPY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: movementAddress(keys, MOVEMENT),
      createdAt: Math.floor(AT / 1000) + 5
    });
    const read = historyOf(
      keys,
      new Map([
        ["wss://a", [movementEvent(keys, first), misplaced, misdated]],
        ["wss://b", [movementEvent(keys, MOVEMENT_COPY)]]
      ])
    );
    expect(read.movements).toEqual(new Map([[KEY, MOVEMENT_COPY]]));
    // Another wallet's: none.
    const other = historyOf(
      keys,
      new Map([["wss://a", [movementEvent(deriveHistoryRecordKeys(otherRoot), MOVEMENT_COPY)]]])
    );
    expect(other.movements.size).toBe(0);
  });

  it("writes a recharge or a return in format 1, a withdrawal in 2: an app of before leaves it", () => {
    expect(movementValue(MOVEMENT_COPY)).toMatchObject({ version: 1 });
    const back = { ...MOVEMENT, kind: "return" as const, way: null, txid: null };
    expect(movementValue({ movement: back, revision: 0 })).toMatchObject({ version: 1 });
    const withdrawal: MovementCopy = {
      movement: { ...MOVEMENT, kind: "withdrawal", way: "spark", txid: null },
      revision: 0
    };
    expect(movementValue(withdrawal)).toMatchObject({ version: 2 });
    expect(parseMovementCopy(movementValue(withdrawal))).toEqual(withdrawal);
    // Format 1 has no withdrawal; format 2 reads recharges and returns too.
    expect(parseMovementCopy({ ...movementValue(withdrawal), version: 1 })).toBeNull();
    expect(parseMovementCopy({ ...movementValue(MOVEMENT_COPY), version: 2 })).toEqual(
      MOVEMENT_COPY
    );
  });

  it("tells the address of one of a newer format, never written over", () => {
    const newer = sealRecord({
      type: "card-movement",
      value: { ...movementValue(MOVEMENT_COPY), version: 3 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: movementAddress(keys, MOVEMENT),
      createdAt: Math.floor(AT / 1000) + 1
    });
    const read = historyOf(keys, new Map([["wss://a", [newer]]]));
    expect(read.newer).toBe(true);
    expect(read.newerAt).toEqual(new Set([movementAddress(keys, MOVEMENT)]));
    expect(read.movements.size).toBe(0);
  });
});

describe("a withdrawal's note", () => {
  const KEY = `${NOTE.cardId}/${NOTE.id}`;
  const WRITTEN = Math.floor(AT / 1000) + 30;

  it("holds the note whole, never expires, and tells a relay nothing", () => {
    const event = withdrawalEvent(keys, NOTE, WRITTEN);
    expect(event.created_at).toBe(WRITTEN);
    // No expiration: it tells a withdrawal from a return for good.
    expect(event.tags).toEqual([["d", withdrawalAddress(keys, NOTE)]]);
    // Padded as a tap's: a relay cannot tell them apart.
    expect(event.content.length).toBe(historyEvent(keys, COPY).content.length);
    const text = inClear(event);
    for (const secret of [NOTE.cardId, NOTE.id, "spark"]) expect(text).not.toContain(secret);
    const read = historyOf(
      keys,
      new Map([
        ["wss://a", [event, movementEvent(keys, MOVEMENT_COPY)]],
        // Written again as it is (a withdrawal tried again): the same note.
        ["wss://b", [withdrawalEvent(keys, NOTE, WRITTEN + 60)]]
      ])
    );
    expect(read.withdrawals).toEqual(new Map([[KEY, NOTE]]));
    expect(read.movements).toEqual(new Map([[`${MOVEMENT.cardId}/${MOVEMENT.id}`, MOVEMENT_COPY]]));
  });

  it("goes through its value and back, checked whole, a newer version said so", () => {
    expect(parseWithdrawalValue(withdrawalValue(NOTE))).toEqual(NOTE);
    expect(withdrawalValue(NOTE)).toMatchObject({ version: 1 });
    expect(parseWithdrawalValue({ ...withdrawalValue(NOTE), version: 2 })).toBe("newer");
    expect(parseWithdrawalValue({ ...withdrawalValue(NOTE), version: 0 })).toBeNull();
    expect(parseWithdrawalValue({ ...withdrawalValue(NOTE), way: "main" })).toBeNull();
    expect(parseWithdrawalValue({ ...withdrawalValue(NOTE), id: "with space" })).toBeNull();
    expect(parseWithdrawalValue(null)).toBeNull();
  });

  it("drops one at another payment's address, another wallet's, and tells a newer one's", () => {
    const misplaced = sealRecord({
      type: "card-withdrawal",
      value: withdrawalValue(NOTE),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: withdrawalAddress(keys, { ...NOTE, id: "other-payment" }),
      createdAt: WRITTEN
    });
    // At a movement's address: not a note.
    const asMovement = sealRecord({
      type: "card-withdrawal",
      value: withdrawalValue(NOTE),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: movementAddress(keys, MOVEMENT),
      createdAt: WRITTEN
    });
    const otherWallet = withdrawalEvent(deriveHistoryRecordKeys(otherRoot), NOTE, WRITTEN);
    const read = historyOf(keys, new Map([["wss://a", [misplaced, asMovement, otherWallet]]]));
    expect(read.withdrawals.size).toBe(0);

    const newer = sealRecord({
      type: "card-withdrawal",
      value: { ...withdrawalValue(NOTE), version: 2 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: withdrawalAddress(keys, NOTE),
      createdAt: WRITTEN
    });
    const later = historyOf(keys, new Map([["wss://a", [newer]]]));
    expect(later.newerAt).toEqual(new Set([withdrawalAddress(keys, NOTE)]));
    expect(later.withdrawals.size).toBe(0);
  });
});
