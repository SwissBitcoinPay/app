import { bytesToHex } from "@noble/hashes/utils.js";

import { bip39PhraseOf } from "@/lib/breez/recovery-phrase";
import { deriveKey } from "@/lib/nostr/keys";

import { isCanonicalRelayHost } from "./relay-host";
import { UID_LENGTH } from "./sun";

/*
 * The keys of a wallet's BoltCards (NTAG 424 DNA application keys K0 to K4), its cards' opaque ids
 * and their relay channels' secrets: all derived from the wallet secret (walletSecret in
 * src/lib/breez/seed.ts) under a salt of their own, so that the passkey gives them back on any
 * device and nothing of them is ever sent: a relay never receives any of them. Nothing of them is
 * stored either, but what an Android phone keeps of one card to pay with the app closed: its pass
 * (card-pass.ts).
 *
 * Shaped as boltcard/docs/DETERMINISTIC.md, with HKDF-SHA256 (deriveKey) instead of AES-CMAC:
 * - K1, which encrypts the PICCData `p` (sun.ts), is the wallet's, for all its cards: `p` must be
 *   opened before the card is known, since the UID is inside it;
 * - the card's id derives from its UID alone: the same card keeps its id across reprogrammings,
 *   and the id never tells the UID;
 * - K0, K2, K3 and K4 derive from the UID and the keys' version, incremented at each programming
 *   of the card: a card reset and programmed again never gets the keys of its earlier taps back.
 *
 * IRREVERSIBLE: never change the salt nor an `info` string once released. Every paired card holds
 * keys derived from them; a change would make the app unable to check its taps or to reset it
 * (vectors in card-keys.test.ts).
 */

/**
 * Domain of every card key, and of the card records (card-record.ts, card-order.ts, card-own.ts,
 * history-*.ts, payee-records.ts), which import it from here: one value, never changed again.
 */
export const CARD_SALT = "sattle.me/card";

const KEY_LENGTH = 16;

/** Versions of a card's keys: the card keeps it as a byte (ChangeKey), 0 is a blank card's. */
export const MIN_KEY_VERSION = 1;
export const MAX_KEY_VERSION = 255;

/**
 * The root of the wallet's card keys: in memory only, while needed, then wiped by its holder
 * (`fill(0)`), like the seed it comes from. Never kept on a device (an Android phone keeps a pass
 * of each card that pays with the app closed, card-pass.ts, not the
 * root of every card's keys). Never derive from it a key that must stay off a phone (the account's
 * wallet, backup, team or point of sale).
 */
export function deriveCardRoot(walletSecret: Uint8Array): Uint8Array {
  return deriveKey(walletSecret, CARD_SALT, "card-root/v1");
}

/** K1: the encryption key of every card's PICCData (SDM Meta Read Access Key). */
export function cardEncryptionKey(root: Uint8Array): Uint8Array {
  return deriveKey(root, CARD_SALT, "k1/v1", KEY_LENGTH);
}

/** The opaque id of the card of `uid`: 16 bytes, lowercase hex. Never tells the UID. */
export function cardIdOf(root: Uint8Array, uid: Uint8Array): string {
  return bytesToHex(deriveKey(root, CARD_SALT, `card-id/v1/${uidHex(uid)}`, KEY_LENGTH));
}

/** The five application keys of a card at one version of its keys. */
export type CardKeys = {
  /** App Master Key: the only one that changes keys and file settings. */
  k0: Uint8Array;
  /** SDM Meta Read Access Key: encrypts `p`. The wallet's (cardEncryptionKey). */
  k1: Uint8Array;
  /** SDM File Read Access Key: the MAC `c`. */
  k2: Uint8Array;
  /** Unused by BoltCards, set apart from the others as NXP AN12196 recommends. */
  k3: Uint8Array;
  k4: Uint8Array;
};

export function isKeyVersion(version: unknown): version is number {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= MIN_KEY_VERSION &&
    version <= MAX_KEY_VERSION
  );
}

export function cardKeysOf(root: Uint8Array, uid: Uint8Array, version: number): CardKeys {
  if (!isKeyVersion(version)) throw new Error("Invalid card key version");
  const uidText = uidHex(uid);
  const derive = (name: string) =>
    deriveKey(root, CARD_SALT, `${name}/v1/${uidText}/${version}`, KEY_LENGTH);
  return {
    k0: derive("k0"),
    k1: cardEncryptionKey(root),
    k2: derive("k2"),
    k3: derive("k3"),
    k4: derive("k4")
  };
}

/** Overwrites the keys with zeros once used. Best effort, as wipeBackupKeys. */
export function wipeCardKeys(keys: CardKeys): void {
  for (const key of [keys.k0, keys.k1, keys.k2, keys.k3, keys.k4]) key.fill(0);
}

/**
 * The generation of a card's first wallet. Part of the wallet's derivation (cardWalletPhrase), so
 * that a card can be given a new wallet without changing that derivation: a card deleted then added
 * again pays from the next generation (card-record.ts, `walletGeneration`), nothing of its deleted
 * wallet shown again.
 */
export const FIRST_CARD_WALLET_GENERATION = 1;

/**
 * A card's wallet: the card, and its wallet's generation. Each of a card's data names the wallet it
 * belongs to (its mode and approved merchants, its payments, its movements, the copies of its
 * months): a card deleted then added again starts anew, its data
 * of an earlier generation never read for it again, and erased (src/features/card/card-erasure.ts).
 */
export type CardWalletOf = { cardId: string; walletGeneration: number };

/** Whether `value` is a wallet's generation: a whole number, the first one or later. */
export function isWalletGeneration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= FIRST_CARD_WALLET_GENERATION
  );
}

/** Whether `a` and `b` name the same card's same wallet. */
export function sameCardWallet(a: CardWalletOf, b: CardWalletOf): boolean {
  return a.cardId === b.cardId && a.walletGeneration === b.walletGeneration;
}

/**
 * The words of the wallet a card pays from (a wallet of its own for each card, never the
 * account's): the 12 BIP-39 words of 16 bytes derived from the card root and the
 * card's id, as Breez makes a passkey's wallet from its PRF output (recovery-phrase.ts). The
 * passkey gives them back on any device, across reprogrammings of the card; they tell nothing of
 * the account's wallet nor of the other cards'. A JavaScript string cannot be wiped: dropped as
 * soon as the wallet is connected, never kept, logged nor sent.
 */
export function cardWalletPhrase(root: Uint8Array, cardId: string, generation: number): string {
  const entropy = cardWalletEntropy(root, cardId, generation);
  try {
    return walletPhraseOf(entropy);
  } finally {
    entropy.fill(0);
  }
}

/**
 * The 16 bytes a card's wallet's words encode (cardWalletPhrase): what a card's pass keeps of its
 * wallet (card-pass.ts), wiped by its holder.
 */
export function cardWalletEntropy(
  root: Uint8Array,
  cardId: string,
  generation: number
): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(cardId)) throw new Error("Invalid card id");
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error("Invalid card wallet generation");
  }
  return deriveKey(root, CARD_SALT, `wallet/v1/${cardId}/${generation}`, 16);
}

/** The words of a card's wallet from its entropy (cardWalletEntropy). Never kept, logged nor sent. */
export function walletPhraseOf(entropy: Uint8Array): string {
  if (entropy.length !== 16) throw new Error("A card's wallet has 16 bytes of entropy");
  return bip39PhraseOf(entropy).join(" ");
}

/**
 * The secret of a card's channel on a relay (32 bytes): its bearer token there (the relay keeps
 * only its SHA-256). From the card's id and the relay's canonical host (relay-host.ts): another
 * phone of the wallet finds the same channel, and no relay can use a channel's secret on another.
 */
export function channelSecretOf(root: Uint8Array, cardId: string, relayHost: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(cardId)) throw new Error("Invalid card id");
  if (!isCanonicalRelayHost(relayHost)) throw new Error("Relay host not canonical");
  return deriveKey(root, CARD_SALT, `channel-secret/v1/${cardId}/${relayHost}`);
}

function uidHex(uid: Uint8Array): string {
  if (uid.length !== UID_LENGTH) throw new Error("A card UID has 7 bytes");
  return bytesToHex(uid);
}
