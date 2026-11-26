import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * The secret of a seed as bytes, whichever SDK gave it (seed.ts, seed.web.ts): the same wallet must
 * give the same bytes in the apps and on the web, or the backup keys would differ between them.
 * The type prefixes keep a mnemonic and entropy from ever giving the same bytes. Never change this
 * encoding: the keys of every released backup derive from it (src/lib/backup/keys.ts).
 */
export function encodeWalletSecret(
  secret: { mnemonic: string; passphrase?: string } | { entropy: Uint8Array }
): Uint8Array {
  if ("entropy" in secret) return concatBytes(utf8ToBytes("entropy:"), secret.entropy);
  // BIP-39 words, whatever the spacing or case the SDK gives them in.
  const words = secret.mnemonic.trim().split(/\s+/).join(" ").toLowerCase();
  if (words === "") throw new Error("Empty mnemonic");
  // No passphrase and an empty one are the same BIP-39 seed.
  const passphrase = secret.passphrase ? `\n${secret.passphrase}` : "";
  return utf8ToBytes(`mnemonic:${words}${passphrase}`);
}
