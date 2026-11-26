import type { PayoutCurrency } from "@/config/payout-currencies";
import { detectCountry, detectPayoutCurrency, needsIpCountry } from "@/lib/currencies";
import { fetchIpCountry } from "@/lib/ip-country";
import { getDeviceLocale, type DeviceLocale } from "@/lib/locale/device";

import { DEFAULT_COUNTRY_DETECTION } from "./country-detection-format";
import { readCountryDetection } from "./country-detection-store";

export type SignUpLocation = {
  payoutCurrency: PayoutCurrency;
  /** The country of residence until the merchant picks one; null when nothing tells it. */
  detectedCountry: string | null;
};

/**
 * Payout currency and country of an account, detected once, when it is created, then kept in its
 * settings: time zone, then the country of the IP address, then the device settings (see
 * currencies.ts). The IP address only while this device allows it ("Detect my country with
 * country.is" of "Advanced settings").
 */
export async function detectSignUpLocation(
  device: DeviceLocale = getDeviceLocale()
): Promise<SignUpLocation> {
  const allowed = (await readCountryDetection()) ?? DEFAULT_COUNTRY_DETECTION;
  // The IP address is only sent to the lookup service when the time zone is not enough.
  const ipCountry =
    allowed && needsIpCountry(device)
      ? // Offline, blocked or too slow: detection goes on with the device settings.
        await fetchIpCountry().catch(() => null)
      : null;
  return {
    payoutCurrency: detectPayoutCurrency(device, ipCountry),
    detectedCountry: detectCountry(device, ipCountry)
  };
}
