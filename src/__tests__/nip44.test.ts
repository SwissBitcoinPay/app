import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  UnknownNip44VersionError,
  conversationKey,
  messageKeys,
  nip44Decrypt,
  nip44Encrypt,
  paddedLength
} from "@/lib/nostr/nip44";

import vectors from "./fixtures/nip44-vectors.json";

// The test vectors of the NIP-44 reference implementation (see `source` in the fixture).
describe("NIP-44 v2", () => {
  it("pads plaintexts to the spec's lengths", () => {
    for (const [length, padded] of vectors.calc_padded_len) {
      expect(paddedLength(length)).toBe(padded);
    }
  });

  it("derives the spec's conversation keys of two parties", () => {
    for (const vector of vectors.get_conversation_key) {
      expect(bytesToHex(conversationKey(hexToBytes(vector.sec1), vector.pub2))).toBe(
        vector.conversation_key
      );
    }
    for (const vector of vectors.invalid_get_conversation_key) {
      expect(() => conversationKey(hexToBytes(vector.sec1), vector.pub2)).toThrow();
    }
  });

  it("gives both parties the same conversation key", () => {
    const a = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const b = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const pubA = bytesToHex(schnorr.getPublicKey(a));
    const pubB = bytesToHex(schnorr.getPublicKey(b));
    expect(bytesToHex(conversationKey(a, pubB))).toBe(bytesToHex(conversationKey(b, pubA)));
  });

  it("derives the spec's message keys", () => {
    const conversationKey = hexToBytes(vectors.get_message_keys.conversation_key);
    for (const expected of vectors.get_message_keys.keys) {
      const keys = messageKeys(conversationKey, hexToBytes(expected.nonce));
      expect(bytesToHex(keys.chachaKey)).toBe(expected.chacha_key);
      expect(bytesToHex(keys.chachaNonce)).toBe(expected.chacha_nonce);
      expect(bytesToHex(keys.hmacKey)).toBe(expected.hmac_key);
    }
  });

  it("encrypts and decrypts the spec's payloads", () => {
    for (const vector of vectors.encrypt_decrypt) {
      const key = hexToBytes(vector.conversation_key);
      expect(nip44Encrypt(vector.plaintext, key, hexToBytes(vector.nonce))).toBe(vector.payload);
      expect(nip44Decrypt(vector.payload, key)).toBe(vector.plaintext);
    }
  });

  it("refuses the spec's invalid payloads", () => {
    for (const vector of vectors.invalid_decrypt) {
      expect(() => nip44Decrypt(vector.payload, hexToBytes(vector.conversation_key))).toThrow();
    }
  });

  it("tells a payload of another version apart", () => {
    const unknown = vectors.invalid_decrypt.filter(({ note }) => note.startsWith("unknown"));
    expect(unknown.length).toBeGreaterThan(0);
    for (const vector of unknown) {
      expect(() => nip44Decrypt(vector.payload, hexToBytes(vector.conversation_key))).toThrow(
        UnknownNip44VersionError
      );
    }
    expect(() => nip44Decrypt("#future", new Uint8Array(32))).toThrow(UnknownNip44VersionError);
  });

  it("draws a fresh nonce each time and refuses another key", () => {
    const key = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const a = nip44Encrypt("Fine Bakery", key);
    const b = nip44Encrypt("Fine Bakery", key);
    expect(a).not.toBe(b);
    expect(nip44Decrypt(a, key)).toBe("Fine Bakery");
    const other = globalThis.crypto.getRandomValues(new Uint8Array(32));
    expect(() => nip44Decrypt(a, other)).toThrow("Invalid MAC");
  });

  it("refuses plaintexts it cannot frame", () => {
    const key = new Uint8Array(32).fill(1);
    expect(() => nip44Encrypt("", key)).toThrow("Invalid plaintext length");
    expect(() => nip44Encrypt("a".repeat(65536), key)).toThrow("Invalid plaintext length");
    expect(nip44Decrypt(nip44Encrypt("a".repeat(65535), key), key)).toHaveLength(65535);
  });
});
