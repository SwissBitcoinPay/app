import { MTPELERIN_REFERRAL_CODE } from "@/config/mtpelerin";
import { hasMainWallet } from "@/features/account/main-wallet";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId
} from "@/features/account/session";
import { invoiceNetwork } from "@/features/terminal/invoice";
import { getAppInfo } from "@/lib/app-info";
import { createMtPelerinApi, type MtPelerinApi } from "@/lib/mtpelerin/api";
import { appMtpEnvironment, type MtpEnvironment } from "@/lib/mtpelerin/environment";
import { testLoginSigner } from "@/lib/mtpelerin/evm-login";
import { mtpSessionStore, type MtpSessionStore } from "@/lib/mtpelerin/session-sync";
import { mtPelerinTransport } from "@/lib/mtpelerin/transport";
import { currentRelays } from "@/lib/relays/current";
import type { TeamKeys } from "@/lib/team/keys";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";

import { SellFlow, type SellPayer } from "./flow";
import { recordMtpSale } from "./sale-records";
import { walletPayer } from "./wallet-payer";

/**
 * This build's Mt Pelerin (src/lib/mtpelerin/environment.ts) for the open merchant's account: its
 * API and the account's session (session-sync.ts: this device's, and the relays' for its other
 * devices). Null without the open account, or for an account without a wallet of its own
 * (main-wallet.ts): it never sells, so it never logs in to Mt Pelerin.
 */
export type AccountMtpAccess = {
  environment: MtpEnvironment;
  api: MtPelerinApi;
  sessions: MtpSessionStore;
  team: TeamKeys;
};

export function accountMtpAccess(): AccountMtpAccess | null {
  return hasMainWallet() ? openAccountMtpAccess() : null;
}

/**
 * The merchant sign-up's Mt Pelerin (its bank step: the share sold
 * goes through Mt Pelerin, so its login comes before the bank details): the same API and session as
 * accountMtpAccess, for an account whose sign-up chose the merchant's usage, before its wallet
 * exists (main-wallet.ts: only once the sign-up is done). Only its login is made with it
 * (signUpLoginFlow) and its bank accounts registered (payout-accounts.ts): never a payment. Null
 * without the open account, or for an account that is no merchant's.
 */
export function signUpMtpAccess(): AccountMtpAccess | null {
  return getAccountSettings()?.usage === "merchant" ? openAccountMtpAccess() : null;
}

/**
 * "Create my merchant profile" (its split and, with a fiat share,
 * its Mt Pelerin login before the bank details, as a merchant's sign-up): a card holder's account
 * about to become a merchant's, before its wallet exists. Only its login and its bank accounts, as
 * signUpMtpAccess. Null without the open account, or for an account that is no card holder's.
 */
export function merchantProfileMtpAccess(): AccountMtpAccess | null {
  return getAccountSettings()?.usage === "card" ? openAccountMtpAccess() : null;
}

function openAccountMtpAccess(): AccountMtpAccess | null {
  const walletId = getAccountWalletId();
  const team = getAccountTeamKeys();
  if (!walletId || !team) return null;
  const environment = appMtpEnvironment();
  return {
    environment,
    api: createMtPelerinApi(mtPelerinTransport(environment)),
    sessions: mtpSessionStore({ walletId, environment }, { team, relays: currentRelays }),
    team
  };
}

/**
 * "Sell"'s flow (flow.ts) for the open merchant's account, over this build's Mt Pelerin
 * (accountMtpAccess): Mt Pelerin itself in the production app, its login by SMS; its dev/test
 * environment in the staging app, where the account logs in with its own signature. The
 * account's wallet pays Mt Pelerin's invoices (wallet-payer.ts), "Wallet"'s connection
 * (`openWallet`), each sale's record written first on the account's relays (sale-records.ts). The
 * Lightning address is the point of sale's. Null without the open owner's account, or for an
 * account without a wallet of its own (main-wallet.ts). Made by "Sell"'s panel
 * (SellSheet.tsx) and by the split's sale (SplitSale.tsx), each its own.
 */
export function accountSellFlow({
  owner,
  language,
  openWallet
}: {
  owner: OwnerTerminalProfile | null;
  /** The app's language (Mt Pelerin's e-mails). */
  language: string;
  /** "Wallet"'s connection of the account's wallet, which pays Mt Pelerin. */
  openWallet: () => Promise<void>;
}): SellFlow | null {
  const access = owner ? accountMtpAccess() : null;
  if (!owner || !access) return null;
  const { environment, api, sessions, team } = access;
  return new SellFlow({
    api,
    sessions,
    lightningAddress: owner.lightningAddress,
    appVersion: getAppInfo().version,
    language,
    network: invoiceNetwork(),
    payer: walletPayer({ openWallet: () => openWallet() }),
    recordSale: recordMtpSale,
    referralCode: MTPELERIN_REFERRAL_CODE,
    // No SMS on dev/test, its login is the signature's; production's by SMS only.
    walletLogin: environment === "test" ? testLoginSigner(team) : null
  });
}

/** No payment: the sign-up's login (signUpLoginFlow) never gets that far (flow.ts `signedIn`). */
function refuse(): Promise<never> {
  return Promise.reject(new Error("No payment at the sign-up's Mt Pelerin login"));
}

const NO_PAYMENTS: SellPayer = {
  quote: refuse,
  covers: refuse,
  balance: refuse,
  paidSince: refuse,
  confirm: refuse,
  pay: refuse
};

/**
 * The Mt Pelerin login of an account becoming a merchant's, over `access` (signUpMtpAccess,
 * merchantProfileMtpAccess): the steps of "Sell"'s login, the
 * number and its SMS code in the production app (the account's key on dev/test), then the e-mail,
 * ending once the profile is complete (flow.ts `signedIn`). The session is the account's
 * (session-sync.ts): "Sell" and the split's sale find it logged in. No Lightning address yet
 * (the point of sale is prepared once the account is a merchant's): the address is proven by
 * "Sell" before a first sale, as for any merchant.
 */
export function mtpLoginFlow(access: AccountMtpAccess, language: string): SellFlow {
  const { environment, api, sessions, team } = access;
  return new SellFlow({
    api,
    sessions,
    lightningAddress: null,
    appVersion: getAppInfo().version,
    language,
    // No invoice is read at this login: a prefix no invoice has, should one ever be.
    network: "",
    payer: NO_PAYMENTS,
    recordSale: refuse,
    referralCode: MTPELERIN_REFERRAL_CODE,
    walletLogin: environment === "test" ? testLoginSigner(team) : null
  });
}
