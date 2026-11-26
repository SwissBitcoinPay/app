/**
 * Test helpers: BOLT11 invoices and LNURLs built here, so that a test chooses their fields (amount,
 * description hash, payment hash). The signature is 65 zero bytes, which no key made (the app
 * reads no node from it, bolt11PayeeNode), unless the test signs it as a node (`signWith`).
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GENERATOR[i];
  }
  return chk >>> 0;
}

function expandHrp(hrp: string): number[] {
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)];
}

/** Bech32 (BIP-173), or bech32m with `constant` 0x2bc830a3 (BIP-350). */
export function encodeBech32(hrp: string, words: number[], constant = 1): string {
  const mod = polymod([...expandHrp(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join("")}`;
}

export function bytesToWords(bytes: Uint8Array): number[] {
  const words: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
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

function field(tag: number, data: number[]): number[] {
  return [tag, Math.floor(data.length / 32), data.length % 32, ...data];
}

/** A fresh 32-byte preimage and its payment hash, hex. */
export function preimagePair(seed: number): { preimage: string; paymentHash: string } {
  const preimage = new Uint8Array(32).fill(seed & 0xff);
  return { preimage: bytesToHex(preimage), paymentHash: bytesToHex(sha256(preimage)) };
}

export function metadataHash(metadata: string): string {
  return bytesToHex(sha256(utf8ToBytes(metadata)));
}

/** Millisatoshis as the shortest BOLT11 amount part (no multiplier when whole bitcoins). */
function amountPart(msat: bigint): string {
  if (msat % 100_000_000_000n === 0n) return `${msat / 100_000_000_000n}`;
  if (msat % 100_000_000n === 0n) return `${msat / 100_000_000n}m`;
  if (msat % 100_000n === 0n) return `${msat / 100_000n}u`;
  if (msat % 100n === 0n) return `${msat / 100n}n`;
  return `${msat * 10n}p`;
}

/** 5-bit words as bytes, the last one padded with 0 bits (what BOLT11 signs). */
function wordsToPaddedBytes(words: number[]): Uint8Array {
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
  if (bits > 0) bytes.push((accumulator << (8 - bits)) & 0xff);
  return Uint8Array.from(bytes);
}

/** A node's secret key for tests (32 bytes, `seed` repeated) and its compressed public key, hex. */
export function testNode(seed: number): { secretKey: Uint8Array; nodeId: string } {
  const secretKey = new Uint8Array(32).fill(seed & 0xff);
  return { secretKey, nodeId: bytesToHex(secp256k1.getPublicKey(secretKey, true)) };
}

export function makeInvoice({
  amountMsat,
  network = "bc",
  paymentHash,
  descriptionHash,
  description,
  timestamp = Math.floor(Date.now() / 1000),
  expirySeconds,
  signWith,
  withNodeField = false
}: {
  amountMsat?: bigint;
  network?: string;
  paymentHash: string;
  descriptionHash?: string;
  /** A plain description (`d`), UTF-8. */
  description?: string;
  timestamp?: number;
  expirySeconds?: number;
  /** A node's secret key (testNode): the invoice is signed by it, as a node signs its invoices. */
  signWith?: Uint8Array;
  /** With `signWith`: the node's key in an `n` field too. */
  withNodeField?: boolean;
}): string {
  const hrp = `ln${network}${amountMsat === undefined ? "" : amountPart(amountMsat)}`;
  const data = [
    ...integerWords(timestamp, 7),
    ...field(1, bytesToWords(hexToBytes(paymentHash))),
    ...(descriptionHash ? field(23, bytesToWords(hexToBytes(descriptionHash))) : []),
    ...(description !== undefined ? field(13, bytesToWords(utf8ToBytes(description))) : []),
    ...(expirySeconds !== undefined ? field(6, integerWords(expirySeconds)) : []),
    ...(signWith && withNodeField
      ? field(19, bytesToWords(secp256k1.getPublicKey(signWith, true)))
      : [])
  ];
  if (!signWith) return encodeBech32(hrp, [...data, ...new Array<number>(104).fill(0)]);
  const message = sha256(Uint8Array.from([...utf8ToBytes(hrp), ...wordsToPaddedBytes(data)]));
  // Recovery id first in noble's "recovered" format, last in BOLT11's.
  const recovered = secp256k1.sign(message, signWith, { prehash: false, format: "recovered" });
  const signature = Uint8Array.from([...recovered.slice(1), recovered[0]]);
  return encodeBech32(hrp, [...data, ...bytesToWords(signature)]);
}

/** A bech32 LNURL (LUD-01) of an https URL. */
export function encodeLnurl(url: string): string {
  return encodeBech32("lnurl", bytesToWords(utf8ToBytes(url))).toUpperCase();
}
