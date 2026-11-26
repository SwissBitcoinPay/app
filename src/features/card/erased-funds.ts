import { CARD_WALLET_CHECK_MS } from "@/config/card";
import { recoverCardFunds } from "@/features/wallet/funds-recovery-sync";
import { erasedThrough, type CardState } from "@/lib/card/card-record";
import { FIRST_CARD_WALLET_GENERATION, type CardWalletOf } from "@/lib/card/keys";
import { logFailure } from "@/lib/log/log";
import { within } from "@/lib/within";

import { leaseCardWallet, prepareReturn, readCardWallet } from "./card-wallet";
import type { CardAccess } from "./states";

/*
 * The sats that reached a wallet no card shows any more: a deleted card's, or a card's earlier one
 * once the card was added again (it pays from its next wallet, keys.ts). Its deletion needed it
 * empty (manage.ts), but a "Top up" invoice stays payable until it expires
 * (CARD_INVOICE_EXPIRY_SECS), and its Bitcoin address for good: "Cards" looks at such wallets
 * again, and offers to send what one holds back to the main balance, the passkey asked as for any
 * return. "Delete account" checks them too (account-deletion.ts), and is refused while one is not
 * empty. So does "Cards" for a card whose programming stopped (`reset`: a relay change left before
 * its end), out of the list until added again, which pays from the same wallet (pairing.ts,
 * walletGenerationAfter): its balance, only when it holds some, a card lost meanwhile leaving it
 * nowhere else in sight.
 */

/** What a wallet no card shows any more holds, once synced. */
export type ErasedFunds = {
  wallet: CardWalletOf;
  /** Its balance: what a return sends back. */
  sats: bigint;
  /** Its on-chain deposits not credited yet: sent back once they are. */
  arrivingSats: bigint;
};

/** The wallets of `states` no card shows any more (erasedThrough), each card's in order. */
export function erasedWallets(states: readonly CardState[]): CardWalletOf[] {
  return states.flatMap((state) =>
    Array.from({ length: erasedThrough(state) }, (_, index) => ({
      cardId: state.cardId,
      walletGeneration: FIRST_CARD_WALLET_GENERATION + index
    }))
  );
}

/** The wallets of the cards of `states` whose programming stopped (`reset`): each its current one. */
export function resetWallets(states: readonly CardState[]): CardWalletOf[] {
  return states.flatMap((state) =>
    state.status === "reset"
      ? [{ cardId: state.cardId, walletGeneration: state.walletGeneration }]
      : []
  );
}

/**
 * What the wallet `wallet` holds and receives, once synced: null when it holds nothing and nothing
 * is on its way, or when it could not be read within CARD_WALLET_CHECK_MS (nothing said then, it
 * is read again next time). Never rejects.
 */
export async function readErasedFunds(
  access: CardAccess,
  wallet: CardWalletOf
): Promise<ErasedFunds | null> {
  try {
    const view = await within(
      (async () => {
        const lease = await leaseCardWallet(access, wallet);
        try {
          const read = await readCardWallet(lease);
          // Funds out of its balance (as of the sync above): brought back to it, then shown as
          // its deposit on its way (funds-recovery-sync.ts).
          if ((await lease.wallet.getRecoverableFunds(false)) > 0n) {
            void recoverCardFunds(access.walletId, wallet, { connect: true });
          }
          return read;
        } finally {
          await lease.release();
        }
      })(),
      CARD_WALLET_CHECK_MS
    );
    if (view === null) return null;
    const arrivingSats = view.pending.reduce((sum, deposit) => sum + deposit.amountSats, 0n);
    return view.balanceSats > 0n || arrivingSats > 0n
      ? { wallet, sats: view.balanceSats, arrivingSats }
      : null;
  } catch (error) {
    logFailure("Reading a deleted card's wallet failed", error);
    return null;
  }
}

/**
 * Sends everything the wallet `wallet` holds back to the account's wallet, once the passkey
 * confirmed it (prepareReturn: a Spark transfer to the open account's own address, checked).
 * Resolves with what was sent and where it stands; rejects as prepareReturn and its `send()` do
 * (NothingToReturnError, the passkey's failures, the wallet's), nothing sent then.
 */
export async function returnErasedFunds(
  access: CardAccess,
  wallet: CardWalletOf
): Promise<{ sats: bigint; status: "completed" | "pending" | "failed" }> {
  const lease = await leaseCardWallet(access, wallet);
  try {
    const transfer = await prepareReturn(lease);
    try {
      const sent = await transfer.send();
      return { sats: transfer.quote.amountSats, status: sent.status };
    } catch (error) {
      await transfer.cancel();
      throw error;
    }
  } finally {
    await lease.release();
  }
}
