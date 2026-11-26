import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64Url } from "@/lib/base64";
import { secureRandomBytes } from "@/lib/random";

import { isExpoPushToken } from "./push-token";

/*
 * The phone's Expo push token, sealed for one tap of the card (relay contract v2, sealed tokens,
 * sattleme/relay README, "Sealed push token"): the relay keeps it with the tap's
 * hash and can open it only when that very tap reaches it, with the tap's `c`, then wakes the phone
 * with an alert (iOS: Android has no push, its card socket wakes it, socket.ts). At rest, its
 * database ties no channel to a device. The key derives from `c` alone, which only the card and the
 * phone know before the tap. The bare token is sealed, which every relay of contract v2 opens.
 *
 * IRREVERSIBLE: the relay opens what this seals; the `info` string and the layout never change
 * (vector in card-push-seal.test.ts: the relay's own, test/token.test.ts).
 */

const INFO = "card-relay v2 push token";
const IV_BYTES = 12;
/** A text the relay opens: 1 to 300 bytes of UTF-8 (its `t` is 29 to 328 bytes). */
const MAX_TEXT_BYTES = 300;

/**
 * `t` for the tap of MAC `c` (its 8 raw bytes): base64url (no padding) of IV ‖ AES-256-GCM
 * ciphertext of the push token ‖ tag, the key HKDF-SHA256(ikm = c, empty salt, INFO). A new
 * random IV for every seal: the same `c` is sealed again with another token when the phone's
 * changes, and an IV used twice under one key would break GCM. `iv` is for the reference vector
 * only.
 */
export function sealPushToken(
  c: Uint8Array,
  token: string,
  iv: Uint8Array = secureRandomBytes(IV_BYTES)
): string {
  if (c.length !== 8) throw new Error("A tap MAC has 8 bytes");
  if (iv.length !== IV_BYTES) throw new Error("A GCM IV has 12 bytes");
  if (!isExpoPushToken(token)) throw new Error("Not an Expo push token");
  const plain = utf8ToBytes(token);
  if (plain.length > MAX_TEXT_BYTES) throw new Error("Push token too long");
  const key = hkdf(sha256, c, new Uint8Array(0), utf8ToBytes(INFO), 32);
  try {
    const sealed = gcm(key, iv).encrypt(plain);
    const out = new Uint8Array(IV_BYTES + sealed.length);
    out.set(iv);
    out.set(sealed, IV_BYTES);
    return bytesToBase64Url(out);
  } finally {
    key.fill(0);
  }
}
