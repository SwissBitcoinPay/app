import type { TFunction } from "i18next";

import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import type { BusinessAddress, MerchantSettings } from "@/lib/settings/merchant";

/*
 * Who issues an invoice, under its name ("Settings › Business"):
 * its address and its numbers, on the PDF (invoice-html.ts) and its preview (RecipientStep.tsx).
 * Each number is named as the business's country names it, in the app's language (the device's,
 * English when the app does not speak it: src/i18n/languages.ts): in Switzerland "IDE" in French,
 * "UID" in German and English, "IDI" in Italian (uid.admin.ch), and the VAT number "TVA", "MWST" or
 * "IVA"; "SIRET" and the intra-EU VAT number in France (CGI, art. 242 nonies A of its annex II);
 * "Steuernummer" and "USt-IdNr." in Germany (§ 14 UStG); "Codice fiscale" and "Partita IVA" in
 * Italy (DPR 633/1972, art. 21); "NIF" in Spain and Portugal; "Y-tunnus" in Finland. Elsewhere, a
 * company number; the VAT number is the intra-EU one in the European Union ("USt-IdNr." in German,
 * "Partita IVA" in Italian…), else a VAT number. The numbers are written as typed: they are not
 * checked.
 */

/** The business's settings an invoice's issuer reads. */
export type BusinessDetails = Pick<
  MerchantSettings,
  "businessAddress" | "companyNumber" | "vatNumber" | "detectedCountry"
>;

/** A number of the business, named: "UID number", "CHE-123.456.789". */
export type BusinessNumber = { label: string; value: string };

/** Countries whose company number has a name of its own (businessNumbers.company.<code>). */
const NAMED_COMPANY_NUMBERS = ["CH", "FR", "DE", "IT", "ES", "PT", "FI"] as const;

/** The European Union's member states (ISO 3166-1 alpha-2): their VAT numbers are intra-EU. */
const EU_MEMBERS: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"
]); // prettier-ignore

/** The business's country: its address's, else the one detected when the account was created. */
export function businessCountry(details: BusinessDetails): string | null {
  return details.businessAddress?.country ?? details.detectedCountry;
}

/** How the business's country names its company number, in the app's language. */
export function companyNumberLabel(t: TFunction, country: string | null): string {
  const named = NAMED_COMPANY_NUMBERS.find((code) => code === country);
  return named ? t(`businessNumbers.company.${named}`) : t("businessNumbers.company.other");
}

/** How the business's country names its VAT number, in the app's language. */
export function vatNumberLabel(t: TFunction, country: string | null): string {
  if (country === "CH") return t("businessNumbers.vat.CH");
  if (country !== null && EU_MEMBERS.has(country)) return t("businessNumbers.vat.EU");
  return t("businessNumbers.vat.other");
}

/**
 * The business's address as its lines on an invoice: the street, the postal code and the city, the
 * country; none while neither the street, the postal code nor the city is typed (a country alone
 * is no address).
 */
export function businessAddressLines(
  address: BusinessAddress | null,
  language: Language
): string[] {
  if (!address) return [];
  const { street, postalCode, city, country } = address;
  if (street === "" && postalCode === "" && city === "") return [];
  return [
    street,
    [postalCode, city].filter(Boolean).join(" "),
    country ? getCountryName(country, language) : ""
  ].filter((line) => line !== "");
}

/**
 * The business's numbers typed, each named by its country: the company's, then the VAT one (alone
 * in Switzerland when it repeats the IDE).
 */
export function businessNumbers(details: BusinessDetails, t: TFunction): BusinessNumber[] {
  const country = businessCountry(details);
  const { companyNumber, vatNumber } = details;
  // In Switzerland the VAT number is the IDE followed by TVA, MWST or IVA: the IDE is not written
  // again beside it. Elsewhere both are written, as typed: a French VAT number holds the SIREN,
  // never the SIRET both must show.
  const repeated =
    country === "CH" &&
    companyNumber !== "" &&
    vatNumber !== "" &&
    compact(vatNumber).includes(compact(companyNumber));
  return [
    { label: companyNumberLabel(t, country), value: repeated ? "" : companyNumber },
    { label: vatNumberLabel(t, country), value: vatNumber }
  ].filter(({ value }) => value !== "");
}

/** A number's letters and digits only, in capitals: "che-123.456.789" as "CHE123456789". */
function compact(number: string): string {
  return number.toUpperCase().replace(/[^0-9A-Z]/g, "");
}
