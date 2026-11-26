import { ARTICLE_NAME_MAX_LENGTH } from "@/config/catalog";
import type { LineDraft } from "@/features/invoices/form";
import { createLineSaves } from "@/features/invoices/line-saves";
import { isArticleOf, lineArticle, sameName } from "@/features/invoices/SaveToCatalog";
import type { Article } from "@/lib/catalog/article";

/*
 * What "Save to my items" would add from a line typed by hand (SaveToCatalog.tsx),
 * and when the catalogue holds it already. The flow itself: invoice-flow.test.tsx.
 */

const CHF = { code: "CHF", digits: 2 };

function line(patch: Partial<LineDraft> = {}): LineDraft {
  return { key: "a", name: "Chicken skewer", quantity: "1", price: "5", vat: "8.1", ...patch };
}

function article(patch: Partial<Article> = {}): Article {
  return {
    version: 1,
    id: "0".repeat(32),
    name: "Chicken skewer",
    description: "",
    price: { minor: 500, digits: 2, currency: "CHF" },
    image: null,
    barcode: null,
    createdAt: 1790000000,
    updatedAt: 1790000000,
    ...patch
  };
}

describe("lineArticle", () => {
  it("reads the name trimmed and the unit price in minor units", () => {
    expect(lineArticle(line({ name: "  Chicken skewer ", price: "5.5" }), CHF)).toEqual({
      name: "Chicken skewer",
      priceMinor: 550
    });
  });

  it("gives nothing for a line that is not whole", () => {
    expect(lineArticle(line({ name: "   " }), CHF)).toBeNull();
    expect(lineArticle(line({ price: "" }), CHF)).toBeNull();
    expect(lineArticle(line({ price: "5.555" }), CHF)).toBeNull();
    expect(lineArticle(line({ quantity: "" }), CHF)).toBeNull();
    expect(lineArticle(line({ vat: "120" }), CHF)).toBeNull();
  });

  it("never saves a name an article cannot hold whole", () => {
    const longest = "x".repeat(ARTICLE_NAME_MAX_LENGTH);
    expect(lineArticle(line({ name: longest }), CHF)?.name).toBe(longest);
    expect(lineArticle(line({ name: `${longest}x` }), CHF)).toBeNull();
  });

  it("never reads a price on a scale other than its currency's", () => {
    expect(lineArticle(line(), { code: "CHF", digits: 0 })).toBeNull();
    expect(lineArticle(line({ price: "500" }), { code: "JPY", digits: 0 })).toEqual({
      name: "Chicken skewer",
      priceMinor: 500
    });
  });
});

describe("sameName and isArticleOf", () => {
  it("compares names trimmed, whatever their case", () => {
    expect(sameName(" chicken SKEWER", "Chicken skewer ")).toBe(true);
    expect(sameName("Chicken skewer", "Turkey skewer")).toBe(false);
    expect(sameName("Zu\u0308rich", "zürich")).toBe(true);
  });

  it("holds an article the same only at the same price in the invoice's currency", () => {
    const typed = { name: "chicken skewer", priceMinor: 500 };
    expect(isArticleOf(article(), typed, CHF)).toBe(true);
    expect(isArticleOf(article(), { ...typed, priceMinor: 501 }, CHF)).toBe(false);
    expect(
      isArticleOf(article({ price: { minor: 500, digits: 2, currency: "EUR" } }), typed, CHF)
    ).toBe(false);
    expect(isArticleOf(article({ name: "Skewer" }), typed, CHF)).toBe(false);
  });
});

describe("createLineSaves", () => {
  it("runs one save at a time", () => {
    const lineSaves = createLineSaves();
    expect(lineSaves.start("a")).toBe(true);
    expect(lineSaves.start("b")).toBe(false);
    expect(lineSaves.current().running).toBe("a");
    lineSaves.finish();
    expect(lineSaves.current().running).toBeNull();
  });

  it("forgets a failed save once the line saved, and what a line removed left", () => {
    const lineSaves = createLineSaves();
    const listener = jest.fn();
    lineSaves.subscribe(listener);
    lineSaves.setPending("a", { attempt: article(), existing: null, versions: [], known: [] });
    lineSaves.setSaved("a", article());
    expect(lineSaves.current().pending.has("a")).toBe(false);
    lineSaves.setPending("c", { attempt: article(), existing: null, versions: [], known: [] });
    const before = lineSaves.current();
    lineSaves.forget("a");
    lineSaves.forget("c");
    expect(lineSaves.current().saved.has("a")).toBe(false);
    expect(lineSaves.current().pending.has("c")).toBe(false);
    // A new state at each change: what a render read stays as it was.
    expect(before.saved.has("a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(5);
    lineSaves.forget("c");
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
