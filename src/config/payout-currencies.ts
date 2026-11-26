/**
 * Fiat currencies a merchant can be paid out in, by bank transfer to an IBAN: the payout provider
 * (Mt Pelerin, src/config/mtpelerin.ts) supports all of them. This list is the
 * only source, the app asks no API for it. The merchant's country of residence does not restrict
 * it.
 *
 * Adding a currency: also name it in every language (`currencies` and `currencyNames` in
 * src/i18n/locales/), give it a colour (src/theme/currency-colors.ts), map its countries in
 * src/lib/currencies.ts, so that it can be detected, and give it its flag there (`CURRENCY_FLAG`).
 *
 * Their rates come from CoinGecko, which quotes all of them (src/lib/rates/).
 */
export const PAYOUT_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "PLN",
  "SEK",
  "SGD",
  "USD",
  "ZAR"
] as const;

/** ISO 4217 code of a payout currency. */
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

/** Used when nothing on the device points to a payout currency. */
export const DEFAULT_PAYOUT_CURRENCY: PayoutCurrency = "CHF";

export function isPayoutCurrency(code: string): code is PayoutCurrency {
  return (PAYOUT_CURRENCIES as readonly string[]).includes(code);
}
