import { detectCountry, detectPayoutCurrency, needsIpCountry } from "@/lib/currencies";
import type { DeviceLocale } from "@/lib/locale/device";

const device = (overrides: Partial<DeviceLocale>): DeviceLocale => ({
  languageTag: "fr-CH",
  languageCode: "fr",
  regionCode: null,
  currencyCode: null,
  timeZone: null,
  ...overrides
});

describe("detectPayoutCurrency", () => {
  it("trusts the time zone first: a phone set to English (US) in Switzerland pays out in CHF", () => {
    expect(
      detectPayoutCurrency(
        device({ currencyCode: "USD", regionCode: "US", timeZone: "Europe/Zurich" }),
        "NL"
      )
    ).toBe("CHF");
    expect(detectPayoutCurrency(device({ timeZone: "Europe/Berlin" }))).toBe("EUR");
    expect(detectPayoutCurrency(device({ timeZone: "America/Chicago" }))).toBe("USD");
    expect(detectPayoutCurrency(device({ timeZone: "Africa/Johannesburg" }))).toBe("ZAR");
  });

  it("uses the IP country when the time zone gives none, before the device settings", () => {
    const settings = { currencyCode: "USD", regionCode: "US" };
    expect(detectPayoutCurrency(device({ ...settings, timeZone: "Asia/Kolkata" }), "GB")).toBe(
      "GBP"
    );
    expect(detectPayoutCurrency(device(settings), "gb")).toBe("GBP");
    expect(detectPayoutCurrency(device(settings), "ZA")).toBe("ZAR");
  });

  it("falls back to the device settings: region currency, then region", () => {
    expect(detectPayoutCurrency(device({ currencyCode: "EUR", regionCode: "FR" }))).toBe("EUR");
    expect(detectPayoutCurrency(device({ currencyCode: "zar" }))).toBe("ZAR");
    expect(detectPayoutCurrency(device({ regionCode: "GB" }))).toBe("GBP");
    expect(detectPayoutCurrency(device({ regionCode: "li" }))).toBe("CHF");
    // An IP country without a payout currency moves on to the settings.
    expect(detectPayoutCurrency(device({ currencyCode: "SEK" }), "BR")).toBe("SEK");
  });

  it("skips currencies that cannot be paid out and defaults to CHF", () => {
    expect(
      detectPayoutCurrency(
        device({ currencyCode: "BRL", regionCode: "BR", timeZone: "America/Sao_Paulo" }),
        "BR"
      )
    ).toBe("CHF");
    // The UAE dirham is not a payout currency.
    expect(
      detectPayoutCurrency(
        device({ currencyCode: "AED", regionCode: "AE", timeZone: "Asia/Dubai" }),
        "AE"
      )
    ).toBe("CHF");
    expect(detectPayoutCurrency(device({}))).toBe("CHF");
  });
});

describe("detectCountry", () => {
  it("prefers the time zone, then the IP country, then the region", () => {
    expect(detectCountry(device({ regionCode: "de", timeZone: "Europe/Zurich" }), "NL")).toBe("CH");
    expect(detectCountry(device({ regionCode: "de", timeZone: "Asia/Kolkata" }), "at")).toBe("AT");
    expect(detectCountry(device({ regionCode: "de", timeZone: "Asia/Kolkata" }))).toBe("DE");
    expect(detectCountry(device({ timeZone: "Asia/Kolkata" }))).toBeNull();
  });

  it("ignores regions that are not countries (es-419 on web)", () => {
    expect(detectCountry(device({ regionCode: "419", timeZone: "Asia/Kolkata" }), "MX")).toBe("MX");
    expect(detectCountry(device({ regionCode: "419", timeZone: "Asia/Kolkata" }))).toBeNull();
  });
});

describe("needsIpCountry", () => {
  it("only asks for the IP country when the time zone gives no payout currency", () => {
    expect(needsIpCountry(device({ timeZone: "Europe/Zurich" }))).toBe(false);
    expect(needsIpCountry(device({ timeZone: "Africa/Johannesburg" }))).toBe(false);
    expect(needsIpCountry(device({ timeZone: "Asia/Kolkata" }))).toBe(true);
    expect(needsIpCountry(device({ timeZone: "Asia/Dubai" }))).toBe(true);
    expect(needsIpCountry(device({ regionCode: "CH", currencyCode: "CHF" }))).toBe(true);
  });
});
