import i18n from "@/i18n";
import { LANGUAGES, toLanguage } from "@/i18n/languages";
import {
  businessAddressLines,
  businessCountry,
  businessNumbers,
  companyNumberLabel,
  vatNumberLabel,
  type BusinessDetails
} from "@/features/invoices/business-details";

/*
 * The business's numbers named as its country names them, in the app's language (Switzerland's
 * in each of its languages, English otherwise).
 */

/** The app's translations in the language a device of `code` gets ("rm": Romansh). */
const tOf = (code: string) => i18n.getFixedT(toLanguage(code));

describe("the business's numbers", () => {
  it("are named in Switzerland in the language of the device, English when the app lacks it", () => {
    const labels = (code: string) => [
      companyNumberLabel(tOf(code), "CH"),
      vatNumberLabel(tOf(code), "CH")
    ];
    // French, a national language: the app's French texts.
    expect(labels("fr")).toEqual(["Numéro IDE", "Numéro TVA"]);
    expect(labels("de")).toEqual(["UID-Nummer", "MWST-Nummer"]);
    expect(labels("it")).toEqual(["Numero IDI", "Numero IVA"]);
    expect(labels("en")).toEqual(["UID number", "VAT number"]);
    // Romansh, the fourth national language: the app speaks English there.
    expect(toLanguage("rm")).toBe("en");
    expect(labels("rm")).toEqual(["UID number", "VAT number"]);
  });

  it("are the SIRET and the intra-EU VAT number in France", () => {
    expect(companyNumberLabel(tOf("en"), "FR")).toBe("SIRET number");
    expect(vatNumberLabel(tOf("en"), "FR")).toBe("VAT identification number");
    expect(companyNumberLabel(tOf("en"), "FR")).toBe("SIRET number");
    expect(vatNumberLabel(tOf("de"), "FR")).toBe("USt-IdNr.");
  });

  it("are named by the other countries that name them, and as any company's elsewhere", () => {
    expect(companyNumberLabel(tOf("de"), "DE")).toBe("Steuernummer");
    expect(vatNumberLabel(tOf("de"), "DE")).toBe("USt-IdNr.");
    expect(companyNumberLabel(tOf("it"), "IT")).toBe("Codice fiscale");
    expect(vatNumberLabel(tOf("it"), "IT")).toBe("Partita IVA");
    expect(companyNumberLabel(tOf("es"), "ES")).toBe("NIF");
    expect(companyNumberLabel(tOf("pt"), "PT")).toBe("NIF");
    expect(companyNumberLabel(tOf("fi"), "FI")).toBe("Y-tunnus");
    // In the European Union, the VAT number is the intra-EU one.
    expect(vatNumberLabel(tOf("en"), "BE")).toBe("VAT identification number");
    expect(companyNumberLabel(tOf("en"), "BE")).toBe("Company number");
    // Outside it (the United Kingdom since 2020, Liechtenstein), or no country known.
    for (const country of ["GB", "LI", "US", null]) {
      expect(companyNumberLabel(tOf("en"), country)).toBe("Company number");
      expect(vatNumberLabel(tOf("en"), country)).toBe("VAT number");
    }
  });

  it("name each label in every language of the app", () => {
    for (const language of LANGUAGES) {
      const t = i18n.getFixedT(language);
      for (const country of ["CH", "FR", "DE", "IT", "ES", "PT", "FI", "BE", "US", null]) {
        for (const label of [companyNumberLabel(t, country), vatNumberLabel(t, country)]) {
          expect(label).not.toMatch(/^businessNumbers\./);
          expect(label.trim()).not.toBe("");
        }
      }
    }
  });

  it("are written once typed, the company's first, by the address's country", () => {
    const details: BusinessDetails = {
      businessAddress: { street: "", postalCode: "", city: "", country: "FR" },
      companyNumber: "123 456 789 00012",
      vatNumber: "",
      detectedCountry: "CH"
    };
    // The address's country, not the one detected when the account was created.
    expect(businessCountry(details)).toBe("FR");
    expect(businessNumbers(details, tOf("en"))).toEqual([
      { label: "SIRET number", value: "123 456 789 00012" }
    ]);
    expect(businessCountry({ ...details, businessAddress: null })).toBe("CH");
    expect(
      businessNumbers({ ...details, companyNumber: "", businessAddress: null }, tOf("en"))
    ).toEqual([]);
  });
});

describe("the business's numbers in Switzerland", () => {
  const swiss: BusinessDetails = {
    businessAddress: null,
    companyNumber: "CHE-123.456.789",
    vatNumber: "CHE-123.456.789 MWST",
    detectedCountry: "CH"
  };

  it("are the VAT number alone when it repeats the IDE, however typed", () => {
    expect(businessNumbers(swiss, tOf("de"))).toEqual([
      { label: "MWST-Nummer", value: "CHE-123.456.789 MWST" }
    ]);
    expect(
      businessNumbers({ ...swiss, companyNumber: "che 123 456 789" }, tOf("en")).map(
        ({ value }) => value
      )
    ).toEqual(["CHE-123.456.789 MWST"]);
  });

  it("are both when the VAT number is another one, or outside Switzerland", () => {
    expect(
      businessNumbers({ ...swiss, vatNumber: "CHE-987.654.321 MWST" }, tOf("en")).map(
        ({ label }) => label
      )
    ).toEqual(["UID number", "VAT number"]);
    // A Finnish VAT number holds the Y-tunnus: both are written there.
    const finnish = {
      ...swiss,
      companyNumber: "1234567-8",
      vatNumber: "FI12345678",
      detectedCountry: "FI"
    };
    expect(businessNumbers(finnish, tOf("fi")).map(({ label }) => label)).toEqual([
      "Y-tunnus",
      "ALV-tunniste"
    ]);
  });
});

describe("the business's address", () => {
  it("is written once a street, a postal code or a city is typed, its country in the app's language", () => {
    const address = {
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH"
    };
    expect(businessAddressLines(address, "en")).toEqual([
      "4 Market Street",
      "1204 Geneva",
      "Switzerland"
    ]);
    expect(businessAddressLines(address, "de")).toEqual([
      "4 Market Street",
      "1204 Geneva",
      "Schweiz"
    ]);
    expect(businessAddressLines({ ...address, street: "", country: null }, "en")).toEqual([
      "1204 Geneva"
    ]);
    expect(
      businessAddressLines({ street: "", postalCode: "", city: "", country: "CH" }, "en")
    ).toEqual([]);
    expect(businessAddressLines(null, "en")).toEqual([]);
  });
});
