import { bytesToHex } from "@noble/hashes/utils.js";

import { encodeWalletSecret } from "@/lib/breez/secret";
import { cardStatesFilter, deriveCardRecordKeys } from "@/lib/card/card-record";
import { deriveCardRoot } from "@/lib/card/keys";
import { payeeValue, type PayeeEntry } from "@/lib/card/payee-book";
import {
  cardPayeeEvents,
  derivePayeeRecordKeys,
  formatMarkerEvent,
  formerModeAddress,
  payeeAddress,
  payeeEvent,
  payeeModeAddress,
  payeeModeEvent,
  payeesFilter,
  payeesOf
} from "@/lib/card/payee-records";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const otherRoot = deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }));
const keys = derivePayeeRecordKeys(root);
/** cardIdOf(root, 04996c6a926980): card-keys.test.ts. */
const CARD = "30c19d9bfae333c1cb42a5ce6e20debb";
const OTHER_CARD = "0123456789abcdef0123456789abcdef";
/** Their first wallets; the card's next one (deleted, then added again). */
const WALLET = { cardId: CARD, walletGeneration: 1 };
const OTHER_WALLET = { cardId: OTHER_CARD, walletGeneration: 1 };
const NEXT_WALLET = { cardId: CARD, walletGeneration: 2 };
const ADDRESS = "sattleme02c6047f94@breez.tips";
/** A node's key: a merchant identified by the node its invoices pay. */
const NODE = "030936e7a016fb3f5ce53c8db29da2b6dfbf8e068ea058c363e0fd77f444270d8a";
const T0 = 1_790_000_000_000;

const ENTRY: PayeeEntry = {
  ...WALLET,
  id: ADDRESS,
  approved: true,
  approvalAt: T0,
  approvedAt: T0,
  approvedName: "Fine Bakery",
  localName: null,
  localNameAt: 0,
  lastName: "Fine Bakery",
  lastSeenAt: T0,
  updatedAt: 1_790_000_000
};
const MODE = { ...WALLET, mode: "confirm" as const, modeAt: T0, updatedAt: 1_790_000_001 };

describe("the payees' record keys", () => {
  // Computed once, then checked against Node's own HKDF (crypto.hkdfSync) from the card root.
  it("keep the released derivations", () => {
    expect(bytesToHex(keys.nostr.secretKey)).toBe(
      "f945af57df8412258dbd608db7f0362f2ae5dedcb73ead6ef7a5165cdd91a430"
    );
    expect(bytesToHex(keys.encryptionKey)).toBe(
      "a92e8c5c559051a07f2b84a77a1b2ef5bc0474bca6c98f3814b6ba08dfb2f599"
    );
    expect(bytesToHex(keys.addressKey)).toBe(
      "556c3aef35b5e4efa422f5f51a6aa3b078ba4d97c451f448a0503bda02f9ca50"
    );
    // Format 1's mode, one for every card: the books' marker since 2.
    expect(formerModeAddress(keys)).toBe(
      "ee5c0d7c09e35e235d7ac6f5c761869a8ad64f66dc550c6163f40088d539956e"
    );
    // Each card's wallet's own (format 2).
    expect(payeeModeAddress(keys, WALLET)).toBe(
      "20c4fa7ae97e9172ceb570244cefb3ed895c6483daaabe56c599dd7ca7d723f4"
    );
    expect(payeeAddress(keys, WALLET, ADDRESS)).toBe(
      "e7537580b897716517c3aefa9f7a4908fe93fea3de3872c1a81d22ee150e7051"
    );
    expect(payeeModeAddress(keys, NEXT_WALLET)).toBe(
      "4628af9c7e08d589aa6da8ba840da4e32df7c5307166864b6f0071a5d8999cfe"
    );
    // A merchant identified by its node: the same derivation,
    // its key in place of an address (which always holds an "@").
    expect(payeeAddress(keys, WALLET, NODE)).toBe(
      "37e72c64deb16e749c79c8e1460cb7fa46bfcea748f981028c3349ac1f831133"
    );
  });

  it("give each card's wallet its own addresses, which tell neither the card nor the merchant", () => {
    expect(payeeModeAddress(keys, OTHER_WALLET)).not.toBe(payeeModeAddress(keys, WALLET));
    expect(payeeAddress(keys, OTHER_WALLET, ADDRESS)).not.toBe(payeeAddress(keys, WALLET, ADDRESS));
    // The card added again writes at others: nothing of its earlier book is at them.
    expect(payeeAddress(keys, NEXT_WALLET, ADDRESS)).not.toBe(payeeAddress(keys, WALLET, ADDRESS));
  });

  it("are another wallet's for another wallet, and not the cards' author", () => {
    const other = derivePayeeRecordKeys(otherRoot);
    expect(other.nostr.publicKey).not.toBe(keys.nostr.publicKey);
    expect(payeeAddress(other, WALLET, ADDRESS)).not.toBe(payeeAddress(keys, WALLET, ADDRESS));
    // A read of the cards by author never gets these records (nor the other way round).
    const cards = deriveCardRecordKeys(root);
    expect(payeesFilter(keys).authors).not.toEqual(cardStatesFilter(cards).authors);
  });
});

describe("the payees' records", () => {
  it("go through their records and back, the merchant only inside", () => {
    const event = payeeEvent(keys, ENTRY);
    expect(event.kind).toBe(RECORD_KIND);
    expect(event.created_at).toBe(ENTRY.updatedAt);
    expect(event.tags).toEqual([["d", payeeAddress(keys, WALLET, ADDRESS)]]);
    expect(JSON.stringify(event)).not.toContain("breez.tips");
    expect(JSON.stringify(event)).not.toContain(CARD);
    const mode = payeeModeEvent(keys, MODE);
    expect(mode.tags).toEqual([["d", payeeModeAddress(keys, WALLET)]]);
    // Both padded to the same size: a relay cannot tell the mode from a merchant.
    expect(mode.content.length).toBe(event.content.length);

    const read = payeesOf(
      keys,
      new Map([
        ["wss://a", [event, mode]],
        ["wss://b", [event]]
      ])
    );
    expect(read.cards).toEqual(
      new Map([[CARD, new Map([[1, { mode: MODE, payees: new Map([[ADDRESS, ENTRY]]) }]])]])
    );
    expect(read.newer).toEqual(new Set());
    expect(read.answered).toBe(2);
  });

  it("carry a merchant identified by its node, of format 3, and back", () => {
    const node: PayeeEntry = { ...ENTRY, id: NODE, approvedName: "", lastName: "" };
    const event = payeeEvent(keys, node);
    expect(event.tags).toEqual([["d", payeeAddress(keys, WALLET, NODE)]]);
    expect(JSON.stringify(event)).not.toContain(NODE);
    // Padded as any other: a relay cannot tell a node's from an address's.
    expect(event.content.length).toBe(payeeEvent(keys, ENTRY).content.length);
    const read = payeesOf(keys, new Map([["wss://a", [event, payeeEvent(keys, ENTRY)]]]));
    expect(read.cards.get(CARD)?.get(1)?.payees).toEqual(
      new Map([
        [NODE, node],
        [ADDRESS, ENTRY]
      ])
    );
    expect(read.newer).toEqual(new Set());
  });

  it("are read card by card: a merchant approved for one card is not for the other", () => {
    const other = { ...ENTRY, cardId: OTHER_CARD, approved: false, approvalAt: T0 + 1 };
    const otherMode = { ...MODE, cardId: OTHER_CARD, mode: "automatic" as const };
    const read = payeesOf(
      keys,
      new Map([
        [
          "wss://a",
          [payeeEvent(keys, ENTRY), payeeEvent(keys, other), payeeModeEvent(keys, otherMode)]
        ]
      ])
    );
    expect(read.cards.get(CARD)).toEqual(
      new Map([[1, { mode: null, payees: new Map([[ADDRESS, ENTRY]]) }]])
    );
    expect(read.cards.get(OTHER_CARD)).toEqual(
      new Map([[1, { mode: otherMode, payees: new Map([[ADDRESS, other]]) }]])
    );
  });

  it("are read wallet by wallet: a card added again shares nothing with its earlier book", () => {
    const next = { ...ENTRY, ...NEXT_WALLET, approved: false, approvalAt: T0 + 1 };
    const nextMode = { ...MODE, ...NEXT_WALLET, mode: "automatic" as const };
    const answers = new Map([
      [
        "wss://a",
        [
          payeeEvent(keys, ENTRY),
          payeeModeEvent(keys, MODE),
          payeeEvent(keys, next),
          payeeModeEvent(keys, nextMode)
        ]
      ]
    ]);
    const read = payeesOf(keys, answers);
    expect(read.cards.get(CARD)).toEqual(
      new Map([
        [1, { mode: MODE, payees: new Map([[ADDRESS, ENTRY]]) }],
        [2, { mode: nextMode, payees: new Map([[ADDRESS, next]]) }]
      ])
    );
    // For a deletion request: the copies of the wallets asked for, those only.
    const first = cardPayeeEvents(keys, answers, (wallet) => wallet.walletGeneration === 1);
    expect(first.map((event) => event.tags)).toEqual([
      [["d", payeeAddress(keys, WALLET, ADDRESS)]],
      [["d", payeeModeAddress(keys, WALLET)]]
    ]);
  });

  it("leave the records of version 1, one book for every card, as no card's", () => {
    const { cardId: _cardId, ...v1 } = ENTRY;
    const old = sealRecord({
      type: "card-payee",
      value: { ...v1, version: 1 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: "a41121bea6282364f3059293e7a57a90f4f664559a91f21ba40980006ee95fae",
      createdAt: ENTRY.updatedAt
    });
    const read = payeesOf(keys, new Map([["wss://a", [old]]]));
    expect(read.cards.size).toBe(0);
    expect(read.newer.size).toBe(0);
  });

  it("merge every copy relays sent", () => {
    const removed = {
      ...ENTRY,
      approved: false,
      approvalAt: T0 + 1,
      updatedAt: ENTRY.updatedAt + 1
    };
    const read = payeesOf(
      keys,
      new Map([
        ["wss://a", [payeeEvent(keys, ENTRY)]],
        ["wss://b", [payeeEvent(keys, removed)]]
      ])
    );
    expect(read.cards.get(CARD)?.get(1)?.payees.get(ADDRESS)).toEqual(removed);
  });

  it("drop what is not one: another wallet's, another address, a date that is not the copy's", () => {
    const other = derivePayeeRecordKeys(otherRoot);
    const misplaced = sealRecord({
      type: "card-payee",
      value: payeeValue(ENTRY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, WALLET, "other@example.com"),
      createdAt: ENTRY.updatedAt
    });
    // At another card's address: its approval would move from card to card.
    const otherCard = sealRecord({
      type: "card-payee",
      value: payeeValue(ENTRY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, OTHER_WALLET, ADDRESS),
      createdAt: ENTRY.updatedAt
    });
    // At the card's next wallet's: its approval would move to the card added again.
    const otherWallet = sealRecord({
      type: "card-payee",
      value: payeeValue(ENTRY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, NEXT_WALLET, ADDRESS),
      createdAt: ENTRY.updatedAt
    });
    const misdated = sealRecord({
      type: "card-payee",
      value: payeeValue(ENTRY),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, WALLET, ADDRESS),
      createdAt: ENTRY.updatedAt + 60
    });
    const modeElsewhere = sealRecord({
      type: "card-payee-mode",
      value: { version: 2, ...MODE },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeModeAddress(keys, OTHER_WALLET),
      createdAt: MODE.updatedAt
    });
    const modeOfNext = sealRecord({
      type: "card-payee-mode",
      value: { version: 2, ...MODE },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeModeAddress(keys, NEXT_WALLET),
      createdAt: MODE.updatedAt
    });
    const tampered = { ...payeeEvent(keys, ENTRY), created_at: ENTRY.updatedAt + 1 };
    const read = payeesOf(
      keys,
      new Map([
        [
          "wss://a",
          [
            payeeEvent(other, ENTRY),
            misplaced,
            otherCard,
            otherWallet,
            misdated,
            modeElsewhere,
            modeOfNext,
            tampered,
            null,
            "x"
          ]
        ]
      ])
    );
    expect(read.cards.size).toBe(0);
  });

  it("tell which relays lack the books' marker at the former mode's address", () => {
    const marker = formatMarkerEvent(keys, 1_790_000_100);
    expect(marker.tags).toEqual([["d", formerModeAddress(keys)]]);
    // Padded as the others: a relay cannot tell it either.
    expect(marker.content.length).toBe(payeeEvent(keys, ENTRY).content.length);
    const former = sealRecord({
      type: "card-payee-mode",
      value: { version: 1, mode: "automatic", modeAt: T0, updatedAt: 1_790_000_200 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: formerModeAddress(keys),
      createdAt: 1_790_000_200
    });
    const read = payeesOf(
      keys,
      new Map([
        ["wss://a", [marker, payeeEvent(keys, ENTRY)]],
        // Format 1's mode, written after the marker: the marker is lacking there.
        ["wss://b", [marker, former]],
        ["wss://c", []]
      ])
    );
    // No card's, no newer app's.
    expect(read.cards).toEqual(
      new Map([[CARD, new Map([[1, { mode: null, payees: new Map([[ADDRESS, ENTRY]]) }]])]])
    );
    expect(read.newer).toEqual(new Set());
    expect(read.former).toEqual({ lacking: 2, newestAt: 1_790_000_200, newer: false });
    // Of a newer format there: never written over.
    const newer = sealRecord({
      type: "card-payee-mode",
      value: { version: 3, books: "per-card" },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: formerModeAddress(keys),
      createdAt: 1_790_000_300
    });
    expect(payeesOf(keys, new Map([["wss://a", [newer]]])).former).toEqual({
      lacking: 1,
      newestAt: 1_790_000_300,
      newer: true
    });
  });

  it("say when one is of a newer format", () => {
    const newer = sealRecord({
      type: "card-payee",
      // 3 is a node's entry (payee-book.ts): 4 is the next format.
      value: { ...payeeValue(ENTRY), version: 4 },
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: payeeAddress(keys, WALLET, ADDRESS),
      createdAt: ENTRY.updatedAt
    });
    const read = payeesOf(keys, new Map([["wss://a", [newer, payeeModeEvent(keys, MODE)]]]));
    expect(read.newer).toEqual(new Set([payeeAddress(keys, WALLET, ADDRESS)]));
    expect(read.cards.get(CARD)).toEqual(new Map([[1, { mode: MODE, payees: new Map() }]]));
  });
});
