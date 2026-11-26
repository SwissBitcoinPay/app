import { useRouter } from "expo-router";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { detectSignUpLocation } from "@/features/account/detection";
import { devicePasskeyOf } from "@/features/account/device-passkey";
import {
  OtherAccountError,
  closeAccount,
  getAccountWalletId,
  isAccountOpenedByWords,
  openAccount,
  seedHasBackupKey,
  subscribeAccount
} from "@/features/account/session";
import {
  toUnlockFailure,
  unlockFailureMessage,
  type UnlockFailure
} from "@/features/account/usePasskeyAccount";
import { usePasskeysPreparing } from "@/features/account/usePasskeysPreparing";
import { rescueOffered } from "@/features/rescue/offer";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { signInWithPasskey, type PasskeyWallet } from "@/lib/breez/passkey";
import { disconnectCardWallets, disconnectWallet } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import type { AccountProfile } from "@/lib/terminal/model";

/**
 * Till mode: at launch only the point of sale is open, so
 * that a stolen device shows nothing else of the business. The rest opens once this device's
 * account is open again, through its passkey, without connecting its wallet: the passkey's seed
 * gives the account's backup keys, checked against the point of
 * sale's profile (`backupKey`), and stays with the open account (session.ts). The wallet screen
 * connects the wallet with it, without asking for the passkey again (wallet-access.ts); the
 * wallet (the SDK, which holds its keys) runs only while a screen needs it.
 * Till mode comes back with "Switch to till mode", which closes the account and drops its seed,
 * or when the app restarts (the account lives in memory only). The point of sale's on-chain
 * addresses are filled once the account is open, in the background (onchain-pool.ts,
 * syncOnchainPool): unlocking never waits for them.
 */

export type { UnlockFailure };

/**
 * Whether the account of `walletId` (this device's point of sale) is open now, through its passkey.
 * Never when it was opened with its recovery phrase ("Open with my 12 words",
 * src/features/rescue/): those words send its funds away from that screen only, they never unlock
 * the app.
 */
export function accountUnlocked(walletId: string): boolean {
  return (
    getAccountWalletId()?.toLowerCase() === walletId.toLowerCase() && !isAccountOpenedByWords()
  );
}

/** Whether the account of `walletId` (this device's point of sale) is open, followed. */
export function useUnlocked(walletId: string): boolean {
  return useSyncExternalStore(
    subscribeAccount,
    () => accountUnlocked(walletId),
    () => false
  );
}

/**
 * Back to till mode: the account closes (its backup keys are wiped and its seed dropped,
 * session.ts) and the wallets, if connected, disconnect: the account's and the cards', whose keys
 * derive from its seed (the SDK objects, which hold the wallets' keys, are destroyed:
 * connection.ts).
 */
export async function lockTerminal(): Promise<void> {
  closeAccount();
  await Promise.all([disconnectWallet(), disconnectCardWallets()]);
}

/**
 * Opens the account of `profile` with the passkey's `seed`, through its backup key: a passkey of
 * another account opens nothing. The passkey's id stays with the open account, which asks for
 * that passkey only from then on (session.ts, wallet-access.ts).
 */
async function openTerminalAccount(
  { seed, credentialId }: PasskeyWallet,
  profile: AccountProfile,
  businessNameWord: string
): Promise<void> {
  if (!seedHasBackupKey(seed, profile.backupKey)) throw new OtherAccountError();
  await openAccount({
    seed,
    credentialId,
    walletId: profile.walletId,
    created: false,
    detect: detectSignUpLocation,
    businessNameWord,
    backupKey: profile.backupKey
  });
}

/** A failed unlock stays this long (as the dock's message did before the notifications). */
const UNLOCK_FAILURE_MS = 6000;

/**
 * The system's passkey prompt, directly (no screen in between), then this device's account opens
 * again (session.ts), its wallet left disconnected. A passkey of another account is refused: the
 * point of sale stays as it is. A dismissed prompt is not an error. A failure shows as an error
 * notification, gone at the next attempt. `unlock` resolves with whether the account
 * opened: false when it failed, the prompt was dismissed, or an unlock was already running.
 */
export function useUnlock(profile: AccountProfile) {
  const { t } = useTranslation();
  const router = useRouter();
  const [unlocking, setUnlocking] = useState(false);
  // On the web, until the SDK is loaded, the unlock buttons show a spinner and cannot be tapped.
  const preparing = usePasskeysPreparing();
  const { notify, dismiss } = useNotifications();
  // The notification of the last failure, while it may still show.
  const shown = useRef<number | null>(null);
  // A ref: a double tap must not open a second prompt before the re-render.
  const running = useRef(false);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    if (shown.current !== null) dismiss(shown.current);
    shown.current = null;
    setUnlocking(true);
    try {
      // The passkey this device saved for its account only (device-passkey.ts), else any.
      const wallet = await signInWithPasskey(await devicePasskeyOf(profile.walletId));
      closeAccount();
      await disconnectWallet();
      await openTerminalAccount(wallet, profile, t("merchantSettings.businessNameWord"));
      return true;
    } catch (error) {
      logFailure("Unlocking failed", error);
      // Nothing of another account (nor of a half-open one) stays open or connected.
      await lockTerminal().catch(() => undefined);
      const failure = toUnlockFailure(error);
      if (failure)
        shown.current = notify({
          tone: "error",
          title: t("navigation.lock.failedTitle"),
          body: unlockFailureMessage(failure, t),
          // A passkey that no longer opens the account: its 12 words still send its funds away
          // (src/features/rescue/).
          ...(rescueOffered(failure)
            ? {
                action: {
                  label: t("rescue.entry"),
                  icon: "arrow-right" as const,
                  onPress: () => router.push("/rescue")
                }
              }
            : {}),
          key: "unlock-failure",
          duration: UNLOCK_FAILURE_MS
        });
      return false;
    } finally {
      running.current = false;
      setUnlocking(false);
    }
  }, [profile, t, notify, dismiss, router]);

  return { unlock, unlocking, preparing };
}
