import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/*
 * The owner's key of a sale: the business's link owner key
 * (deriveLinkOwner, src/lib/team/keys.ts) tweaked by the sale's own key, Q = P + t·G with
 * t = SHA-256(prefix, P, sale key), P taken with an even y (BIP-340). Whoever holds the sale's key
 * (its payment link) computes the public half from the owner key's public half, which the link
 * carries; only the owner computes the secret, q = p + t, from the owner key's secret. So the owner
 * signs the final version of any sale of the business (link.ts), an employee's included, with a key
 * of that sale alone: relays cannot tell the owner's final versions apart from any other author's,
 * nor link them together. The same construction as BIP-32's unhardened derivation and Taproot's
 * tweak; checked by signing with the secret and verifying with the public half (owner-key.test.ts).
 */

const TWEAK_PREFIX = utf8ToBytes("sattle.me/payment-link/owner/v1");
const ORDER = secp256k1.Point.Fn.ORDER;
const HEX_32 = /^[0-9a-f]{64}$/;

function toScalar(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes)}`);
}

function fromScalar(value: bigint): Uint8Array {
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

/** The tweak of the sale whose own key is `saleKey`, for the owner key `owner` (x-only, hex). */
function tweakOf(owner: string, saleKey: Uint8Array): bigint {
  const tweak = toScalar(sha256(concatBytes(TWEAK_PREFIX, hexToBytes(owner), saleKey))) % ORDER;
  // Odds below 2^-255: a key that cannot be used is refused, never replaced by another.
  if (tweak === 0n) throw new Error("Unusable tweak");
  return tweak;
}

/**
 * The public half (x-only, hex) of the owner's key of the sale whose own key is `saleKey`, from the
 * public half of the business's link owner key. Throws for a public key off the curve.
 */
export function saleOwnerPublicKey(owner: string, saleKey: Uint8Array): string {
  if (!HEX_32.test(owner)) throw new Error("Invalid owner key");
  const point = secp256k1.Point.fromHex(`02${owner}`).add(
    secp256k1.Point.BASE.multiply(tweakOf(owner, saleKey))
  );
  return point.toAffine().x.toString(16).padStart(64, "0");
}

/**
 * The secret of the owner's key of the sale whose own key is `saleKey`, from the secret of the
 * business's link owner key: it signs (BIP-340) as saleOwnerPublicKey.
 */
export function saleOwnerSecretKey(ownerSecret: Uint8Array, saleKey: Uint8Array): Uint8Array {
  const owner = bytesToHex(schnorr.getPublicKey(ownerSecret));
  const secret = toScalar(ownerSecret);
  // P with an even y: the secret of an odd point is negated, as BIP-340 lifts x-only keys.
  const even = secp256k1.Point.BASE.multiply(secret).toAffine().y % 2n === 0n;
  const tweaked = ((even ? secret : ORDER - secret) + tweakOf(owner, saleKey)) % ORDER;
  if (tweaked === 0n) throw new Error("Unusable tweak");
  return fromScalar(tweaked);
}
