import type { BreezNetwork } from "@/lib/breez/config";
import { decodeBech32m } from "@/lib/lightning/bech32";

/**
 * Human-readable part of the segwit addresses of a network (BIP-173): the build's Breez network
 * (src/lib/breez/config.ts), mainnet for both variants.
 */
export function addressHrp(network: BreezNetwork): string {
  return network === "mainnet" ? "bc" : "bcrt";
}

/** Longest segwit address (BIP-173). */
const MAX_ADDRESS_LENGTH = 90;

/** Taproot: witness version 1, a 32-byte program (BIP-341), so 52 words of 5 bits. */
const TAPROOT_VERSION = 1;
const TAPROOT_PROGRAM_WORDS = 52;

/**
 * The deposit address `address` as the app keeps it (lowercase, as explorers print it), or null
 * when it is not a taproot address of `network`. A Spark deposit address is always one: the SDK
 * only accepts addresses paying a key with no script path (`validate_address_pays_to_verifying_key`,
 * spark-sdk 0.28.4), so anything else did not come from the merchant's wallet.
 */
export function parseDepositAddress(address: string, network: BreezNetwork): string | null {
  return parseTaprootAddress(address, addressHrp(network));
}

/**
 * parseDepositAddress, for the addresses of `hrp` ("bc", "bcrt"): the same prefixes as BOLT11's
 * (a payment link checks both against its invoice's network).
 */
export function parseTaprootAddress(address: string, hrp: string): string | null {
  if (address.length > MAX_ADDRESS_LENGTH) return null;
  const decoded = decodeBech32m(address);
  if (!decoded || decoded.hrp !== hrp) return null;
  const [version, ...program] = decoded.words;
  if (version !== TAPROOT_VERSION || program.length !== TAPROOT_PROGRAM_WORDS) return null;
  // 52 words are 260 bits: the 32 bytes and 4 bits of padding, which must be zeros (BIP-173).
  if ((program[program.length - 1] & 0b1111) !== 0) return null;
  return address.toLowerCase();
}
