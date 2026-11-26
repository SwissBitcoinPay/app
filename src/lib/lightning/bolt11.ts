import { bytesToUtf8 } from "@noble/ciphers/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { decodeBech32, wordsToBytes, wordsToInteger } from "./bech32";

/**
 * The fields of a BOLT11 invoice the point of sale checks before showing it: network, amount,
 * payment hash, description hash and expiry; and its plain description, which a card payment shows
 * as the point of sale wrote it (src/lib/card/card-invoice.ts). The signature is not verified here:
 * the point of sale's invoices are signed by the Spark service provider's node, which names no
 * merchant. A card payment reads the node that signed its invoice too (decodeSignedBolt11).
 * Spec: https://github.com/lightning/bolts/blob/master/11-payment-encoding.md
 */
export type Bolt11 = {
  /** "bc" mainnet, "tb" testnet, "tbs" signet, "bcrt" regtest. */
  network: string;
  /** Exact amount in millisatoshi, null for an invoice without amount. */
  amountMsat: bigint | null;
  /** Unix seconds. */
  timestamp: number;
  /** Seconds after `timestamp` (3600 when the invoice does not say). */
  expirySeconds: number;
  /** Hex, 32 bytes. */
  paymentHash: string;
  /** Hex, 32 bytes; null when the invoice carries a plain description. */
  descriptionHash: string | null;
  /** The plain description (`d`, UTF-8) as written, unchecked; null when the invoice has none. */
  description: string | null;
};

const HRP = /^ln(bcrt|bc|tbs|tb)(\d+)?([munp])?$/;
/** Millisatoshi per unit of the amount, by multiplier (1 BTC = 10^11 msat). */
const MSAT_PER_UNIT: Record<string, bigint> = {
  "": 100_000_000_000n,
  m: 100_000_000n,
  u: 100_000n,
  n: 100n
};

const TIMESTAMP_WORDS = 7;
/** 65-byte signature, as 5-bit words. */
const SIGNATURE_WORDS = 104;
const TAG_PAYMENT_HASH = 1;
const TAG_DESCRIPTION = 13;
const TAG_DESCRIPTION_HASH = 23;
const TAG_EXPIRY = 6;
const TAG_PAYEE_NODE = 19;
/** A compressed public key (33 bytes) as 5-bit words. */
const NODE_WORDS = 53;
/** A node's public key as decodeSignedBolt11 gives it: compressed (33 bytes), lowercase hex. */
const NODE_KEY = /^0[23][0-9a-f]{64}$/;
/** 256 bits as 5-bit words. */
const HASH_WORDS = 52;
const DEFAULT_EXPIRY_SECONDS = 3600;

function amountMsat(digits: string | undefined, multiplier: string | undefined): bigint | null {
  if (digits === undefined) return multiplier === undefined ? null : invalidAmount();
  if (digits.length > 1 && digits.startsWith("0")) return invalidAmount();
  const value = BigInt(digits);
  if (multiplier === "p") {
    // A pico-bitcoin is a tenth of a millisatoshi: only whole millisatoshis are valid.
    if (value % 10n !== 0n) return invalidAmount();
    return value / 10n;
  }
  return value * MSAT_PER_UNIT[multiplier ?? ""];
}

function invalidAmount(): never {
  throw new Error("Invalid invoice amount");
}

/** An invoice read once: its fields, and what its signature covers, for decodeSignedBolt11. */
type ReadBolt11 = {
  invoice: Bolt11;
  /** The human-readable part and the data part's words (timestamp and fields): what it signs. */
  hrp: string;
  data: number[];
  /** 64 bytes (r ‖ s) then the recovery id. */
  signature: Uint8Array;
  /** Its `n` fields' words, as many as it has. */
  nodes: number[][];
};

function readBolt11(input: string): ReadBolt11 | null {
  const text = input.trim().replace(/^lightning:/i, "");
  const decoded = decodeBech32(text);
  if (!decoded) return null;
  const hrp = HRP.exec(decoded.hrp);
  if (!hrp) return null;
  let amount: bigint | null;
  try {
    amount = amountMsat(hrp[2], hrp[3]);
  } catch {
    return null;
  }
  const words = decoded.words;
  if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) return null;
  const timestamp = wordsToInteger(words.slice(0, TIMESTAMP_WORDS));
  const data = words.slice(0, words.length - SIGNATURE_WORDS);
  const fields = data.slice(TIMESTAMP_WORDS);

  let paymentHash: string | null = null;
  let descriptionHash: string | null = null;
  let description: string | null = null;
  let expirySeconds = DEFAULT_EXPIRY_SECONDS;
  const nodes: number[][] = [];
  let i = 0;
  while (i < fields.length) {
    if (i + 3 > fields.length) return null;
    const tag = fields[i];
    const length = fields[i + 1] * 32 + fields[i + 2];
    const field = fields.slice(i + 3, i + 3 + length);
    if (field.length !== length) return null;
    // Fields of an unexpected length are skipped, as the spec requires for p and h.
    if (tag === TAG_PAYMENT_HASH && length === HASH_WORDS && paymentHash === null) {
      paymentHash = bytesToHex(wordsToBytes(field));
    } else if (tag === TAG_DESCRIPTION_HASH && length === HASH_WORDS && descriptionHash === null) {
      descriptionHash = bytesToHex(wordsToBytes(field));
    } else if (tag === TAG_DESCRIPTION && description === null) {
      description = bytesToUtf8(wordsToBytes(field));
    } else if (tag === TAG_EXPIRY) {
      expirySeconds = wordsToInteger(field);
    } else if (tag === TAG_PAYEE_NODE) {
      nodes.push(field);
    }
    i += 3 + length;
  }
  if (paymentHash === null) return null;

  return {
    invoice: {
      network: hrp[1],
      amountMsat: amount,
      timestamp,
      expirySeconds,
      paymentHash,
      descriptionHash,
      description
    },
    hrp: decoded.hrp,
    data,
    signature: wordsToBytes(words.slice(words.length - SIGNATURE_WORDS)),
    nodes
  };
}

/** Decodes a BOLT11 invoice (with or without a `lightning:` prefix), or null when invalid. */
export function decodeBolt11(input: string): Bolt11 | null {
  return readBolt11(input)?.invoice ?? null;
}

/**
 * Decodes a BOLT11 invoice as decodeBolt11 does, read once, with `signer()`: the node it is payable
 * to, the public key that signed it, compressed, lowercase hex. Worked out at the first call only
 * (an elliptic-curve operation: a record whose address is proven never needs it), then kept. As
 * BOLT11 reads it: the `n` field's key when the invoice has one, checked against the signature
 * (low-S only), else the key the signature recovers (high-S accepted). Null when the signature
 * holds for no key, or when its `n` field is of the wrong length, more than one, or not the key
 * that signed. Only the key that signed an invoice can be paid by it: the wallet checks the same
 * signature before it pays (spark-sdk 0.28.4 through lightning-invoice).
 */
export function decodeSignedBolt11(
  input: string
): { invoice: Bolt11; signer: () => string | null } | null {
  const read = readBolt11(input);
  if (!read) return null;
  let node: string | null | undefined;
  return {
    invoice: read.invoice,
    signer: () => {
      if (node === undefined) node = signerOf(read);
      return node;
    }
  };
}

/** The node `input` (a BOLT11 invoice) is payable to (decodeSignedBolt11's `signer`). */
export function bolt11PayeeNode(input: string): string | null {
  return decodeSignedBolt11(input)?.signer() ?? null;
}

function signerOf({ hrp, data, signature, nodes }: ReadBolt11): string | null {
  if (signature.length !== 65 || signature[64] > 3) return null;
  if (nodes.length > 1 || (nodes.length === 1 && nodes[0].length !== NODE_WORDS)) return null;
  const message = sha256(Uint8Array.from([...utf8ToBytes(hrp), ...wordsToBytes(data, true)]));
  const compact = signature.slice(0, 64);
  try {
    if (nodes.length === 1) {
      const node = wordsToBytes(nodes[0]);
      return secp256k1.verify(compact, message, node, { prehash: false, lowS: true })
        ? bytesToHex(node)
        : null;
    }
    return bytesToHex(
      secp256k1.Signature.fromBytes(compact, "compact")
        .addRecoveryBit(signature[64])
        .recoverPublicKey(message)
        .toBytes(true)
    );
  } catch {
    // r or s out of range, a point not on the curve: no key signed it.
    return null;
  }
}

/** Unix seconds after which the invoice can no longer be paid. */
export function bolt11ExpiresAt(invoice: Bolt11): number {
  return invoice.timestamp + invoice.expirySeconds;
}

/** Whether `value` is a node's public key as decodeSignedBolt11 gives it. */
export function isNodeKey(value: unknown): value is string {
  return typeof value === "string" && NODE_KEY.test(value);
}
