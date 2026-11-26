import type { Seed } from "@breeztech/breez-sdk-spark/web";

import { recoveryWords } from "./recovery-phrase";
import { encodeWalletSecret } from "./secret";
import type { WalletSeed } from "./types";

/** Same API as seed.ts. */
export function walletSecret(seed: WalletSeed): Uint8Array {
  // The web SDK seed, from passkey.web.ts.
  const web = seed as unknown as Seed;
  switch (web.type) {
    case "mnemonic":
      return encodeWalletSecret({ mnemonic: web.mnemonic, passphrase: web.passphrase });
    case "entropy":
      return encodeWalletSecret({ entropy: Uint8Array.from(web) });
    default:
      throw new Error("Unexpected wallet seed");
  }
}

/** Same API as seed.ts: the web SDK's `{ type: "mnemonic" }` seed, as passkey.web.ts gives one. */
export function mnemonicSeed(mnemonic: string): WalletSeed {
  const seed: Seed = { type: "mnemonic", mnemonic };
  return seed as unknown as WalletSeed;
}

/** Same API as seed.ts. */
export function recoveryPhraseOf(seed: WalletSeed): string[] | null {
  const web = seed as unknown as Seed;
  return web.type === "mnemonic" ? recoveryWords(web.mnemonic, web.passphrase) : null;
}
