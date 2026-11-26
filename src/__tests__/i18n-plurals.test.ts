import i18n from "@/i18n";
import { LANGUAGES } from "@/i18n/languages";
import fr from "@/i18n/locales/fr";

/*
 * Counted texts ("3 payments") in every language of the app, whatever the count.
 *
 * The translations give each counted text its `_one` and `_other` forms only. Current CLDR, which
 * i18next reads through `Intl.PluralRules`, gives French, Spanish, Italian and Portuguese a third
 * form, "many", for whole millions: up to i18next 26, 1,000,000 payments found no text in these
 * languages and showed the fallback language's (English), or the key. Since i18next 27.1 a missing
 * form takes the language's own `_other` (CLDR's fallback), which this test holds.
 */

/** The keys of the counted texts, from the French source (`cards.payees.payments`). */
function countedKeys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string")
      return key.endsWith("_other") ? [path.slice(0, -"_other".length)] : [];
    return countedKeys(value as object, path);
  });
}

const COUNTED = countedKeys(fr);

/** Counts of each CLDR form of these languages: zero, one, other, and whole millions ("many"). */
const COUNTS = [0, 1, 2, 5, 21, 1_000_000, 2_000_000, 1_000_000_000];

/** A counted text in one language, without falling back to another one: the key when it has none. */
function counted(language: string, key: string, count: number): string {
  // Dynamic keys: the typed `t` only takes the French source's literal keys.
  const t = i18n.t.bind(i18n) as unknown as (key: string, options: object) => string;
  return t(key, { lng: language, count, fallbackLng: false });
}

describe("counted texts", () => {
  it("are found in the French source", () => {
    expect(COUNTED.length).toBeGreaterThan(10);
  });

  it('know the "many" form of French, Spanish, Italian and Portuguese', () => {
    for (const language of ["fr", "es", "it", "pt"]) {
      expect(new Intl.PluralRules(language).select(1_000_000)).toBe("many");
    }
  });

  it.each([...LANGUAGES])("have a text of their own language for every count in %s", (language) => {
    for (const key of COUNTED) {
      for (const count of COUNTS) {
        expect({ key, count, text: counted(language, key, count) }).not.toEqual({
          key,
          count,
          text: key
        });
      }
    }
  });

  it("use the language's own `_other` form for a whole million, not English's", () => {
    // French's and Spanish's own texts: the count as given, formatted by no one.
    expect(i18n.getFixedT("fr")("cards.payees.payments", { count: 1_000_000 })).toBe(
      "1000000 paiements"
    );
    expect(i18n.getFixedT("es")("cards.payees.payments", { count: 2_000_000 })).toBe(
      "2000000 pagos"
    );
  });
});
