import { compactIban, isValidIban } from "@/lib/iban";
import type { BankAccountInput } from "@/lib/mtpelerin/accounts";
import type { MtpOwnerName } from "@/lib/mtpelerin/types";

/*
 * Bank details as they are typed (BankDetailsFields): wherever the app asks for them (the sign-up,
 * "Settings › Bank account", "Sell"'s bank accounts), with who holds the account, a person or a
 * company, always asked. The names of both kinds are kept while the merchant goes from one to the
 * other. In memory only, while the form shows: what is typed goes to Mt Pelerin (BankAccountInput),
 * never into the settings.
 */

export type BankHolderKind = "person" | "company";

export type BankDetails = {
  /** null until chosen: a v2 account's holder (one name, migration/plan.ts) asks it too. */
  holderKind: BankHolderKind | null;
  companyName: string;
  firstname: string;
  lastname: string;
  /**
   * The holder's country of residence, indicative only: it is not the IBAN's country and does not
   * restrict the payout currency. Picked by the merchant, else the detected country (see
   * detectCountry).
   */
  country: string | null;
  /** As typed: grouped by four. */
  iban: string;
  address: string;
  postalCode: string;
  city: string;
};

/** Nothing typed yet, the country detected (null: none). */
export function emptyBankDetails(country: string | null = null): BankDetails {
  return {
    holderKind: null,
    companyName: "",
    firstname: "",
    lastname: "",
    country,
    iban: "",
    address: "",
    postalCode: "",
    city: ""
  };
}

/**
 * A holder said as one name (the v2 server's): "Satoshi Alice Nakamoto" → "Satoshi Alice",
 * "Nakamoto"; one word: the last name. Its kind is asked: the names to correct.
 */
export function splitHolderName(name: string): { firstname: string; lastname: string } {
  const words = name.trim().split(/\s+/);
  const lastname = words.pop() ?? "";
  return { firstname: words.join(" "), lastname };
}

/** The holder typed, trimmed; null while its kind is not chosen or a name is missing. */
export function bankHolderOf(details: BankDetails): MtpOwnerName | null {
  if (details.holderKind === "company") {
    const name = details.companyName.trim();
    return name === "" ? null : { kind: "company", name };
  }
  if (details.holderKind === "person") {
    const firstname = details.firstname.trim();
    const lastname = details.lastname.trim();
    return firstname === "" || lastname === "" ? null : { kind: "person", firstname, lastname };
  }
  return null;
}

/** Whether every required field is there: the holder, a valid IBAN, the address, the country. */
export function bankDetailsComplete(details: BankDetails): boolean {
  return (
    bankHolderOf(details) !== null &&
    !!details.country &&
    isValidIban(details.iban) &&
    [details.address, details.postalCode, details.city].every((value) => value.trim() !== "")
  );
}

/**
 * What Mt Pelerin registers for the account typed, in `currency`: compact IBAN, trimmed
 * fields. Null until complete (bankDetailsComplete).
 */
export function bankAccountInputOf(
  details: BankDetails,
  currency: string
): BankAccountInput | null {
  const holder = bankHolderOf(details);
  if (!holder || !details.country || !bankDetailsComplete(details)) return null;
  return {
    holder,
    iban: compactIban(details.iban),
    street: details.address.trim(),
    postcode: details.postalCode.trim(),
    city: details.city.trim(),
    country: details.country,
    currency
  };
}
