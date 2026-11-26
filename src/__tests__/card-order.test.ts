import { encodeWalletSecret } from "@/lib/breez/secret";
import {
  CARD_ORDER_VERSION,
  MAX_ORDERED_CARDS,
  cardOrderAddress,
  cardOrderEvent,
  cardOrderFilter,
  cardOrderOf,
  cardOrderValue,
  newerCardOrder,
  orderCards,
  orderToSave,
  parseCardOrder,
  type CardOrder
} from "@/lib/card/card-order";
import {
  cardStateEvent,
  cardStatesOf,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { deriveCardRoot } from "@/lib/card/keys";
import { NewerRecordError, sealRecord } from "@/lib/nostr/record";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = deriveCardRoot(encodeWalletSecret({ mnemonic: MNEMONIC }));
const keys = deriveCardRecordKeys(root);
const otherKeys = deriveCardRecordKeys(
  deriveCardRoot(encodeWalletSecret({ mnemonic: `${MNEMONIC} zoo` }))
);

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);
const D = "d".repeat(32);

const ORDER: CardOrder = {
  cards: [
    { cardId: C, walletGeneration: 1 },
    { cardId: A, walletGeneration: 2 }
  ],
  updatedAt: 1_790_000_000
};

/** The order's record of `value` as another app would seal it, at the order's address. */
function sealed(value: unknown, createdAt: number, type = "card-order") {
  return sealRecord({
    type,
    value,
    signer: keys.nostr.secretKey,
    encryptionKey: keys.encryptionKey,
    address: cardOrderAddress(keys),
    createdAt,
    block: 512
  });
}

describe("the order's address", () => {
  it("keeps its released derivation (vector, computed once with Node's HKDF)", () => {
    expect(cardOrderAddress(keys)).toBe(
      "aea92e6f71b18389ed531afe2b48522ee1d16b81437c6718c9da9dd49988d978"
    );
  });

  it("is another wallet's for another wallet", () => {
    expect(cardOrderAddress(otherKeys)).not.toBe(cardOrderAddress(keys));
  });

  it("is read by the cards' author, at that address only", () => {
    expect(cardOrderFilter(keys)).toEqual({
      kinds: [30078],
      authors: [keys.nostr.publicKey],
      "#d": [cardOrderAddress(keys)]
    });
  });
});

describe("an order", () => {
  it("goes through its record and back, telling no card to a relay", () => {
    const event = cardOrderEvent(keys, ORDER);
    expect(event.created_at).toBe(ORDER.updatedAt);
    expect(event.pubkey).toBe(keys.nostr.publicKey);
    expect(event.tags).toEqual([["d", cardOrderAddress(keys)]]);
    expect(JSON.stringify(event)).not.toContain(A);
    expect(cardOrderOf(keys, new Map([["wss://a", [event]]]))).toEqual({
      order: ORDER,
      newer: false,
      newestAt: ORDER.updatedAt
    });
  });

  it("tells a relay nothing of how many cards it orders, up to thirteen", () => {
    const of = (count: number) =>
      cardOrderEvent(keys, {
        cards: Array.from({ length: count }, (_, i) => ({
          cardId: i.toString(16).padStart(32, "0"),
          walletGeneration: count === 1 ? 1 : 99
        })),
        updatedAt: ORDER.updatedAt
      }).content.length;
    // One block whatever their number (their wallets' generations two digits long, at worst).
    expect(of(13)).toBe(of(1));
    expect(of(10)).toBe(of(1));
  });

  it("is refused out of shape", () => {
    const value = cardOrderValue(ORDER) as Record<string, unknown>;
    expect(parseCardOrder(value)).toEqual(ORDER);
    for (const patch of [
      { version: 0 },
      { version: "1" },
      { updatedAt: -1 },
      { updatedAt: 1.5 },
      { cards: "a" },
      { cards: [null] },
      { cards: [[A, 1]] },
      { cards: [{ cardId: A.toUpperCase(), walletGeneration: 1 }] },
      { cards: [{ cardId: "a".repeat(31), walletGeneration: 1 }] },
      { cards: [{ cardId: A, walletGeneration: 0 }] },
      { cards: [{ cardId: A, walletGeneration: 1.5 }] },
      // A card twice.
      {
        cards: [
          { cardId: A, walletGeneration: 1 },
          { cardId: A, walletGeneration: 2 }
        ]
      },
      {
        cards: Array.from({ length: MAX_ORDERED_CARDS + 1 }, (_, index) => ({
          cardId: index.toString(16).padStart(32, "0"),
          walletGeneration: 1
        }))
      }
    ]) {
      expect(parseCardOrder({ ...value, ...patch })).toBeNull();
    }
    expect(parseCardOrder(null)).toBeNull();
    expect(parseCardOrder([value])).toBeNull();
    expect(parseCardOrder({ ...value, cards: [] })).toEqual({
      cards: [],
      updatedAt: 1_790_000_000
    });
  });

  it("of a newer version is a newer app's", () => {
    expect(() => parseCardOrder({ version: CARD_ORDER_VERSION + 1 })).toThrow(NewerRecordError);
  });
});

describe("the order the relays hold", () => {
  it("is their newest readable copy, a relay's copy that was not chosen then left out", () => {
    const older = cardOrderEvent(keys, {
      cards: [{ cardId: B, walletGeneration: 1 }],
      updatedAt: 10
    });
    const newest = cardOrderEvent(keys, ORDER);
    const read = cardOrderOf(
      keys,
      new Map([
        ["wss://a", [older]],
        ["wss://b", [newest, older]]
      ])
    );
    expect(read.order).toEqual(ORDER);
    expect(read.newestAt).toBe(ORDER.updatedAt);
  });

  it("ignores another wallet's, another address's, an altered copy and a value dated otherwise", () => {
    const foreign = cardOrderEvent(otherKeys, { ...ORDER, updatedAt: ORDER.updatedAt + 5 });
    const elsewhere = sealRecord({
      type: "card-order",
      value: cardOrderValue({ ...ORDER, updatedAt: ORDER.updatedAt + 6 }),
      signer: keys.nostr.secretKey,
      encryptionKey: keys.encryptionKey,
      address: "0".repeat(64),
      createdAt: ORDER.updatedAt + 6
    });
    const altered = { ...cardOrderEvent(keys, ORDER), created_at: ORDER.updatedAt + 7 };
    const misdated = sealed(cardOrderValue(ORDER), ORDER.updatedAt + 8);
    const read = cardOrderOf(keys, new Map([["wss://a", [foreign, elsewhere, altered, misdated]]]));
    expect(read).toEqual({ order: null, newer: false, newestAt: null });
  });

  it("is none, never written over, when a newer app's copy is the newest", () => {
    const mine = cardOrderEvent(keys, ORDER);
    const newerValue = sealed({ version: CARD_ORDER_VERSION + 1 }, ORDER.updatedAt + 1);
    expect(cardOrderOf(keys, new Map([["wss://a", [mine, newerValue]]]))).toEqual({
      order: null,
      newer: true,
      newestAt: ORDER.updatedAt + 1
    });
    // Older than the readable one: that one stands, the record is still not written over.
    const olderNewer = sealed({ version: CARD_ORDER_VERSION + 1 }, ORDER.updatedAt - 1);
    expect(cardOrderOf(keys, new Map([["wss://a", [mine, olderNewer]]]))).toEqual({
      order: ORDER,
      newer: true,
      newestAt: ORDER.updatedAt
    });
  });

  it("is not a card's state for the readers of the cards' states (the apps before it)", () => {
    const state: CardState = {
      cardId: "30c19d9bfae333c1cb42a5ce6e20debb",
      uid: "04996c6a926980",
      keyVersion: 1,
      status: "active",
      relayHost: "relay.sattle.me",
      lastCounter: 5,
      depositedThrough: 1005,
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5,
      suspended: false,
      name: "",
      look: null,
      issuer: null,
      settingsAt: 1_789_999_000_000,
      walletGeneration: 1,
      updatedAt: 1_790_000_000
    };
    const answers = new Map([
      ["wss://a", [cardStateEvent(keys, state), cardOrderEvent(keys, ORDER)]]
    ]);
    const read = cardStatesOf(keys, root, answers);
    expect([...read.states.keys()]).toEqual([state.cardId]);
    expect(read.newer.size).toBe(0);
    // And a card's state is no order.
    expect(cardOrderOf(keys, answers).order).toEqual(ORDER);
    expect(
      cardOrderOf(keys, new Map([["wss://a", [sealed(cardOrderValue(ORDER), 9, "card-state")]]]))
        .order
    ).toBeNull();
  });
});

describe("an order to save", () => {
  it("is dated now, or just after the relays' newest copy", () => {
    const cards = [{ cardId: A, walletGeneration: 1, name: "x" } as never];
    expect(orderToSave(cards, 100, null)).toEqual({
      cards: [{ cardId: A, walletGeneration: 1 }],
      updatedAt: 100
    });
    expect(orderToSave(cards, 100, 99).updatedAt).toBe(100);
    expect(orderToSave(cards, 100, 100).updatedAt).toBe(101);
    expect(orderToSave(cards, 100, 250).updatedAt).toBe(251);
  });

  it("names MAX_ORDERED_CARDS cards at most", () => {
    const many = Array.from({ length: MAX_ORDERED_CARDS + 3 }, (_, index) => ({
      cardId: index.toString(16).padStart(32, "0"),
      walletGeneration: 1
    }));
    const order = orderToSave(many, 1, null);
    expect(order.cards).toHaveLength(MAX_ORDERED_CARDS);
    expect(parseCardOrder(cardOrderValue(order))).toEqual(order);
  });
});

describe("the newer of two orders", () => {
  it("is the one chosen last, either alone", () => {
    const later = { ...ORDER, updatedAt: ORDER.updatedAt + 1 };
    expect(newerCardOrder(null, null)).toBeNull();
    expect(newerCardOrder(ORDER, null)).toBe(ORDER);
    expect(newerCardOrder(null, ORDER)).toBe(ORDER);
    expect(newerCardOrder(ORDER, later)).toBe(later);
    expect(newerCardOrder(later, ORDER)).toBe(later);
    expect(newerCardOrder(ORDER, { ...ORDER })).toBe(ORDER);
  });
});

describe("cards in an order", () => {
  const card = (cardId: string, walletGeneration = 1) => ({ cardId, walletGeneration });

  it("keep the order they come in without one", () => {
    const cards = [card(A), card(B)];
    expect(orderCards(cards, null)).toEqual(cards);
    expect(orderCards(cards, { cards: [], updatedAt: 1 })).toEqual(cards);
  });

  it("come as it orders them, then the ones it does not name, in the order they come in", () => {
    const cards = [card(A, 2), card(B), card(C), card(D)];
    expect(orderCards(cards, ORDER).map(({ cardId }) => cardId)).toEqual([C, A, B, D]);
  });

  it("leave out what it names of cards gone, and take a card added again for a card it does not name", () => {
    // A was ordered at its second wallet: added again since, it pays from its third.
    expect(orderCards([card(A, 3), card(B), card(C)], ORDER).map(({ cardId }) => cardId)).toEqual([
      C,
      A,
      B
    ]);
    expect(orderCards([card(A, 2)], ORDER)).toEqual([card(A, 2)]);
  });
});
