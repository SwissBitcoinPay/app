import {
  COUNTRY_DETECTION_KEY,
  parseCountryDetection,
  serializeCountryDetection
} from "@/features/account/country-detection-format";
import { writeCountryDetection } from "@/features/account/country-detection-store";
import { detectSignUpLocation } from "@/features/account/detection";
import { wipeDevice } from "@/features/settings/device-wipe";
import type { DeviceLocale } from "@/lib/locale/device";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

/*
 * "Detect my country with country.is" ("Advanced settings"):
 * this device's choice of whether the sign-up may ask country.is the country of its IP address.
 */

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

/** A device whose time zone tells no country (UTC): country.is would be asked. */
const UNTOLD: DeviceLocale = {
  languageTag: "en-US",
  languageCode: "en",
  regionCode: "US",
  currencyCode: "USD",
  timeZone: "UTC"
};

function countryIs(country: string) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockClear();
  spy.mockImplementation(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ ip: "198.51.100.7", country })
      }) as Response
  );
  return () => spy.mock.calls.filter(([url]) => String(url).includes("country.is"));
}

afterEach(() => jest.restoreAllMocks());

describe("country.is at the sign-up", () => {
  it("is stored under a key installed apps keep, in a versioned record", () => {
    // IRREVERSIBLE: installed apps keep the choice there.
    expect(COUNTRY_DETECTION_KEY).toBe("country-detection");
    expect(serializeCountryDetection(false)).toBe('{"version":1,"detect":false}');
    expect(parseCountryDetection(serializeCountryDetection(true))).toBe(true);
    for (const stored of [null, "{", "null", '{"version":1,"detect":"no"}', '{"version":2}']) {
      expect(parseCountryDetection(stored)).toBeNull();
    }
  });

  it("is asked by default, when the time zone tells no country", async () => {
    const asked = countryIs("CH");
    const location = await detectSignUpLocation(UNTOLD);
    expect(asked()).toHaveLength(1);
    expect(location.detectedCountry).toBe("CH");
  });

  it("is never asked once the device turned it off: the device's settings alone", async () => {
    await writeCountryDetection(false);
    const asked = countryIs("CH");
    const location = await detectSignUpLocation(UNTOLD);
    expect(asked()).toEqual([]);
    expect(location.detectedCountry).toBe("US");
  });

  it("is forgotten with the device's data", async () => {
    await writeCountryDetection(false);
    await wipeDevice();
    expect(secureStore.items.has(COUNTRY_DETECTION_KEY)).toBe(false);
  });
});
