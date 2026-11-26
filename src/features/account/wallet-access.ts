import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { releaseWallet } from "@/features/terminal/activate";
import { signInWithPasskey, type PasskeyWallet } from "@/lib/breez/passkey";
import { recoveryPhraseOf } from "@/lib/breez/seed";
import {
  checkWalletConfig,
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  isWalletConnected,
  subscribeWallet
} from "@/lib/breez/wallet";
import { refuseOverduePayment } from "@/features/recovery-check/overdue";
import { logFailure } from "@/lib/log/log";

import { requireMainWallet } from "./main-wallet";
import {
  OtherAccountError,
  getAccountCredentialId,
  getAccountSeed,
  getAccountWalletId,
  isAccountSeed
} from "./session";
import { toFailure, type AccountFailure } from "./usePasskeyAccount";

/**
 * The open account's wallet, connected on demand. Unlocking the app opens the account without
 * connecting its wallet (lock.ts): the SDK, which holds the wallet's keys, runs only while a screen
 * needs it (balance, payments). Such a screen connects it with the seed the open account keeps
 * (session.ts), without asking for the passkey again, and it disconnects as soon as the screen is
 * left, in till mode (lockTerminal) or when the app restarts. A payment sent still asks for the
 * passkey (confirmAccountPasskey). The SDK calls themselves go in wallet.ts and wallet.web.ts,
 * through `wallet.use()` (connection.ts): the SDK object never leaves them.
 */

/** The account closed, or the wallet was closed, while it was being opened: nothing to show. */
class WalletClosedError extends Error {
  constructor() {
    super("The wallet was closed while it was being opened");
    this.name = "WalletClosedError";
  }
}

/** The connection in progress (openAccountWallet), shared by the calls that come meanwhile. */
let pending: Promise<void> | null = null;

/**
 * The connection openAccountWallet made: the only one a wallet screen uses. A wallet connected by
 * another flow (sign-up, login) never counts as opened here.
 */
let granted: number | null = null;
const grantListeners = new Set<() => void>();

/** Whether the open account's wallet is connected through openAccountWallet. */
export function isAccountWalletOpen(): boolean {
  return granted !== null && getWalletConnectionId() === granted;
}

/** Calls `listener` whenever isAccountWalletOpen() may change; returns the unsubscribe function. */
export function subscribeAccountWallet(listener: () => void): () => void {
  grantListeners.add(listener);
  const unsubscribe = subscribeWallet(listener);
  return () => {
    grantListeners.delete(listener);
    unsubscribe();
  };
}

/**
 * Connects the open account's wallet with the account's seed (getAccountSeed), without the
 * passkey; the wallet's id is checked once connected (OtherAccountError otherwise). Nothing
 * connects when `wanted()` is false (the screen was left). Resolves at once when it is already
 * open (isAccountWalletOpen); a second call while connecting shares the first.
 */
export function openAccountWallet(wanted: () => boolean = () => true): Promise<void> {
  pending ??= connectAccountWallet(wanted).finally(() => {
    pending = null;
  });
  return pending;
}

/** Disconnects the wallet: its SDK object, which holds its keys, is destroyed (connection.ts). */
export function closeAccountWallet(): Promise<void> {
  return disconnectWallet();
}

async function connectAccountWallet(wanted: () => boolean): Promise<void> {
  const walletId = getAccountWalletId();
  const seed = getAccountSeed();
  if (!walletId || !seed) throw new WalletClosedError();
  if (isAccountWalletOpen()) return;
  // A card holder's account has no wallet of its own (main-wallet.ts): never connected.
  requireMainWallet();
  checkWalletConfig();
  if (!wanted()) throw new WalletClosedError();
  // A wallet connected by another flow is replaced: this one is the screen's own connection,
  // which it closes once left.
  await disconnectWallet();
  // Till mode, or the screen left, meanwhile: the wallet's keys are not loaded at all.
  if (getAccountWalletId() !== walletId || !wanted()) throw new WalletClosedError();
  await connectWallet(seed);
  try {
    // Till mode, or the screen left, while it connected: it must not stay connected.
    if (getAccountWalletId() !== walletId || !isWalletConnected()) throw new WalletClosedError();
    if ((await getWalletId()).toLowerCase() !== walletId.toLowerCase()) {
      throw new OtherAccountError();
    }
  } catch (error) {
    await disconnectWallet().catch(() => undefined);
    throw error;
  }
  granted = getWalletConnectionId();
  for (const listener of grantListeners) listener();
}

/**
 * The passkey of the open account, asked again: pinned to the one that opened it
 * (getAccountCredentialId, `allowCredentials`), so that the password manager offers that one only,
 * not every passkey of the app. Only that passkey can give the account's seed (a PRF output is a
 * passkey's own): no passkey that could do is left out. Without its id (a platform that did not
 * name it), any passkey of the app is offered. The caller still checks the seed (isAccountSeed):
 * the pin only narrows the prompt, it proves nothing.
 */
export function signInWithAccountPasskey(): Promise<PasskeyWallet> {
  return signInWithPasskey(getAccountCredentialId() ?? undefined);
}

/**
 * Asks for the passkey again before a payment leaves the wallet: the open wallet's keys could
 * otherwise spend without the merchant, on a device left unlocked. The passkey must be the open
 * account's (its backup key, OtherAccountError otherwise); its seed is only checked, then dropped.
 * A dismissed prompt rejects with the passkey's `cancelled` (toUnlockFailure gives null for it).
 * The account's wallet must be open, unless the payment leaves a card's wallet (`accountWallet:
 * false`, src/features/card/payment.ts): the account must be open then, its wallet need not.
 * Refused with RecoveryCheckOverdueError, before the prompt, past the 30 days of the check of the
 * 12 words, unless it confirms no payment (`payment: false`).
 */
export async function confirmAccountPasskey({
  accountWallet = true,
  payment = true
}: { accountWallet?: boolean; payment?: boolean } = {}): Promise<void> {
  const walletId = getAccountWalletId();
  const open = () => getAccountWalletId() === walletId && (!accountWallet || isAccountWalletOpen());
  if (!walletId || !open()) throw new WalletClosedError();
  // Past the 30 days of the check of the 12 words, no payment (src/features/recovery-check/):
  // refused before the passkey is asked. `payment: false` for what keeps a card safe (its limits,
  // the merchants it pays without asking).
  if (payment) refuseOverduePayment();
  const { seed } = await signInWithAccountPasskey();
  // Till mode, or the wallet closed, during the prompt: nothing is sent.
  if (!open()) throw new WalletClosedError();
  if (!isAccountSeed(seed)) throw new OtherAccountError();
}

/** The passkey's wallet has no recovery phrase to show (recoveryPhraseOf gave none). */
export class NoRecoveryPhraseError extends Error {
  constructor() {
    super("The wallet's seed is no recovery phrase");
    this.name = "NoRecoveryPhraseError";
  }
}

/**
 * "Recovery phrase": the passkey asked again, as before a payment (confirmAccountPasskey), and its
 * seed checked to be the open account's (OtherAccountError otherwise); then the recovery phrase of
 * that seed (recoveryPhraseOf, NoRecoveryPhraseError when it has none). Needs no connected wallet.
 * The caller shows the words and forgets them as soon as they no longer show: never stored, logged
 * nor sent. A dismissed prompt rejects with the passkey's `cancelled`.
 */
export async function revealRecoveryPhrase(): Promise<string[]> {
  const walletId = getAccountWalletId();
  if (!walletId) throw new WalletClosedError();
  const { seed } = await signInWithAccountPasskey();
  // Till mode (the account closed), or another account opened, during the prompt: nothing shows.
  if (getAccountWalletId() !== walletId) throw new WalletClosedError();
  if (!isAccountSeed(seed)) throw new OtherAccountError();
  const words = recoveryPhraseOf(seed);
  if (!words) throw new NoRecoveryPhraseError();
  return words;
}

/**
 * For a screen that needs the open account's wallet (balance, payments): `open()` connects it
 * (openAccountWallet, without the passkey); the wallet disconnects as soon as the screen is left
 * (blurred or unmounted), in till mode, or with `close()`. Focus is the screen's own: a
 * destination of several screens (a stack) uses it in its layout, so that a screen pushed on top
 * does not close the wallet. `failure` says why the wallet did not open (`account.errors`); it
 * goes once the screen is left, or at the next `open()`.
 */
export function useAccountWallet() {
  // Only the connection this hook opened: never one another flow left connected.
  const connected = useSyncExternalStore(subscribeAccountWallet, isAccountWalletOpen, () => false);
  const focused = useIsFocused();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<AccountFailure | null>(null);
  // A ref: a double tap must not connect twice before the re-render.
  const running = useRef(false);
  // Whether the screen is focused now: a wallet that connects once it was left must not stay.
  const active = useRef(false);
  // Counts the screen's visits: an attempt ended by the screen being left is no failure, even when
  // it is shown again before that attempt ends.
  const visit = useRef(0);

  useEffect(() => {
    if (!focused) return;
    active.current = true;
    visit.current++;
    return () => {
      active.current = false;
      // Left: the wallet's keys go, and the next visit opens it again.
      void releaseWallet();
      setFailure(null);
    };
  }, [focused]);

  const open = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const started = visit.current;
    setFailure(null);
    setOpening(true);
    try {
      await openAccountWallet(() => active.current);
      // Left at the very end of the connection, after its own checks: it goes too.
      if (!active.current) await releaseWallet();
    } catch (error) {
      logFailure("Opening the wallet failed", error);
      // Left meanwhile (its release ended this attempt), shown again or not: nothing to say, the
      // visit shown opens it again.
      if (!active.current || visit.current !== started) return;
      // Closed meanwhile while the screen still shows (by another flow): a failure too (`failed`),
      // with its "Try again", rather than a screen waiting for nothing. No passkey was asked: never
      // a passkey's message (a wallet that is not the account's is `failed` too).
      setFailure(toFailure(error));
    } finally {
      running.current = false;
      setOpening(false);
    }
  }, []);

  return {
    connected,
    open,
    opening,
    failure,
    close: closeAccountWallet
  };
}
