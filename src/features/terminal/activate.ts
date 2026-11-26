import { requireMainWallet } from "@/features/account/main-wallet";
import {
  OtherAccountError,
  getAccountBackupKey,
  getAccountSeed,
  getAccountWalletId
} from "@/features/account/session";
import {
  connectWallet,
  disconnectWallet,
  getWalletId,
  getWalletLightningAddress
} from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import type { MerchantSettings } from "@/lib/settings/merchant";
import {
  CARD_HOLDER_PROFILE_VERSION,
  TERMINAL_PROFILE_VERSION,
  accountProfile,
  isCardHolderProfile,
  ownerProfile,
  type AccountProfile,
  type CardHolderProfile,
  type TerminalProfile
} from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { getTerminalProfile, publishTerminalProfile } from "./profile-cache";

type TerminalSettings = Pick<MerchantSettings, "businessName" | "displayCurrency">;

/**
 * Prepares this device for the open account, whose sign-up is done: the point of sale of a
 * merchant's (activateTerminal), or a card holder's device (prepareCardHolder: no wallet).
 */
export function prepareThisDevice(
  settings: Pick<MerchantSettings, "businessName" | "displayCurrency" | "usage">
): Promise<TerminalProfile> {
  return settings.usage === "card" ? prepareCardHolder(settings) : activateTerminal(settings);
}

/**
 * Prepares this device for the open account of a card holder:
 * its profile (CardHolderProfile) is saved, so that "Cards" and "Settings" open at the next
 * launch, in till mode, the passkey opening the rest; never its wallet, which a card holder's
 * account does not have (main-wallet.ts).
 */
export async function prepareCardHolder(settings: TerminalSettings): Promise<CardHolderProfile> {
  const walletId = getAccountWalletId();
  const backupKey = getAccountBackupKey();
  if (!walletId || !backupKey) throw new Error("No account is open");
  const profile: CardHolderProfile = {
    version: CARD_HOLDER_PROFILE_VERSION,
    walletId: walletId.toLowerCase(),
    backupKey,
    businessName: settings.businessName,
    currency: settings.displayCurrency
  };
  const prepared = await getTerminalProfile();
  if (
    !prepared ||
    !isCardHolderProfile(prepared) ||
    prepared.walletId !== profile.walletId ||
    prepared.backupKey !== profile.backupKey ||
    prepared.businessName !== profile.businessName ||
    prepared.currency !== profile.currency
  ) {
    await saveTerminalProfile(profile);
    publishTerminalProfile(profile);
  }
  return profile;
}

/**
 * Prepares this device to take payments for the open account, a merchant's whose sign-up is done:
 * its Lightning address (registered now when it has none),
 * its business name and currency are saved on the device, so that the point of sale opens at the
 * next launch without a passkey, with the account's backup key, which unlocking checks (lock.ts).
 * Connects the account's wallet for it, a merchant's only (main-wallet.ts: right after "Start
 * accepting payments", at login, or once "Create my merchant profile" is done), its id checked to
 * be
 * the account's, then disconnects it: neither the point of sale nor the unlocked app needs its
 * keys, which can spend (wallet-access.ts connects it again for a screen that does). Its on-chain
 * addresses are filled afterwards, in the background, once the account is open (onchain-pool.ts,
 * syncOnchainPool).
 *
 * A device already prepared for the open account (a step left while it was, then finished again,
 * maybe with another currency) needs no wallet: its Lightning address stays the wallet's
 * (ensureLightningAddress keeps a registered one as it is, its description included), only the
 * business name and currency of the profile follow the settings.
 */
export async function activateTerminal(settings: TerminalSettings): Promise<TerminalProfile> {
  // An employee's device (src/features/team/) is prepared again, as the owner's now.
  const prepared = ownerProfile(await getTerminalProfile());
  if (prepared && isAccountDevice(prepared)) {
    const profile: TerminalProfile = {
      ...prepared,
      businessName: settings.businessName,
      currency: settings.displayCurrency
    };
    try {
      if (
        profile.businessName !== prepared.businessName ||
        profile.currency !== prepared.currency
      ) {
        await saveTerminalProfile(profile);
        publishTerminalProfile(profile);
      }
    } finally {
      // A retry needs no wallet either: it goes even when saving failed.
      await releaseWallet();
    }
    return profile;
  }
  requireMainWallet();
  const seed = getAccountSeed();
  const accountId = getAccountWalletId();
  if (!seed || !accountId) throw new Error("No account is open");
  // Another flow's connection (another account's, left by the welcome screen) goes first.
  await disconnectWallet();
  await connectWallet(seed);
  let profile: TerminalProfile;
  try {
    const walletId = await getWalletId();
    // The id the account was opened with (walletIdOf) is the connected wallet's, or nothing is
    // saved: the profile pairs this wallet with this account.
    if (walletId.toLowerCase() !== accountId.toLowerCase()) throw new OtherAccountError();
    const backupKey = accountBackupKey(walletId);
    const lightningAddress = await getWalletLightningAddress(walletId, settings.businessName);
    profile = {
      version: TERMINAL_PROFILE_VERSION,
      walletId,
      backupKey,
      lightningAddress,
      businessName: settings.businessName,
      currency: settings.displayCurrency
    };
    await saveTerminalProfile(profile);
  } finally {
    await releaseWallet();
  }
  // Followed once this connection is gone: the point of sale's screens it opens on a card holder's
  // device ("Create my merchant profile", device-kind.ts) may hold the account's wallet at once
  // ("Cards"), never to have it disconnected under them here.
  publishTerminalProfile(profile);
  return profile;
}

/**
 * Brings this device's profile in step with a change of the open account's settings ("Settings":
 * business name, display currency), without the wallet: only a profile of this very account (same
 * wallet and backup key), a point of sale's or a card holder's, is changed. Resolves with whether
 * it was.
 */
export async function refreshTerminalDetails(settings: TerminalSettings): Promise<boolean> {
  const prepared = accountProfile(await getTerminalProfile());
  if (!prepared || !isAccountDevice(prepared)) return false;
  if (
    prepared.businessName === settings.businessName &&
    prepared.currency === settings.displayCurrency
  ) {
    return false;
  }
  const profile: TerminalProfile = {
    ...prepared,
    businessName: settings.businessName,
    currency: settings.displayCurrency
  };
  await saveTerminalProfile(profile);
  publishTerminalProfile(profile);
  return true;
}

/**
 * The open account's backup key, when the account is the one of `walletId`. The profile pairs the
 * wallet with its account: never another account's backup key.
 */
function accountBackupKey(walletId: string): string {
  const backupKey = getAccountBackupKey();
  if (!backupKey || getAccountWalletId()?.toLowerCase() !== walletId.toLowerCase()) {
    throw new Error("The open account is not this wallet's");
  }
  return backupKey;
}

/**
 * Whether `profile` is the open account's device's (same wallet, same backup key): a profile of
 * another account is prepared again.
 */
function isAccountDevice(profile: AccountProfile): boolean {
  const walletId = getAccountWalletId();
  const backupKey = getAccountBackupKey();
  return (
    walletId !== null &&
    backupKey !== null &&
    profile.walletId.toLowerCase() === walletId.toLowerCase() &&
    profile.backupKey === backupKey
  );
}

/**
 * Disconnects the wallet, whose keys are no longer needed (the point of sale is ready, a check is
 * done, a screen is left). A failure is only logged: its SDK object is destroyed anyway.
 */
export async function releaseWallet(): Promise<void> {
  await disconnectWallet().catch((error: unknown) => {
    // Destroyed anyway (connection.ts).
    logFailure("Disconnecting the wallet failed", error);
  });
}
