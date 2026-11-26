import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { base64UrlToBytes } from "@/lib/base64";
import { sealPushToken } from "@/lib/card/push-seal";

/**
 * The relay's reference vector (sattleme/relay, test/token.test.ts, also checked
 * with Python's `cryptography`), as is: the bare token sealed.
 */
const VECTOR = {
  c: "4E8A9D1C2B3F6A70",
  iv: "000102030405060708090a0b",
  token: "ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]",
  key: "0d2826e3eeb47f9ced26b5f2f1dab23acb95b564d1e011241cf558432d25cbbd",
  t: "AAECAwQFBgcICQoL861nRxTgw6gXCBcmtICKaqBSQXQNa-o2DtJiVLIXP2dCtnZzN767qRPyXzAsDVzMXa9AGc6_iIlN"
};

/** What the relay does with `t` (src/crypto.ts `openToken`): null when it does not open. */
function openToken(c: Uint8Array, t: string): string | null {
  const bytes = base64UrlToBytes(t);
  if (!bytes || bytes.length < 29) return null;
  const key = hkdf(sha256, c, new Uint8Array(0), utf8ToBytes("card-relay v2 push token"), 32);
  try {
    return new TextDecoder().decode(gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12)));
  } catch {
    return null;
  }
}

describe("sealPushToken", () => {
  it("gives the relay's reference vector: the bare token", () => {
    const c = hexToBytes(VECTOR.c);
    expect(sealPushToken(c, VECTOR.token, hexToBytes(VECTOR.iv))).toBe(VECTOR.t);
    expect(openToken(c, VECTOR.t)).toBe(VECTOR.token);
    // The key, for implementers.
    expect(
      bytesToHex(hkdf(sha256, c, new Uint8Array(0), utf8ToBytes("card-relay v2 push token"), 32))
    ).toBe(VECTOR.key);
  });

  it("draws a new IV for every seal: the same tap sealed twice never repeats one", () => {
    const c = hexToBytes(VECTOR.c);
    const seals = Array.from({ length: 20 }, () => sealPushToken(c, VECTOR.token));
    const ivs = seals.map((t) => bytesToHex(base64UrlToBytes(t)!.subarray(0, 12)));
    expect(new Set(ivs).size).toBe(seals.length);
    for (const t of seals) expect(openToken(c, t)).toBe(VECTOR.token);
  });

  it("opens with that tap's c only", () => {
    const t = sealPushToken(hexToBytes(VECTOR.c), VECTOR.token);
    expect(openToken(hexToBytes("4E8A9D1C2B3F6A71"), t)).toBeNull();
  });

  it("seals Expo push tokens only, for an 8-byte c and a 12-byte IV", () => {
    const c = hexToBytes(VECTOR.c);
    expect(() => sealPushToken(c, "https://evil.example/push")).toThrow();
    expect(() => sealPushToken(c, `ExponentPushToken[${"x".repeat(257)}]`)).toThrow();
    expect(() => sealPushToken(c, JSON.stringify({ to: VECTOR.token, wake: "data" }))).toThrow();
    expect(() => sealPushToken(c.subarray(0, 7), VECTOR.token)).toThrow();
    expect(() => sealPushToken(c, VECTOR.token, new Uint8Array(11))).toThrow();
    const longest = `ExponentPushToken[${"x".repeat(256)}]`;
    expect(base64UrlToBytes(sealPushToken(c, longest))!.length).toBe(12 + longest.length + 16);
    expect(openToken(c, sealPushToken(c, longest))).toBe(longest);
  });
});
