/**
 * Test helpers: on-chain addresses built here. Taproot (witness v1, bech32m, BIP-350) like the
 * Spark deposit addresses the SDK hands out; checked against BIP-350's reference implementation.
 */
import { bytesToWords, encodeBech32 } from "./lightning";

const BECH32M_CONSTANT = 0x2bc830a3;

/** The taproot address of a 32-byte program filled with `fill` (1 to 255), on `hrp`'s network. */
export function taprootAddress(fill: number, hrp = "bc"): string {
  return encodeBech32(hrp, [1, ...bytesToWords(new Uint8Array(32).fill(fill))], BECH32M_CONSTANT);
}
