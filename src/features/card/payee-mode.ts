import { confirmAccountPasskey } from "@/features/account/wallet-access";
import { RecoveryCheckOverdueError, openAccountOverdue } from "@/features/recovery-check/overdue";
import type { CardWalletOf } from "@/lib/card/keys";
import {
  LooserCardPayeeModeError,
  removeCardPayee,
  setCardPayeeMode,
  type CardPayeeMode,
  type CardPayees
} from "@/lib/card/payees";

/*
 * The holder changes a card's mode ("Payments without confirmation"): any change, to a mode that
 * asks more often or less, only once the open account's passkey confirms it, as a change of a limit
 * (one rule for every change). So is an approved merchant's removal, as its approval.
 * The same on the phone and on the web. Below this screen, the books still refuse a looser mode
 * without the passkey (payee-store.ts), whoever asks.
 */

/**
 * Chooses `mode` for the card's wallet `card` once the open account's passkey confirms it (the
 * card's wallet need not be open). A dismissed prompt rejects with the passkey's `cancelled`
 * (toUnlockFailure gives null), nothing changed; another account's passkey with
 * OtherAccountError. NewerCardPayeesError as the books. Past the check of the 12 words, a stricter
 * mode only (overdue.ts): a looser one, which the books refuse as
 * they do without the passkey, rejects with RecoveryCheckOverdueError.
 */
export async function chooseCardPayeeMode(
  walletId: string,
  card: CardWalletOf,
  mode: CardPayeeMode
): Promise<CardPayees> {
  const overdue = openAccountOverdue();
  await confirmAccountPasskey({ accountWallet: false, payment: false });
  try {
    return await setCardPayeeMode(walletId, card, mode, { passkeyConfirmed: !overdue });
  } catch (error) {
    if (overdue && error instanceof LooserCardPayeeModeError) throw new RecoveryCheckOverdueError();
    throw error;
  }
}

/**
 * Removes the approved merchant `id` from the card's wallet `card` once the open account's passkey
 * confirms it, as approving it. Its next payments ask the holder again. Rejects as
 * chooseCardPayeeMode, nothing changed.
 */
export async function removeApprovedPayee(
  walletId: string,
  card: CardWalletOf,
  id: string
): Promise<CardPayees> {
  await confirmAccountPasskey({ accountWallet: false, payment: false });
  return removeCardPayee(walletId, card, id);
}
