import i18n, { resources } from "@/i18n";
import { LANGUAGES, baseLanguage, toLanguage } from "@/i18n/languages";
import de from "@/i18n/locales/de";
import deCH, { SWISS_WORDINGS } from "@/i18n/locales/de-CH";
import { swissSpelling } from "@/i18n/swiss-spelling";
import { getCountryName, listCountries } from "@/lib/countries";

/*
 * German in its two variants (src/i18n/locales/de-CH.ts): "de" as Germany and Austria write it,
 * "de-CH" as Switzerland and Liechtenstein do, picked by the device's region.
 */

/** Every text of a translation, by its key ("cards.sheet.close"). */
function texts(tree: object, prefix = ""): [key: string, text: string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "string" ? [[path, value] as [string, string]] : texts(value, path);
  });
}

/** Every Swiss wording, by its key. */
function wordings(tree: object, prefix = ""): [key: string, german: string, swiss: string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return Array.isArray(value)
      ? [[path, value[0], value[1]] as [string, string, string]]
      : wordings(value as object, path);
  });
}

const GERMAN = new Map(texts(de));
const SWISS = new Map(texts(deCH));

/** What only Germany writes: ß, „ “ and ‚ ‘. */
const GERMANY_ONLY = /[ßẞ„“‚‘]/;

/**
 * What only Switzerland writes, which de.ts must not: ss where Germany writes ß (the stems of the
 * app's words), guillemets (› stands alone between a screen and its part: "Wallet › Export"),
 * Swiss words and the apostrophe grouping digits.
 */
const SWITZERLAND_ONLY = [
  /schliess|gröss|\bgross|strasse|dreissig|ausser|äusser|heiss|gemäss|mässig|grüss/i,
  /[«»‹]/,
  /\binnert\b/i,
  /\bLimite/,
  /\bMWST\b(?!-Nummer)/,
  /\bNormalsatz\b/,
  /\bTotal\b/,
  /\d'\d{3}/
];

/** The interpolations and nested keys of a text: a wording keeps them all. */
const placeholders = (text: string) => (text.match(/\{\{[^}]+\}\}|\$t\([^)]+\)/g) ?? []).sort();

describe("the app's German variants", () => {
  it("follow the device's region: Switzerland and Liechtenstein write Swiss German", () => {
    expect(toLanguage("de-CH")).toBe("de-CH");
    expect(toLanguage("de_CH")).toBe("de-CH");
    expect(toLanguage("de-ch")).toBe("de-CH");
    expect(toLanguage("de-LI")).toBe("de-CH");
    expect(toLanguage("de-Latn-CH")).toBe("de-CH");
    expect(toLanguage("de-DE")).toBe("de");
    expect(toLanguage("de-AT")).toBe("de");
    expect(toLanguage("de-LU")).toBe("de");
    expect(toLanguage("de")).toBe("de");
    // Another language of Switzerland stays itself, Romansh is not spoken by the app.
    expect(toLanguage("fr-CH")).toBe("fr");
    expect(toLanguage("it-CH")).toBe("it");
    expect(toLanguage("rm-CH")).toBe("en");
    expect(baseLanguage("de-CH")).toBe("de");
    expect(baseLanguage("fr")).toBe("fr");
  });

  it("are both languages of the app, each with all its texts", () => {
    expect(LANGUAGES).toEqual(expect.arrayContaining(["de", "de-CH"]));
    expect(Object.keys(resources)).toEqual([...LANGUAGES]);
    expect([...SWISS.keys()]).toEqual([...GERMAN.keys()]);
    expect(i18n.getFixedT("de-CH")("cards.sheet.close")).toBe("Schliessen");
    expect(i18n.getFixedT("de")("cards.sheet.close")).toBe("Schließen");
    expect(i18n.getFixedT("de-CH")("invoices.lines.vat")).toBe("MWST");
    expect(i18n.getFixedT("de")("invoices.lines.vat")).toBe("MwSt.");
  });

  it("write no ß nor German quotation marks in Swiss German", () => {
    for (const [key, text] of SWISS) {
      if (GERMANY_ONLY.test(text)) throw new Error(`de-CH ${key}: ${text}`);
    }
  });

  it("write Swiss German as German in Swiss spelling, but for Switzerland's own words", () => {
    const own = new Map(wordings(SWISS_WORDINGS).map(([key, , swiss]) => [key, swiss]));
    for (const [key, german] of GERMAN) {
      expect([key, SWISS.get(key)]).toEqual([key, own.get(key) ?? swissSpelling(german)]);
    }
  });

  it("write German as Germany does: no Swiss spelling, guillemets nor Swiss words", () => {
    for (const [key, text] of GERMAN) {
      for (const swiss of SWITZERLAND_ONLY) {
        if (swiss.test(text.replace(/ › /g, " "))) throw new Error(`de ${key}: ${text}`);
      }
    }
  });

  it("open and close each German quotation in the same text", () => {
    for (const [key, text] of GERMAN) {
      const marks = text.replace(/[^„“‚‘]/g, "");
      if (!/^(?:„(?:‚‘)*“|‚‘)*$/.test(marks)) throw new Error(`de ${key}: ${text}`);
    }
  });

  it("write each Swiss wording for the German text it replaces, keeping its placeholders", () => {
    for (const [key, german, swiss] of wordings(SWISS_WORDINGS)) {
      // A German text changed in de.ts: its Swiss wording is to be written again.
      expect([key, GERMAN.get(key)]).toEqual([key, german]);
      // A wording says more than Swiss spelling, in Swiss spelling.
      expect([key, swiss]).not.toEqual([key, swissSpelling(german)]);
      expect([key, GERMANY_ONLY.test(swiss)]).toEqual([key, false]);
      expect([key, placeholders(swiss)]).toEqual([key, placeholders(german)]);
    }
  });

  it("name countries in Swiss spelling in Swiss German", () => {
    expect(getCountryName("CH", "de-CH")).toBe("Schweiz");
    expect(getCountryName("DE", "de-CH")).toBe("Deutschland");
    const german = listCountries("de");
    const swiss = listCountries("de-CH");
    expect(swiss.map(({ code }) => code).sort()).toEqual(german.map(({ code }) => code).sort());
    for (const { code, name } of swiss) {
      expect(name).not.toMatch(GERMANY_ONLY);
      expect(name).toBe(swissSpelling(getCountryName(code, "de")));
    }
  });

  it("spell ß as ss and quote with guillemets in Swiss spelling", () => {
    expect(swissSpelling("„Schließen“ ‚außen‘ STRAẞE geht’s")).toBe(
      "«Schliessen» ‹aussen› STRASSE geht’s"
    );
  });
});
