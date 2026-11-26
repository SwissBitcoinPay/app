import {
  getAccountSettings,
  getAccountWalletId,
  isAccountOpenedByWords,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import type { CardWalletOf } from "@/lib/card/keys";
import { nowUnix } from "@/lib/clock";
import { logFailure } from "@/lib/log/log";
import { fetchRate } from "@/lib/rates/snapshot";
import { hourOf } from "@/lib/rates/sources";
import { fiatToSats } from "@/lib/terminal/amount";

import { RECOVERY_CHECK_THRESHOLD_CHF_MINOR, seenAboveThreshold } from "./policy";

/*
 * What the open account keeps, as its screens read it: its own
 * wallet's balance less the split's share still to sell ("Wallet", WalletScreen.tsx), and
 * each of its cards' wallets' balances ("Cards", CardWalletPanel.tsx). Nothing is connected for
 * it: a balance counts once a screen read it, in this run of the app. Once what is known already
 * keeps more than 1000 CHF (all balances count up, so a part above it proves the whole is), the
 * check of the words starts (policy.ts), saved with the account's settings for all its devices.
 * Never for an account opened with its words ("Open with my 12 words"), nor during its sign-up.
 */

type Held = {
  walletId: string;
  /** The account's own wallet: its balance less the split's share still to sell, null unread. */
  wallet: bigint | null;
  /** Each card's wallet's balance, by `<card id>/<generation>`. */
  cards: Map<string, bigint>;
};

let held: Held | null = null;

/** What is held for the account open now; a new record for another account. */
function heldFor(walletId: string): Held {
  if (held?.walletId !== walletId) held = { walletId, wallet: null, cards: new Map() };
  return held;
}

/** The open account's own wallet keeps `sats` (its balance less the split's share to sell). */
export function noteWalletKept(sats: bigint): void {
  const walletId = getAccountWalletId();
  if (walletId === null || sats < 0n) return;
  heldFor(walletId).wallet = sats;
  evaluate(walletId);
}

/** The open account's card's wallet `card` holds `sats`. */
export function noteCardHeld(card: CardWalletOf, sats: bigint): void {
  const walletId = getAccountWalletId();
  if (walletId === null || sats < 0n) return;
  heldFor(walletId).cards.set(`${card.cardId}/${card.walletGeneration}`, sats);
  evaluate(walletId);
}

/**
 * What the account's wallet keeps of `balance`: all of it at 100 % bitcoin; else less the split's
 * share still to sell (`dueSats`, SplitSale.tsx). Without that share known (no sale set up, Mt
 * Pelerin unreachable), the share kept in bitcoin of the balance, rounded down: an estimate that
 * only decides when to ask for the words, never an amount sent nor shown.
 */
export function walletKept(
  balance: bigint,
  bitcoinPercent: number,
  dueSats: bigint | null
): bigint {
  if (bitcoinPercent >= 100) return balance;
  if (dueSats !== null) return balance > dueSats ? balance - dueSats : 0n;
  return (balance * BigInt(bitcoinPercent)) / 100n;
}

/** For the tests: as a new run of the app. */
export function resetRecoveryHoldings(): void {
  held = null;
  threshold = null;
  running = null;
  again = false;
}

/** What is known to be kept of the account `walletId`, in sats. */
function keptSats(walletId: string): bigint {
  if (held?.walletId !== walletId) return 0n;
  let sum = held.wallet ?? 0n;
  for (const sats of held.cards.values()) sum += sats;
  return sum;
}

/** 1000 CHF in sats at the hour's point (fiatToSats: rounded up), read once an hour. */
let threshold: { hour: number; sats: bigint } | null = null;

async function thresholdSats(now: number): Promise<bigint | null> {
  const hour = hourOf(now);
  if (threshold?.hour === hour) return threshold.sats;
  const point = await fetchRate("CHF");
  if (point === null) return null;
  const sats = fiatToSats(RECOVERY_CHECK_THRESHOLD_CHF_MINOR, 2, point.rate);
  threshold = { hour, sats };
  return sats;
}

/** One evaluation at a time; one more once it ends when a balance came meanwhile. */
let running: Promise<void> | null = null;
let again = false;

function evaluate(walletId: string): void {
  if (running) {
    again = true;
    return;
  }
  running = evaluateOnce(walletId)
    .catch((error: unknown) =>
      logFailure("Starting the check of the recovery phrase failed", error)
    )
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        const open = getAccountWalletId();
        if (open !== null) evaluate(open);
      }
    });
}

async function evaluateOnce(walletId: string): Promise<void> {
  // Nothing could change (one due already or checked within the year, the account marked): no
  // rate asked.
  if (!mayStart(walletId)) return;
  const now = nowUnix();
  const limit = await thresholdSats(now);
  // No rate: nothing proven, asked again at the next balance read.
  if (limit === null || keptSats(walletId) < limit) return;
  // The relays' answer at the opening first (as every write the app makes by itself): a stale copy
  // of this device, written now, would be newer than a check done on another device, and lose it.
  await whenAccountSynced();
  if (!mayStart(walletId)) return;
  await updateAccount((settings) => {
    const seen = seenAboveThreshold(settings.recoveryCheck, nowUnix());
    return seen ? { recoveryCheck: seen } : {};
  });
}

/**
 * Whether the account `walletId`, open, seen above the threshold now, changes its check (policy.ts
 * seenAboveThreshold): one starts, or the account is marked.
 */
function mayStart(walletId: string): boolean {
  if (getAccountWalletId() !== walletId || isAccountOpenedByWords()) return false;
  const settings = getAccountSettings();
  if (!settings || settings.signUp !== "done") return false;
  return seenAboveThreshold(settings.recoveryCheck, nowUnix()) !== null;
}
