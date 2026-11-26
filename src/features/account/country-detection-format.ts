/**
 * Storage key of "Detect my country with country.is", this device's choice before any sign-in
 * ("Advanced settings"): whether the sign-up may ask country.is the country of the device's IP
 * address (detection.ts). Never rename it: installed apps keep the choice there.
 */
export const COUNTRY_DETECTION_KEY = "country-detection";

/** Format of the stored record. A change of format needs a new version. */
const COUNTRY_DETECTION_VERSION = 1;

/** Without a choice (none yet, or not read): country.is may be asked, as before the choice. */
export const DEFAULT_COUNTRY_DETECTION = true;

export function serializeCountryDetection(detect: boolean): string {
  return JSON.stringify({ version: COUNTRY_DETECTION_VERSION, detect });
}

/**
 * A stored record, null when absent, damaged or of another format (a newer app's: the default then,
 * never written over unasked).
 */
export function parseCountryDetection(stored: string | null): boolean | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; detect?: unknown } | null;
    return value?.version === COUNTRY_DETECTION_VERSION && typeof value.detect === "boolean"
      ? value.detect
      : null;
  } catch {
    return null;
  }
}
