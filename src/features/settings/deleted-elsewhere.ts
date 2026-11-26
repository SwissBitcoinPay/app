import { useEffect } from "react";
import { AppState } from "react-native";

import {
  getAccountWalletId,
  subscribeAccount,
  subscribeAccountDeletion
} from "@/features/account/session";
import { fetchAccountDeletion } from "@/lib/backup/deletion";
import { RELAY_TIMEOUT_MS } from "@/lib/backup/settings-backup";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";
import type { AccountProfile } from "@/lib/terminal/model";

import { signOut } from "./sign-out";

/*
 * The account deleted on another of the owner's devices ("Delete account": the other devices
 * read the deletion requests): this device forgets
 * it, as "Log out" does (sign-out.ts), and the welcome screen says why. Told in till mode by
 * the relays (the backup key's deletion request, src/lib/backup/deletion.ts: at launch, when the
 * app comes back to the foreground, every DELETED_CHECK_INTERVAL_MS), and as the account opens
 * here (session.ts, subscribeAccountDeletion), before its backup could be published again.
 */

/** How often one of the owner's devices looks for the deletion of its account, in till mode. */
export const DELETED_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** The business whose account was deleted elsewhere, for the welcome screen. In memory only. */
let notice: string | null = null;

/** The name of the business this device forgot because its account was deleted elsewhere. */
export function getDeletedAccountNotice(): string | null {
  return notice;
}

/** Forgets on this device the account of `profile`, deleted elsewhere (see above). */
export async function forgetDeletedAccount(profile: AccountProfile): Promise<void> {
  notice = profile.businessName;
  // Said until an account opens here again (a login, a new account).
  const unsubscribe = subscribeAccount(() => {
    if (getAccountWalletId() === null) return;
    notice = null;
    unsubscribe();
  });
  try {
    await signOut();
  } catch (error) {
    // What could not be removed stays; the welcome screen shows all the same (sign-out.ts).
    logFailure("Forgetting the deleted account failed", error);
  }
}

/** Forgets, at most once at a time, the account deleted elsewhere. */
let forgetting: Promise<void> | null = null;

function forgetOnce(profile: AccountProfile): Promise<void> {
  forgetting ??= forgetDeletedAccount(profile).finally(() => {
    forgetting = null;
  });
  return forgetting;
}

/**
 * Looks once on the relays whether `profile`'s account was deleted, in till mode only (an open
 * account is told as it opens, session.ts), and forgets it then. Resolves with whether it did.
 * Never rejects.
 */
export async function checkDeletedElsewhere(profile: AccountProfile): Promise<boolean> {
  const { backupKey } = profile;
  if (getAccountWalletId() !== null) return false;
  try {
    const found = await fetchAccountDeletion(
      backupKey,
      currentRelays(),
      RELAY_TIMEOUT_MS.background
    );
    // Unlocked meanwhile: the opening tells it.
    if (found !== "deleted" || getAccountWalletId() !== null) return false;
    await forgetOnce(profile);
    return true;
  } catch (error) {
    logFailure("Looking for the account's deletion failed", error);
    return false;
  }
}

/**
 * One of the owner's devices: forgets its account once deleted on another device, in till mode
 * (checkDeletedElsewhere: at launch, back to the foreground, every DELETED_CHECK_INTERVAL_MS) and
 * as it opens here (subscribeAccountDeletion).
 */
export function useAccountDeletionWatch(profile: AccountProfile): void {
  useEffect(() => {
    const look = () => void checkDeletedElsewhere(profile);
    look();
    const timer = setInterval(look, DELETED_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") look();
    });
    const unsubscribe = subscribeAccountDeletion((walletId) => {
      if (walletId.toLowerCase() === profile.walletId.toLowerCase()) void forgetOnce(profile);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      unsubscribe();
    };
  }, [profile]);
}
