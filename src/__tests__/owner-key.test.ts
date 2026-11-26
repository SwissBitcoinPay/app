import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";

const message = utf8ToBytes("final version of a sale");

describe("the owner's key of a sale", () => {
  it("signs as the public half anyone with the sale's key computes, whatever the parity", () => {
    // Enough owner keys for both parities of their point.
    for (let n = 1; n <= 12; n += 1) {
      const ownerSecret = new Uint8Array(32).fill(n);
      const owner = bytesToHex(schnorr.getPublicKey(ownerSecret));
      const saleKey = new Uint8Array(32).fill(100 + n);
      const secret = saleOwnerSecretKey(ownerSecret, saleKey);
      const publicKey = saleOwnerPublicKey(owner, saleKey);
      expect(bytesToHex(schnorr.getPublicKey(secret))).toBe(publicKey);
      const signature = schnorr.sign(message, secret);
      expect(schnorr.verify(signature, message, hexToBytes(publicKey))).toBe(true);
    }
  });

  it("is another key for each sale, and none of the owner key's", () => {
    const ownerSecret = new Uint8Array(32).fill(7);
    const owner = bytesToHex(schnorr.getPublicKey(ownerSecret));
    const a = saleOwnerPublicKey(owner, new Uint8Array(32).fill(1));
    const b = saleOwnerPublicKey(owner, new Uint8Array(32).fill(2));
    expect(a).not.toBe(b);
    expect(a).not.toBe(owner);
    // Another owner key, the same sale: another key.
    const other = bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(8)));
    expect(saleOwnerPublicKey(other, new Uint8Array(32).fill(1))).not.toBe(a);
  });

  it("never changes: every final version an owner signed derives from it", () => {
    const owner = bytesToHex(schnorr.getPublicKey(new Uint8Array(32).fill(7)));
    expect(saleOwnerPublicKey(owner, new Uint8Array(32).fill(1))).toBe(VECTOR);
  });

  it("refuses an owner key that is not one", () => {
    expect(() => saleOwnerPublicKey("ab", new Uint8Array(32))).toThrow();
    expect(() => saleOwnerPublicKey("ff".repeat(32), new Uint8Array(32))).toThrow();
  });
});

/** Computed apart (Python, pure secp256k1 arithmetic): SHA-256 tweak, Q = lift_x(P) + t·G. */
const VECTOR = "b74954890b2f6d3815cff871129a91f21d87b03a3fcb036e87f9358ff72b45ab";
