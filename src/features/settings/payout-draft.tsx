import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_PAYOUT_CURRENCY,
  isPayoutCurrency,
  type PayoutCurrency
} from "@/config/payout-currencies";
import { getAccountSettings } from "@/features/account/session";
import { emptyBankDetails, type BankDetails } from "@/features/bank/bank-details";
import type { MerchantSettings } from "@/lib/settings/merchant";

/*
 * What "Split" (02) and "Bank account" (03) of the settings change, kept while the
 * owner goes from one to the other (the settings' stack holds it): started from the account's
 * settings each time the split opens, saved by the last step only.
 */

export type PayoutDraft = {
  bitcoinPercent: number;
  payoutCurrency: PayoutCurrency;
  /** The bank details typed, in memory only: they go to Mt Pelerin, never into the settings. */
  bank: BankDetails;
  /** The detected country, listed first by the country picker. */
  detectedCountry: string | null;
};

type PayoutDraftState = {
  draft: PayoutDraft;
  /** Starts the draft again from the account's settings (the split opens). */
  start: () => void;
  update: (patch: Partial<Omit<PayoutDraft, "bank">>) => void;
  updateBank: (patch: Partial<BankDetails>) => void;
};

/**
 * The account's payout currency, or what a new account gets when this version no longer offers it
 * (the list may change): the currency the payout screens show, and save.
 */
export function offeredPayoutCurrency(settings: MerchantSettings | null): PayoutCurrency {
  return settings && isPayoutCurrency(settings.payoutCurrency)
    ? settings.payoutCurrency
    : DEFAULT_PAYOUT_CURRENCY;
}

function draftOf(settings: MerchantSettings | null): PayoutDraft {
  return {
    bitcoinPercent: settings?.bitcoinPercent ?? 100,
    payoutCurrency: offeredPayoutCurrency(settings),
    // Nothing of the account's bank account: its details are Mt Pelerin's, read there; the form
    // starts empty, or from one of Mt Pelerin's accounts.
    bank: emptyBankDetails(settings?.detectedCountry ?? null),
    detectedCountry: settings?.detectedCountry ?? null
  };
}

const PayoutDraftContext = createContext<PayoutDraftState | null>(null);

export function PayoutDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(() => draftOf(getAccountSettings()));
  // Stable: the split starts the draft when it mounts, never again while it shows.
  const start = useCallback(() => setDraft(draftOf(getAccountSettings())), []);
  const update = useCallback(
    (patch: Partial<Omit<PayoutDraft, "bank">>) =>
      setDraft((previous) => ({ ...previous, ...patch })),
    []
  );
  const updateBank = useCallback(
    (patch: Partial<BankDetails>) =>
      setDraft((previous) => ({ ...previous, bank: { ...previous.bank, ...patch } })),
    []
  );
  const value = useMemo<PayoutDraftState>(
    () => ({ draft, start, update, updateBank }),
    [draft, start, update, updateBank]
  );
  return <PayoutDraftContext.Provider value={value}>{children}</PayoutDraftContext.Provider>;
}

export function usePayoutDraft(): PayoutDraftState {
  const state = useContext(PayoutDraftContext);
  if (!state) throw new Error("usePayoutDraft must be used inside <PayoutDraftProvider>");
  return state;
}
