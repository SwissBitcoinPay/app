import { capitalized } from "@/lib/locale/date";

/** Today (0) or yesterday (-1). */
export type RelativeDay = 0 | -1;

// A day's word never changes for a locale: asked once (a list writes it on each render).
const words = new Map<string, string | null>();

function write(languageTag: string, offset: RelativeDay): string | null {
  // Not a valid BCP 47 tag (e.g. "en-US@posix" from some browsers): the default locale, as date.ts.
  for (const locale of [languageTag, undefined]) {
    try {
      const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      return capitalized(format.format(offset, "day"), format.resolvedOptions().locale);
    } catch {
      // Try the next locale; a browser without Intl.RelativeTimeFormat: none.
    }
  }
  return null;
}

/**
 * The browser's own word for today or yesterday in `languageTag`, as at the start of a sentence
 * ("Today", "Gestern"): `Intl.RelativeTimeFormat`, with the browser's locale data, as the
 * dates of date.ts. Null when the browser gives none.
 */
export function relativeDayWord(languageTag: string, offset: RelativeDay): string | null {
  const key = `${languageTag}|${offset}`;
  let word = words.get(key);
  if (word === undefined) {
    word = write(languageTag, offset);
    words.set(key, word);
  }
  return word;
}
