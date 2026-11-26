import { deriveKey, nostrKeys } from "@/lib/nostr/keys";
import { RECORD_KIND } from "@/lib/nostr/record";
import type { RelayFilter } from "@/lib/nostr/relay";

import {
  cardStatesOf,
  wipeCardRecordKeys,
  type CardRecordKeys,
  type CardState
} from "./card-record";
import { CARD_SALT, isWalletGeneration, type CardWalletOf } from "./keys";
import { payeesOf, wipePayeeRecordKeys, type PayeeRecordKeys } from "./payee-records";
import type { RemotePayees } from "./payee-book";

/*
 * Each card's own copies of its records: its state (card-record.ts) and its wallet's book of
 * merchants (payee-records.ts), sealed again with keys of that card's wallet only. A phone that
 * pays a card with the app closed keeps that card's pass (card-pass.ts), never the root of every
 * card's keys: with the pass's own secret, it reads what the account's devices and the web app
 * decided for that card (a pause, its limits, its mode, a merchant removed) and nothing of the
 * account's other cards. The same records, in the same formats, at addresses and by authors of
 * their own; written by the devices that write the account's copies, with the root
 * (src/features/card/own-copies.ts), never by a pass.
 *
 * A wallet of its own per card's wallet (`cardId` and `walletGeneration`): a card deleted then
 * added again gets new keys, which a pass of its earlier wallet does not give.
 *
 * IRREVERSIBLE: the salt and the `info` strings (vectors in card-pass.test.ts).
 */

/** The secret of a card's wallet's own copies (32 bytes): what a pass keeps of them. */
export function cardOwnSecret(root: Uint8Array, { cardId, walletGeneration }: CardWalletOf) {
  if (!/^[0-9a-f]{32}$/.test(cardId)) throw new Error("Invalid card id");
  if (!isWalletGeneration(walletGeneration)) throw new Error("Invalid card wallet generation");
  return deriveKey(root, CARD_SALT, `own/v1/${cardId}/${walletGeneration}`);
}

/** The keys of a card's wallet's own copies: of its state, of its book of merchants. */
export type CardOwnKeys = { state: CardRecordKeys; payees: PayeeRecordKeys };

export function cardOwnKeys(ownSecret: Uint8Array): CardOwnKeys {
  if (ownSecret.length !== 32) throw new Error("A card's own secret has 32 bytes");
  const derive = (info: string) => deriveKey(ownSecret, CARD_SALT, info);
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    state: {
      nostr: nostrKeys(derive("own-state-nostr-secret-key/v1")),
      encryptionKey: derive("own-state-encryption-key/v1"),
      addressKey: derive("own-state-address-key/v1")
    },
    payees: {
      nostr: nostrKeys(derive("own-payees-nostr-secret-key/v1")),
      encryptionKey: derive("own-payees-encryption-key/v1"),
      addressKey: derive("own-payees-address-key/v1")
    }
  };
}

export function wipeCardOwnKeys(keys: CardOwnKeys): void {
  wipeCardRecordKeys(keys.state);
  wipePayeeRecordKeys(keys.payees);
}

/** The secret keys a read or a write of the copies authenticates as (NIP-42). */
export function cardOwnAuthKeys(keys: CardOwnKeys): Uint8Array[] {
  return [keys.state.nostr.secretKey, keys.payees.nostr.secretKey];
}

/** What relays hold of a card's wallet's own copies: every record of their two authors. */
export function cardOwnFilter(keys: CardOwnKeys): RelayFilter {
  return {
    kinds: [RECORD_KIND],
    authors: [keys.state.nostr.publicKey, keys.payees.nostr.publicKey]
  };
}

export type CardOwnRead = {
  /** The card's state, every copy of its wallet merged; null: none. */
  state: CardState | null;
  /** Its wallet's book (its mode, its merchants). */
  payees: RemotePayees;
  /** A copy of a newer format: what was read is not whole. */
  newer: boolean;
  /** Relays that answered. */
  answered: number;
};

/**
 * The own copies of the card's wallet `wallet` among what relays sent, each checked whole as the
 * account's are; none of another card nor wallet. `root`: the card root, which checks the state's
 * id against its UID; a pass, which has none, gives the UID the state must name instead.
 */
export function cardOwnCopiesOf(
  keys: CardOwnKeys,
  wallet: CardWalletOf,
  answers: ReadonlyMap<string, readonly unknown[]>,
  check: { root: Uint8Array } | { uid: string }
): CardOwnRead {
  const states = cardStatesOf(keys.state, "root" in check ? check.root : null, answers);
  const read = payeesOf(keys.payees, answers);
  let state = states.states.get(wallet.cardId) ?? null;
  if (
    state &&
    (state.walletGeneration !== wallet.walletGeneration ||
      ("uid" in check && state.uid !== check.uid))
  ) {
    state = null;
  }
  return {
    state,
    payees: read.cards.get(wallet.cardId)?.get(wallet.walletGeneration) ?? {
      mode: null,
      payees: new Map()
    },
    newer: states.newer.size > 0 || read.newer.size > 0,
    answered: answers.size
  };
}
