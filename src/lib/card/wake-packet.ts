import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8 } from "@noble/ciphers/utils.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import { base64UrlToBytes } from "@/lib/base64";

import { isCanonicalRelayHost } from "./relay-host";

/*
 * The wake packet of a tap (relay contract v2): what the relay sends the phone when a point of
 * sale reads one of its cards, in an Expo notification or from `GET /v1/channel/pending`. ECIES to
 * the device's key (device-key.ts): ephemeral ECDH P-256, HKDF-SHA256 of the shared x coordinate
 * (salt: the ephemeral public key, 65 raw bytes; info "card-relay v2"), AES-256-GCM with a 12-byte
 * IV and no associated data, the tag after the ciphertext (WebCrypto's layout, which the relay
 * uses). Sent as `{epk, iv, ct}` in base64url; inside, `{p, c, session, wsToken, relay}`.
 *
 * A packet proves nothing by itself: anyone who knows the device's public key can make one. What
 * it carries is checked like anything from outside: the tap (`p`, `c`) against the card's keys and
 * last counter (tap.ts), the relay against the card's own.
 */

const INFO = utf8ToBytes("card-relay v2");

/** Longest ciphertext accepted: the plaintext is a few hundred bytes. */
const MAX_CIPHERTEXT = 2048;
/** The GCM tag. */
const TAG = 16;

export type WakePacket = { epk: Uint8Array; iv: Uint8Array; ct: Uint8Array };

/** A packet as sent (`{epk, iv, ct}`, base64url), or null when out of shape. */
export function parseWakePacket(value: unknown): WakePacket | null {
  if (value === null || typeof value !== "object") return null;
  const { epk, iv, ct } = value as Record<string, unknown>;
  if (typeof epk !== "string" || typeof iv !== "string" || typeof ct !== "string") return null;
  const bytes = {
    epk: base64UrlToBytes(epk),
    iv: base64UrlToBytes(iv),
    ct: base64UrlToBytes(ct)
  };
  if (!bytes.epk || !bytes.iv || !bytes.ct) return null;
  if (bytes.epk.length !== 65 || bytes.epk[0] !== 0x04 || bytes.iv.length !== 12) return null;
  if (bytes.ct.length <= TAG || bytes.ct.length > MAX_CIPHERTEXT) return null;
  if (!p256.utils.isValidPublicKey(bytes.epk, false)) return null;
  return bytes as WakePacket;
}

/** What a packet says of a tap. */
export type CardWake = {
  /** As the point of sale sent them: 32 and 16 hex digits. */
  p: string;
  c: string;
  /** The relay's session: 16 bytes, lowercase hex. */
  session: string;
  /** The phone's credential for `wss://<relay>/wait/<session>`. */
  wsToken: string;
  /** The relay's host (canonical), where the phone opens the WebSocket. */
  relay: string;
};

const P = /^[0-9a-fA-F]{32}$/;
const C = /^[0-9a-fA-F]{16}$/;
const SESSION = /^[0-9a-f]{32}$/;
/** At least 128 bits, base64url (docs/card-relay.md). */
const WS_TOKEN = /^[A-Za-z0-9_-]{22,128}$/;

function parseWake(value: unknown): CardWake | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { p, c, session, wsToken, relay } = value as Record<string, unknown>;
  if (
    typeof p !== "string" ||
    typeof c !== "string" ||
    typeof session !== "string" ||
    typeof wsToken !== "string" ||
    typeof relay !== "string" ||
    !P.test(p) ||
    !C.test(c) ||
    !SESSION.test(session) ||
    !WS_TOKEN.test(wsToken) ||
    !isCanonicalRelayHost(relay)
  ) {
    return null;
  }
  return { p, c, session, wsToken, relay };
}

/** The packet opened with the device's secret key; null when it does not open or is out of shape. */
export function openWakePacket(secretKey: Uint8Array, packet: WakePacket): CardWake | null {
  let plain: Uint8Array;
  try {
    // Compressed: its first byte is the parity, the next 32 the x coordinate.
    const shared = p256.getSharedSecret(secretKey, packet.epk, true).slice(1);
    const key = hkdf(sha256, shared, packet.epk, INFO, 32);
    plain = gcm(key, packet.iv).decrypt(packet.ct);
  } catch {
    return null;
  }
  try {
    return parseWake(JSON.parse(bytesToUtf8(plain)));
  } catch {
    return null;
  }
}
