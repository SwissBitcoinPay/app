import type { WalletPayment } from "@/lib/breez/types";
import {
  lastSplitCheckpoint,
  paidHashes,
  splitCheckpointOf,
  splitDue,
  splitOid,
  type SplitOrder
} from "@/lib/mtpelerin/split";

/*
 * The split's sale (src/lib/mtpelerin/split.ts): what a proposal
 * counts of the wallet's receipts, and where the last sale stands.
 */

const SINCE = 1_763_164_800;
const NOW = SINCE + 86_400;
const LEGACY_TXID = "ab".repeat(32);
const exclusions = { legacyTransfers: new Set([LEGACY_TXID]) };

let next = 0;
function payment(patch: Partial<WalletPayment> = {}): WalletPayment {
  next += 1;
  return {
    id: `payment-${next}`,
    direction: "receive",
    status: "completed",
    amountSats: 10_000n,
    feeSats: 0n,
    timestamp: SINCE + 100 + next,
    network: "lightning",
    ...patch
  };
}

const due = (payments: WalletPayment[], fiatPercent = 20, since = SINCE, nowSeconds = NOW) =>
  splitDue({ payments, since, nowSeconds, fiatPercent, exclusions });

describe("the split's sale", () => {
  it("writes a sale's checkpoint as its order's oid, and reads no other oid as one", () => {
    // IRREVERSIBLE: the orders made carry it; read back on every device of the owner's.
    expect(splitOid(1_763_164_800)).toBe("sattle-split-1:1763164800");
    expect(splitCheckpointOf("sattle-split-1:1763164800")).toBe(1_763_164_800);
    // A sale of "Sell" (a UUID), no oid, another prefix, a checkpoint out of shape.
    expect(splitCheckpointOf("6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c")).toBeNull();
    expect(splitCheckpointOf(null)).toBeNull();
    expect(splitCheckpointOf("")).toBeNull();
    expect(splitCheckpointOf("sattle-split-2:1763164800")).toBeNull();
    expect(splitCheckpointOf("sattle-split-1:176316480")).toBeNull();
    expect(splitCheckpointOf("sattle-split-1:17631648000")).toBeNull();
    expect(splitCheckpointOf("sattle-split-1:0763164800")).toBeNull();
    expect(splitCheckpointOf("sattle-split-1:1763164800 ")).toBeNull();
    expect(splitCheckpointOf("x sattle-split-1:1763164800")).toBeNull();
    for (const bad of [0, -1, 1.5, 999_999_999, 10_000_000_000, Number.NaN]) {
      expect(() => splitOid(bad)).toThrow(RangeError);
    }
  });

  it("counts the fiat share of what the wallet received since the last sale, rounded down", () => {
    const first = payment({ amountSats: 60_000n, timestamp: SINCE + 10 });
    const second = payment({
      amountSats: 40_001n,
      timestamp: SINCE + 500,
      network: "bitcoin",
      txId: "ef".repeat(32)
    });
    expect(due([second, first])).toEqual({
      receivedSats: 100_001n,
      receipts: 2,
      // 20 % of 100 001 sats: 20 000.2.
      dueSats: 20_000n,
      checkpoint: SINCE + 500
    });
    // The owner's deposit counts as any receipt.
    expect(due([payment({ amountSats: 1n })], 100)).toMatchObject({ dueSats: 1n });
    // A share of nothing to sell is still a count: its checkpoint moves on.
    expect(due([payment({ amountSats: 4n })], 20)).toMatchObject({ dueSats: 0n, receipts: 1 });
    expect(due([first], 0)).toMatchObject({ dueSats: 0n });
    for (const bad of [-1, 101, 20.5, Number.NaN]) {
      expect(() => due([first], bad)).toThrow(RangeError);
    }
  });

  it("counts nothing of before the last sale, and tells when nothing counts", () => {
    const old = payment({ timestamp: SINCE - 1 });
    const edge = payment({ timestamp: SINCE });
    const fresh = payment({ timestamp: SINCE + 1, amountSats: 500n });
    expect(due([old, edge])).toBeNull();
    expect(due([])).toBeNull();
    expect(due([old, edge, fresh])).toEqual({
      receivedSats: 500n,
      receipts: 1,
      dueSats: 100n,
      checkpoint: SINCE + 1
    });
  });

  it("never counts what the wallet sent, a failed receipt, nor a payment twice", () => {
    const sale = payment({ amountSats: 1_000n });
    expect(
      due([
        sale,
        { ...sale },
        payment({ direction: "send" }),
        payment({ status: "failed" }),
        payment({ amountSats: 0n })
      ])
    ).toMatchObject({ receivedSats: 1_000n, receipts: 1 });
  });

  it("leaves out a card's return and the funds migrated from the v2 app", () => {
    const sale = payment({ amountSats: 1_000n });
    // A card's return: a Spark transfer from the card's wallet.
    const cardReturn = payment({ network: "spark", amountSats: 50_000n });
    // A transfer the SDK cannot tell may be one.
    const untold = payment({ network: "unknown", amountSats: 50_000n });
    // The v2 wallet's coins, moved on-chain by the migration.
    const migrated = payment({ network: "bitcoin", txId: LEGACY_TXID, amountSats: 900_000n });
    const deposit = payment({ network: "bitcoin", txId: "cd".repeat(32), amountSats: 2_000n });
    expect(due([sale, cardReturn, untold, migrated, deposit])).toMatchObject({
      receivedSats: 3_000n,
      receipts: 2
    });
    expect(due([cardReturn, untold, migrated])).toBeNull();
    // The transaction as the SDK may spell it: the same one.
    expect(due([{ ...migrated, txId: LEGACY_TXID.toUpperCase() }])).toBeNull();
    // What the v2 server pays to the account's Lightning address, marked by it (LUD-12).
    const payout = payment({ amountSats: 300_000n, senderComment: "sbp-v2-migration" });
    expect(due([sale, payout])).toMatchObject({ receivedSats: 1_000n, receipts: 1 });
    // Any other comment is a payer's: counted.
    const tipped = payment({ amountSats: 2_000n, senderComment: "Thank you!" });
    expect(due([sale, tipped])).toMatchObject({ receivedSats: 3_000n, receipts: 2 });
    // The mark exactly, never a look-alike.
    const near = payment({ amountSats: 4_000n, senderComment: "SBP-V2-MIGRATION" });
    expect(due([sale, near])).toMatchObject({ receivedSats: 5_000n });
  });

  it("stops before a receipt that cannot be told yet, so that no checkpoint passes it", () => {
    const early = payment({ timestamp: SINCE + 10, amountSats: 1_000n });
    const pending = payment({ timestamp: SINCE + 20, status: "pending", amountSats: 7_000n });
    const late = payment({ timestamp: SINCE + 30, amountSats: 2_000n });
    expect(due([late, pending, early])).toEqual({
      receivedSats: 1_000n,
      receipts: 1,
      dueSats: 200n,
      checkpoint: SINCE + 10
    });
    // Completed: counted from the checkpoint the sale carried, with what came after it.
    expect(due([late, { ...pending, status: "completed" }, early], 20, SINCE + 10)).toMatchObject({
      receivedSats: 9_000n,
      checkpoint: SINCE + 30
    });
    // An on-chain receipt without its transaction yet may be the v2 wallet's coins.
    const untold = payment({ timestamp: SINCE + 20, network: "bitcoin", amountSats: 7_000n });
    expect(due([late, untold, early])).toMatchObject({ receivedSats: 1_000n, receipts: 1 });
    expect(due([late, { ...untold, txId: LEGACY_TXID }, early])).toMatchObject({
      receivedSats: 3_000n,
      checkpoint: SINCE + 30
    });
    // A pending payment the split would not count stops nothing.
    const sending = payment({ timestamp: SINCE + 5, status: "pending", direction: "send" });
    const returning = payment({ timestamp: SINCE + 5, status: "pending", network: "spark" });
    expect(due([sending, returning, early, late])).toMatchObject({ receipts: 2 });
    // The only receipt still pending: nothing to propose yet.
    expect(due([pending])).toBeNull();
  });

  it("waits for the current second to end: another receipt may still come in it", () => {
    const now = payment({ timestamp: NOW, amountSats: 1_000n });
    const before = payment({ timestamp: NOW - 1, amountSats: 300n });
    expect(due([now])).toBeNull();
    expect(due([now, before])).toMatchObject({ receivedSats: 300n, checkpoint: NOW - 1 });
    expect(due([now, before], 20, SINCE, NOW + 1)).toMatchObject({
      receivedSats: 1_300n,
      checkpoint: NOW
    });
  });

  it("finds the last sale: the latest checkpoint of an order that was paid", () => {
    const hash = (digit: string) => digit.repeat(64);
    const order = (patch: Partial<SplitOrder>): SplitOrder => ({
      oid: null,
      paymentHash: null,
      funded: false,
      ...patch
    });
    const orders = [
      // Paid, as the wallet tells.
      order({ oid: splitOid(SINCE + 100), paymentHash: hash("a") }),
      // Paid, as Mt Pelerin tells (a device that does not hold the payment yet).
      order({ oid: splitOid(SINCE + 200), funded: true }),
      // Quoted, never paid: it sold nothing.
      order({ oid: splitOid(SINCE + 900), paymentHash: hash("b") }),
      order({ oid: splitOid(SINCE + 950) }),
      // A sale of "Sell", paid: not the split's.
      order({ oid: "6f1d2c3b-4a59-4e68-9d7c-8b6a5f4e3d2c", paymentHash: hash("c"), funded: true })
    ];
    const paid = paidHashes([
      payment({ direction: "send", paymentHash: hash("A") }),
      payment({ direction: "send", paymentHash: hash("c") }),
      // A payment that failed paid nothing; a receipt of that hash is no payment.
      payment({ direction: "send", status: "failed", paymentHash: hash("b") }),
      payment({ direction: "receive", paymentHash: hash("b") })
    ]);
    expect(paid).toEqual(new Set([hash("a"), hash("c")]));
    expect(lastSplitCheckpoint(orders, paid)).toBe(SINCE + 200);
    expect(lastSplitCheckpoint(orders.slice(0, 1), paid)).toBe(SINCE + 100);
    expect(lastSplitCheckpoint(orders.slice(2), paid)).toBeNull();
    expect(lastSplitCheckpoint([], paid)).toBeNull();
    // Still being paid: its receipts are not proposed again meanwhile.
    const paying = paidHashes([
      payment({ direction: "send", status: "pending", paymentHash: hash("b") })
    ]);
    expect(lastSplitCheckpoint(orders, paying)).toBe(SINCE + 900);
  });
});
