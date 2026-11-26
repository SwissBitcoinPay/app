import { LIGHTNING_ACCOUNT_FIELDS } from "@/config/mtpelerin";
import { compactIban, isValidIban } from "@/lib/iban";

import { MtPelerinError } from "./errors";
import { isSellCurrency, sellAccountsOf } from "./sale";
import type {
  MtpAccount,
  MtpAccountOwner,
  MtpAccountOwnerName,
  MtpBankAccount,
  MtpBankAccountChange,
  MtpLightningAccount,
  MtpNewBankAccount,
  MtpNewLightningAccount,
  MtpOwnerName,
  MtpUnreadableAccount
} from "./types";

/*
 * The accounts "Sell" creates at Mt Pelerin: the merchant's
 * Lightning address, proven by its 1-sat invoice, and the bank accounts a sale is
 * wired to. `user_is_owner` is always `true`: the merchant's own address, the merchant's own
 * accounts, a company's included (as Mt Pelerin answered). A bank account's holder and
 * address can be changed (`PATCH /accounts/{id}`, undocumented), never its IBAN nor its currency.
 * Pure.
 */

/** The merchant's Lightning address, with its verification code. */
export function newLightningAccount(
  address: string,
  verificationCode: string
): MtpNewLightningAccount {
  return {
    type: "lightning",
    ...LIGHTNING_ACCOUNT_FIELDS,
    crypto_address: address,
    verification_code: verificationCode,
    user_is_owner: true
  };
}

/** Who holds a bank account and where they live, as the merchant types them. */
export type BankOwnerInput = {
  holder: MtpOwnerName;
  street: string;
  postcode: string;
  city: string;
  /** ISO 3166-1 alpha-2, null until chosen. */
  country: string | null;
};

/** What the merchant types for a bank account ("Add an account"). */
export type BankAccountInput = BankOwnerInput & {
  iban: string;
  currency: string;
};

/** The holder's name as a line: "Acme Ltd", "Alice Smith". */
export function ownerNameText(name: MtpAccountOwnerName): string {
  return name.kind === "person" ? `${name.firstname} ${name.lastname}` : name.name;
}

const filled = (value: string) => value.trim() !== "";

/** A holder and address the merchant typed, every line there. */
export type TypedOwner = {
  name: MtpOwnerName;
  street: string;
  postcode: string;
  city: string;
  country: string;
};

/** `input`'s holder and address trimmed; null while one is missing or the country is not one. */
function ownerOf(input: BankOwnerInput): TypedOwner | null {
  const { holder, street, postcode, city, country } = input;
  const names = holder.kind === "company" ? [holder.name] : [holder.firstname, holder.lastname];
  if (!names.every(filled) || ![street, postcode, city].every(filled)) return null;
  if (country === null || !/^[A-Z]{2}$/.test(country)) return null;
  return {
    name:
      holder.kind === "company"
        ? { kind: "company", name: holder.name.trim() }
        : { kind: "person", firstname: holder.firstname.trim(), lastname: holder.lastname.trim() },
    street: street.trim(),
    postcode: postcode.trim(),
    city: city.trim(),
    country
  };
}

/** The account's label the app gives it (`reference`): its holder's name. */
function referenceOf(name: MtpAccountOwnerName): string {
  return ownerNameText(name).slice(0, 128);
}

/**
 * The account to create from `input`, its fields trimmed; null while one is missing or
 * invalid (the IBAN's checksum, the currency, the country): nothing is sent.
 */
export function newBankAccount(input: BankAccountInput): MtpNewBankAccount | null {
  const owner = ownerOf(input);
  if (owner === null) return null;
  const { iban, currency } = input;
  if (!isValidIban(iban) || !isSellCurrency(currency)) return null;
  const { name } = owner;
  return {
    type: "external",
    reference: referenceOf(name),
    iban: compactIban(iban),
    currency,
    ...(name.kind === "company"
      ? { owner_companyname: name.name }
      : { owner_firstname: name.firstname, owner_lastname: name.lastname }),
    owner_street: owner.street,
    owner_postcode: owner.postcode,
    owner_city: owner.city,
    owner_country: owner.country,
    user_is_owner: true
  };
}

function sameName(a: MtpAccountOwnerName, b: MtpAccountOwnerName): boolean {
  if (a.kind === "person") {
    return b.kind === "person" && a.firstname === b.firstname && a.lastname === b.lastname;
  }
  // A holder in one name (`unsaid`) is never the same as a company's or a person's typed: saying
  // which it is changes it.
  return b.kind === a.kind && a.name === b.name;
}

/** Whether two holders and addresses are the same, line by line. */
export function sameOwner(a: MtpAccountOwner, b: MtpAccountOwner): boolean {
  return (
    sameName(a.name, b.name) &&
    a.street === b.street &&
    a.postcode === b.postcode &&
    a.city === b.city &&
    a.country === b.country
  );
}

/** A change of `account`'s holder and address: the request, and the holder and address it says. */
export type BankAccountChange = { request: MtpBankAccountChange; owner: TypedOwner };

/**
 * `account`'s holder and address as `input` says them; null while a field is missing or invalid,
 * or when nothing changes: nothing is sent. The other kind's names are cleared (`null`): a holder
 * that becomes a company is no longer read as a person. The label (`reference`) follows the name
 * only while it was the one the app gave (the holder's name) or none: a label of the merchant's,
 * given elsewhere, stays.
 */
export function bankAccountChange(
  account: MtpBankAccount,
  input: BankOwnerInput
): BankAccountChange | null {
  const owner = ownerOf(input);
  if (owner === null || sameOwner(owner, account.owner)) return null;
  const { name } = owner;
  const ownLabel = account.label === null || account.label === referenceOf(account.owner.name);
  return {
    owner,
    request: {
      owner_firstname: name.kind === "person" ? name.firstname : null,
      owner_lastname: name.kind === "person" ? name.lastname : null,
      owner_companyname: name.kind === "company" ? name.name : null,
      owner_street: owner.street,
      owner_postcode: owner.postcode,
      owner_city: owner.city,
      owner_country: owner.country,
      ...(ownLabel ? { reference: referenceOf(name) } : {})
    }
  };
}

/**
 * Whether Mt Pelerin's answer to `change` is `account` changed as asked: the same account (id,
 * IBAN, currency), its holder and address the ones sent. An answer that says otherwise (a field
 * kept, another account) is never shown as done.
 */
export function changeApplied(
  answer: MtpAccount,
  account: MtpBankAccount,
  change: BankAccountChange
): boolean {
  return (
    answer.kind === "bank" &&
    answer.id === account.id &&
    answer.iban === account.iban &&
    answer.currency === account.currency &&
    sameOwner(answer.owner, change.owner)
  );
}

/**
 * The account of `accounts` a sale may go to (sellAccountsOf) with `iban` (compact) and
 * `currency`: Mt Pelerin takes the same IBAN twice on one profile (dev/test), a
 * second one is never created. One it rejected or closed does not count: the account is created
 * again.
 */
export function knownBankAccount(
  accounts: readonly MtpBankAccount[],
  { iban, currency }: { iban: string; currency: string }
): MtpBankAccount | null {
  return (
    sellAccountsOf(accounts).find(
      (account) => account.iban === iban && account.currency === currency
    ) ?? null
  );
}

export function lightningAccountsOf(accounts: readonly MtpAccount[]): MtpLightningAccount[] {
  return accounts.filter((account): account is MtpLightningAccount => account.kind === "lightning");
}

export function bankAccountsOf(accounts: readonly MtpAccount[]): MtpBankAccount[] {
  return accounts.filter((account): account is MtpBankAccount => account.kind === "bank");
}

/** The accounts of a list the guards could not read (guards.ts `readAccounts`). */
export function unreadableAccountsOf(accounts: readonly MtpAccount[]): MtpUnreadableAccount[] {
  return accounts.filter(
    (account): account is MtpUnreadableAccount => account.kind === "unreadable"
  );
}

/**
 * The failure of a list of accounts read with `unreadable` among them, when what it lacks would
 * decide ("no such account"): MtPelerinError "malformed" naming the list's call and the field.
 */
export function unreadableAccountError(unreadable: MtpUnreadableAccount): MtPelerinError {
  return new MtPelerinError("malformed", null, null, {
    call: "listAccounts",
    field: unreadable.field
  });
}

/**
 * Whether Mt Pelerin lacks a line of the holder's address (a missing or incomplete address can
 * delay or block the transfer): the account is still offered, said so.
 */
export function hasIncompleteAddress(account: MtpBankAccount): boolean {
  const { street, postcode, city, country } = account.owner;
  return [street, postcode, city, country].some((line) => line === null || line.trim() === "");
}

/** The IBAN's last four characters, as rows show it: "CH93 •••• 2957". */
export function maskedIban(iban: string): string {
  const compact = compactIban(iban);
  return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
}
