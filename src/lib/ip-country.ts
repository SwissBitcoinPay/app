import { getWithTimeout } from "@/lib/http";

/**
 * Country of the device's IP address, from country.is:
 * free for commercial use, no key, open source (MaxMind GeoLite2 data), and it states that it
 * keeps no logs (https://country.is). It is a third party: the request sends
 * the device's IP address to it, nothing else. Only called when the time zone does not tell the
 * country (`needsIpCountry` in currencies.ts).
 */
export const IP_COUNTRY_URL = "https://api.country.is/";

/** Detection must not wait on a slow network: past this, the next signal is used. */
const TIMEOUT_MS = 5000;

/**
 * ISO 3166-1 alpha-2 code of the caller's country, or null when the service has no data for its
 * IP address (HTTP 404). Rejects on any other failure: HTTP error, timeout, unexpected body.
 */
export function fetchIpCountry(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TIMEOUT_MS
): Promise<string | null> {
  return getWithTimeout(IP_COUNTRY_URL, fetchImpl, timeoutMs, async (response) => {
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GET ${IP_COUNTRY_URL} failed with HTTP ${response.status}`);
    }
    // The body also holds the IP address: only the country is kept.
    const { country } = (await response.json()) as { country?: unknown };
    if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) {
      throw new Error(`GET ${IP_COUNTRY_URL}: unexpected response shape`);
    }
    return country;
  });
}
