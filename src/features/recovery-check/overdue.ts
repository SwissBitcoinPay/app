import { getAccountSettings, getAccountWalletId } from "@/features/account/session";
import { nowUnix } from "@/lib/clock";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { loadMerchantSettings } from "@/lib/settings/store";

import { recoveryCheckState } from "./policy";

/*
 * Past the 30 days of a check of the recovery phrase: every
 * payment that asks the passkey is refused until its owner types the 12 words back (policy.ts),
 * before the passkey is asked (wallet-access.ts, card payments with the app locked: payment.ts).
 * Nor what would let a card pay more without asking: a limit
 * raised, a looser mode, a merchant approved (manage.ts, payee-mode.ts, CardHistoryDetail.tsx).
 * Never "Open with my 12 words" (src/features/rescue/), what makes a card safer (a pause, a
 * limit lowered, a stricter mode, a merchant removed), nor the passkey that unlocks the app or
 * shows the words.
 */

/** A payment refused: the check of the words is overdue. */
export class RecoveryCheckOverdueError extends Error {
  constructor() {
    super("The check of the recovery phrase is overdue");
    this.name = "RecoveryCheckOverdueError";
  }
}

/** Whether `settings` hold a check of the words past its 30 days at `now`. */
export function recoveryCheckOverdue(settings: MerchantSettings, now: number = nowUnix()): boolean {
  return recoveryCheckState(settings.recoveryCheck, now).kind === "overdue";
}

/** Whether the open account's check is overdue now (false without an open account). */
export function openAccountOverdue(): boolean {
  const settings = getAccountSettings();
  return settings !== null && recoveryCheckOverdue(settings);
}

/** Refuses a payment of the open account while its check is overdue. */
export function refuseOverduePayment(): void {
  if (openAccountOverdue()) throw new RecoveryCheckOverdueError();
}

/**
 * Refuses a payment of the account `walletId` while its check is overdue: its settings the open
 * account's, else this device's copy (the app locked: a card's payment confirmed by the passkey).
 */
export async function refuseOverduePaymentOf(walletId: string): Promise<void> {
  const settings =
    getAccountWalletId()?.toLowerCase() === walletId.toLowerCase()
      ? getAccountSettings()
      : await loadMerchantSettings(walletId).catch(() => null);
  if (settings && recoveryCheckOverdue(settings)) throw new RecoveryCheckOverdueError();
}
