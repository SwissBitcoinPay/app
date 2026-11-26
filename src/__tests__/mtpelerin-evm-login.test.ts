import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { base64ToBytes } from "@/lib/base64";
import { walletSecret } from "@/lib/breez/seed";
import {
  checksumAddress,
  evmAddress,
  personalMessageDigest,
  personalSign,
  personalSigner,
  testLoginSigner
} from "@/lib/mtpelerin/evm-login";
import { deriveTeamKeys, wipeTeamKeys } from "@/lib/team/keys";

import { testSeed } from "../../jest/account";

/*
 * The wallet-signature login of Mt Pelerin's dev/test environment:
 * EIP-191 `personal_sign` of the device id as UTF-8 text, with a key derived from the account's
 * team root (evm-login.ts).
 */

/** web3.js's `eth.accounts.sign` example: its key, address and signature of "Some data". */
const WEB3 = {
  key: "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
  address: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
  signature:
    "b91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c"
};

describe("the test login's EIP-191 signature (evm-login.ts)", () => {
  it("hashes the device id as UTF-8 text, as Mt Pelerin's digest", () => {
    // Smart contract wallets: "for device id 65b1f2e8c9f1a2b3c4d5e6f7 the signers must sign
    // for the digest 0xc611…", never the 12 bytes its hex would decode to.
    expect(bytesToHex(personalMessageDigest("65b1f2e8c9f1a2b3c4d5e6f7"))).toBe(
      "c611fcf3d7a14f55e3c7d511cd68cda70386ab4edcfd0f030aacc060ba8c89b1"
    );
  });

  it("signs as personal_sign does: r ‖ s ‖ v, v of 27 or 28", () => {
    const key = hexToBytes(WEB3.key);
    expect(evmAddress(secp256k1.getPublicKey(key, false))).toBe(WEB3.address);
    expect(evmAddress(secp256k1.getPublicKey(key, true))).toBe(WEB3.address);
    const signature = personalSign(key, "Some data");
    expect(bytesToHex(signature)).toBe(WEB3.signature);
    expect(personalSigner("Some data", signature)).toBe(WEB3.address);
  });

  it("checksums addresses as EIP-55", () => {
    // EIP-55's own examples.
    for (const address of [
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
      "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
      "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"
    ]) {
      expect(checksumAddress(address.slice(2))).toBe(address);
    }
  });

  it("finds no signer, or another one, for a signature that is not the message's", () => {
    const signature = personalSign(hexToBytes(WEB3.key), "Some data");
    expect(personalSigner("Some other data", signature)).not.toBe(WEB3.address);
    expect(personalSigner("Some data", signature.subarray(0, 64))).toBeNull();
    const badV = Uint8Array.from(signature);
    badV[64] = 30;
    expect(personalSigner("Some data", badV)).toBeNull();
    // r = 0: no point.
    expect(personalSigner("Some data", new Uint8Array(65).fill(0, 0, 64).fill(27, 64))).toBeNull();
    // v as 0 / 1 (some wallets) reads as 27 / 28.
    const raw = Uint8Array.from(signature);
    raw[64] = raw[64]! - 27;
    expect(personalSigner("Some data", raw)).toBe(WEB3.address);
  });
});

describe("the account's test login (testLoginSigner)", () => {
  it("never changes its key: each device finds the same test profile (salt, info)", () => {
    // Computed apart, in Python (HKDF-SHA256 of the team's root, then keccak of the public key).
    const signer = testLoginSigner(deriveTeamKeys(walletSecret(testSeed())));
    expect(signer.address).toBe("0xFB4642A04004dF792b685Fa64FAd6ac7A1b837d5");
    const key = hexToBytes("a083a25bef958a0b2feaf694b4ac20303e95c84a8b604820c29a14e44f9a38b0");
    expect(evmAddress(secp256k1.getPublicKey(key, true))).toBe(signer.address);
  });

  it("signs the device id as Mt Pelerin's login takes it: base64 of the signature, the account's address", () => {
    const signer = testLoginSigner(deriveTeamKeys(walletSecret(testSeed())));
    const code = signer.signDevice("65b1f2e8c9f1a2b3c4d5e6f7");
    expect(code).toMatch(/^[A-Za-z0-9+/]{86}[A-Za-z0-9+/=]{2}$/);
    const signature = base64ToBytes(code)!;
    expect(signature).toHaveLength(65);
    expect(personalSigner("65b1f2e8c9f1a2b3c4d5e6f7", signature)).toBe(signer.address);
    // Deterministic (RFC 6979): the same id, the same code.
    expect(signer.signDevice("65b1f2e8c9f1a2b3c4d5e6f7")).toBe(code);
  });

  it("signs nothing once the account closed", () => {
    const team = deriveTeamKeys(walletSecret(testSeed()));
    const signer = testLoginSigner(team);
    wipeTeamKeys(team);
    expect(() => signer.signDevice("65b1f2e8c9f1a2b3c4d5e6f7")).toThrow();
    expect(() => testLoginSigner(team)).toThrow();
  });
});
