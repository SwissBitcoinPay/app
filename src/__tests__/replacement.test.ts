import {
  MAX_RECORDED_INPUTS,
  isOutpoint,
  outpoint,
  paymentParts,
  type KnownTx
} from "@/lib/onchain/replacement";

const id = (n: number) => n.toString(16).padStart(64, "0");
const coin = (n: number, vout = 0) => outpoint(id(1000 + n), vout);

function tx(
  n: number,
  sats: number,
  inputs: string[],
  at: number | null,
  listed: boolean
): KnownTx {
  return { txid: id(n), sats: BigInt(sats), inputs, at, listed };
}

const part = (sats: number, source: number) => ({ sats: BigInt(sats), source: id(source) });

describe("outpoints", () => {
  it("writes a coin as <txid>:<vout>, lowercase", () => {
    expect(outpoint("AB".repeat(32), 3)).toBe(`${"ab".repeat(32)}:3`);
    expect(isOutpoint(`${"ab".repeat(32)}:3`)).toBe(true);
    expect(isOutpoint(`${"ab".repeat(32)}:4294967295`)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const value of [
      `${"AB".repeat(32)}:3`,
      `${"ab".repeat(32)}:03`,
      `${"ab".repeat(32)}:-1`,
      `${"ab".repeat(32)}:4294967296`,
      `${"ab".repeat(31)}:1`,
      `${"ab".repeat(32)}`,
      3,
      null
    ]) {
      expect(isOutpoint(value)).toBe(false);
    }
  });

  it("keeps a hundred coins of a transaction's record", () => {
    expect(MAX_RECORDED_INPUTS).toBe(100);
  });
});

describe("paymentParts", () => {
  it("counts each transaction at its own time when none replaces another", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, true),
      tx(2, 500, [coin(2)], null, true),
      tx(3, 700, [coin(3)], 5, false)
    ]);
    expect([...parts.keys()].sort()).toEqual([id(1), id(2)]);
    expect(parts.get(id(1))).toEqual([part(1000, 1)]);
    expect(parts.get(id(2))).toEqual([part(500, 2)]);
  });

  it("gives a fee bump the time of the transaction it replaced", () => {
    // RBF: the same coin, a lower change; the address is paid the same.
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1000, [coin(1), coin(9)], null, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(1000, 1)]);
  });

  it("counts a replacement paying less for what it pays", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 900, [coin(1)], 20, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(900, 1)]);
  });

  it("counts what a replacement pays more at its own time", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1200, [coin(1)], 20, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(1000, 1), part(200, 2)]);
  });

  it("follows a chain of replacements back to the first payment", () => {
    // 2 replaced 1 (coin 1) and spends a new coin; 3 replaced 2 through that new coin only.
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1000, [coin(1), coin(2)], 20, false),
      tx(3, 1500, [coin(2)], 30, true)
    ]);
    expect(parts.get(id(3))).toEqual([part(1000, 1), part(500, 3)]);
  });

  it("never counts two alternatives of one payment twice", () => {
    // 2 replaced 1 in time (both seen then), 3 replaced 2: the payment is 1000 sats, not 2000.
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1000, [coin(1)], 12, false),
      tx(3, 2000, [coin(1)], null, true)
    ]);
    expect(parts.get(id(3))).toEqual([part(1000, 1), part(1000, 3)]);
  });

  it("gives a merge of two payments the time of each, for what each paid", () => {
    const parts = paymentParts([
      tx(1, 500, [coin(1)], 10, false),
      tx(2, 700, [coin(2)], 15, false),
      tx(3, 1200, [coin(1), coin(2)], null, true)
    ]);
    expect(parts.get(id(3))).toEqual([part(500, 1), part(700, 2)]);
  });

  it("shares a payment between the transactions that replace it, never more than it paid", () => {
    // Two coins: each replacement spends one of them, both may be mined.
    const parts = paymentParts([
      tx(1, 1000, [coin(1), coin(2)], 10, false),
      tx(3, 600, [coin(2)], null, true),
      tx(2, 600, [coin(1)], null, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(600, 1)]);
    expect(parts.get(id(3))).toEqual([part(400, 1), part(200, 3)]);
  });

  it("shares it in the order of the replacements' own times first", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1), coin(2)], 10, false),
      tx(2, 600, [coin(1)], 40, true),
      tx(3, 600, [coin(2)], 30, true)
    ]);
    expect(parts.get(id(3))).toEqual([part(600, 1)]);
    expect(parts.get(id(2))).toEqual([part(400, 1), part(200, 2)]);
  });

  it("leaves a listed payment its own sats when another listed transaction spends its coin", () => {
    // An explorer that lists both alternatives for a moment: the first is a payment of its own.
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, true),
      tx(2, 1000, [coin(1)], null, true)
    ]);
    expect(parts.get(id(1))).toEqual([part(1000, 1)]);
    expect(parts.get(id(2))).toEqual([part(1000, 2)]);
  });

  it("takes a replacement that spends no recorded coin for a new payment", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1000, [coin(2)], null, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(1000, 2)]);
  });

  it("counts a txid given twice once, as first given", () => {
    const parts = paymentParts([
      tx(1, 1000, [coin(1)], 10, false),
      tx(2, 1000, [coin(1)], null, true),
      tx(2, 5000, [coin(5)], null, true)
    ]);
    expect(parts.get(id(2))).toEqual([part(1000, 1)]);
  });
});
