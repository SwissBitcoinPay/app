/**
 * Bech32 (BIP-173) and bech32m (BIP-350) decoding, without the 90-character limit: BOLT11 invoices
 * and LNURLs are longer. Only what the point of sale reads: Lightning invoices, bech32 LNURLs
 * (LUD-01) and taproot deposit addresses (bech32m, src/lib/onchain/address.ts).
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: readonly number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i];
  }
  return chk >>> 0;
}

function expandHrp(hrp: string): number[] {
  const high: number[] = [];
  const low: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    const code = hrp.charCodeAt(i);
    high.push(code >> 5);
    low.push(code & 31);
  }
  return [...high, 0, ...low];
}

export type Bech32 = {
  /** Human-readable part, lowercase. */
  hrp: string;
  /** 5-bit words, checksum removed. */
  words: number[];
};

/** What the checksum's polymod must give: 1 for bech32, this constant for bech32m (BIP-350). */
const BECH32M_CONSTANT = 0x2bc830a3;

/** Decodes a bech32 string (either case, never mixed), or null when it is not valid bech32. */
export function decodeBech32(input: string): Bech32 | null {
  return decode(input, 1);
}

/** Decodes a bech32m string (BIP-350: segwit v1+ addresses), or null when it is not one. */
export function decodeBech32m(input: string): Bech32 | null {
  return decode(input, BECH32M_CONSTANT);
}

function decode(input: string, constant: number): Bech32 | null {
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) return null;
  const text = input.toLowerCase();
  const separator = text.lastIndexOf("1");
  if (separator < 1 || separator + 7 > text.length) return null;
  const hrp = text.slice(0, separator);
  for (let i = 0; i < hrp.length; i++) {
    const code = hrp.charCodeAt(i);
    if (code < 33 || code > 126) return null;
  }
  const values: number[] = [];
  for (const char of text.slice(separator + 1)) {
    const value = CHARSET.indexOf(char);
    if (value === -1) return null;
    values.push(value);
  }
  if (polymod([...expandHrp(hrp), ...values]) !== constant) return null;
  return { hrp, words: values.slice(0, -6) };
}

/**
 * Regroups 5-bit words into bytes; the trailing bits (fewer than 8) are dropped, or with `pad` kept
 * as a last byte padded with 0 bits (how BOLT11 signs its data part).
 */
export function wordsToBytes(words: readonly number[], pad = false): Uint8Array {
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const word of words) {
    accumulator = ((accumulator << 5) | word) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  if (pad && bits > 0) bytes.push((accumulator << (8 - bits)) & 0xff);
  return Uint8Array.from(bytes);
}

/** Big-endian unsigned integer of 5-bit words. */
export function wordsToInteger(words: readonly number[]): number {
  let value = 0;
  for (const word of words) value = value * 32 + word;
  return value;
}
