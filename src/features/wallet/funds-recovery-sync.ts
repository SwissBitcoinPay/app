import { isOnchainAvailable } from "@/config/onchain";
import {
  getAccountTeamKeys,
  getAccountWalletId,
  whenAccountSynced
} from "@/features/account/session";
import { isAccountWalletOpen } from "@/features/account/wallet-access";
import { leaseCardWallet, type CardWalletLease } from "@/features/card/card-wallet";
import { NoAccountError, withCardAccess } from "@/features/card/states";
import { WalletError } from "@/lib/breez/errors";
import { accountRecoveryWallet, cardWallet, getWalletConnectionId } from "@/lib/breez/wallet";
import type { CardWalletOf } from "@/lib/card/keys";
import { logFailure } from "@/lib/log/log";
import { currentRelays } from "@/lib/relays/current";

import { recoverFunds, type FundsRecoveryOutcome } from "./funds-recovery";

/*
 * When the funds that left a wallet's balance are recovered (funds-recovery.ts), without anyone
 * asking (automatic and unseen), on a connection made for something else:
 * finding out needs the wallet synced, and a connection for that alone, at each start of the app,
 * would cost every merchant a sync for what seldom happens:
 * - the account's wallet, a merchant's (main-wallet.ts), once "Wallet" synced it (useWalletData),
 *   on the screen's connection (wallet-access.ts);
 * - each card's wallet once "Cards" read it (CardsScreen), on the screen's lease; a wallet no card
 *   shows any more (erased-funds.ts), once its read found funds out of its balance, leased for it
 *   (card-wallet.ts).
 * An attempt that found nothing to do, or did all it could, is not made again for
 * FUNDS_RECOVERY_INTERVAL_MS while the app runs; one that left something for later (the relays,
 * the network's rate, a timelock, a confirmation, the screen left), not before
 * FUNDS_RECOVERY_RETRY_MS. In memory: the first opportunity after each start tries.
 */

/** After an attempt with nothing left to do, the wallet's next one waits this long. */
export const FUNDS_RECOVERY_INTERVAL_MS = 6 * 3600 * 1000;

/** After an attempt that left something for later, the wallet's next one waits this long. */
export const FUNDS_RECOVERY_RETRY_MS = 10 * 60 * 1000;

/** By wallet (`account/<id>`, `card/<id>/<card id>/<generation>`): when its next attempt may be. */
const nextAttempt = new Map<string, number>();

/** By wallet: its attempt running, shared by the calls that come meanwhile. */
const running = new Map<string, Promise<void>>();

function delayAfter(outcome: FundsRecoveryOutcome | null): number {
  if (outcome === null || outcome.status === "none") return FUNDS_RECOVERY_INTERVAL_MS;
  return outcome.status === "done" && !outcome.waiting
    ? FUNDS_RECOVERY_INTERVAL_MS
    : FUNDS_RECOVERY_RETRY_MS;
}

/** Runs `attempt` for `key` unless one runs or its time has not come; never rejects. */
function attemptOnce(
  key: string,
  now: number,
  attempt: () => Promise<FundsRecoveryOutcome | null>
): Promise<void> {
  const current = running.get(key);
  if (current) return current;
  const next = nextAttempt.get(key);
  if (next !== undefined && now < next) return Promise.resolve();
  // Not twice at once, whatever it ends with.
  nextAttempt.set(key, now + FUNDS_RECOVERY_RETRY_MS);
  const run = attempt()
    .then(
      (outcome) => outcome,
      (error: unknown) => {
        // The wallet stayed busy (a wallet screen), the account closed: not a failure, the next
        // opportunity tries.
        const busy = error instanceof WalletError && error.code === "alreadyConnected";
        if (!busy && !(error instanceof NoAccountError)) {
          logFailure("Starting a funds recovery failed", error);
        }
        return { status: "later" } as const;
      }
    )
    .then((outcome) => {
      nextAttempt.set(key, Date.now() + delayAfter(outcome));
    })
    .finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

/**
 * Recovers the funds that left the balance of the open account's wallet `walletId` (see above), on
 * the connection "Wallet" holds (isAccountWalletOpen: its id checked), as long as it holds it;
 * never connected for it. Never for a card holder's account, which no wallet screen opens
 * (main-wallet.ts). Never rejects.
 */
export function recoverAccountFunds(walletId: string, now: number = Date.now()): Promise<void> {
  if (!isOnchainAvailable()) return Promise.resolve();
  const id = walletId.toLowerCase();
  return attemptOnce(`account/${id}`, now, async () => {
    // The account's relays as the sync left them.
    await whenAccountSynced();
    const team = getAccountTeamKeys();
    const connection = getWalletConnectionId();
    if (getAccountWalletId()?.toLowerCase() !== id || !team) return null;
    // The screen left (or never opened it): tried again at its next opening.
    if (connection === null || !isAccountWalletOpen()) return { status: "later" };
    return recoverFunds({
      wallet: accountRecoveryWallet,
      walletId: id,
      subject: { kind: "account" },
      team,
      relays: currentRelays(),
      own: () =>
        getWalletConnectionId() === connection &&
        isAccountWalletOpen() &&
        getAccountWalletId()?.toLowerCase() === id
    });
  });
}

/**
 * Recovers the funds that left the balance of the card's wallet `card`, of the open account
 * `walletId` (see above): its wallet leased for it, released once done. From "Cards", only on the
 * connection its screen holds (`connect` false): a wallet the screen let go stays so, the next
 * "Cards" tries again. `connect`: connected for it (a wallet no card shows any more, found with
 * funds out of its balance). Never rejects.
 */
export function recoverCardFunds(
  walletId: string,
  card: CardWalletOf,
  { connect = false, now = Date.now() }: { connect?: boolean; now?: number } = {}
): Promise<void> {
  if (!isOnchainAvailable()) return Promise.resolve();
  const id = walletId.toLowerCase();
  return attemptOnce(`card/${id}/${card.cardId}/${card.walletGeneration}`, now, async () => {
    const team = getAccountTeamKeys();
    if (getAccountWalletId()?.toLowerCase() !== id || !team) return null;
    let notConnected = false;
    // The card's keys only while it is leased: the recovery itself needs the team's.
    const lease = await withCardAccess(async (access): Promise<CardWalletLease | null> => {
      if (access.walletId.toLowerCase() !== id) return null;
      // Leased at once if so (leaseCardWallet counts its user before anything else): its other
      // user's release then leaves it connected for this one.
      if (!connect && !cardWallet(card.cardId, card.walletGeneration).isConnected()) {
        notConnected = true;
        return null;
      }
      return leaseCardWallet(access, card);
    });
    if (notConnected) return { status: "later" };
    if (!lease) return null;
    try {
      return await recoverFunds({
        wallet: lease.wallet,
        walletId: lease.walletId,
        subject: { kind: "card", cardId: card.cardId, walletGeneration: card.walletGeneration },
        team,
        relays: currentRelays(),
        own: () => lease.wallet.isConnected() && getAccountWalletId()?.toLowerCase() === id
      });
    } finally {
      await lease.release();
    }
  });
}

/** Forgets the attempts made (tests). */
export function resetFundsRecoveryAttempts(): void {
  nextAttempt.clear();
  running.clear();
}
