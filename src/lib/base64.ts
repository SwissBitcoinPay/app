/*
 * Base64 (RFC 4648), written here: Hermes and older JavaScript engines have no `atob` / `btoa`
 * to rely on, and these only take Latin-1 strings anyway. Decoding is strict: one value has one
 * spelling, anything else is refused (null).
 */

/** RFC 4648 §4. */
const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** RFC 4648 §5: URL- and filename-safe, nothing to escape in a URL fragment. */
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encode(bytes: Uint8Array, alphabet: string): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let c = 0; c < chars; c++) text += alphabet[(chunk >> (18 - c * 6)) & 63];
  }
  return text;
}

/** Unpadded text of `alphabet` as bytes; null unless it is the canonical encoding of some bytes. */
function decode(text: string, alphabet: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((text.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of text) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  // Left-over bits are padding: zero in the canonical encoding.
  return buffer === 0 ? bytes : null;
}

/** Base64url without padding (RFC 4648 §5): 32 bytes give 43 characters. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return encode(bytes, URL_SAFE);
}

/**
 * The bytes of unpadded base64url text, or null when it is not the canonical encoding of some
 * bytes (another alphabet, padding, a length no byte count gives, unused bits set): one key has
 * exactly one spelling in a link.
 */
export function base64UrlToBytes(text: string): Uint8Array | null {
  return decode(text, URL_SAFE);
}

/** Standard base64 with "=" padding (RFC 4648 §4), as NIP-44 payloads use it. */
export function bytesToBase64(bytes: Uint8Array): string {
  const text = encode(bytes, STANDARD);
  return text + "=".repeat((4 - (text.length % 4)) % 4);
}

/** The bytes of padded standard base64 text, or null when it is not canonical. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const unpadded = text.replace(/={1,2}$/, "");
  if (unpadded.includes("=")) return null;
  return decode(unpadded, STANDARD);
}
