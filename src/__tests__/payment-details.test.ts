import {
  finalPaidDetails,
  methodOf,
  settledTransactions,
  watchedTransactions
} from "@/features/payment-link/details";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { SaleFinal } from "@/lib/payment-link/final";

import { makeInvoice, preimagePair } from "../../jest/lightning";

const TX_A = "aa".repeat(32);
const TX_B = "bb".repeat(32);
const TX_C = "cc".repeat(32);

/** A Lightning payment of `sats` of a final version (preimage pair `n`). */
function paidInvoice(n: number, sats: bigint): SaleFinal["lightning"][number] {
  const { paymentHash, preimage } = preimagePair(n);
  const invoice = makeInvoice({ amountMsat: sats * 1000n, paymentHash });
  return { invoice, preimage, decoded: decodeBolt11(invoice)!, sats };
}

/** A final version "paid" of `due` sats, by these invoices and transactions. */
function paidFinal(
  due: bigint,
  lightning: SaleFinal["lightning"],
  transactions: { txid: string; receivedAt: number; sats: bigint }[]
): SaleFinal {
  const onchainSats = transactions.reduce((sum, tx) => sum + tx.sats, 0n);
  const lightningSats = lightning.reduce((sum, paid) => sum + paid.sats, 0n);
  return {
    status: "paid",
    received: onchainSats + lightningSats,
    due,
    point: { hour: 1_791_000_000, rate: 50000 },
    lightning,
    onchain:
      transactions.length === 0 ? null : { address: "bc1p", transactions, sats: onchainSats },
    link: "ab".repeat(32),
    accepted: onchainSats + lightningSats < due
  };
}

describe("payment details", () => {
  it("names how it was paid from what proves each part, nothing when nothing does", () => {
    expect(methodOf(true, false)).toBe("lightning");
    expect(methodOf(false, true)).toBe("onchain");
    expect(methodOf(true, true)).toBe("mixed");
    expect(methodOf(false, false)).toBeNull();
  });

  it("lists watched transactions as deep as they are, 3 at most, in the order they came", () => {
    expect(
      watchedTransactions(
        [
          { txid: TX_C, confirmations: 0, receivedAt: null },
          { txid: TX_B, confirmations: 7, receivedAt: 2000 },
          { txid: TX_A, confirmations: 1, receivedAt: 1000 }
        ],
        false
      )
    ).toEqual([
      { txid: TX_A, confirmations: 1, confirmed: false },
      // 3 deep on mempool.space, the second explorer not told yet: still being confirmed.
      { txid: TX_B, confirmations: 3, confirmed: false },
      // Its time not known yet: after the others.
      { txid: TX_C, confirmations: 0, confirmed: false }
    ]);
  });

  it("says a watched transaction confirmed only once both explorers showed it", () => {
    expect(
      watchedTransactions(
        [
          { txid: TX_A, confirmations: 4, receivedAt: 1000 },
          // Paid by Lightning, the address watched still: this one is not that deep.
          { txid: TX_B, confirmations: 1, receivedAt: 2000 }
        ],
        true
      )
    ).toEqual([
      { txid: TX_A, confirmations: 3, confirmed: true },
      { txid: TX_B, confirmations: 1, confirmed: false }
    ]);
  });

  it("never shows a count no watch follows any more: confirmed by both explorers, or not known", () => {
    const txs = [
      { txid: TX_A, confirmations: 3, receivedAt: 1000 },
      { txid: TX_B, confirmations: 1, receivedAt: 2000 }
    ];
    expect(settledTransactions(txs, true)).toEqual([
      { txid: TX_A, confirmations: 3, confirmed: true },
      // Listed after the watch's verdict, never that deep: not one it cross-checked.
      { txid: TX_B, confirmations: null, confirmed: false }
    ]);
    // 3 deep on mempool.space alone: not known either.
    expect(settledTransactions(txs, false)).toEqual([
      { txid: TX_A, confirmations: null, confirmed: false },
      { txid: TX_B, confirmations: null, confirmed: false }
    ]);
  });

  it("says a final version's transactions are confirmed when they paid the sale", () => {
    const details = finalPaidDetails(
      paidFinal(
        49_000n,
        [paidInvoice(1, 9_000n)],
        [
          { txid: TX_B, receivedAt: 2000, sats: 30_000n },
          { txid: TX_A, receivedAt: 1000, sats: 10_000n }
        ]
      ),
      1_790_000_000
    );
    expect(details).toEqual({
      createdAt: 1_790_000_000,
      method: "mixed",
      transactions: [
        { txid: TX_A, confirmations: 3, confirmed: true },
        { txid: TX_B, confirmations: 3, confirmed: true }
      ]
    });
  });

  it("says a final version's transactions are confirmed when the business accepted less", () => {
    const details = finalPaidDetails(
      paidFinal(49_000n, [], [{ txid: TX_A, receivedAt: 1000, sats: 46_550n }]),
      1_790_000_000
    );
    expect(details.method).toBe("onchain");
    expect(details.transactions).toEqual([{ txid: TX_A, confirmations: 3, confirmed: true }]);
  });

  it("knows nothing of the confirmations of a final version its invoices paid alone", () => {
    // Paid at once by Lightning: the transaction sent too was published however deep it was.
    const details = finalPaidDetails(
      paidFinal(
        49_000n,
        [paidInvoice(1, 49_000n)],
        [{ txid: TX_A, receivedAt: 1000, sats: 5_000n }]
      ),
      1_790_000_000
    );
    expect(details.method).toBe("mixed");
    expect(details.transactions).toEqual([{ txid: TX_A, confirmations: null, confirmed: false }]);
  });

  it("lists no transaction of a final version paid over Lightning only", () => {
    const details = finalPaidDetails(
      paidFinal(49_000n, [paidInvoice(1, 49_000n)], []),
      1_790_000_000
    );
    expect(details).toEqual({ createdAt: 1_790_000_000, method: "lightning", transactions: [] });
  });
});
