import type { Seed } from "@breeztech/breez-sdk-spark-react-native";

import { WalletError } from "./errors";
import { recoveryWords } from "./recovery-phrase";
import { encodeWalletSecret } from "./secret";
import type { WalletSeed } from "./types";

/**
 * The secret of a wallet seed as bytes, the same on native and on the web for the same wallet:
 * key material for the app's own keys (src/lib/backup/keys.ts), never stored nor sent.
 */
export function walletSecret(seed: WalletSeed): Uint8Array {
  // The native SDK seed, from passkey.ts. Its tags are the strings of `Seed_Tags`: compared as
  // such, so that reading a seed does not load the native library.
  const native = seed as unknown as Seed;
  switch (native.tag) {
    case "Mnemonic":
      return encodeWalletSecret({
        mnemonic: native.inner.mnemonic,
        passphrase: native.inner.passphrase
      });
    case "Entropy":
      return encodeWalletSecret({ entropy: new Uint8Array(native.inner[0]) });
    default:
      throw new Error("Unexpected wallet seed");
  }
}

/**
 * The SDK seed of BIP-39 words without passphrase, as the SDK gives a passkey's (`Seed.Mnemonic`):
 * a card's wallet (src/lib/card/keys.ts, cardWalletPhrase). Loads the native library, which the
 * wallet it connects needs anyway.
 */
export function mnemonicSeed(mnemonic: string): WalletSeed {
  let sdk: typeof import("@breeztech/breez-sdk-spark-react-native");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy, as wallet.ts
    sdk = require("@breeztech/breez-sdk-spark-react-native");
  } catch (error) {
    throw new WalletError("unavailable", "The Breez SDK native library could not be loaded", {
      cause: error
    });
  }
  return new sdk.Seed.Mnemonic({ mnemonic, passphrase: undefined }) as unknown as WalletSeed;
}

/**
 * The wallet's recovery phrase, for "Recovery phrase" only (recovery-phrase.ts): its words
 * when the seed is a BIP-39 phrase the wallet restores from alone, else null (raw entropy, a
 * passphrase). Shown to the account's owner after the passkey, never stored, logged nor sent.
 */
export function recoveryPhraseOf(seed: WalletSeed): string[] | null {
  const native = seed as unknown as Seed;
  return native.tag === "Mnemonic"
    ? recoveryWords(native.inner.mnemonic, native.inner.passphrase)
    : null;
}
