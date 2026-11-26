import type { SellCurrency } from "@/config/mtpelerin";
import { emptyBankDetails, splitHolderName, type BankDetails } from "@/features/bank/bank-details";
import type { AccountMtpAccess } from "@/features/sell/account-flow";
import { logUnreadableAccounts } from "@/features/sell/flow";
import { formatIban } from "@/lib/iban";
import {
  bankAccountChange,
  bankAccountsOf,
  changeApplied,
  knownBankAccount,
  newBankAccount,
  unreadableAccountError,
  unreadableAccountsOf,
  type BankAccountInput
} from "@/lib/mtpelerin/accounts";
import { MtPelerinError, isAccountRefusal, isDuplicateAccount } from "@/lib/mtpelerin/errors";
import { logFailure } from "@/lib/log/log";
import { sellAccountsOf } from "@/lib/mtpelerin/sale";
import { createMtpSession, MtpSessionLostError, type MtpSession } from "@/lib/mtpelerin/session";
import type { MtpBankAccount, MtpUnreadableAccount } from "@/lib/mtpelerin/types";

/*
 * The merchant's bank accounts at Mt Pelerin, for "Settings › Bank account" and the bank step of
 * the sign-up and of "Create my merchant profile": the
 * accounts it has there, and the one typed registered there (as "Sell"'s "Add an
 * account"). The settings keep only the id of the account the split's sale goes to
 * (`payoutAccountId`, saleAccount in SalePage.tsx): its IBAN, holder and address are Mt Pelerin's,
 * read from its API, never kept by the app.
 *
 * An account Mt Pelerin has already (same IBAN and currency) whose holder or address the merchant
 * typed otherwise is changed there (`PATCH /accounts/{id}`, as
 * "Sell › Bank accounts"), so that each transfer carries what was typed; Mt Pelerin refusing
 * it, nothing is saved.
 *
 * Only the session and the accounts are read, never "Sell"'s steps (flow.ts): opening the
 * settings asks Mt Pelerin for nothing else (no 1-sat invoice of a Lightning address not proven).
 */

/**
 * What Mt Pelerin has: not connected, or its bank accounts a sale may go to (sellAccountsOf), and
 * how many of its accounts the guards could not read (never offered).
 */
export type PayoutAccountsRead =
  { connected: false } | { connected: true; accounts: MtpBankAccount[]; unreadable: number };

/** What registering an account at Mt Pelerin did. */
export type PayoutAccountRegistration =
  | {
      /**
       * `registered`: created at Mt Pelerin. `known`: Mt Pelerin already had it, active or pending
       * (same IBAN and currency), as typed: nothing sent. `updated`: Mt Pelerin had it with another
       * holder or address, changed there and read again to be sure.
       */
      kind: "registered" | "known" | "updated";
      /** Mt Pelerin's id of the account (`beneficiary_id`): what the settings keep. */
      accountId: string;
    }
  | {
      /**
       * `unchanged`: Mt Pelerin had it with another holder or address and refused, or kept, them.
       * `ibanTaken`: "Duplicate account", the IBAN is another profile's. `notConnected`:
       * no session any more. Nothing to save, in each case.
       */
      kind: "unchanged" | "ibanTaken" | "notConnected";
    };

export type PayoutAccounts = {
  /**
   * Whether the account holds a Mt Pelerin session (this device's or its relays'), Mt Pelerin not
   * asked: its token may still be refused, `register` then answers `notConnected`.
   */
  connected(): Promise<boolean>;
  /** Rejects when Mt Pelerin did not answer (MtPelerinError): nothing is told then. */
  read(): Promise<PayoutAccountsRead>;
  /** `input` registered at Mt Pelerin unless it has it already. Rejects as `read`. */
  register(
    input: BankAccountInput & { currency: SellCurrency }
  ): Promise<PayoutAccountRegistration>;
};

/** Mt Pelerin's bank accounts of the open merchant's account, over `access`'s session. */
export function payoutAccounts(access: Pick<AccountMtpAccess, "api" | "sessions">): PayoutAccounts {
  const { api, sessions } = access;
  let session: Promise<MtpSession> | null = null;
  const opened = (): Promise<MtpSession> => {
    // A load that failed is tried again by the next call.
    session ??= sessions
      .load()
      .then(({ refreshToken }) => createMtpSession(api, sessions, refreshToken))
      .catch((error: unknown) => {
        session = null;
        throw error;
      });
    return session;
  };
  /**
   * Every bank account of the profile, any status and currency, and those the guards could
   * not read (never offered); null: not connected.
   */
  const banks = async (): Promise<{
    accounts: MtpBankAccount[];
    unreadable: MtpUnreadableAccount[];
  } | null> => {
    const current = await opened();
    if (!current.open()) return null;
    try {
      const listed = await current.authed((token) => api.listAccounts(token, { type: "external" }));
      return { accounts: bankAccountsOf(listed), unreadable: unreadableAccountsOf(listed) };
    } catch (error) {
      if (error instanceof MtpSessionLostError) return null;
      throw error;
    }
  };
  /**
   * `known`'s holder and address as `input` says them (a new account's fields only), then read
   * again.
   */
  const changeKnown = async (
    known: MtpBankAccount,
    input: BankAccountInput
  ): Promise<PayoutAccountRegistration> => {
    const change = bankAccountChange(known, input);
    if (change === null) return { kind: "known", accountId: known.id };
    const current = await opened();
    try {
      await current.authed((token) => api.updateBankAccount(token, known.id, change.request));
    } catch (error) {
      if (error instanceof MtpSessionLostError) return { kind: "notConnected" };
      if (!isAccountRefusal(error)) throw error;
      logFailure("Mt Pelerin refused a bank account's change", error, false);
      return { kind: "unchanged" };
    }
    // What Mt Pelerin has, read again, decides: its answer alone proves nothing kept.
    const after = await banks();
    if (after === null) return { kind: "notConnected" };
    const read = after.accounts.find(({ id }) => id === known.id);
    if (read === undefined || !changeApplied(read, known, change)) {
      logFailure("Mt Pelerin kept a bank account unchanged");
      return { kind: "unchanged" };
    }
    return { kind: "updated", accountId: known.id };
  };

  return {
    connected: async () => (await opened()).open(),
    async read() {
      const listed = await banks();
      if (listed === null) return { connected: false };
      const accounts = sellAccountsOf(listed.accounts);
      // As "Sell" (flow.ts): accounts the guards could not read are never offered, and
      // without any other, "none at Mt Pelerin" is never told.
      if (listed.unreadable[0] && accounts.length === 0) {
        throw unreadableAccountError(listed.unreadable[0]);
      }
      logUnreadableAccounts(listed.unreadable);
      return { connected: true, accounts, unreadable: listed.unreadable.length };
    },
    async register(input) {
      const listed = await banks();
      if (listed === null) return { kind: "notConnected" };
      const { accounts, unreadable } = listed;
      const body = newBankAccount(input);
      if (body === null) throw new Error("Incomplete bank account");
      // Known only as an account a sale may go to (sellAccountsOf): one Mt Pelerin rejected or
      // closed is not where the split's sale goes (saleAccount), it is registered again.
      const known = knownBankAccount(accounts, body);
      if (known !== null) return changeKnown(known, input);
      const current = await opened();
      try {
        const created = await current.authed((token) => api.createAccount(token, body));
        // Created, its answer unread (guards.ts): its id unknown, nothing saved; the next read
        // finds it (`known`).
        if (created.kind === "unreadable") {
          throw new MtPelerinError("malformed", null, null, {
            call: "createAccount",
            field: created.field
          });
        }
        return { kind: "registered", accountId: created.id };
      } catch (error) {
        if (error instanceof MtpSessionLostError) return { kind: "notConnected" };
        if (!isDuplicateAccount(error)) throw error;
        // The IBAN may be one of the merchant's own accounts the guards could not read: never
        // told another profile's then.
        if (unreadable[0]) throw unreadableAccountError(unreadable[0]);
        return { kind: "ibanTaken" };
      }
    }
  };
}

/** The accounts of `accounts` in `currency`: those that wire the split's share in that currency. */
export function payoutAccountsIn(
  accounts: readonly MtpBankAccount[],
  currency: string
): MtpBankAccount[] {
  return accounts.filter((account) => account.currency === currency);
}

const filled = (value: string | null): value is string => value !== null && value.trim() !== "";

/**
 * Whether Mt Pelerin has every line of `account`'s holder and address (its lines may be
 * missing): one that lacks a line is completed in the form before it is chosen, so that each
 * transfer carries them.
 */
export function ownerComplete(account: MtpBankAccount): boolean {
  const { name, street, postcode, city, country } = account.owner;
  // A holder Mt Pelerin wrote as one name (`unsaid`) is a person's or a company's: the form asks.
  const named =
    name.kind === "unsaid"
      ? false
      : name.kind === "company"
        ? filled(name.name)
        : filled(name.firstname) && filled(name.lastname);
  return named && filled(street) && filled(postcode) && filled(city) && country !== null;
}

/**
 * The form filled with what Mt Pelerin has of `account` (to complete or to change): its holder,
 * its IBAN and the address lines it has, the country `fallbackCountry` when it has none.
 */
export function bankDetailsOfAccount(
  account: MtpBankAccount,
  fallbackCountry: string | null
): BankDetails {
  const { name, street, postcode, city, country } = account.owner;
  return {
    ...emptyBankDetails(country ?? fallbackCountry),
    ...(name.kind === "company"
      ? { holderKind: "company" as const, companyName: name.name }
      : name.kind === "person"
        ? { holderKind: "person" as const, firstname: name.firstname, lastname: name.lastname }
        : // One name, its kind not said: in both kinds' fields, the kind asked (as bankDetailsOf).
          { holderKind: null, companyName: name.name, ...splitHolderName(name.name) }),
    iban: formatIban(account.iban),
    address: street ?? "",
    postalCode: postcode ?? "",
    city: city ?? ""
  };
}
