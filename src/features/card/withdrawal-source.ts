import type { SendSource } from "@/features/wallet/send/useSend";
import { withdrawalWayOf } from "@/lib/card/card-movement";

import { cardSendSource, type CardWalletLease } from "./card-wallet";
import { noteCardWithdrawal } from "./history-sync";
import { withCardAccess } from "./states";

/*
 * "Withdraw" of a card to any other wallet, as "Send" and "Empty the card" send it
 * (cardSendSource): its note on a majority of the account's relays after the passkey, before it
 * leaves (src/lib/card/card-movement.ts), at its payment's id, its idempotency key. Without it,
 * "History" could not tell it from a return to the main balance:
 * nothing leaves then. An erased wallet emptied (ErasedDrainSheet) shows no history again: no
 * note; the wallet of a card whose programming stopped does, once added again: noted.
 */

/** The not noted withdrawal (noteCardWithdrawal): no majority of the relays took its note. */
export class WithdrawalNoteError extends Error {
  constructor() {
    super("No majority of the relays took the withdrawal's note");
    this.name = "WithdrawalNoteError";
  }
}

/** The card's wallet `lease` as "Withdraw" sends from it: each withdrawal noted first. */
export function cardWithdrawalSource(lease: CardWalletLease): SendSource {
  return {
    ...cardSendSource(lease),
    beforeSend: async (key, destination) => {
      const noted = await withCardAccess((access) =>
        noteCardWithdrawal(access, {
          cardId: lease.cardId,
          walletGeneration: lease.generation,
          id: key,
          way: withdrawalWayOf(destination.kind)
        })
      );
      if (!noted) throw new WithdrawalNoteError();
    }
  };
}
