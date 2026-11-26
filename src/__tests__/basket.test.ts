import type { Article } from "@/lib/catalog/article";
import {
  MAX_LINE_QUANTITY,
  articleOfBarcode,
  basketTotal,
  gtinKey,
  changeQuantity,
  keptLines,
  quantityOf,
  unitCount,
  unitPrice,
  type Basket,
  type RateOf
} from "@/lib/terminal/basket";

function article(
  id: string,
  minor: number,
  { currency = "CHF", digits = 2, barcode = null as string | null } = {}
): Article {
  return {
    version: 1,
    id: id.repeat(32).slice(0, 32),
    name: `Article ${id}`,
    description: "",
    price: { minor, digits, currency },
    image: null,
    barcode,
    createdAt: 1_790_000_000,
    updatedAt: 1_790_000_000
  };
}

const CHF = { currency: "CHF", digits: 2 };
// 1 EUR = 0.95 CHF: 47 500 CHF and 50 000 EUR per bitcoin, of one hour's point.
const rates: Record<string, number> = { CHF: 47500, EUR: 50000, JPY: 7_000_000 };
const rateOf: RateOf = (currency) => rates[currency];

describe("basket", () => {
  it("adds, removes and caps units per article, in the order articles were first added", () => {
    const a = article("a", 350);
    const b = article("b", 290);
    let basket: Basket = [];
    basket = changeQuantity(basket, a.id, 1);
    basket = changeQuantity(basket, b.id, 1);
    basket = changeQuantity(basket, a.id, 2);
    expect(basket).toEqual([
      { id: a.id, quantity: 3 },
      { id: b.id, quantity: 1 }
    ]);
    expect(quantityOf(basket, a.id)).toBe(3);
    expect(unitCount(basket)).toBe(4);
    // A line at 0 leaves; removing what is not there changes nothing.
    basket = changeQuantity(basket, b.id, -1);
    expect(basket).toEqual([{ id: a.id, quantity: 3 }]);
    expect(changeQuantity(basket, b.id, -1)).toBe(basket);
    expect(changeQuantity(basket, a.id, 5000)).toEqual([{ id: a.id, quantity: MAX_LINE_QUANTITY }]);
  });

  it("totals the lines exactly, in integer minor units", () => {
    const a = article("a", 350);
    const b = article("b", 290);
    const basket: Basket = [
      { id: a.id, quantity: 2 },
      { id: b.id, quantity: 1 }
    ];
    expect(basketTotal(basket, [a, b], CHF, rateOf)).toEqual({
      status: "ok",
      minor: 990,
      units: 3
    });
    // An article left the catalogue: its line counts for nothing, and leaves the basket.
    expect(basketTotal(basket, [a], CHF, rateOf)).toEqual({ status: "ok", minor: 700, units: 2 });
    expect(keptLines(basket, [a])).toEqual([{ id: a.id, quantity: 2 }]);
    expect(keptLines(basket, [a, b])).toBe(basket);
  });

  it("converts an article of another currency at both rates, to the nearest minor unit, half up", () => {
    // 3,00 EUR × 0,95 = 2,85 CHF exactly.
    expect(unitPrice(article("e", 300, { currency: "EUR" }), CHF, rateOf)).toBe(285);
    // 3,33 EUR × 0,95 = 3,1635 → 3,16; 3,35 EUR × 0,95 = 3,1825 → 3,18.
    expect(unitPrice(article("e", 333, { currency: "EUR" }), CHF, rateOf)).toBe(316);
    expect(unitPrice(article("e", 335, { currency: "EUR" }), CHF, rateOf)).toBe(318);
    // 0,10 EUR × 0,95 = 0,095: half a centime, up.
    expect(unitPrice(article("e", 10, { currency: "EUR" }), CHF, rateOf)).toBe(10);
    // 0,09 EUR × 0,95 = 0,0855 → 0,09; 0,01 EUR × 0,95 = 0,0095 → 0,01.
    expect(unitPrice(article("e", 9, { currency: "EUR" }), CHF, rateOf)).toBe(9);
    expect(unitPrice(article("e", 1, { currency: "EUR" }), CHF, rateOf)).toBe(1);
    // A currency without decimals: 700 JPY at 7 000 000 JPY and 47 500 CHF per bitcoin = 4,75 CHF.
    expect(unitPrice(article("j", 700, { currency: "JPY", digits: 0 }), CHF, rateOf)).toBe(475);
    // A line is the unit price times its quantity, never the converted line.
    const e = article("e", 333, { currency: "EUR" });
    expect(basketTotal([{ id: e.id, quantity: 3 }], [e], CHF, rateOf)).toEqual({
      status: "ok",
      minor: 948,
      units: 3
    });
  });

  it("fixes no amount without a rate of an article's currency", () => {
    const e = article("e", 300, { currency: "USD" });
    expect(unitPrice(e, CHF, rateOf)).toBeUndefined();
    expect(basketTotal([{ id: e.id, quantity: 1 }], [e], CHF, rateOf)).toEqual({
      status: "noRate"
    });
    // The point of sale's own currency needs no rate.
    const c = article("c", 300);
    expect(unitPrice(c, CHF, () => undefined)).toBe(300);
  });

  it("charges no more than the keypad's largest amount", () => {
    const a = article("a", 9_999_999);
    expect(basketTotal([{ id: a.id, quantity: 1 }], [a], CHF, rateOf)).toEqual({
      status: "ok",
      minor: 9_999_999,
      units: 1
    });
    expect(basketTotal([{ id: a.id, quantity: 2 }], [a], CHF, rateOf)).toEqual({
      status: "tooLarge"
    });
  });

  it("finds the article of a barcode", () => {
    const a = article("a", 350, { barcode: "7610097111072" });
    const b = article("b", 290);
    expect(articleOfBarcode([b, a], "7610097111072")).toBe(a);
    expect(articleOfBarcode([b, a], "4006381333931")).toBeUndefined();
  });

  it("finds it whatever leading zeros the code is read with: the same GTIN", () => {
    // A UPC-A, as Android reads it (12 digits) and as an EAN-13 (iOS reads that one without its 0).
    const upc = article("a", 590, { barcode: "012345678905" });
    const ean = article("b", 290, { barcode: "0012345678905" });
    expect(articleOfBarcode([upc], "0012345678905")).toBe(upc);
    expect(articleOfBarcode([ean], "012345678905")).toBe(ean);
    // An EAN-8 is a GTIN of its own, never the EAN-13 that ends alike.
    const short = article("c", 150, { barcode: "96385074" });
    expect(articleOfBarcode([short], "1234596385074")).toBeUndefined();
    expect(articleOfBarcode([short], "0000096385074")).toBe(short);
    expect(gtinKey("96385074")).toBe("00000096385074");
    expect(gtinKey("7610097111072")).toBe("07610097111072");
  });
});
