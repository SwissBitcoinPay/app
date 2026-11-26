import { cardPassValue, parseCardPass, samePass, wipeCardPass, type CardPass } from "./card-pass";
import { deleteCardItem, getCardItem, setCardItem } from "./card-keychain";

/*
 * The passes this phone keeps of the account's cards that pay with the app closed (card-pass.ts;
 * which ones: src/features/card/card-passes.ts): in the secure storage (the Android Keystore's
 * key), readable once the phone was unlocked after its start, as a card's tap wakes the app, never
 * restored to another device (out of Android's backups), gone with "Log out" (wipeDevice). With the
 * card items the iOS extension reads too (card-keychain.ts).
 * Same API on the web, where cards are not paid: card-pass-store.web.ts.
 */

/** IRREVERSIBLE: the secure store's key of the cards' passes. Never rename it. */
export const CARD_PASSES_KEY = "card-passes";

/**
 * Format 2: each pass holds the wallet's K1 (card-pass.ts). A pass of format 1 has
 * none, and the card root that would give it is not on the phone: it is never read again (its
 * card's taps ask the holder), and the account's next card sync writes format 2 over it
 * (card-passes.ts), or deletes it.
 */
const FORMAT_VERSION = 2;

export type KeptCardPasses = {
  /** The passes of `walletId`'s cards (each its holder's copy, to wipe: wipeCardPass). */
  passes: CardPass[];
  /** A newer app wrote them: neither used nor written over (a staging rollback). */
  newer: boolean;
};

type Stored = { walletId: string; passes: CardPass[] } | "newer" | null;

function parse(text: string | null): Stored {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as { version?: unknown; walletId?: unknown; passes?: unknown };
    if (typeof value.version === "number" && value.version > FORMAT_VERSION) return "newer";
    if (value.version !== FORMAT_VERSION || typeof value.walletId !== "string") return null;
    if (!Array.isArray(value.passes)) return null;
    const passes: CardPass[] = [];
    for (const item of value.passes) {
      const pass = parseCardPass(item);
      // One pass out of shape: none is trusted.
      if (!pass) return null;
      passes.push(pass);
    }
    return { walletId: value.walletId, passes };
  } catch {
    return null;
  }
}

/** The passes kept for `walletId`'s cards: none of another wallet's, nor out of shape. */
export async function loadCardPasses(walletId: string): Promise<KeptCardPasses> {
  const stored = parse(await getCardItem(CARD_PASSES_KEY));
  if (stored === "newer") return { passes: [], newer: true };
  if (!stored || stored.walletId.toLowerCase() !== walletId.toLowerCase()) {
    for (const pass of stored?.passes ?? []) wipeCardPass(pass);
    return { passes: [], newer: false };
  }
  return { passes: stored.passes, newer: false };
}

/**
 * Keeps exactly `passes` for `walletId`'s cards (none: forgets them), written only when they
 * changed. Never over a newer app's: false then, nothing written.
 */
export async function keepCardPasses(
  walletId: string,
  passes: readonly CardPass[]
): Promise<boolean> {
  const text = await getCardItem(CARD_PASSES_KEY);
  const current = parse(text);
  if (current === "newer") return false;
  if (passes.length === 0) {
    // Out of shape too (parse: null): whatever secrets it holds go.
    if (text !== null) await deleteCardItem(CARD_PASSES_KEY);
    return true;
  }
  const same =
    current !== null &&
    current.walletId.toLowerCase() === walletId.toLowerCase() &&
    current.passes.length === passes.length &&
    current.passes.every((pass, index) => samePass(pass, passes[index]));
  for (const pass of current?.passes ?? []) wipeCardPass(pass);
  if (!same) {
    await setCardItem(
      CARD_PASSES_KEY,
      JSON.stringify({ version: FORMAT_VERSION, walletId, passes: passes.map(cardPassValue) })
    );
  }
  return true;
}
