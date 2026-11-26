import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { RecoveryCheckOverdueError } from "@/features/recovery-check/overdue";
import { RescueClosedError } from "@/features/rescue/closed-error";
import { prepareThisDevice } from "@/features/terminal/activate";
import { PasskeyError, WalletError, type PasskeyErrorCode } from "@/lib/breez/errors";
import {
  createPasskeyWallet,
  preparePasskeys,
  signInWithPasskey,
  type PasskeyWallet
} from "@/lib/breez/passkey";
import { checkWalletConfig, disconnectWallet, walletIdOf } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import type { ImageRef } from "@/lib/media/image";
import type { MerchantSettings, SettingsPatch } from "@/lib/settings/merchant";

import { detectSignUpLocation } from "./detection";
import { clearAccountNotFound, noteAccountNotFound } from "./not-found";
import {
  AccountError,
  AccountNotFoundError,
  OtherAccountError,
  closeAccount,
  openAccount,
  updateAccount,
  type AccountErrorCode
} from "./session";

export type AccountAction = "create" | "logIn";

/**
 * What the user is waiting for: the system passkey prompt, the account's settings (saved for a new
 * account, restored for an existing one), then, for a merchant's account whose sign-up is done,
 * this device's point of sale (activateTerminal, which connects the account's wallet).
 */
export type AccountStep = "passkey" | "account" | "terminal";

/** The business of the account being opened: its name and its logo (null for none). */
export type AccountBusiness = { name: string; logo: ImageRef | null };

/**
 * `business` once the account's settings are known, from the point of sale's step on: the login's
 * loading screen shows it.
 */
export type AccountProgress = {
  action: AccountAction;
  step: AccountStep;
  business?: AccountBusiness;
};

/** Keys of `account.errors` in the translations. */
export type AccountFailure =
  | PasskeyErrorCode
  | "connectFailed"
  | "terminalFailed"
  | "deviceFailed"
  | AccountErrorCode
  /** A payment refused: the check of the 12 words is overdue (src/features/recovery-check/). */
  | "recoveryOverdue"
  /** "Open with my 12 words" closed before a payment left it (src/features/rescue/). */
  | "rescueClosed";

type Recovery =
  /** The passkey was created, deriving its wallet failed: sign in with it, never create another. */
  | { action: AccountAction; credentialId: ArrayBuffer }
  /**
   * The passkey gave its wallet (the seed, and the passkey's id that the account keeps), opening
   * the account failed: retry without a new prompt.
   */
  | { action: AccountAction; wallet: PasskeyWallet };

/**
 * Keys of `account.errors`, and `navigation.lock.otherAccount`: a passkey of another account than
 * the one expected (lock.ts, wallet-access.ts).
 */
export type UnlockFailure = AccountFailure | "otherAccount";

/** The point of sale could not be prepared (no Lightning address, storage failed). */
class TerminalActivationError extends Error {
  /** A card holder's device: no point of sale to speak of. */
  readonly card: boolean;

  constructor(cause: unknown, card: boolean) {
    super("Preparing this device failed", { cause });
    this.name = "TerminalActivationError";
    this.card = card;
  }
}

/**
 * The failure to show after a passkey asked for a known account (lock.ts, wallet-access.ts): null
 * for a dismissed prompt, which shows nothing.
 */
export function toUnlockFailure(error: unknown): UnlockFailure | null {
  if (error instanceof OtherAccountError) return "otherAccount";
  const failure = toFailure(error);
  return failure === "cancelled" ? null : failure;
}

/**
 * What a failure says. No passkey offered on Android is also a password manager whose network a
 * battery saver cut (said on Android only).
 */
export function accountFailureMessage(failure: AccountFailure, t: TFunction): string {
  return failure === "noCredential" && Platform.OS === "android"
    ? t("account.errors.noCredentialAndroid")
    : t(`account.errors.${failure}`);
}

/** What an unlock failure says (the dock's and side bar's padlocks, the wallet screen). */
export function unlockFailureMessage(failure: UnlockFailure, t: TFunction): string {
  return failure === "otherAccount"
    ? t("navigation.lock.otherAccount")
    : accountFailureMessage(failure, t);
}

export function toFailure(error: unknown): AccountFailure {
  if (error instanceof TerminalActivationError) {
    return error.card ? "deviceFailed" : "terminalFailed";
  }
  if (error instanceof PasskeyError) return error.code;
  if (error instanceof AccountError) return error.code;
  if (error instanceof RecoveryCheckOverdueError) return "recoveryOverdue";
  if (error instanceof RescueClosedError) return "rescueClosed";
  if (error instanceof WalletError) {
    switch (error.code) {
      case "unavailable":
        return "unsupported";
      case "notConfigured":
        return "notConfigured";
      case "connectFailed":
        return "connectFailed";
      default:
        return "failed";
    }
  }
  return "failed";
}

/**
 * Account creation and login, both through a passkey: the passkey derives the wallet seed, which
 * names the account (walletIdOf, without connecting its wallet: a card holder's account never has
 * one, main-wallet.ts), then opens it (session.ts): its settings are saved on the device as soon as
 * it is created, or restored at login. The seed stays in memory, never stored. Once the sign-up is
 * done, this device is prepared (prepareThisDevice): a merchant's point of sale connects the
 * account's wallet for its Lightning address, then disconnects it. A failure is shown until the
 * next tap: a dismissed prompt is never retried automatically, nor is it a failure: a notification
 * says it, gone at the next tap. `onReady` also gets the last step shown: the screen may keep
 * showing it while the next screen opens. A login that finds no account (AccountNotFoundError) is
 * no failure either: it is noted (not-found.ts) for `onNotFound`, which opens "No account found".
 *
 * `created`: what a new account's settings start with besides (the migration of a v2 owner,
 * src/features/migration/: its business and its payout, its sign-up done when nothing is left to
 * ask), saved once the account exists, before this device is prepared. Only while its sign-up has
 * not begun: an attempt that resumes after it was saved does not save it again. `onCreated` is
 * told once a new account and those settings are saved, before this device is prepared (which may
 * fail): from then on the account exists, whatever follows.
 *
 * `create(signUp)`: settings of the tap that creates the account, saved as `created`'s, after them
 * (the welcome screen's "A BoltCard": the usage chosen there, its step then skipped). Of that tap
 * only: the next tap, or one that finishes with a passkey already created, brings its own.
 */
export function usePasskeyAccount(
  onReady: (settings: MerchantSettings, reached: AccountProgress) => void,
  onNotFound: () => void,
  {
    created,
    onCreated
  }: { created?: () => SettingsPatch | null; onCreated?: (walletId: string) => void } = {}
) {
  const { t } = useTranslation();
  const { notify, dismiss } = useNotifications();
  // The notification of the last dismissed prompt, while it may still show.
  const cancelled = useRef<number | null>(null);
  const [progress, setProgress] = useState<AccountProgress | null>(null);
  const [failure, setFailure] = useState<Exclude<AccountFailure, "cancelled"> | null>(null);
  // Refs: a double tap must not start a second flow before the first re-render.
  const running = useRef(false);
  const recovery = useRef<Recovery | null>(null);

  // On the web, the SDK must be ready by the tap: see preparePasskeys.
  useEffect(() => void preparePasskeys(), []);

  const run = async (action: AccountAction, signUp?: SettingsPatch) => {
    if (running.current) return;
    running.current = true;
    if (cancelled.current !== null) dismiss(cancelled.current);
    cancelled.current = null;
    setFailure(null);
    clearAccountNotFound();
    // A recovery resumes the action that started it; the other action starts afresh.
    const resume = recovery.current?.action === action ? recovery.current : null;
    try {
      let wallet: PasskeyWallet;
      if (resume && "wallet" in resume) {
        wallet = resume.wallet;
      } else {
        // Before any prompt: a build that cannot open a wallet must not create a passkey.
        checkWalletConfig();
        setProgress({ action, step: "passkey" });
        wallet = resume
          ? await signInWithPasskey(resume.credentialId)
          : action === "create"
            ? await createPasskeyWallet()
            : await signInWithPasskey();
      }
      const { seed } = wallet;
      setProgress({ action, step: "account" });
      // The payout currency of a new account is detected as soon as it exists: the IP lookup, when
      // needed, overlaps the account's opening.
      const location = action === "create" ? detectSignUpLocation() : null;
      let settings: MerchantSettings;
      // The step shown last: the point of sale's for a finished sign-up, else the account's.
      let reached: AccountProgress = { action, step: "account" };
      try {
        // Another account may still be open, after going back to the welcome screen.
        closeAccount();
        await disconnectWallet();
        const walletId = await walletIdOf(seed);
        settings = await openAccount({
          seed,
          // The account asks for that passkey only from then on (wallet-access.ts).
          credentialId: wallet.credentialId,
          walletId,
          created: action === "create",
          // At login, only for an account deleted ("Delete account"): a new one starts.
          detect: () => location ?? detectSignUpLocation(),
          businessNameWord: t("merchantSettings.businessNameWord")
        });
        const patch =
          action === "create" && settings.signUp === "usage" ? { ...created?.(), ...signUp } : null;
        if (patch && Object.keys(patch).length > 0) settings = await updateAccount(patch);
        if (action === "create") onCreated?.(walletId);
        if (settings.signUp === "done") {
          // A merchant's point of sale, with its business ("Preparing your point of sale…"); a card
          // holder's device is prepared at once, without a wallet nor a business.
          if (settings.usage !== "card") {
            reached = {
              action,
              step: "terminal",
              business: { name: settings.businessName, logo: settings.logo }
            };
            setProgress(reached);
          }
          try {
            await prepareThisDevice(settings);
          } catch (error) {
            throw new TerminalActivationError(error, settings.usage === "card");
          }
        }
      } catch (error) {
        // No account found: the next login asks for the passkey again, where another one may be
        // chosen, and no seed waits in memory while the device's relays are changed. A passkey
        // created but not derived yet (the other action's recovery) stays to finish with: "Create
        // my account" must not create a second one.
        if (!(error instanceof AccountNotFoundError)) recovery.current = { action, wallet };
        else if (recovery.current?.action === action) recovery.current = null;
        throw error;
      }
      recovery.current = null;
      onReady(settings, reached);
    } catch (error) {
      if (error instanceof PasskeyError && error.credentialId) {
        recovery.current = { action, credentialId: error.credentialId };
      }
      logFailure(`Passkey ${action} failed`, error);
      if (error instanceof AccountNotFoundError) {
        noteAccountNotFound(error);
        // Back on the welcome screen, it still tells how to finish with the created passkey.
        if (recovery.current !== null && "credentialId" in recovery.current) {
          setFailure("createdNotDerived");
        }
        onNotFound();
        return;
      }
      const failure = toFailure(error);
      // Signing in with the created passkey can never succeed when it is gone from the device or
      // its password manager cannot evaluate PRF: forget it, so that the next tap can create one.
      if (
        resume &&
        "credentialId" in resume &&
        (failure === "noCredential" || failure === "prfUnsupported")
      ) {
        recovery.current = null;
      }
      // While the created passkey is not derived yet, keep telling how to finish with it, also
      // after a dismissed prompt.
      const finishing =
        recovery.current !== null && "credentialId" in recovery.current && failure !== "timedOut";
      setFailure(finishing ? "createdNotDerived" : failure === "cancelled" ? null : failure);
      if (failure === "cancelled")
        cancelled.current = notify({
          tone: "info",
          title: t("account.cancelled.title"),
          body: t("account.cancelled.body"),
          key: "passkey-cancelled"
        });
    } finally {
      running.current = false;
      setProgress(null);
    }
  };

  return {
    progress,
    failure,
    create: (signUp?: SettingsPatch) => void run("create", signUp),
    logIn: () => void run("logIn")
  };
}
