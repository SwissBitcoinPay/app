import { describe, expect, it } from "@jest/globals";
import type { AccountConfigType } from "@types";
import { getPayoutConfigDefaultValues } from "./getPayoutConfigDefaultValues";

const accountConfig = {
  currency: "CHF",
  btc_percent: 25,
  deposit_address: "bc1-current",
  verified_addresses: [
    {
      address: "bc1-other",
      walletConfig: { type: "ledger", label: "Other" }
    },
    {
      address: "bc1-current",
      walletConfig: { type: "bitbox02", label: "Current" }
    }
  ],
  iban: "CH9300762011623852957",
  bank_reference: "Facture 42",
  owner_name: "Swiss Bitcoin Pay",
  owner_address: "Faubourg du Lac 2",
  owner_complement: "Étage 1",
  owner_zip: "2000",
  owner_city: "Neuchâtel",
  owner_country: "CH"
} as AccountConfigType;

describe("getPayoutConfigDefaultValues", () => {
  it("préremplit le formulaire avec les champs snake_case du compte", () => {
    expect(getPayoutConfigDefaultValues(accountConfig)).toMatchObject({
      btcPercent: 25,
      depositAddress: "bc1-current",
      iban: "CH9300762011623852957",
      reference: "Facture 42",
      ownerName: "Swiss Bitcoin Pay",
      ownerAddress: "Faubourg du Lac 2",
      ownerComplement: "Étage 1",
      ownerZip: "2000",
      ownerCity: "Neuchâtel",
      ownerCountry: "CH",
      walletType: "bitbox02",
      walletConfig: { type: "bitbox02", label: "Current" }
    });
  });

  it("déduit le pays depuis la devise quand le compte n'en fournit pas", () => {
    expect(
      getPayoutConfigDefaultValues({
        ...accountConfig,
        owner_country: null
      }).ownerCountry
    ).toBe("CH");
  });

  it("conserve explicitement un payout Bitcoin à zéro pour cent", () => {
    expect(
      getPayoutConfigDefaultValues({
        ...accountConfig,
        btc_percent: 0
      }).btcPercent
    ).toBe(0);
  });
});
