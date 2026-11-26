import { knownCardState, recordCardState, withCardAccess } from "@/features/card/states";
import type { CardState } from "@/lib/card/card-record";

/**
 * The card as the web app deletes it, which cannot reach the card relay: its record "deleted",
 * on the device and the account's relays, its channel left to this phone's next sync.
 */
export async function deletedElsewhere(walletId: string, cardId: string): Promise<CardState> {
  return withCardAccess(async (access) => {
    const known = knownCardState(walletId, cardId);
    if (!known) throw new Error("No such card");
    const { updatedAt: _updatedAt, ...state } = known;
    return (await recordCardState(access, { ...state, status: "deleted" })).state;
  });
}
