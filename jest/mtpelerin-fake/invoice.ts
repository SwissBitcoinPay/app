import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { secureRandomBytes } from "@/lib/random";

/*
 * The fake Mt Pelerin's 1-sat invoices (server.ts): BOLT11 as the app decodes it
 * (src/lib/lightning/bolt11.ts), its fields chosen, its signature 65 zero bytes, which no node made:
 * no wallet could pay it. A test's payer pays it in the fake only (`payInvoice`).
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: readonly number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i]!;
  }
  return chk >>> 0;
}

function expandHrp(hrp: string): number[] {
  const codes = [...hrp].map((char) => char.charCodeAt(0));
  return [...codes.map((code) => code >> 5), 0, ...codes.map((code) => code & 31)];
}

function bech32(hrp: string, words: readonly number[]): string {
  const mod = polymod([...expandHrp(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((word) => CHARSET[word]).join("")}`;
}

function toWords(bytes: Uint8Array): number[] {
  const words: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = ((accumulator << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  return words;
}

function integerWords(value: number, length?: number): number[] {
  const words: number[] = [];
  let rest = value;
  do {
    words.unshift(rest % 32);
    rest = Math.floor(rest / 32);
  } while (rest > 0);
  while (length !== undefined && words.length < length) words.unshift(0);
  return words;
}

function field(tag: number, data: readonly number[]): number[] {
  return [tag, Math.floor(data.length / 32), data.length % 32, ...data];
}

/** BOLT11 amount part of whole millisatoshis (`10n` pico-bitcoins: 1 msat). */
function amountPart(msat: number): string {
  if (msat % 100_000 === 0) return `${msat / 100_000}u`;
  if (msat % 100 === 0) return `${msat / 100}n`;
  return `${msat * 10}p`;
}

/** An invoice of `amountMsat` on `network` ("bc"), its memo `description`, and its hash. */
export function fakeInvoice({
  amountMsat,
  network,
  description,
  timestamp,
  expirySeconds
}: {
  amountMsat: number;
  network: string;
  description: string;
  timestamp: number;
  expirySeconds: number;
}): { pr: string; paymentHash: string } {
  const paymentHash = sha256(secureRandomBytes(32));
  const data = [
    ...integerWords(timestamp, 7),
    ...field(1, toWords(paymentHash)),
    ...field(13, toWords(utf8ToBytes(description))),
    ...field(6, integerWords(expirySeconds))
  ];
  const pr = bech32(`ln${network}${amountPart(amountMsat)}`, [
    ...data,
    ...new Array<number>(104).fill(0)
  ]);
  return { pr, paymentHash: bytesToHex(paymentHash) };
}
