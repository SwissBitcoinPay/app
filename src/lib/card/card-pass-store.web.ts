/* Same API as card-pass-store.ts. Cards are paid from the app on a phone only: nothing is kept. */

import type { CardPass } from "./card-pass";
import type { KeptCardPasses } from "./card-pass-store";

export const CARD_PASSES_KEY = "card-passes";

export async function loadCardPasses(_walletId: string): Promise<KeptCardPasses> {
  return { passes: [], newer: false };
}

export async function keepCardPasses(
  _walletId: string,
  _passes: readonly CardPass[]
): Promise<boolean> {
  return true;
}
