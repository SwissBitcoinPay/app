import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from "@/lib/base64";

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("base64url", () => {
  it("encodes like RFC 4648 §5 without padding, and reads it back", () => {
    // The test vectors of RFC 4648 §10, without their padding.
    const vectors = ["", "Zg", "Zm8", "Zm9v", "Zm9vYg", "Zm9vYmE", "Zm9vYmFy"];
    vectors.forEach((text, length) => {
      const bytes = bytesOf("foobar".slice(0, length));
      expect(bytesToBase64Url(bytes)).toBe(text);
      expect(base64UrlToBytes(text)).toEqual(bytes);
    });
    // The two characters that differ from base64: "-" and "_" for "+" and "/".
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    for (let length = 0; length <= 40; length++) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
      expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    }
    expect(bytesToBase64Url(new Uint8Array(32))).toHaveLength(43);
  });

  it("only reads the canonical spelling", () => {
    const text = bytesToBase64Url(new Uint8Array([1, 2]));
    expect(text).toBe("AQI");
    expect(base64UrlToBytes("AQI=")).toBeNull();
    // Unused bits set: another spelling of the same bytes.
    expect(base64UrlToBytes("AQJ")).toBeNull();
    expect(base64UrlToBytes("A+I")).toBeNull();
    expect(base64UrlToBytes("A/I")).toBeNull();
    // No byte count gives 5 characters.
    expect(base64UrlToBytes("AQIDB")).toBeNull();
  });
});

describe("base64", () => {
  it("encodes like RFC 4648 §4 with padding, and reads it back", () => {
    // The test vectors of RFC 4648 §10.
    const vectors = ["", "Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"];
    vectors.forEach((text, length) => {
      const bytes = bytesOf("foobar".slice(0, length));
      expect(bytesToBase64(bytes)).toBe(text);
      expect(base64ToBytes(text)).toEqual(bytes);
    });
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff]))).toBe("+/8=");
    for (let length = 0; length <= 40; length++) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it("only reads the canonical spelling", () => {
    expect(base64ToBytes("Zg")).toBeNull();
    expect(base64ToBytes("Zg=")).toBeNull();
    expect(base64ToBytes("Zh==")).toBeNull();
    expect(base64ToBytes("Z===")).toBeNull();
    expect(base64ToBytes("Zg==Zg==")).toBeNull();
    expect(base64ToBytes("-_8=")).toBeNull();
  });
});
