import { sha256 } from "@noble/hashes/sha2.js";

import { BIP39_ENGLISH } from "./bip39-english";

/*
 * The wallet's recovery phrase, as "Recovery phrase" shows it to its owner. A wallet of a passkey
 * has one: Breez 0.28.4 derives its seed as `Seed.Mnemonic`,
 * the 12 English words of the first 16 bytes of the passkey's PRF output, without passphrase
 * (crates/breez-sdk/core/src/passkey/derivation.rs, `prf_to_mnemonic`; recovery-phrase.test.ts
 * checks it with the SDK itself). The SDK reads such a phrase as any BIP-39 wallet does (models
 * `Seed::to_bytes`: BIP-39 seed, empty passphrase), its Spark identity at m/8797555'/1'/0'.
 */

/** Word counts the Breez SDK documents for `Seed.Mnemonic`. */
const WORD_COUNTS: readonly number[] = [12, 24];

const INDEX = new Map(BIP39_ENGLISH.map((word, index) => [word, index]));

/**
 * Whether `words` are a BIP-39 phrase of the English list: 12 or 24 of its words, as it writes them
 * (lowercase), whose checksum holds (the first bits of the SHA-256 of the entropy they carry, one
 * per 32 bits of entropy).
 */
export function isBip39Phrase(words: readonly string[]): boolean {
  if (!WORD_COUNTS.includes(words.length)) return false;
  let bits = 0n;
  for (const word of words) {
    const index = INDEX.get(word);
    if (index === undefined) return false;
    bits = (bits << 11n) | BigInt(index);
  }
  const checksumBits = (words.length * 11) / 33;
  const entropy = new Uint8Array((words.length * 11 - checksumBits) / 8);
  let rest = bits >> BigInt(checksumBits);
  for (let at = entropy.length - 1; at >= 0; at--) {
    entropy[at] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  const checksum = Number(bits & ((1n << BigInt(checksumBits)) - 1n));
  try {
    return sha256(entropy)[0] >> (8 - checksumBits) === checksum;
  } finally {
    entropy.fill(0);
  }
}

/**
 * The BIP-39 words of `entropy` (16 or 32 bytes: 12 or 24 words): its bits, then the first bits of
 * its SHA-256 as checksum, 11 bits a word of the English list. What Breez does with a passkey's PRF
 * output (`prf_to_mnemonic`), for a card's wallet (src/lib/card/keys.ts).
 */
export function bip39PhraseOf(entropy: Uint8Array): string[] {
  if (entropy.length !== 16 && entropy.length !== 32) {
    throw new Error("BIP-39 entropy of 16 or 32 bytes only");
  }
  const checksumBits = entropy.length / 4;
  let bits = 0n;
  for (const byte of entropy) bits = (bits << 8n) | BigInt(byte);
  bits = (bits << BigInt(checksumBits)) | BigInt(sha256(entropy)[0] >> (8 - checksumBits));
  const count = (entropy.length * 8 + checksumBits) / 11;
  const words: string[] = [];
  for (let at = count - 1; at >= 0; at--) {
    words.push(BIP39_ENGLISH[Number((bits >> BigInt(at * 11)) & 0x7ffn)]);
  }
  return words;
}

/**
 * The words of a seed's mnemonic, when it is a recovery phrase a wallet restores from its words
 * alone: written as the SDK writes it (words of the list, one space between them), BIP-39, without
 * a passphrase (one that would also be needed is never left out silently). Null otherwise.
 */
export function recoveryWords(mnemonic: string, passphrase: string | undefined): string[] | null {
  if (passphrase) return null;
  const words = mnemonic.split(" ");
  return isBip39Phrase(words) ? words : null;
}
