/**
 * German spelling and quotation marks as Switzerland and Liechtenstein write them (locales/de-CH.ts):
 * ß as ss, ẞ as SS (amtliches Regelwerk of the Rat für deutsche Rechtschreibung, § 25 E2 and E3),
 * guillemets « » and ‹ › where Germany writes „ “ and ‚ ‘ (Federal Chancellery,
 * Schreibweisungen, 201–202). The apostrophe (’) is left as it is.
 */
export function swissSpelling(text: string): string {
  return text
    .replace(/ß/g, "ss")
    .replace(/ẞ/g, "SS")
    .replace(/„/g, "«")
    .replace(/“/g, "»")
    .replace(/‚/g, "‹")
    .replace(/‘/g, "›");
}
