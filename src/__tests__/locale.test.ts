import { hasFlag } from "@/components/ui/Flag";
import { LANGUAGES, LANGUAGE_NAMES, documentLocale, toLanguage } from "@/i18n/languages";
import { groupCountries, listCountries, searchCountries } from "@/lib/countries";
import { dateTimeFormat, formatDate, formatDateCapitalized, withYear } from "@/lib/locale/date";
import { formatDecimal, formatPercent, formatPercentParts } from "@/lib/locale/format";

describe("formatPercent", () => {
  it("follows the device locale for the decimal separator and spacing", () => {
    // CLDR: Swiss locales write "1,5%" / "1.5%" with no space, kept as is even though the design
    // shows "1,5 %". France and Germany add a no-break space (U+00A0 with the ICU of
    // the Node version in .nvmrc), matched by \s.
    expect(formatPercent(1.5, "fr-CH")).toBe("1,5%");
    expect(formatPercent(1.5, "de-CH")).toBe("1.5%");
    expect(formatPercent(1.5, "it-CH")).toBe("1.5%");
    expect(formatPercent(1.5, "fr-FR")).toMatch(/^1,5\s%$/u);
    expect(formatPercent(1.5, "de-DE")).toMatch(/^1,5\s%$/u);
    expect(formatPercent(1.5, "en-US")).toBe("1.5%");
    expect(formatPercent(60, "fr-CH")).toBe("60%");
  });

  it("does not throw on a malformed locale tag", () => {
    expect(formatPercent(40, "en-US@posix")).toMatch(/^40\s?%$/u);
  });
});

describe("formatDecimal", () => {
  it("follows the device locale, without trailing zeros", () => {
    expect(formatDecimal(1.34, 2, "fr-CH")).toBe("1,34");
    expect(formatDecimal(1.34, 2, "de-CH")).toBe("1.34");
    expect(formatDecimal(1.5, 2, "fr-CH")).toBe("1,5");
    expect(formatDecimal(8, 2, "fr-CH")).toBe("8");
    expect(formatDecimal(1.345, 1, "en-US")).toBe("1.3");
  });
});

describe("withYear", () => {
  it("adds the year to a date of another year only", () => {
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    const now = new Date();
    expect(withYear(options, now)).toBe(options);
    const before = new Date(now.getFullYear() - 1, 9, 15);
    expect(withYear(options, before)).toEqual({ ...options, year: "numeric" });
    expect(formatDate(before, "fr-CH", withYear(options, before))).toBe(
      `15 oct. ${now.getFullYear() - 1}`
    );
  });
});

describe("formatDate", () => {
  // Wednesday 30 September 2026, 14:32 in the time zone of the tests.
  const date = new Date(2026, 8, 30, 14, 32);

  it("follows the device locale, the words between the date and the time included", () => {
    const short: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
    expect(formatDate(date, "fr-CH", short)).toBe("30.09");
    expect(formatDate(date, "fr-FR", short)).toBe("30/09");
    expect(formatDate(date, "de-CH", short)).toBe("30.09.");
    const full: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    };
    expect(formatDate(date, "fr-CH", full)).toBe("mercredi 30 septembre à 14:32");
    expect(formatDate(date, "de-CH", full)).toBe("Mittwoch, 30. September um 14:32");
  });

  it("capitalizes the first letter only", () => {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
    expect(formatDateCapitalized(date, "fr-CH", options)).toBe("Mercredi 30 septembre");
    expect(formatDateCapitalized(date, "de-CH", options)).toBe("Mittwoch, 30. September");
  });

  it("shares one formatter per locale and options", () => {
    const options = { hour: "2-digit", minute: "2-digit" } as const;
    expect(dateTimeFormat("fr-CH", options)).toBe(dateTimeFormat("fr-CH", { ...options }));
    expect(dateTimeFormat("fr-CH", options)).not.toBe(dateTimeFormat("de-CH", options));
    expect(dateTimeFormat("fr-CH", options)).not.toBe(
      dateTimeFormat("fr-CH", { ...options, second: "2-digit" })
    );
  });

  it("does not throw on a malformed locale tag", () => {
    expect(formatDate(date, "en-US@posix", { hour: "2-digit", minute: "2-digit" })).toMatch(/32/);
  });

  it("does not throw on an invalid date nor on options the engine refuses", () => {
    const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
    expect(formatDate(new Date(NaN), "fr-CH", time)).toBe("Invalid Date");
    expect(formatDateCapitalized(new Date(NaN), "fr-CH", time)).toBe("Invalid Date");
    // dateStyle with a field of its own: a TypeError in every engine.
    const refused = { dateStyle: "short", hour: "2-digit" } as Intl.DateTimeFormatOptions;
    expect(dateTimeFormat("fr-CH", refused)).toBeNull();
    expect(formatDate(date, "fr-CH", refused)).toBe(date.toLocaleString());
    // The default text keeps to the fields asked: a time alone, a date alone.
    const refusedTime = { timeStyle: "short", hour: "2-digit" } as Intl.DateTimeFormatOptions;
    expect(formatDate(date, "fr-CH", refusedTime)).toBe(date.toLocaleTimeString());
    const refusedDay = { dateStyle: "short", day: "2-digit" } as Intl.DateTimeFormatOptions;
    expect(formatDate(date, "fr-CH", refusedDay)).toBe(date.toLocaleDateString());
  });
});

describe("formatPercentParts", () => {
  it("splits the figure from the percent sign, which joins back into formatPercent", () => {
    expect(formatPercentParts(70, "fr-CH")).toEqual([
      { text: "70", number: true },
      { text: "%", number: false }
    ]);
    const parts = formatPercentParts(70, "fr-FR");
    expect(parts.map(({ number }) => number)).toEqual([true, false]);
    expect(parts[1].text).toMatch(/^\s%$/u);
    for (const tag of ["fr-CH", "fr-FR", "de-DE", "en-US", "tr-TR"]) {
      expect(
        formatPercentParts(1.5, tag)
          .map(({ text }) => text)
          .join("")
      ).toBe(formatPercent(1.5, tag));
    }
  });

  it("keeps the locale's order: the sign first in Turkish", () => {
    expect(formatPercentParts(30, "tr-TR")).toEqual([
      { text: "%", number: false },
      { text: "30", number: true }
    ]);
  });
});

describe("toLanguage", () => {
  it("maps device languages to the UI languages, English otherwise", () => {
    expect(toLanguage("fr")).toBe("fr");
    expect(toLanguage("de-CH")).toBe("de-CH");
    expect(toLanguage("de-DE")).toBe("de");
    expect(toLanguage("pt_BR")).toBe("pt");
    expect(toLanguage("ja")).toBe("en");
    expect(toLanguage(null)).toBe("en");
  });
});

describe("documentLocale", () => {
  it("is the device's own for a document in the device's language", () => {
    expect(documentLocale("fr", "fr-CH")).toBe("fr-CH");
    expect(documentLocale("de-CH", "de-CH")).toBe("de-CH");
    expect(documentLocale("de", "de-AT")).toBe("de-AT");
  });

  it("writes another language in the device's region", () => {
    expect(documentLocale("en", "fr-CH")).toBe("en-CH");
    expect(documentLocale("it", "de-CH")).toBe("it-CH");
    expect(documentLocale("fr", "en")).toBe("fr");
  });

  it("lets German's variant decide its own region", () => {
    expect(documentLocale("de-CH", "fr-FR")).toBe("de-CH");
    // German (Germany's) on a Swiss or Liechtenstein phone.
    expect(documentLocale("de", "fr-CH")).toBe("de-DE");
    expect(documentLocale("de", "de-LI")).toBe("de-DE");
    expect(documentLocale("de", "en-US")).toBe("de-US");
  });

  it("names every language by its own name", () => {
    expect(Object.keys(LANGUAGE_NAMES)).toEqual([...LANGUAGES]);
    expect(LANGUAGE_NAMES["de-CH"]).toBe("Deutsch (Schweiz)");
  });
});

describe("countries", () => {
  it("lists every country in the UI language, sorted by name", () => {
    const list = listCountries("fr");
    expect(list.length).toBeGreaterThan(240);
    expect(list.slice(0, 3).map((c) => c.name)).toEqual(["Afghanistan", "Afrique du Sud", "Åland"]);
  });

  const codes = (countries: { code: string }[]) => countries.map((c) => c.code);

  it("groups Switzerland and its neighbours first, sorted by name in the UI language", () => {
    const [first, rest] = groupCountries("fr", "CH");
    // Suisse, then Allemagne, Autriche, France, Italie, Liechtenstein.
    expect(codes(first)).toEqual(["CH", "DE", "AT", "FR", "IT", "LI"]);
    // German: Deutschland, Frankreich, Italien, Liechtenstein, Österreich.
    expect(codes(groupCountries("de", "CH")[0])).toEqual(["CH", "DE", "FR", "IT", "LI", "AT"]);
    expect(codes(groupCountries("fr", null)[0])).toEqual(codes(first));
    // Then every other country, once, sorted by name.
    expect(rest).toEqual(listCountries("fr").filter((c) => !codes(first).includes(c.code)));
  });

  it("puts the detected country at the head of the first group, once", () => {
    expect(codes(groupCountries("fr", "ES")[0])).toEqual([
      "ES",
      "CH",
      "DE",
      "AT",
      "FR",
      "IT",
      "LI"
    ]);
    expect(codes(groupCountries("fr", "ES")[1])).not.toContain("ES");
    expect(codes(groupCountries("fr", "FR")[0])).toEqual(["FR", "CH", "DE", "AT", "IT", "LI"]);
    // Not a country code (a region of es-419): ignored.
    expect(codes(groupCountries("fr", "419")[0])).toEqual(["CH", "DE", "AT", "FR", "IT", "LI"]);
    const [first, rest] = groupCountries("fr", "ES");
    expect(first.length + rest.length).toBe(listCountries("fr").length);
  });

  it("searches without case or accents", () => {
    const list = listCountries("fr");
    expect(searchCountries(list, "ETATS-UNIS").map((c) => c.code)).toContain("US");
    expect(searchCountries(list, "allemagne").map((c) => c.code)).toEqual(["DE"]);
    expect(searchCountries(list, "zzz")).toEqual([]);
  });

  it("has a flag for every country of the picker", () => {
    const missing = listCountries("fr")
      .filter((c) => !hasFlag(c.code))
      .map((c) => c.code);
    expect(missing).toEqual([]);
  });
});
