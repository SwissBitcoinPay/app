/*
 * Where the SDK keeps the state of the card wallets (src/lib/card/keys.ts, cardWalletPhrase): one
 * storage per card's wallet, since two SDK instances never share one (connection.ts) and a card's
 * wallet may be connected while the account's is. The same names on native (directories of the
 * documents directory, storage.ts), on the web (IndexedDB databases, wallet.web.ts) and in the iOS
 * extension (below its own directory of the SDK, src/lib/engine/card-wallet.ts).
 *
 * IRREVERSIBLE: never rename CARD_WALLETS_NAME nor the path of a card's wallet below it: installed
 * apps keep their card wallets' payments and sync state there, and "Log out" removes them by
 * these names (device-wipe.ts, device-wipe.web.ts).
 */

/** The storage of the card wallets, each card's wallet below it. */
export const CARD_WALLETS_NAME = "breez-sdk-spark-cards";

/** A card's wallet below CARD_WALLETS_NAME: `<card id>/<generation>`. */
export function cardWalletPath(cardId: string, generation: number): string {
  if (!/^[0-9a-f]{32}$/.test(cardId)) throw new Error("Invalid card id");
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error("Invalid card wallet generation");
  }
  return `${cardId}/${generation}`;
}
