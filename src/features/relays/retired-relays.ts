import {
  getAccountSettings,
  getAccountWalletId,
  subscribeAccount,
  whenAccountSynced
} from "@/features/account/session";
import { SettingsError, replaceAccountRetiredRelays } from "@/features/settings/account-settings";
import { TeamError } from "@/features/team/owner";
import { logFailure } from "@/lib/log/log";
import { replaceRetiredRelays } from "@/lib/relays/retired";

/*
 * The replacement of the relays sattle.me retired (src/lib/relays/retired.ts): at each opening of
 * the account on one of the owner's devices, its
 * list moves to the list where each retired relay is replaced, as "Nostr relays" moves it
 * (replaceAccountRetiredRelays), without a word to its owner (no notification, no screen). When it
 * cannot be made now (a sale not final yet, the relays kept out of reach: the merchant's network
 * down, or a relay not retired), it is tried again every RETIRED_RETRY_MS while the account stays
 * open, and at its next opening otherwise: in a few steps if need be, until the list holds no
 * retired relay. An account never opened again keeps its list: its relays not retired still hold
 * what they held.
 */

/** How long a replacement that could not be made waits before the next try, the account open. */
export const RETIRED_RETRY_MS = 15 * 60 * 1000;

/** The next try, while the account it is for stays open. */
let retry: ReturnType<typeof setTimeout> | null = null;
/** Whether the account's closing is watched (the next try then waits for the next opening). */
let watching = false;

function stopRetry(): void {
  if (retry !== null) clearTimeout(retry);
  retry = null;
}

/** A move refused while a sale or an integration's payment is not final yet (changeRelays). */
function isWaiting(error: unknown): boolean {
  return (
    error instanceof SettingsError &&
    (error.code === "salesInProgress" || error.code === "integrationsPending")
  );
}

/**
 * Errors after which a new try during the same opening cannot do better: the account closed (its
 * next opening tries), or a backup of a newer format on the relays (never published over).
 */
function isFinalForNow(error: unknown): boolean {
  return (
    (error instanceof SettingsError &&
      (error.code === "noAccount" || error.code === "newerBackup")) ||
    (error instanceof TeamError && error.code === "noAccount")
  );
}

/**
 * Replaces the open account's retired relays, now (the account synced first), in the background;
 * when it cannot, tries again later (RETIRED_RETRY_MS) while the same account stays open. At each
 * opening of the account (useTeamChannelsSync). Never rejects.
 */
export async function replaceRetiredRelaysInBackground(): Promise<void> {
  stopRetry();
  const walletId = getAccountWalletId();
  if (!walletId) return;
  if (!watching) {
    watching = true;
    subscribeAccount(() => {
      if (getAccountWalletId() === null) stopRetry();
    });
  }
  // Nothing to do, nothing written to the journal, for a list without any retired relay (the
  // table empty, every account once moved) or an account whose sign-up is not done.
  await whenAccountSynced();
  const settings = getAccountSettings();
  if (
    getAccountWalletId() !== walletId ||
    settings?.signUp !== "done" ||
    !replaceRetiredRelays(settings.relays)
  ) {
    return;
  }
  try {
    await replaceAccountRetiredRelays();
  } catch (error) {
    // Locked meanwhile: the next opening tries again, nothing failed.
    if (getAccountWalletId() !== walletId) return;
    // A sale or an integration's payment not final yet is no failure: the move waits for it.
    // Anything else goes to the journal, in the code's own words only (never a value of the account).
    if (!isWaiting(error)) logFailure("Replacing the account's retired relays failed", error);
    if (isFinalForNow(error)) return;
    stopRetry();
    retry = setTimeout(() => {
      retry = null;
      if (getAccountWalletId() === walletId) void replaceRetiredRelaysInBackground();
    }, RETIRED_RETRY_MS);
  }
}
