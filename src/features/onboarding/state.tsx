import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_PAYOUT_CURRENCY,
  isPayoutCurrency,
  type PayoutCurrency
} from "@/config/payout-currencies";
import {
  getAccountRevision,
  getAccountSettings,
  getAccountWalletId
} from "@/features/account/session";
import { emptyBankDetails, type BankDetails } from "@/features/bank/bank-details";
import { migrationBankDraft } from "@/features/migration/flow";
import { getDeviceLocale, type DeviceLocale } from "@/lib/locale/device";
import type { AccountUsage, MerchantSettings, SettingsPatch } from "@/lib/settings/merchant";

export type Usage = AccountUsage;

type OnboardingState = {
  device: DeviceLocale;
  /** The account's, chosen on the welcome screen (src/app/index.tsx). */
  usage: Usage | null;
  /** Share of each payment kept in bitcoin, integer 0–100. Defaults to 100. */
  bitcoinPercent: number;
  setBitcoinPercent: (value: number) => void;
  /**
   * Picked on the split screen, else the account's: detected when it was created
   * (src/features/account/detection.ts), among the payout currencies of
   * src/config/payout-currencies.ts. Saved with the split, never detected again for this account.
   */
  payoutCurrency: PayoutCurrency;
  setPayoutCurrency: (currency: PayoutCurrency) => void;
  /** The detected country of residence (see detectCountry), listed first by the country picker. */
  detectedCountry: string | null;
  /** The bank details typed, in memory only: they go to Mt Pelerin, never into the settings. */
  bank: BankDetails;
  updateBank: (patch: Partial<BankDetails>) => void;
  /**
   * The account's revision (session.ts) when the answers above were read from its settings: the
   * steps save them only while it holds (useSaveStep).
   */
  revision: number;
  /**
   * Whether the setup screen failed to prepare this device's point of sale (useAccountSetup):
   * until then, the header's back button is greyed on it.
   */
  setupFailed: boolean;
  setSetupFailed: (failed: boolean) => void;
  /**
   * A step that must not be left now (the card step while the card is written to): the header's
   * back button is greyed.
   */
  backBlocked: boolean;
  setBackBlocked: (blocked: boolean) => void;
};

/**
 * Whether part of each payment is paid out in fiat: the bank details step, its dot and the saved
 * bank account all depend on it.
 */
export function hasFiatShare(bitcoinPercent: number): boolean {
  return bitcoinPercent < 100;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

/**
 * Sign-up answers, kept in memory while the merchant goes through the steps, starting from the
 * settings of the open account (src/features/account/session.ts): a sign-up that resumes shows
 * the answers saved at the previous steps. The steps save them as they go (useSaveStep,
 * useFinishSignUp), then the setup screen prepares the point of sale (useAccountSetup). The
 * onboarding layout only renders this with an open account.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [device] = useState(getDeviceLocale);
  const [saved] = useState(getAccountSettings);
  const [revision] = useState(getAccountRevision);
  const usage = saved?.usage ?? null;
  const [bitcoinPercent, setBitcoinPercent] = useState(saved?.bitcoinPercent ?? 100);
  // Until the merchant picks one, the payout currency is the account's.
  const [pickedCurrency, setPayoutCurrency] = useState<PayoutCurrency | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const [backBlocked, setBackBlocked] = useState(false);
  // The v2 account a migration read (its lines as the v2 server gave them), else nothing typed
  // yet: the settings keep no bank details, only the id of the account registered at Mt Pelerin.
  const [bank, setBank] = useState<BankDetails>(
    () => migrationBankDraft(getAccountWalletId()) ?? emptyBankDetails()
  );

  const value = useMemo<OnboardingState>(() => {
    const detectedCountry = saved?.detectedCountry ?? null;
    return {
      device,
      usage,
      bitcoinPercent,
      setBitcoinPercent,
      payoutCurrency: pickedCurrency ?? savedCurrency(saved),
      setPayoutCurrency,
      detectedCountry,
      // Until the merchant picks a country, it follows the detection.
      bank: { ...bank, country: bank.country ?? detectedCountry },
      updateBank: (patch) => setBank((previous) => ({ ...previous, ...patch })),
      revision,
      setupFailed,
      setSetupFailed,
      backBlocked,
      setBackBlocked
    };
  }, [
    device,
    saved,
    revision,
    usage,
    bitcoinPercent,
    pickedCurrency,
    bank,
    setupFailed,
    backBlocked
  ]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/**
 * The account's payout currency. Without an account (the layout then leaves for the welcome
 * screen), or with one this version does not offer (the list may change), what a new account gets:
 * the screens show the currency they save.
 */
function savedCurrency(saved: MerchantSettings | null): PayoutCurrency {
  return saved && isPayoutCurrency(saved.payoutCurrency)
    ? saved.payoutCurrency
    : DEFAULT_PAYOUT_CURRENCY;
}

export function useOnboarding(): OnboardingState {
  const state = useContext(OnboardingContext);
  if (!state) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return state;
}

/**
 * The answers of the split screen: the share kept in bitcoin and the payout currency. The display
 * currency is the payout currency.
 */
export function splitAnswers({
  bitcoinPercent,
  payoutCurrency
}: Pick<OnboardingState, "bitcoinPercent" | "payoutCurrency">): SettingsPatch {
  return { usage: "merchant", bitcoinPercent, payoutCurrency, displayCurrency: payoutCurrency };
}

/**
 * What "Start accepting payments" saves: the sign-up is done, with the answers of the split screen
 * and, with a fiat share, the Mt Pelerin bank account it goes to (`payoutAccountId`, its id: the
 * account was registered there first, src/app/onboarding/bank.tsx). Throws for a fiat share
 * without one: nothing is saved then.
 */
export function finishedSignUp(
  state: Pick<OnboardingState, "bitcoinPercent" | "payoutCurrency">,
  payoutAccountId: string | null
): SettingsPatch {
  const fiat = hasFiatShare(state.bitcoinPercent);
  if (fiat && payoutAccountId === null) throw new Error("A fiat share without its bank account");
  return {
    ...splitAnswers(state),
    signUp: "done",
    payoutAccountId: fiat ? payoutAccountId : null
  };
}
