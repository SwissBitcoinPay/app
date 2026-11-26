/**
 * UI languages: the v2 app's (SwissBitcoinPay/app), and Swiss Standard German ("de-CH"), German
 * as Switzerland and Liechtenstein write it (no ß, guillemets, Swiss words: locales/de-CH.ts). "de"
 * is German as Germany and Austria write it.
 */
export const LANGUAGES = ["fr", "en", "de", "de-CH", "it", "es", "pt", "fi"] as const;

export type Language = (typeof LANGUAGES)[number];

/** A language without its regional variant: what services outside the app know ("de"). */
export type BaseLanguage = Exclude<Language, "de-CH">;

/** Used when the device language is not one of LANGUAGES (same choice as v2). */
export const FALLBACK_LANGUAGE: Language = "en";

/**
 * Regions that write Swiss Standard German: Switzerland and Liechtenstein (amtliches Regelwerk of
 * the Rat für deutsche Rechtschreibung, § 25 E2: "In der Schweiz und in Liechtenstein kann immer
 * ss geschrieben werden").
 */
const SWISS_GERMAN_REGIONS: readonly string[] = ["CH", "LI"];

/**
 * The UI language of a device's BCP 47 tag ("de-CH", "pt_BR", "zh-Hant-TW"): its language,
 * German in the variant of its region, English when the app does not speak it.
 */
export function toLanguage(tag: string | null | undefined): Language {
  const base = tag?.split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (base === "de") {
    const region = regionOf(tag);
    return region !== null && SWISS_GERMAN_REGIONS.includes(region) ? "de-CH" : "de";
  }
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : FALLBACK_LANGUAGE;
}

/** The region of a BCP 47 tag ("de-CH", "de_LI", "zh-Hant-TW"); null when it names none. */
function regionOf(tag: string | null | undefined): string | null {
  const [, ...rest] = tag?.split(/[-_]/) ?? [];
  // The region is the first subtag of two letters after the language (a script has four).
  const region = rest.find((subtag) => /^[A-Za-z]{2}$/.test(subtag));
  return region ? region.toUpperCase() : null;
}

/** The language without its regional variant: "de" for "de-CH". */
export function baseLanguage(language: Language): BaseLanguage {
  return language === "de-CH" ? "de" : language;
}

/**
 * Each language as it names itself, the same in every language of the app: a document's language is
 * picked by it (src/components/DocumentLanguage.tsx). German without its variant is Germany's and
 * Austria's.
 */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  "de-CH": "Deutsch (Schweiz)",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  fi: "Suomi"
};

/**
 * The locale a document in `language` writes its numbers and dates in, on a device of locale
 * `deviceTag` (the merchant's region): the device's own when it is
 * in that language ("fr-CH"), else the language in the device's region ("en-CH" on a Swiss
 * phone). German's variant decides its own region: "de-CH" for Swiss German, "de-DE" for
 * German on a phone of Switzerland or Liechtenstein.
 */
export function documentLocale(language: Language, deviceTag: string): string {
  if (toLanguage(deviceTag) === language) return deviceTag;
  if (language === "de-CH") return "de-CH";
  const region = regionOf(deviceTag);
  if (language === "de" && region !== null && SWISS_GERMAN_REGIONS.includes(region)) {
    return "de-DE";
  }
  return region === null ? language : `${language}-${region}`;
}
