import { getCalendars, getLocales } from "expo-localization";

export type DeviceLocale = {
  /** BCP 47 tag used to format numbers, e.g. "fr-CH". */
  languageTag: string;
  /** "fr", "en"… null when the platform does not tell. */
  languageCode: string | null;
  /** ISO 3166-1 alpha-2 region of the device settings. Often null on web. */
  regionCode: string | null;
  /** ISO 4217 currency of the device region. Always null on web. */
  currencyCode: string | null;
  /** IANA time zone, e.g. "Europe/Zurich". */
  timeZone: string | null;
};

/** Reads the device language, region, currency and time zone (first preferred locale). */
export function getDeviceLocale(): DeviceLocale {
  const [locale] = getLocales();
  const [calendar] = getCalendars();
  return {
    languageTag: locale?.languageTag || "en",
    languageCode: locale?.languageCode ?? null,
    regionCode: locale?.regionCode ?? null,
    currencyCode: locale?.currencyCode ?? null,
    timeZone: calendar?.timeZone ?? null
  };
}
