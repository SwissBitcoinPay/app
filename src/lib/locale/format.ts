/**
 * Number formatting follows the device locale (decimal comma or point, percent
 * spacing), not the UI language: a French speaker in Canada and one in France
 * do not write numbers the same way.
 *
 * No house rule on top of it: Swiss locales
 * write "1,5%" (fr-CH) or "1.5%" (de-CH, it-CH) without a space, even though the design shows
 * "1,5 %". Hermes formats with the OS's locale data and the web with the browser's, so the output
 * can vary with the OS or browser version.
 */

function localeFormat(languageTag: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(languageTag, options);
  } catch {
    // Not a valid BCP 47 tag (e.g. "en-US@posix" from some browsers): use the default locale.
    return new Intl.NumberFormat(undefined, options);
  }
}

// One formatter per locale: creating one is slow (Hermes above all), and the split screen formats
// at every % of a drag.
const percentFormats = new Map<string, Intl.NumberFormat>();

function percentFormat(languageTag: string): Intl.NumberFormat {
  let format = percentFormats.get(languageTag);
  if (!format) {
    format = localeFormat(languageTag, { style: "percent", maximumFractionDigits: 2 });
    percentFormats.set(languageTag, format);
  }
  return format;
}

/**
 * Formats a percentage given in percent points: formatPercent(1.5, "fr-CH") -> "1,5%",
 * formatPercent(1.5, "fr-FR") -> "1,5 %" (no-break space).
 */
export function formatPercent(points: number, languageTag: string): string {
  return percentFormat(languageTag).format(points / 100);
}

export type PercentPart = { text: string; number: boolean };

/**
 * formatPercent in parts, for a figure drawn larger than its percent sign:
 * formatPercentParts(70, "fr-FR") -> "70" (number), " %" (not). The parts, in the locale's order,
 * join into formatPercent's output. Without formatToParts, the whole text is one number part.
 */
export function formatPercentParts(points: number, languageTag: string): PercentPart[] {
  const format = percentFormat(languageTag);
  if (typeof format.formatToParts !== "function") {
    return [{ text: format.format(points / 100), number: true }];
  }
  const parts: PercentPart[] = [];
  for (const part of format.formatToParts(points / 100)) {
    const number = NUMBER_PARTS.has(part.type);
    const last = parts[parts.length - 1];
    if (last && last.number === number) last.text += part.value;
    else parts.push({ text: part.value, number });
  }
  return parts;
}

const NUMBER_PARTS = new Set<string>(["minusSign", "integer", "group", "decimal", "fraction"]);

// One per locale, as above: the keypad formats at every key press.
const integerFormats = new Map<string, Intl.NumberFormat>();
const paddedFormats = new Map<string, Intl.NumberFormat>();
const decimalSeparators = new Map<string, string>();

/**
 * Formats a whole number with the locale's grouping: formatInteger(46918n, "fr-CH") -> "46 918".
 * A bigint (sats) is formatted only here, at the display edge; one past Number's exact range
 * (never a sats amount: 21 million BTC is 2.1 × 10^15 sats) keeps its plain digits.
 */
export function formatInteger(value: number | bigint, languageTag: string): string {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      return value.toString();
    }
    value = Number(value);
  }
  let format = integerFormats.get(languageTag);
  if (!format) {
    format = localeFormat(languageTag, { maximumFractionDigits: 0, useGrouping: true });
    integerFormats.set(languageTag, format);
  }
  return format.format(value);
}

/**
 * A whole number of at least `minimumDigits` digits, zero-padded, without grouping, in the
 * locale's digits: formatPaddedInteger(5, 2, "fr-CH") -> "05". The cents of an amount, so that
 * they are written with the same digits as the units (Arabic-Indic in "ar-EG", for instance).
 */
export function formatPaddedInteger(
  value: number,
  minimumDigits: number,
  languageTag: string
): string {
  const key = `${languageTag}|${minimumDigits}`;
  let format = paddedFormats.get(key);
  if (!format) {
    format = localeFormat(languageTag, {
      minimumIntegerDigits: minimumDigits,
      maximumFractionDigits: 0,
      useGrouping: false
    });
    paddedFormats.set(key, format);
  }
  return format.format(value);
}

const decimalFormats = new Map<string, Intl.NumberFormat>();

/**
 * A number with at most `maximumFractionDigits` decimals, the trailing zeros left out, with the
 * locale's separators: formatDecimal(1.34, 2, "fr-CH") -> "1,34", formatDecimal(8, 2, "fr-CH") ->
 * "8". Never an amount (hard rule 3: amounts are bigint sats): a measure shown, such as a delay.
 */
export function formatDecimal(
  value: number,
  maximumFractionDigits: number,
  languageTag: string
): string {
  const key = `${languageTag}|${maximumFractionDigits}`;
  let format = decimalFormats.get(key);
  if (!format) {
    format = localeFormat(languageTag, { maximumFractionDigits, useGrouping: true });
    decimalFormats.set(key, format);
  }
  return format.format(value);
}

/** The locale's decimal separator: "," in fr-CH, "." in de-CH. */
export function decimalSeparator(languageTag: string): string {
  let separator = decimalSeparators.get(languageTag);
  if (separator === undefined) {
    const format = localeFormat(languageTag, { minimumFractionDigits: 1 });
    const part =
      typeof format.formatToParts === "function"
        ? format.formatToParts(1.5).find((p) => p.type === "decimal")
        : undefined;
    separator = part ? part.value : format.format(1.5).replace(/\d/g, "") || ".";
    decimalSeparators.set(languageTag, separator);
  }
  return separator;
}
