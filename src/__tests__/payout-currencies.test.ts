import { hasFlag } from "@/components/ui/Flag";
import {
  DEFAULT_PAYOUT_CURRENCY,
  PAYOUT_CURRENCIES,
  isPayoutCurrency
} from "@/config/payout-currencies";
import { resources } from "@/i18n";
import { COUNTRY_CURRENCY, CURRENCY_FLAG, TIMEZONE_COUNTRY } from "@/lib/currencies";
import { currencyColors } from "@/theme";

const sorted = (codes: readonly string[]) => [...codes].sort();

/** WCAG 2 relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of white text on a #RRGGBB colour. */
const whiteContrast = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe("payout currencies", () => {
  it("are ISO 4217 codes, each listed once, the default one included", () => {
    for (const code of PAYOUT_CURRENCIES) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(new Set(PAYOUT_CURRENCIES).size).toBe(PAYOUT_CURRENCIES.length);
    expect(isPayoutCurrency(DEFAULT_PAYOUT_CURRENCY)).toBe(true);
    expect(isPayoutCurrency("AED")).toBe(false);
    expect(isPayoutCurrency("chf")).toBe(false);
  });

  it("can each be detected from a country, and every detected country has one", () => {
    expect(sorted([...new Set(Object.values(COUNTRY_CURRENCY))])).toEqual(
      sorted(PAYOUT_CURRENCIES)
    );
    for (const [timeZone, country] of Object.entries(TIMEZONE_COUNTRY)) {
      expect({ timeZone, currency: COUNTRY_CURRENCY[country] }).toEqual({
        timeZone,
        currency: expect.any(String)
      });
      // Throws a RangeError for a name that is not an IANA time zone.
      expect(() => new Intl.DateTimeFormat("en", { timeZone })).not.toThrow();
    }
  });

  it("each have a flag: their issuing country's, the European Union's for the euro", () => {
    expect(sorted(Object.keys(CURRENCY_FLAG))).toEqual(sorted(PAYOUT_CURRENCIES));
    for (const [currency, flag] of Object.entries(CURRENCY_FLAG)) {
      expect({ currency, flag, drawn: hasFlag(flag) }).toEqual({ currency, flag, drawn: true });
      // A country's flag is one whose currency it is (no country has the euro alone).
      const issuer = flag === "EU" ? "EUR" : COUNTRY_CURRENCY[flag];
      expect({ currency, flag, issuer }).toEqual({ currency, flag, issuer: currency });
    }
  });

  it("are named in every language, in a sentence and on their own, and only them", () => {
    for (const [language, { translation }] of Object.entries(resources)) {
      for (const names of [translation.currencies, translation.currencyNames]) {
        expect({ language, codes: sorted(Object.keys(names)) }).toEqual({
          language,
          codes: sorted(PAYOUT_CURRENCIES)
        });
      }
    }
  });

  it("each have their colour on the split screen, with white text readable on it", () => {
    expect(sorted(Object.keys(currencyColors))).toEqual(sorted(PAYOUT_CURRENCIES));
    for (const [code, { fill, ink }] of Object.entries(currencyColors)) {
      expect({ code, fill, ink }).toEqual({
        code,
        fill: expect.stringMatching(/^#[0-9A-F]{6}$/),
        ink: expect.stringMatching(/^#[0-9A-F]{6}$/)
      });
      // WCAG AA for the currency code on its tag (12.5 px).
      expect({ code, contrast: whiteContrast(fill) >= 4.5 }).toEqual({ code, contrast: true });
    }
    // Each currency is told apart by its colour.
    expect(new Set(Object.values(currencyColors).map(({ fill }) => fill)).size).toBe(
      PAYOUT_CURRENCIES.length
    );
  });
});
