import { describe, expect, it } from "@jest/globals";
import {
  buildCurrencyOptions,
  filterEnabledCurrencies
} from "./currencyOptions";

describe("buildCurrencyOptions", () => {
  it("uses the server flags and decimal metadata", () => {
    expect(
      buildCurrencyOptions([
        {
          code: "JPY",
          decimals: 0,
          enabled: true,
          offramp: false
        },
        {
          code: "BHD",
          decimals: 3,
          enabled: true,
          offramp: false
        },
        {
          code: "ANG",
          decimals: 2,
          enabled: false,
          offramp: false
        }
      ])
    ).toEqual([
      {
        label: "JPY • Japanese yen 🇯🇵",
        value: "JPY",
        decimals: 0,
        enabled: true,
        offramp: false
      },
      {
        label: "BHD • Bahraini dinar",
        value: "BHD",
        decimals: 3,
        enabled: true,
        offramp: false
      },
      {
        label: "ANG • Netherlands Antillean guilder",
        value: "ANG",
        decimals: 2,
        enabled: false,
        offramp: false
      }
    ]);
  });

  it("falls back to the code when the server adds a new currency", () => {
    expect(
      buildCurrencyOptions([
        {
          code: "NEW",
          decimals: 4,
          enabled: true,
          offramp: true
        }
      ])
    ).toEqual([
      {
        label: "NEW",
        value: "NEW",
        decimals: 4,
        enabled: true,
        offramp: true
      }
    ]);
  });

  it("keeps disabled currencies out of selectable options", () => {
    const currencies = buildCurrencyOptions([
      { code: "CHF", decimals: 2, enabled: true, offramp: true },
      { code: "ANG", decimals: 2, enabled: false, offramp: false }
    ]);

    expect(
      filterEnabledCurrencies(currencies).map(({ value }) => value)
    ).toEqual(["CHF"]);
  });
});
