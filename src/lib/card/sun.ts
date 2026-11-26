import { cmac, ecb } from "@noble/ciphers/aes.js";
import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";

/*
 * SUN, NXP's Secure Unique NFC message, as a BoltCard writes it at each tap
 * (`lnurlw://…?p=<32 hex>&c=<16 hex>`, boltcard/docs/SPEC.md): `p` is the PICCData encrypted with
 * K1, `c` the SDM MAC of the tap computed with K2 (NXP AN12196 §3.3, §3.4). The card's SDM file
 * settings mirror the UID and the read counter (PICCDataTag 0xC7) and compute the MAC over an empty
 * input (SDMMACInputOffset = SDMMACOffset), as BoltCards are programmed.
 * Checked against boltcard/docs/TEST_VECTORS.md (card-sun.test.ts).
 */

/** UID mirrored (bit 7), read counter mirrored (bit 6), UID of 7 bytes (bits 3..0): PICCDataTag. */
export const PICC_DATA_TAG = 0xc7;

export const UID_LENGTH = 7;
/** The SDM read counter: 3 bytes, little-endian on the card. */
export const MAX_COUNTER = 0xffffff;

/** What `p` tells once decrypted: the card's UID and its read counter at the tap. */
export type PiccData = { uid: Uint8Array; counter: number };

const BLOCK = 16;

/**
 * `p` decrypted with K1 (AES-128, a single block, zero IV: CBC equals ECB here): PICCDataTag,
 * UID (7 bytes), read counter (3 bytes, little-endian), 5 bytes of padding the card chooses. Null
 * unless the tag is 0xC7, which is what a wrong key or a forged `p` gives but with odds of 1/256:
 * `c` must be checked too (verifySun).
 */
export function decryptPiccData(k1: Uint8Array, p: Uint8Array): PiccData | null {
  if (k1.length !== BLOCK || p.length !== BLOCK) return null;
  const plain = ecb(k1, { disablePadding: true }).decrypt(p);
  if (plain[0] !== PICC_DATA_TAG) return null;
  const uid = plain.slice(1, 1 + UID_LENGTH);
  const counter = plain[8] | (plain[9] << 8) | (plain[10] << 16);
  return { uid, counter };
}

/**
 * SV2 of AN12196 §3.4.2: the input of the SDM session MAC key, `3CC3 0001 0080` then the UID and
 * the counter (little-endian).
 */
export function sessionVector(uid: Uint8Array, counter: number): Uint8Array {
  checkUidAndCounter(uid, counter);
  return concatBytes(
    Uint8Array.of(0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80),
    uid,
    Uint8Array.of(counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff)
  );
}

/** The SDM session MAC key of a tap: CMAC(K2, SV2). */
export function sessionMacKey(k2: Uint8Array, uid: Uint8Array, counter: number): Uint8Array {
  return cmac(sessionVector(uid, counter), k2);
}

/**
 * `c` of a tap (8 bytes): the CMAC, with the session key, of the card's empty MAC input, truncated
 * to its odd bytes (1, 3, …, 15) as NTAG 424 DNA truncates MACs (AN12196 §3.3).
 */
export function sunMac(k2: Uint8Array, uid: Uint8Array, counter: number): Uint8Array {
  const full = cmac(new Uint8Array(0), sessionMacKey(k2, uid, counter));
  return truncateMac(full);
}

/** The odd bytes of a 16-byte MAC: NTAG 424 DNA's truncation to 8 bytes. */
export function truncateMac(full: Uint8Array): Uint8Array {
  const short = new Uint8Array(8);
  for (let i = 0; i < 8; i++) short[i] = full[2 * i + 1];
  return short;
}

/**
 * A tap, checked: `p` opens with K1 into PICCData of tag 0xC7, and `c` is that tap's MAC with K2
 * (compared in constant time). Null otherwise: never a partial answer. Whether the UID is the
 * expected card's and the counter is fresh is the caller's to check.
 */
export function verifySun(
  k1: Uint8Array,
  k2: Uint8Array,
  p: Uint8Array,
  c: Uint8Array
): PiccData | null {
  if (c.length !== 8) return null;
  const picc = decryptPiccData(k1, p);
  if (!picc) return null;
  return equalBytes(sunMac(k2, picc.uid, picc.counter), c) ? picc : null;
}

/** `p` and `c` as bytes, from a point of sale's request or a card's NDEF. */
export type SunParams = { p: Uint8Array; c: Uint8Array };

const P_HEX = /^[0-9a-fA-F]{32}$/;
const C_HEX = /^[0-9a-fA-F]{16}$/;

/**
 * `p` (32 hex) and `c` (16 hex) as bytes, null when either is malformed. Either case: readers and
 * relays differ (the card writes uppercase).
 */
export function parseSunParams(p: unknown, c: unknown): SunParams | null {
  if (typeof p !== "string" || typeof c !== "string" || !P_HEX.test(p) || !C_HEX.test(c)) {
    return null;
  }
  return { p: hexBytes(p), c: hexBytes(c) };
}

function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

function checkUidAndCounter(uid: Uint8Array, counter: number): void {
  if (uid.length !== UID_LENGTH) throw new Error("A card UID has 7 bytes");
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
    throw new Error("A card counter has 3 bytes");
  }
}
