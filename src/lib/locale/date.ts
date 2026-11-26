/**
 * Dates and times follow the device locale, as numbers do (format.ts): the order, the separators,
 * the names of days and months, the 12- or 24-hour clock and the words joining a date and a time
 * ("um", "at"…) all come from `Intl`, never from the app's
 * translations, so that one sentence is never written in two languages. Hermes formats with the
 * OS's locale data and the web with the browser's: the output can vary with their versions.
 */

/** A formatter and the locale it resolved to (for the capitalization of its text). */
type SharedFormat = { format: Intl.DateTimeFormat; locale: string };

function createFormat(
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): SharedFormat | null {
  // Not a valid BCP 47 tag (e.g. "en-US@posix" from some browsers): the default locale. Options
  // the engine does not support either way: no formatter, formatDate falls back to its default.
  for (const locale of [languageTag, undefined]) {
    try {
      const format = new Intl.DateTimeFormat(locale, options);
      return { format, locale: format.resolvedOptions().locale };
    } catch {
      // Try the next locale.
    }
  }
  return null;
}

// One formatter per locale and options: creating one is slow (Hermes above all), and the wallet's
// list formats a time per row at each render.
const formats = new Map<string, SharedFormat | null>();

function sharedFormat(
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): SharedFormat | null {
  const key = `${languageTag}|${JSON.stringify(options)}`;
  let shared = formats.get(key);
  if (shared === undefined) {
    shared = createFormat(languageTag, options);
    formats.set(key, shared);
  }
  return shared;
}

/** A shared formatter of `languageTag` with these options, made on first use; null if none. */
export function dateTimeFormat(
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat | null {
  return sharedFormat(languageTag, options)?.format ?? null;
}

/**
 * The engine's default text of `date`, for what `options` show: a time alone stays a time (the
 * paid line, a row's time), a date alone a date (a day's title), else both.
 */
function defaultText(date: Date, options: Intl.DateTimeFormatOptions): string {
  const time =
    options.timeStyle !== undefined ||
    options.hour !== undefined ||
    options.minute !== undefined ||
    options.second !== undefined;
  const day =
    options.dateStyle !== undefined ||
    options.weekday !== undefined ||
    options.year !== undefined ||
    options.month !== undefined ||
    options.day !== undefined;
  if (time && !day) return date.toLocaleTimeString();
  if (day && !time) return date.toLocaleDateString();
  return date.toLocaleString();
}

/** formatDate's text and the locale it was written in (undefined for the default text). */
function written(
  date: Date,
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): { text: string; locale: string | undefined } {
  const shared = sharedFormat(languageTag, options);
  if (shared) {
    try {
      return { text: shared.format.format(date), locale: shared.locale };
    } catch {
      // An invalid date (RangeError): the default text below.
    }
  }
  return { text: defaultText(date, options), locale: undefined };
}

/**
 * `date` written in `languageTag`:
 * formatDate(d, "de-CH", { day: "2-digit", month: "2-digit" }) -> "04.10.".
 * Never throws (a screen renders it): an invalid date or unsupported options give the engine's
 * default text of the same fields (a time, a date, or both).
 */
export function formatDate(
  date: Date,
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): string {
  return written(date, languageTag, options).text;
}

/**
 * formatDate with its first letter in upper case, for a text that starts a title or a line:
 * "Mercoledì 30 settembre" in Italian, whose day names are lower case.
 */
export function formatDateCapitalized(
  date: Date,
  languageTag: string,
  options: Intl.DateTimeFormatOptions
): string {
  const { text, locale } = written(date, languageTag, options);
  return capitalized(text, locale);
}

/** `options` with the year when `date` is not of this year ("15 Oct", "15 Oct 2025"). */
export function withYear(
  options: Intl.DateTimeFormatOptions,
  date: Date
): Intl.DateTimeFormatOptions {
  return date.getFullYear() === new Date().getFullYear()
    ? options
    : { ...options, year: "numeric" };
}

/** `text` with its first letter in upper case, by the rules of `locale` (a resolved one). */
export function capitalized(text: string, locale: string | undefined): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}
