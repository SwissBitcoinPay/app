import { isPayoutCurrency } from "@/config/payout-currencies";
import { splitHolderName, type BankDetails } from "@/features/bank/bank-details";
import { normalizeBusinessName } from "@/features/settings/account-settings";
import { formatIban } from "@/lib/iban";
import type { LegacyAccountCopy } from "@/lib/legacy-v2/data";
import type { LegacyAccount, LegacyBankAccount } from "@/lib/legacy-v2/server";
import type { SettingsPatch } from "@/lib/settings/merchant";

/*
 * The sattle.me account of a v2 owner, as the migration creates it:
 * a merchant's, with what the v2 account said of its business and how it was paid out. Its business
 * name, its point of sale's currency and its on-chain payments come from the v2 server, else from
 * the v2 app's copy of the account; the share kept in bitcoin and the bank account of the rest from
 * the v2 server only (never guessed).
 *
 * As a new merchant's sign-up: all in bitcoin, the sign-up is done; with a share in a bank, the
 * account is created at its bank step (src/app/onboarding/bank.tsx), where the merchant logs in to
 * Mt Pelerin (their own account: the v2 server registered the bank accounts under Swiss Bitcoin
 * Pay's) and confirms the v2 bank account, prefilled (`bankDraft`), which is then registered there;
 * without the v2 share, at its split. No 1-sat invoice is asked meanwhile: "Sell" proves the
 * Lightning address before a first sale.
 */

export type MigrationPlan = {
  /** What the new account's settings get, its sign-up's state included. */
  patch: SettingsPatch;
  /**
   * The v2 bank account as the bank step's form starts, whatever lines the v2 server gave (the
   * holder as one name, its kind to choose); null without one, or all in bitcoin.
   */
  bankDraft: BankDetails | null;
};

/** The v2 bank account in the bank form (BankDetailsFields), its lines as the v2 server gave them. */
export function bankDraftOf(bank: LegacyBankAccount | null): BankDetails | null {
  if (!bank) return null;
  const holder = bank.holderName ?? "";
  return {
    holderKind: null,
    companyName: holder,
    ...splitHolderName(holder),
    country: bank.country,
    iban: formatIban(bank.iban),
    address: bank.address ?? "",
    postalCode: bank.postalCode ?? "",
    // Its address complement and transfer reference stay out: Mt Pelerin takes neither.
    city: bank.city ?? ""
  };
}

/** The first of `codes` this app pays out and counts in (src/config/payout-currencies.ts). */
function payoutCurrencyOf(...codes: (string | null | undefined)[]): string | null {
  return codes.find((code): code is string => !!code && isPayoutCurrency(code)) ?? null;
}

/**
 * The new account's settings from the v2 account (`account`, read with the owner's session; null
 * when it could not be) and the v2 app's copy of it (`copy`). Anything unsaid keeps the new
 * account's own value (detected at its creation).
 */
export function migrationPlan(
  copy: LegacyAccountCopy | null,
  account: LegacyAccount | null
): MigrationPlan {
  const name = normalizeBusinessName(account?.name ?? copy?.name ?? "");
  const display = payoutCurrencyOf(account?.currency, copy?.currency);
  const payout = payoutCurrencyOf(account?.bankCurrency, display);
  const onchain = account?.onchain ?? copy?.onchain ?? null;
  const percent = account?.bitcoinPercent ?? null;
  return {
    patch: {
      usage: "merchant",
      ...(name !== "" ? { businessName: name } : {}),
      ...(display ? { displayCurrency: display } : {}),
      ...(payout ? { payoutCurrency: payout } : {}),
      ...(onchain !== null ? { onchainPayments: onchain } : {}),
      bitcoinPercent: percent ?? 100,
      // The bank account is Mt Pelerin's, registered at the bank step: never saved here.
      payoutAccountId: null,
      signUp: percent === 100 ? "done" : percent === null ? "split" : "bank"
    },
    bankDraft: percent === 100 ? null : bankDraftOf(account?.bank ?? null)
  };
}
