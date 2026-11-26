/**
 * The business settings of "New invoice".
 */

/**
 * The latest due date offered, in months from today: its
 * payment link's sale lasts until then, and the amount due of a payment is proven with the point of
 * its hour, which CoinGecko gives for 365 days (HISTORY_DAYS, src/lib/rates/sources.ts).
 */
export const MAX_DUE_MONTHS = 9;

/**
 * Margin below the most the Lightning address accepts (its `maxSendable`) under which an invoice
 * without an on-chain address must stay at its creation, in percent: its amount in sats follows
 * the rate until its due date, and stays payable over
 * Lightning while the rate does not fall by a fifth (a rise of a quarter of its sats). Above it, it
 * needs an address. Its payer's page keeps Lightning up to the whole maximum.
 */
export const INVOICE_LIGHTNING_MARGIN_PERCENT = 20n;

/** At most this many lines on an invoice: its record stays well below what relays accept. */
export const MAX_INVOICE_LINES = 50;

/** Longest designation of a line (an article's name: ARTICLE_NAME_MAX_LENGTH is 60). */
export const LINE_NAME_MAX_LENGTH = 120;

/** Longest name, street, postal code, city and client reference of the recipient. */
export const RECIPIENT_FIELD_MAX_LENGTH = 120;

/** Longest payment conditions and legal notice (multi-line texts). */
export const INVOICE_TEXT_MAX_LENGTH = 1000;

/** Longest redirection URL. */
export const REDIRECT_URL_MAX_LENGTH = 500;

/** Largest quantity of a line, in whole units (its hundredths are typed after the separator). */
export const MAX_QUANTITY_UNITS = 99_999;

/** Highest VAT rate accepted, in basis points (100 %). */
export const MAX_VAT_BASIS_POINTS = 10_000;

/**
 * The standard VAT rate of each country, in basis points (810: 8,1 %): the default rate of an
 * invoice's lines ("Settings" can change it), from the country the account was created in
 * (MerchantSettings.detectedCountry: its time zone first, src/lib/currencies.ts). A country not
 * listed has none (0 %, to be set in "Settings").
 *
 * Checked against several 2026 tables (EU member states, Switzerland: vatupdate.com,
 * hellotax.com, taxology.co, the Swiss Federal Tax Administration's current rates); the
 * United Kingdom, Norway and Liechtenstein (in the Swiss VAT area) from general knowledge only.
 * Rates change: a change here moves only the default of accounts that did not choose theirs.
 */
export const STANDARD_VAT_RATES: Readonly<Record<string, number>> = {
  // Switzerland and Liechtenstein (one VAT area).
  CH: 810,
  LI: 810,
  // European Union.
  AT: 2000,
  BE: 2100,
  BG: 2000,
  CY: 1900,
  CZ: 2100,
  DE: 1900,
  DK: 2500,
  EE: 2400,
  ES: 2100,
  FI: 2550,
  FR: 2000,
  GR: 2400,
  HR: 2500,
  HU: 2700,
  IE: 2300,
  IT: 2200,
  LT: 2100,
  LU: 1700,
  LV: 2100,
  MT: 1800,
  NL: 2100,
  PL: 2300,
  PT: 2300,
  RO: 2100,
  SE: 2500,
  SI: 2200,
  SK: 2300,
  // Others of Europe.
  GB: 2000,
  NO: 2500
};

/** The standard rate of `country` (ISO 3166-1 alpha-2), in basis points; 0 when not listed. */
export function standardVatRate(country: string | null): number {
  return (country && STANDARD_VAT_RATES[country.toUpperCase()]) || 0;
}
