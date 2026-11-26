import {
  addressGroups,
  dayOf,
  formatSignedFiat,
  groupByDay,
  kindOf,
  pendingBalanceSats,
  pillOf,
  recipientOf,
  referenceOf,
  satsToFiatMinor,
  shortReference,
  signOf,
  titleOf,
  totalsSince
} from "../features/wallet/model";
import type { PendingDeposit, WalletPayment } from "../lib/breez/types";

function payment(overrides: Partial<WalletPayment> = {}): WalletPayment {
  return {
    id: "id-1",
    direction: "receive",
    status: "completed",
    amountSats: 1000n,
    feeSats: 0n,
    timestamp: 1790950000,
    network: "lightning",
    ...overrides
  };
}

describe("satsToFiatMinor", () => {
  it("converts at the rate on integers, rounded half up to the cent", () => {
    // 1 284 530 sats at 94 800 CHF = 1 217,734… CHF.
    expect(satsToFiatMinor(1284530n, 2, 94800)).toBe(121773n);
    // 1 000 sats at 50 000 CHF = 0,50 CHF exactly.
    expect(satsToFiatMinor(1000n, 2, 50000)).toBe(50n);
    // 10 sats at 50 000 CHF = 0,005 CHF, half a cent: up. At 49 999, just under: down.
    expect(satsToFiatMinor(10n, 2, 50000)).toBe(1n);
    expect(satsToFiatMinor(10n, 2, 49999)).toBe(0n);
    // A currency without decimals: 10 sats at 15 000 000 JPY = 1,5 JPY → 2.
    expect(satsToFiatMinor(10n, 0, 15000000)).toBe(2n);
  });

  it("rounds down for a minimum", () => {
    // 10 sats at 50 000 CHF = 0,005 CHF: 0 cent as a minimum, never the half cent above.
    expect(satsToFiatMinor(10n, 2, 50000, "down")).toBe(0n);
    // 1 409 sats at 100 000 CHF = 1,409 CHF: 140 cents as a minimum, 141 to the nearest.
    expect(satsToFiatMinor(1409n, 2, 100000, "down")).toBe(140n);
    expect(satsToFiatMinor(1409n, 2, 100000)).toBe(141n);
  });

  it("reads a rate with decimals exactly", () => {
    // 100 000 000 sats (1 BTC) at 95 123,45 = 9 512 345 cents, no float error.
    expect(satsToFiatMinor(100000000n, 2, 95123.45)).toBe(9512345n);
  });

  it("refuses negative sats", () => {
    expect(() => satsToFiatMinor(-1n, 2, 50000)).toThrow();
  });
});

describe("formatSignedFiat", () => {
  it("writes the sign before the figure, with the true minus sign", () => {
    expect(formatSignedFiat(14220n, 2, "fr-CH", "−")).toBe("−142,20");
    expect(formatSignedFiat(1746n, 2, "fr-CH", "+")).toBe("+17,46");
    expect(formatSignedFiat(5n, 2, "en-US", "")).toBe("0.05");
  });
});

describe("signOf", () => {
  it("is + received, − sent, none for a failed payment", () => {
    expect(signOf(payment())).toBe("+");
    expect(signOf(payment({ direction: "send" }))).toBe("−");
    expect(signOf(payment({ direction: "send", status: "failed" }))).toBe("");
  });
});

describe("totalsSince", () => {
  it("adds the completed payments since the date, fees excluded", () => {
    const since = 1790000000;
    const totals = totalsSince(
      [
        payment({ amountSats: 18420n }),
        payment({ amountSats: 6330n, status: "pending" }),
        payment({ direction: "send", amountSats: 150000n, feeSats: 12n }),
        payment({ direction: "send", amountSats: 50000n, status: "failed" }),
        payment({ amountSats: 999n, timestamp: since - 1 })
      ],
      since
    );
    expect(totals).toEqual({ receivedSats: 18420n, sentSats: 150000n });
  });
});

describe("groupByDay", () => {
  it("groups by local day: today, yesterday, then the dates", () => {
    const now = new Date(2026, 9, 2, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime() / 1000;
    const groups = groupByDay(
      [
        payment({ id: "a", timestamp: at(2, 14) }),
        payment({ id: "b", timestamp: at(2, 0) }),
        payment({ id: "c", timestamp: at(1, 23) }),
        payment({ id: "d", timestamp: new Date(2026, 8, 30, 12).getTime() / 1000 })
      ],
      now
    );
    expect(
      groups.map((g) => [g.when instanceof Date ? "date" : g.when, g.payments.length])
    ).toEqual([
      ["today", 2],
      ["yesterday", 1],
      ["date", 1]
    ]);
    const third = groups[2].when as Date;
    expect([third.getMonth(), third.getDate()]).toEqual([8, 30]);
  });

  it("finds yesterday across a month's start", () => {
    const now = new Date(2026, 9, 1, 9, 0);
    const groups = groupByDay(
      [payment({ timestamp: new Date(2026, 8, 30, 20).getTime() / 1000 })],
      now
    );
    expect(groups[0].when).toBe("yesterday");
  });
});

describe("dayOf", () => {
  it("names a payment's day as its group does", () => {
    const now = new Date(2026, 9, 2, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime() / 1000;
    expect(dayOf(at(2, 0), now)).toBe("today");
    expect(dayOf(at(1, 23), now)).toBe("yesterday");
    const date = dayOf(new Date(2026, 8, 30, 12).getTime() / 1000, now) as Date;
    expect([date.getMonth(), date.getDate()]).toEqual([8, 30]);
  });
});

describe("a payment's row", () => {
  it("is titled by the Lightning address paid, else the description, else its kind", () => {
    expect(
      titleOf(
        payment({
          direction: "send",
          lightningAddress: "bakehouse@wallet.example",
          description: "x"
        })
      )
    ).toEqual({ text: "bakehouse@wallet.example" });
    expect(titleOf(payment({ description: "  Till B  " }))).toEqual({ text: "Till B" });
    expect(titleOf(payment({ description: "   " }))).toEqual({ key: "receipt" });
    expect(titleOf(payment({ direction: "send" }))).toEqual({ key: "sending" });
    expect(titleOf(payment({ network: "bitcoin", description: "x" }))).toEqual({ key: "deposit" });
    expect(titleOf(payment({ network: "bitcoin", direction: "send" }))).toEqual({
      key: "withdrawal"
    });
  });

  it('titles a transfer the SDK cannot tell "Deposit" or "Withdrawal", whatever it carries', () => {
    // The wallet layer gives it no description nor address: were
    // one there, it would still not be its title.
    const unknown = payment({ network: "unknown", description: "x", lightningAddress: "a@b.c" });
    expect(titleOf(unknown)).toEqual({ key: "deposit" });
    expect(titleOf({ ...unknown, direction: "send" })).toEqual({ key: "withdrawal" });
    // No "Type" is said of it, and a pending one is "In progress", never "Confirming".
    expect(kindOf(unknown)).toBeNull();
    expect(pillOf({ ...unknown, status: "pending" })).toEqual({ state: "open", key: "inProgress" });
    expect(referenceOf(unknown)).toBe("id-1");
  });

  it("names its kind", () => {
    expect(kindOf(payment())).toBe("lightningReceipt");
    expect(kindOf(payment({ direction: "send", lightningAddress: "a@b.c" }))).toBe(
      "lightningAddress"
    );
    expect(kindOf(payment({ direction: "send" }))).toBe("lightningInvoice");
    expect(kindOf(payment({ network: "bitcoin" }))).toBe("bitcoinAddress");
    expect(kindOf(payment({ network: "spark" }))).toBe("sparkTransfer");
  });

  it("shows a pill only for a payment that did not complete", () => {
    expect(pillOf(payment())).toBeNull();
    expect(pillOf(payment({ status: "failed" }))).toEqual({ state: "canceled", key: "failed" });
    expect(pillOf(payment({ status: "pending", network: "bitcoin" }))).toEqual({
      state: "unconfirmed",
      key: "confirming"
    });
    expect(pillOf(payment({ status: "pending" }))).toEqual({ state: "open", key: "inProgress" });
  });

  it("is referenced by its payment hash, transaction id, else its id, shortened", () => {
    expect(referenceOf(payment({ paymentHash: "hash", txId: "tx" }))).toBe("hash");
    expect(referenceOf(payment({ txId: "tx" }))).toBe("tx");
    expect(referenceOf(payment())).toBe("id-1");
    expect(shortReference("7f2c04b1aaaaaaaaaaaaaaaae91a")).toBe("7f2c04b1…e91a");
    expect(shortReference("short")).toBe("short");
  });
});

describe("a payment's recipient", () => {
  it("is the address a withdrawal paid, or the Lightning address paid", () => {
    const address = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    expect(
      recipientOf(payment({ direction: "send", network: "bitcoin", destinationAddress: address }))
    ).toEqual({ network: "bitcoin", address });
    expect(recipientOf(payment({ direction: "send", lightningAddress: "a@b.c" }))).toEqual({
      network: "lightning",
      address: "a@b.c"
    });
  });

  it("is none where the SDK gives none to show, and for what came in", () => {
    // A withdrawal without its address (stored before Breez 0.28), an invoice, a Spark transfer.
    expect(recipientOf(payment({ direction: "send", network: "bitcoin", txId: "tx" }))).toBeNull();
    expect(recipientOf(payment({ direction: "send", description: "Flour" }))).toBeNull();
    expect(recipientOf(payment({ direction: "send", network: "spark" }))).toBeNull();
    // A transfer the SDK cannot tell: nothing of its details is proven.
    expect(
      recipientOf(payment({ direction: "send", network: "unknown", lightningAddress: "a@b.c" }))
    ).toBeNull();
    // What came in names no recipient, whatever it carries.
    expect(recipientOf(payment({ lightningAddress: "a@b.c" }))).toBeNull();
    expect(
      recipientOf(payment({ network: "bitcoin", destinationAddress: "bc1qw508d6qejxtdg4y5r3za" }))
    ).toBeNull();
  });

  it("writes a Bitcoin address whole, in groups of 4", () => {
    expect(addressGroups("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(
      "bc1q w508 d6qe jxtd g4y5 r3za rvar y0c5 xw7k v8f3 t4"
    );
    expect(addressGroups("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(
      "3J98 t1Wp EZ73 CNmQ viec rnyi Wrnq RhWN Ly"
    );
    expect(addressGroups("")).toBe("");
  });
});

describe("pendingBalanceSats", () => {
  const deposit = (amountSats: bigint, mature: boolean, vout = 0): PendingDeposit => ({
    txid: "ab".repeat(32),
    vout,
    amountSats,
    mature,
    waitsForFees: true
  });

  it("adds up the least each confirmed deposit will add, net of the most its claim takes", () => {
    // 1 500 − 99 and 2 000 − 99: what the balance gains at least, whatever paid them.
    expect(pendingBalanceSats([deposit(1500n, true), deposit(2000n, true, 1)], 99n)).toBe(3302n);
    // Not confirmed yet: not told, as their rows.
    expect(pendingBalanceSats([deposit(1500n, true), deposit(9000n, false, 1)], 99n)).toBe(1401n);
    expect(pendingBalanceSats([deposit(9000n, false)], 99n)).toBe(0n);
    expect(pendingBalanceSats([], 99n)).toBe(0n);
  });

  it("adds nothing for a deposit its claim would leave nothing of", () => {
    expect(pendingBalanceSats([deposit(99n, true)], 99n)).toBe(0n);
    expect(pendingBalanceSats([deposit(50n, true), deposit(100n, true, 1)], 99n)).toBe(1n);
  });

  it("tells nothing while the deposits are not read", () => {
    expect(pendingBalanceSats(null, 99n)).toBeNull();
  });
});
