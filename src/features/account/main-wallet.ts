import type { MerchantSettings } from "@/lib/settings/merchant";

import { getAccountSettings } from "./session";

/*
 * The account's own wallet ("Wallet", the main balance) belongs to merchants only: an account
 * opened to manage cards (usage "card") never has one, nor is it ever created; each of its cards
 * pays from its own wallet (src/features/card/card-wallet.ts). Its id still names what the device
 * keeps of the account (walletIdOf, never connecting it). Every connection of the account's wallet
 * asks here first: the sign-up's end, the login and "Create my merchant profile" (activate.ts), the
 * screens that use it (wallet-access.ts), the background tasks (background-wallet.ts). A sign-up
 * not done yet has none either: its merchant path connects it once done, preparing the point of
 * sale.
 */

/** The account is not a merchant's: it has no main wallet (see above). */
export class NoMainWalletError extends Error {
  constructor() {
    super("The account has no main wallet");
    this.name = "NoMainWalletError";
  }
}

/** Whether the account of `settings` has a wallet of its own: a merchant's, its sign-up done. */
export function settingsHaveMainWallet(settings: MerchantSettings): boolean {
  return settings.signUp === "done" && settings.usage === "merchant";
}

/** Whether the open account may connect its own wallet: a merchant's, its sign-up done. */
export function hasMainWallet(): boolean {
  const settings = getAccountSettings();
  return settings !== null && settingsHaveMainWallet(settings);
}

/** NoMainWalletError unless the open account may connect its own wallet (hasMainWallet). */
export function requireMainWallet(): void {
  if (!hasMainWallet()) throw new NoMainWalletError();
}
