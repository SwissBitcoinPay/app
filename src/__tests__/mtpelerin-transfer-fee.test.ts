import { readDecimal, type MtpDecimal } from "@/lib/mtpelerin/decimal";
import {
  heldMinor,
  receivedMinor,
  transferFeeMinor,
  type ChfSide
} from "@/lib/mtpelerin/transfer-fee";

/*
 * Mt Pelerin's transfer fee of a sale wired at once (src/lib/mtpelerin/transfer-fee.ts): 1 CHF, EUR
 * or GBP, or the equivalent of 1 CHF, below the equivalent of 50 CHF; none for a deferred sell.
 * Its estimate and its order leave it out (Mt Pelerin's dev/test environment): the app takes it
 * from what is received.
 */

function dec(text: string): MtpDecimal {
  const read = readDecimal(text);
  if (read === null) throw new Error(`Not a decimal: ${text}`);
  return read;
}

/** A price of 1 sat in CHF, as Mt Pelerin's dev/test environment gives one. */
const CHF_RATE = dec("0.00054337");

function chf(wired: string, rate: MtpDecimal | null = CHF_RATE): ChfSide {
  return { wired: dec(wired), rate };
}

describe("Mt Pelerin's transfer fee", () => {
  it("takes 1 CHF of a sale in CHF wired at once below 50 CHF, none from 50 CHF on", () => {
    const fee = (wired: string) =>
      transferFeeMinor({ deferred: false, currency: "CHF", rate: CHF_RATE, chf: chf(wired) });
    // The owner's case: 3 CHF sold at once.
    expect(fee("3.01")).toBe(100);
    expect(fee("0")).toBe(100);
    expect(fee("49.99")).toBe(100);
    // Its centimes rounded down, as what is wired is shown: 49.999 is below 50.
    expect(fee("49.999")).toBe(100);
    expect(fee("50")).toBe(0);
    expect(fee("50.00")).toBe(0);
    expect(fee("843.21")).toBe(0);
    // Past what a number holds: far above the threshold.
    expect(fee("999999999999999")).toBe(0);
  });

  it("takes none of a deferred sell, whatever its amount, its francs read or not", () => {
    expect(
      transferFeeMinor({ deferred: true, currency: "CHF", rate: CHF_RATE, chf: chf("3.01") })
    ).toBe(0);
    expect(transferFeeMinor({ deferred: true, currency: "JPY", rate: null, chf: null })).toBe(0);
  });

  it("takes 1 EUR or 1 GBP below the equivalent of 50 CHF, told in francs", () => {
    const fee = (currency: string, chfWired: string) =>
      transferFeeMinor({ deferred: false, currency, rate: dec("0.00058"), chf: chf(chfWired) });
    // 51 EUR may be below 50 CHF: the francs decide, never the amount in euros.
    expect(fee("EUR", "47.90")).toBe(100);
    expect(fee("EUR", "50.00")).toBe(0);
    expect(fee("GBP", "12.00")).toBe(100);
    expect(fee("GBP", "60.00")).toBe(0);
  });

  it("takes the equivalent of 1 CHF in another currency, rounded up", () => {
    // 1 sat = 0.00054337 CHF = 0.0006 USD: 1 CHF = 1.10422… USD, so 1.11 USD.
    expect(
      transferFeeMinor({
        deferred: false,
        currency: "USD",
        rate: dec("0.0006"),
        chf: chf("10.00")
      })
    ).toBe(111);
    // In yen, without decimals: 1 sat = 0.0855 JPY, 1 CHF = 157.35… JPY, so 158 JPY.
    expect(
      transferFeeMinor({
        deferred: false,
        currency: "JPY",
        rate: dec("0.0855"),
        chf: chf("10.00")
      })
    ).toBe(158);
    // At the same price as the franc: exactly 1.00.
    expect(
      transferFeeMinor({ deferred: false, currency: "SEK", rate: CHF_RATE, chf: chf("10.00") })
    ).toBe(100);
    // From the threshold on: none, even without a rate.
    expect(
      transferFeeMinor({ deferred: false, currency: "USD", rate: null, chf: chf("50.00") })
    ).toBe(0);
  });

  it("cannot tell the fee without the francs, or without the prices it needs", () => {
    expect(transferFeeMinor({ deferred: false, currency: "CHF", rate: CHF_RATE, chf: null })).toBe(
      null
    );
    expect(
      transferFeeMinor({ deferred: false, currency: "USD", rate: null, chf: chf("10.00") })
    ).toBeNull();
    expect(
      transferFeeMinor({
        deferred: false,
        currency: "USD",
        rate: dec("0.0006"),
        chf: chf("10.00", null)
      })
    ).toBeNull();
    expect(
      transferFeeMinor({
        deferred: false,
        currency: "USD",
        rate: dec("0.0006"),
        chf: chf("10.00", dec("0"))
      })
    ).toBeNull();
    // A fee of 1 of the sale's own currency needs no price.
    expect(
      transferFeeMinor({ deferred: false, currency: "EUR", rate: null, chf: chf("10.00", null) })
    ).toBe(100);
  });

  it("tells what is received: what Mt Pelerin wires, rounded down, less the fee, never below 0", () => {
    expect(receivedMinor(dec("3.01"), "CHF", 100)).toBe(201);
    expect(receivedMinor(dec("3.019"), "CHF", 100)).toBe(201);
    expect(receivedMinor(dec("843.21"), "CHF", 0)).toBe(84_321);
    expect(receivedMinor(dec("0.80"), "CHF", 100)).toBe(0);
    expect(receivedMinor(dec("8.32"), "JPY", 1)).toBe(7);
    expect(receivedMinor(dec("999999999999999"), "CHF", 100)).toBeNull();
  });

  it("reads what Mt Pelerin holds for a bank account's deferred sells, rounded down", () => {
    // In the account's currency only.
    const balances = [
      { currency: "CHF", total: dec("137.50") },
      { currency: "EUR", total: dec("12.509") }
    ];
    expect(heldMinor(balances, "CHF")).toBe(13_750);
    expect(heldMinor(balances, "EUR")).toBe(1_250);
    expect(heldMinor([{ currency: "JPY", total: dec("8.9") }], "JPY")).toBe(8);
    // Nothing listed in that currency (dev/test answers `{}`): nothing held, as read.
    expect(heldMinor([], "CHF")).toBe(0);
    expect(heldMinor(balances, "GBP")).toBe(0);
    expect(heldMinor([{ currency: "CHF", total: dec("999999999999999") }], "CHF")).toBeNull();
  });
});
