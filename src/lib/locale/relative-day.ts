import { requireOptionalNativeModule } from "expo";

/** Today (0) or yesterday (-1). */
export type RelativeDay = 0 | -1;

type RelativeDayModule = {
  relativeDay(languageTag: string, offset: number): string | null;
};

// The app's own native module (modules/relative-day): absent from Jest and from a binary built
// before it, where the caller falls back on the app's translations.
const native = requireOptionalNativeModule<RelativeDayModule>("RelativeDay");

// A day's word never changes for a locale: asked once (a list writes it on each render). Only the
// words found are kept: the iOS module writes none when the day turned during its call.
const words = new Map<string, string>();

/**
 * The device's own word for today or yesterday in `languageTag`, as at the start of a sentence
 * ("Today", "Gestern"): Hermes has no `Intl.RelativeTimeFormat`, so the OS writes it
 * (iOS: DateFormatter's relative formatting; Android: ICU's RelativeDateTimeFormatter), with its
 * locale data, as the dates of date.ts. Null when the OS gives none.
 */
export function relativeDayWord(languageTag: string, offset: RelativeDay): string | null {
  const key = `${languageTag}|${offset}`;
  const known = words.get(key);
  if (known !== undefined) return known;
  let word: string | null = null;
  try {
    word = native?.relativeDay(languageTag, offset) || null;
  } catch {
    // A native error: the app's translation.
  }
  if (word) words.set(key, word);
  return word;
}
