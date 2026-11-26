import countries from "i18n-iso-countries";
import de from "i18n-iso-countries/langs/de.json";
import en from "i18n-iso-countries/langs/en.json";
import es from "i18n-iso-countries/langs/es.json";
import fi from "i18n-iso-countries/langs/fi.json";
import fr from "i18n-iso-countries/langs/fr.json";
import it from "i18n-iso-countries/langs/it.json";
import pt from "i18n-iso-countries/langs/pt.json";

import { baseLanguage, type Language } from "@/i18n/languages";
import { swissSpelling } from "@/i18n/swiss-spelling";

for (const locale of [de, en, es, fi, fr, it, pt]) {
  countries.registerLocale(locale);
}

export type Country = { code: string; name: string };

/** A German name as the UI's variant writes it: Swiss spelling for "de-CH" ("Grossbritannien"). */
function spelled(name: string, language: Language): string {
  return language === "de-CH" ? swissSpelling(name) : name;
}

/** Country name in the UI language (ISO 3166-1 alpha-2 code in, name out). */
export function getCountryName(code: string, language: Language): string {
  const name = countries.getName(code, baseLanguage(language));
  return name === undefined ? code : spelled(name, language);
}

/** Every country, sorted by name in the UI language. */
export function listCountries(language: Language): Country[] {
  const names = countries.getNames(baseLanguage(language), { select: "official" });
  const collator = new Intl.Collator(language);
  return Object.entries(names)
    .map(([code, name]) => ({ code, name: spelled(name, language) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

const SWITZERLAND = "CH";
/** Switzerland's neighbours: Austria, Germany, France, Italy, Liechtenstein. */
const NEIGHBOURS: readonly string[] = ["AT", "DE", "FR", "IT", "LI"];

/**
 * The country picker's two groups: first the detected
 * country (if any), Switzerland, then its neighbours sorted by name; then every other country,
 * sorted by name. A country appears once.
 */
export function groupCountries(
  language: Language,
  detected?: string | null
): [first: Country[], rest: Country[]] {
  const all = listCountries(language);
  const byCode = new Map(all.map((c) => [c.code, c]));
  const neighbours = all.filter((c) => NEIGHBOURS.includes(c.code)).map((c) => c.code);
  const codes = new Set(
    [detected, SWITZERLAND, ...neighbours].filter(
      (code): code is string => code != null && byCode.has(code)
    )
  );
  const first = [...codes].map((code) => byCode.get(code) as Country);
  return [first, all.filter((c) => !codes.has(c.code))];
}

/** Case- and accent-insensitive search on the name, or exact match on the code. */
export function searchCountries(list: Country[], query: string): Country[] {
  const q = normalise(query.trim());
  if (!q) return list;
  return list.filter((c) => normalise(c.name).includes(q) || c.code.toLowerCase() === q);
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
