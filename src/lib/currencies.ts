import {
  DEFAULT_PAYOUT_CURRENCY,
  isPayoutCurrency,
  type PayoutCurrency
} from "@/config/payout-currencies";
import type { DeviceLocale } from "@/lib/locale/device";

/**
 * Countries whose official currency is a payout currency (src/config/payout-currencies.ts). Only
 * these are needed: any other country falls back to DEFAULT_PAYOUT_CURRENCY anyway.
 */
const EUR_COUNTRIES = [
  "AD",
  "AT",
  "AX",
  "BE",
  "BG",
  "BL",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GF",
  "GP",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MC",
  "ME",
  "MF",
  "MQ",
  "MT",
  "NL",
  "PM",
  "PT",
  "RE",
  "SI",
  "SK",
  "SM",
  "VA",
  "XK",
  "YT"
];

export const COUNTRY_CURRENCY: Readonly<Record<string, PayoutCurrency>> = {
  ...Object.fromEntries(EUR_COUNTRIES.map((country) => [country, "EUR" as const])),
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  LI: "CHF",
  CZ: "CZK",
  DK: "DKK",
  FO: "DKK",
  GL: "DKK",
  GB: "GBP",
  GG: "GBP",
  IM: "GBP",
  JE: "GBP",
  HK: "HKD",
  HU: "HUF",
  JP: "JPY",
  MX: "MXN",
  NO: "NOK",
  NZ: "NZD",
  PL: "PLN",
  SE: "SEK",
  SG: "SGD",
  US: "USD",
  PR: "USD",
  EC: "USD",
  SV: "USD",
  ZA: "ZAR"
};

/**
 * The flag shown next to each payout currency in the currency picker (`Flag`, country-flag-icons):
 * its issuing country's, the European Union's for the euro.
 */
export const CURRENCY_FLAG: Readonly<Record<PayoutCurrency, string>> = {
  AUD: "AU",
  CAD: "CA",
  CHF: "CH",
  CZK: "CZ",
  DKK: "DK",
  EUR: "EU",
  GBP: "GB",
  HKD: "HK",
  HUF: "HU",
  JPY: "JP",
  MXN: "MX",
  NOK: "NO",
  NZD: "NZ",
  PLN: "PL",
  SEK: "SE",
  SGD: "SG",
  USD: "US",
  ZAR: "ZA"
};

/**
 * Time zones of those countries: the first signal of detectCountry. Any other
 * time zone gives no country, and detection moves on to the next signal.
 */
export const TIMEZONE_COUNTRY: Readonly<Record<string, string>> = {
  "Europe/Zurich": "CH",
  "Europe/Vaduz": "LI",
  "Europe/Vienna": "AT",
  "Europe/Brussels": "BE",
  "Europe/Sofia": "BG",
  "Europe/Zagreb": "HR",
  "Asia/Nicosia": "CY",
  "Asia/Famagusta": "CY",
  "Europe/Nicosia": "CY",
  "Europe/Tallinn": "EE",
  "Europe/Helsinki": "FI",
  "Europe/Mariehamn": "AX",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Athens": "GR",
  "Europe/Dublin": "IE",
  "Europe/Rome": "IT",
  "Europe/Riga": "LV",
  "Europe/Vilnius": "LT",
  "Europe/Luxembourg": "LU",
  "Europe/Malta": "MT",
  "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT",
  "Atlantic/Madeira": "PT",
  "Atlantic/Azores": "PT",
  "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI",
  "Europe/Madrid": "ES",
  "Africa/Ceuta": "ES",
  "Atlantic/Canary": "ES",
  "Europe/Andorra": "AD",
  "Europe/Monaco": "MC",
  "Europe/San_Marino": "SM",
  "Europe/Vatican": "VA",
  "Europe/Podgorica": "ME",
  "Europe/London": "GB",
  "Europe/Isle_of_Man": "IM",
  "Europe/Jersey": "JE",
  "Europe/Guernsey": "GG",
  "Europe/Prague": "CZ",
  "Europe/Copenhagen": "DK",
  "Europe/Budapest": "HU",
  "Europe/Oslo": "NO",
  "Europe/Warsaw": "PL",
  "Europe/Stockholm": "SE",
  "Asia/Hong_Kong": "HK",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Africa/Johannesburg": "ZA",
  "Pacific/Auckland": "NZ",
  "Pacific/Chatham": "NZ",
  ...Object.fromEntries(
    [
      "Sydney",
      "Melbourne",
      "Brisbane",
      "Perth",
      "Adelaide",
      "Hobart",
      "Darwin",
      "Lord_Howe",
      "Broken_Hill",
      "Lindeman",
      "Eucla"
    ].map((city) => [`Australia/${city}`, "AU"])
  ),
  ...Object.fromEntries(
    [
      "Mexico_City",
      "Cancun",
      "Merida",
      "Monterrey",
      "Matamoros",
      "Chihuahua",
      "Ciudad_Juarez",
      "Ojinaga",
      "Mazatlan",
      "Bahia_Banderas",
      "Hermosillo",
      "Tijuana"
    ].map((city) => [`America/${city}`, "MX"])
  ),
  ...Object.fromEntries(
    [
      "Toronto",
      "Vancouver",
      "Edmonton",
      "Winnipeg",
      "Halifax",
      "St_Johns",
      "Regina",
      "Moncton",
      "Glace_Bay",
      "Goose_Bay",
      "Whitehorse",
      "Dawson",
      "Dawson_Creek",
      "Fort_Nelson",
      "Creston",
      "Cambridge_Bay",
      "Inuvik",
      "Iqaluit",
      "Rankin_Inlet",
      "Resolute",
      "Swift_Current",
      "Atikokan",
      "Blanc-Sablon"
    ].map((city) => [`America/${city}`, "CA"])
  ),
  ...Object.fromEntries(
    [
      "New_York",
      "Chicago",
      "Denver",
      "Los_Angeles",
      "Phoenix",
      "Anchorage",
      "Juneau",
      "Sitka",
      "Yakutat",
      "Nome",
      "Metlakatla",
      "Adak",
      "Boise",
      "Detroit",
      "Menominee",
      "Indiana/Indianapolis",
      "Kentucky/Louisville",
      "North_Dakota/Center"
    ].map((city) => [`America/${city}`, "US"])
  ),
  "Pacific/Honolulu": "US",
  "America/Puerto_Rico": "PR"
};

/** The country of the device's time zone, when it is one of TIMEZONE_COUNTRY. */
export function countryFromTimeZone(device: DeviceLocale): string | null {
  return (device.timeZone && TIMEZONE_COUNTRY[device.timeZone]) || null;
}

function currencyOf(country: string | null | undefined): PayoutCurrency | undefined {
  return country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
}

/*
 * Country and payout currency are detected without asking the merchant, from the most to the
 * least reliable signal:
 * 1. the time zone: usually set automatically (network, location), it follows where the device
 *    is, whatever its language settings or a VPN;
 * 2. the country of the IP address (see ip-country.ts), looked up only when the time zone is
 *    not enough (needsIpCountry);
 * 3. the device settings: the region (and its currency on native), which on the web is the
 *    region of the browser language.
 */

/** The merchant's country of residence, first guess: time zone, else IP address, else region. */
export function detectCountry(
  device: DeviceLocale,
  ipCountry: string | null = null
): string | null {
  const region = device.regionCode?.toUpperCase();
  // Only ISO 3166-1 alpha-2 codes are countries: UN M.49 areas such as "419" (browsers set to
  // es-419, Latin America) are not. The time zone and the IP country are always alpha-2.
  const country =
    countryFromTimeZone(device) ??
    ipCountry ??
    (region && /^[A-Z]{2}$/.test(region) ? region : null);
  return country ? country.toUpperCase() : null;
}

/**
 * The payout currency: the first signal (see above) whose currency is a payout currency, else
 * DEFAULT_PAYOUT_CURRENCY.
 */
export function detectPayoutCurrency(
  device: DeviceLocale,
  ipCountry: string | null = null
): PayoutCurrency {
  const candidates = [
    currencyOf(countryFromTimeZone(device)),
    currencyOf(ipCountry),
    device.currencyCode?.toUpperCase(),
    currencyOf(device.regionCode)
  ];
  for (const candidate of candidates) {
    if (candidate && isPayoutCurrency(candidate)) return candidate;
  }
  return DEFAULT_PAYOUT_CURRENCY;
}

/**
 * Whether the IP address is worth looking up: only when the time zone gives no country with a
 * payout currency. Otherwise the device's IP address is never sent to the lookup service.
 */
export function needsIpCountry(device: DeviceLocale): boolean {
  return !currencyOf(countryFromTimeZone(device));
}
