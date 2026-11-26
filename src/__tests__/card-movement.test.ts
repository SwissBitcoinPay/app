import type { WalletPayment } from "@/lib/breez/types";
import {
  NO_NOTES,
  cardMovementValue,
  movementOf,
  parseCardMovement,
  parseCardWithdrawalNote,
  senderNoteOf,
  unidentifiedOf,
  walletMovementsOf,
  withdrawalWayOf,
  type WithdrawalNotes
} from "@/lib/card/card-movement";

/*
 * What came to a card's wallet or left it besides its payments at a point of sale: read from the
 * wallet's own payments (spark-sdk 0.28.4), then kept on the account's relays.
 */

const CARD = "0123456789abcdef0123456789abcdef";
/** The card's wallet whose payments the tests read: its second (deleted once, added again). */
const WALLET = { cardId: CARD, walletGeneration: 2 };
const ID = "4f7a9c62-1d3e-4b8a-9c71-2f5e6d8a0b13";
const TXID = "7f3a9c".padEnd(64, "1");
const AT = 1_792_054_800;
/** The relays read whole, no withdrawal noted: a Spark transfer sent is a return. */
const NOTES: WithdrawalNotes = { ways: new Map(), conclusive: true };

function payment(fields: Partial<WalletPayment>): WalletPayment {
  return {
    id: ID,
    direction: "receive",
    status: "completed",
    amountSats: 20_000n,
    feeSats: 0n,
    timestamp: AT,
    network: "spark",
    ...fields
  };
}

describe("a movement of a card's wallet", () => {
  it("is a recharge from the main balance: a Spark transfer received", () => {
    expect(movementOf(WALLET, payment({}), NOTES)).toEqual({
      id: ID,
      cardId: CARD,
      walletGeneration: 2,
      kind: "recharge",
      way: "main",
      at: AT * 1000,
      amountSats: 20_000n,
      feeSats: 0n,
      txid: null,
      description: null,
      value: null
    });
  });

  it("is a recharge by invoice when the Lightning payment has a description, else by address", () => {
    expect(
      movementOf(WALLET, payment({ network: "lightning", description: "Card top-up" }), NOTES)
    ).toMatchObject({ kind: "recharge", way: "invoice", description: "Card top-up" });
    expect(movementOf(WALLET, payment({ network: "lightning" }), NOTES)).toMatchObject({
      kind: "recharge",
      way: "address",
      description: null
    });
    expect(
      movementOf(WALLET, payment({ network: "lightning", description: "" }), NOTES)
    ).toMatchObject({
      way: "address"
    });
  });

  it("is a recharge by Bitcoin address once its claim names its transaction, its fee deducted", () => {
    expect(
      movementOf(
        WALLET,
        payment({ network: "bitcoin", amountSats: 29_901n, feeSats: 99n, txId: TXID }),
        NOTES
      )
    ).toMatchObject({
      kind: "recharge",
      way: "onchain",
      amountSats: 29_901n,
      feeSats: 99n,
      txid: TXID
    });
    // Its provider's record not there yet (spark-sdk 0.28.4: pending, without its transaction).
    expect(movementOf(WALLET, payment({ network: "bitcoin" }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ network: "bitcoin", txId: "X" }), NOTES)).toBeNull();
  });

  it("is a return to the main balance: a Spark transfer sent, what it cost on top", () => {
    expect(
      movementOf(WALLET, payment({ direction: "send", amountSats: 10_000n, feeSats: 1n }), NOTES)
    ).toMatchObject({ kind: "return", way: null, amountSats: 10_000n, feeSats: 1n });
  });

  it("is none for a payment at a point of sale, one not completed, or one out of shape", () => {
    // A Lightning payment sent without a withdrawal's note: a tap's (payment-log.ts); a Bitcoin
    // withdrawal without its transaction yet.
    expect(
      movementOf(WALLET, payment({ direction: "send", network: "lightning" }), NOTES)
    ).toBeNull();
    expect(
      movementOf(WALLET, payment({ direction: "send", network: "bitcoin" }), NOTES)
    ).toBeNull();
    expect(movementOf(WALLET, payment({ status: "pending" }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ status: "failed" }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ amountSats: 0n }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ feeSats: -1n }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ id: "" }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ id: "x".repeat(129) }), NOTES)).toBeNull();
    expect(movementOf(WALLET, payment({ id: "with space" }), NOTES)).toBeNull();
  });

  it("is never a recharge nor a return for a transfer the SDK cannot tell", () => {
    // spark-sdk 0.27.0 on: a completed transfer of a type it does not know. Before, such a
    // Lightning receipt without description read as a recharge by the card's Lightning address.
    const unknown = payment({ network: "unknown" });
    expect(movementOf(WALLET, unknown, NOTES)).toBeNull();
    expect(movementOf(WALLET, { ...unknown, direction: "send" }, NOTES)).toBeNull();
    // It is an unidentified movement instead: "Deposit" received, "Withdrawal" sent.
    expect(unidentifiedOf(WALLET, unknown, NOTES)).toEqual({
      kind: "unidentified",
      id: ID,
      cardId: CARD,
      walletGeneration: 2,
      direction: "receive",
      at: AT * 1000,
      amountSats: 20_000n
    });
    expect(unidentifiedOf(WALLET, { ...unknown, direction: "send" }, NOTES)).toMatchObject({
      direction: "send"
    });
  });

  it("is unidentified only once completed, in shape, and of a transfer the SDK cannot tell", () => {
    const unknown = payment({ network: "unknown" });
    for (const network of ["spark", "lightning", "bitcoin"] as const) {
      expect(unidentifiedOf(WALLET, { ...unknown, network }, NOTES)).toBeNull();
    }
    expect(unidentifiedOf(WALLET, { ...unknown, status: "pending" }, NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, { ...unknown, status: "failed" }, NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, { ...unknown, amountSats: 0n }, NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, { ...unknown, id: "" }, NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, { ...unknown, id: "with space" }, NOTES)).toBeNull();
  });

  it("goes through its value and back, checked whole", () => {
    const value = { minor: 2540, digits: 2, currency: "CHF", hour: 1_792_054_800 };
    const onchain = {
      ...movementOf(
        WALLET,
        payment({ network: "bitcoin", amountSats: 29_901n, feeSats: 99n, txId: TXID }),
        NOTES
      )!,
      value
    };
    const invoice = movementOf(
      WALLET,
      payment({ network: "lightning", description: "Top-up" }),
      NOTES
    )!;
    for (const movement of [onchain, invoice]) {
      expect(parseCardMovement(cardMovementValue(movement), false)).toEqual(movement);
    }
    expect(cardMovementValue(onchain)).toMatchObject({ amountSats: 29_901, feeSats: 99 });
    for (const [base, fields] of [
      [onchain, { txid: null }],
      [onchain, { way: "invoice" }],
      [onchain, { amountSats: 0 }],
      [onchain, { feeSats: -1 }],
      [onchain, { feeSats: 1.5 }],
      [onchain, { kind: "refund" }],
      [onchain, { way: "elsewhere" }],
      [onchain, { cardId: "card" }],
      [onchain, { walletGeneration: undefined }],
      [onchain, { walletGeneration: 0 }],
      [onchain, { walletGeneration: 2.5 }],
      [onchain, { at: -1 }],
      [onchain, { value: "25,40 CHF" }],
      [invoice, { description: null }],
      [invoice, { description: "" }],
      [invoice, { way: "address" }],
      [invoice, { kind: "return" }],
      [{ ...invoice, kind: "return" as const, way: null, description: null }, { way: "main" }]
    ] as const) {
      expect(parseCardMovement({ ...cardMovementValue(base), ...fields }, false)).toBeNull();
    }
    expect(parseCardMovement(null, false)).toBeNull();
    expect(parseCardMovement([cardMovementValue(invoice)], false)).toBeNull();
  });
});

describe("a withdrawal of a card's wallet", () => {
  const sent = (fields: Partial<WalletPayment>) =>
    payment({ direction: "send", amountSats: 15_000n, feeSats: 4n, ...fields });
  const noted = (
    way: "invoice" | "address" | "lnurl" | "onchain" | "spark",
    conclusive = true
  ) => ({
    ways: new Map([[`${CARD}/${ID}`, way]]),
    conclusive
  });

  it('goes where "Send" read: each kind its way', () => {
    expect(withdrawalWayOf("bolt11")).toBe("invoice");
    expect(withdrawalWayOf("lightningAddress")).toBe("address");
    expect(withdrawalWayOf("lnurlPay")).toBe("lnurl");
    expect(withdrawalWayOf("bitcoinAddress")).toBe("onchain");
    expect(withdrawalWayOf("sparkAddress")).toBe("spark");
  });

  it("is a Bitcoin withdrawal sent, with its transaction, noted or not: no other sends on-chain", () => {
    for (const notes of [NOTES, NO_NOTES]) {
      expect(movementOf(WALLET, sent({ network: "bitcoin", txId: TXID }), notes)).toEqual({
        id: ID,
        cardId: CARD,
        walletGeneration: 2,
        kind: "withdrawal",
        way: "onchain",
        at: AT * 1000,
        amountSats: 15_000n,
        feeSats: 4n,
        txid: TXID,
        description: null,
        value: null
      });
    }
    // Its transaction not given yet: not a movement yet.
    expect(movementOf(WALLET, sent({ network: "bitcoin" }), NOTES)).toBeNull();
  });

  it("is a Spark transfer or a Lightning payment sent with its note, where the note says", () => {
    expect(movementOf(WALLET, sent({}), noted("spark"))).toMatchObject({
      kind: "withdrawal",
      way: "spark",
      feeSats: 4n
    });
    // A note read on a minority of the relays still proves it: a return is never noted.
    expect(movementOf(WALLET, sent({}), noted("spark", false))).toMatchObject({
      kind: "withdrawal"
    });
    for (const way of ["invoice", "address", "lnurl"] as const) {
      expect(movementOf(WALLET, sent({ network: "lightning" }), noted(way))).toMatchObject({
        kind: "withdrawal",
        way
      });
    }
    // Another payment's note, or another card's: not this one's.
    const other = { ways: new Map([[`${CARD}/other-id`, "spark" as const]]), conclusive: true };
    expect(movementOf(WALLET, sent({}), other)).toMatchObject({ kind: "return" });
    const otherCard = {
      ways: new Map([[`${"f".repeat(32)}/${ID}`, "spark" as const]]),
      conclusive: true
    };
    expect(movementOf(WALLET, sent({}), otherCard)).toMatchObject({ kind: "return" });
  });

  it("leaves a Spark transfer sent undecided until the notes are read on a majority", () => {
    // Not known yet: no movement, an unidentified "Withdrawal" in its place.
    expect(movementOf(WALLET, sent({}), NO_NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, sent({}), NO_NOTES)).toEqual({
      kind: "unidentified",
      id: ID,
      cardId: CARD,
      walletGeneration: 2,
      direction: "send",
      at: AT * 1000,
      amountSats: 15_000n,
      undecided: true
    });
    // Read whole without a note: a return. Noted: a withdrawal. Never undecided then.
    expect(unidentifiedOf(WALLET, sent({}), NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, sent({}), noted("spark", false))).toBeNull();
    // A Lightning payment without a note stays a payment at a point of sale, whatever is read.
    expect(movementOf(WALLET, sent({ network: "lightning" }), NOTES)).toBeNull();
    expect(unidentifiedOf(WALLET, sent({ network: "lightning" }), NO_NOTES)).toBeNull();
    // Received, it is a recharge whatever is read.
    expect(unidentifiedOf(WALLET, payment({}), NO_NOTES)).toBeNull();
  });

  it("reads the wallet's payments into movements, those not known yet too", () => {
    const payments = [
      sent({}),
      sent({ id: "2b8e1f4a-3c5d-4e6f-8a7b-9c0d1e2f3a4b", network: "lightning" }),
      payment({ id: "5c9d2e1f-4a3b-4c5d-8e6f-7a8b9c0d1e2f" })
    ];
    expect(walletMovementsOf(WALLET, payments, NO_NOTES).map((m) => m.kind)).toEqual([
      "unidentified",
      "recharge"
    ]);
    expect(walletMovementsOf(WALLET, payments, NOTES).map((m) => m.kind)).toEqual([
      "return",
      "recharge"
    ]);
  });

  it("is written in a format that has withdrawals only, checked whole", () => {
    const value = { minor: 1500, digits: 2, currency: "CHF", hour: 1_792_054_800 };
    const onchain = {
      ...movementOf(WALLET, sent({ network: "bitcoin", txId: TXID }), NOTES)!,
      value
    };
    const spark = movementOf(WALLET, sent({}), noted("spark"))!;
    for (const movement of [onchain, spark]) {
      expect(parseCardMovement(cardMovementValue(movement), true)).toEqual(movement);
      // A format of before has no withdrawal: refused there.
      expect(parseCardMovement(cardMovementValue(movement), false)).toBeNull();
    }
    for (const [base, fields] of [
      [onchain, { txid: null }],
      [onchain, { way: "main" }],
      [spark, { way: null }],
      [spark, { way: "main" }],
      [spark, { way: "elsewhere" }],
      [spark, { txid: TXID }],
      [spark, { way: "invoice", description: "Top-up" }]
    ] as const) {
      expect(parseCardMovement({ ...cardMovementValue(base), ...fields }, true)).toBeNull();
    }
    // Its invoice way needs no description, unlike a recharge's.
    const invoice = movementOf(WALLET, sent({ network: "lightning" }), noted("invoice"))!;
    expect(parseCardMovement(cardMovementValue(invoice), true)).toEqual(invoice);
  });

  it("is noted with its card's wallet, its payment's id and its way, checked whole", () => {
    const note = { cardId: CARD, walletGeneration: 2, id: ID, way: "spark" };
    expect(parseCardWithdrawalNote(note)).toEqual(note);
    for (const fields of [
      { cardId: "card" },
      { walletGeneration: 0 },
      { id: "" },
      { id: "with space" },
      { way: "main" },
      { way: undefined }
    ]) {
      expect(parseCardWithdrawalNote({ ...note, ...fields })).toBeNull();
    }
    expect(parseCardWithdrawalNote(null)).toBeNull();
    expect(parseCardWithdrawalNote([note])).toBeNull();
  });
});

describe("what the payer of a recharge wrote", () => {
  const received = (fields: Partial<WalletPayment>) =>
    payment({ network: "lightning", senderComment: "For the coffee", ...fields });

  it("is the comment of a Lightning payment received (LUD-12), as the wallet tells it", () => {
    expect(senderNoteOf(received({}))).toBe("For the coffee");
    // Never part of the movement, nor of its record (MOVEMENT_FORMAT_VERSION).
    const movement = movementOf(WALLET, received({}), NOTES);
    expect(movement).toMatchObject({ way: "address", description: null });
    expect(JSON.stringify(cardMovementValue(movement!))).not.toContain("coffee");
  });

  it("is one line, without hidden characters, cut when too long: the payer's text", () => {
    expect(senderNoteOf(received({ senderComment: "  Thanks\n\tfor\u202e everything  " }))).toBe(
      "Thanks for everything"
    );
    const long = "ü".repeat(500);
    const note = senderNoteOf(received({ senderComment: long }))!;
    expect(Array.from(note)).toHaveLength(140);
    expect(note.endsWith("…")).toBe(true);
    expect(senderNoteOf(received({ senderComment: " \u200e\n " }))).toBeNull();
  });

  it("is none without a comment, nor for any other payment", () => {
    expect(senderNoteOf(received({ senderComment: undefined }))).toBeNull();
    expect(senderNoteOf(received({ senderComment: "" }))).toBeNull();
    expect(senderNoteOf(received({ status: "pending" }))).toBeNull();
    expect(senderNoteOf(received({ direction: "send" }))).toBeNull();
    expect(senderNoteOf(received({ network: "spark" }))).toBeNull();
    expect(senderNoteOf(received({ network: "unknown" }))).toBeNull();
  });
});
