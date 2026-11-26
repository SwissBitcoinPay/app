import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64 } from "@/lib/base64";
import { deriveKey } from "@/lib/nostr/keys";
import { usableTeamKeys, type TeamKeys } from "@/lib/team/keys";

/*
 * The login of Mt Pelerin's dev/test environment (only the wallet-signature login works there):
 * an EVM key of the account's own, derived from the team's
 * root (src/lib/team/keys.ts), never a wallet that holds anything. The same on each of the owner's
 * devices, so that the account finds the same test profile from any of them. It signs the device id
 * as EIP-191 `personal_sign` does (as a UTF-8 text string), and the signature goes
 * as base64 (step 3). Never used with production: its profile is the SMS login's. Pure.
 */

/**
 * HKDF salt of the test login's key. **Never change** it nor the `info` below once released: the
 * account would find a new, empty test profile.
 */
const SALT = "sattle.me/mtpelerin-test-login";

/** An EVM account (an EOA, plain `ecrecover`): its address, and what signs as it. */
export type EvmSigner = {
  /** `0x` and 40 hex digits, EIP-55 checksummed. */
  address: string;
  /** The login's `code` for `deviceId`: its EIP-191 signature, base64. Never logged. */
  signDevice: (deviceId: string) => string;
};

/** EIP-55: the address's hex digits in capitals where its keccak hash's are 8 or more. */
export function checksumAddress(hex40: string): string {
  const lower = hex40.toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
  }
  return out;
}

/** The EVM address of the secp256k1 public key `publicKey` (compressed or not). */
export function evmAddress(publicKey: Uint8Array): string {
  const point = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return checksumAddress(bytesToHex(keccak_256(point.subarray(1)).subarray(12)));
}

/** EIP-191 version 0x45 (`personal_sign`): the digest of `message`'s UTF-8 bytes. */
export function personalMessageDigest(message: string): Uint8Array {
  const bytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${bytes.length}`);
  return keccak_256(concatBytes(prefix, bytes));
}

/** `personal_sign`'s 65 bytes, `r ‖ s ‖ v` with `v` = 27 + the recovery bit. */
export function personalSign(secretKey: Uint8Array, message: string): Uint8Array {
  const recovered = secp256k1.sign(personalMessageDigest(message), secretKey, {
    prehash: false,
    format: "recovered"
  });
  // noble's recovered format puts the recovery bit first.
  return concatBytes(recovered.subarray(1), Uint8Array.of(27 + recovered[0]!));
}

/** The address that signed `message` (`signature`: `r ‖ s ‖ v`), null when it is none. */
export function personalSigner(message: string, signature: Uint8Array): string | null {
  if (signature.length !== 65) return null;
  const v = signature[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return null;
  try {
    const publicKey = secp256k1.recoverPublicKey(
      concatBytes(Uint8Array.of(recovery), signature.subarray(0, 64)),
      personalMessageDigest(message),
      { prehash: false }
    );
    return evmAddress(publicKey);
  } catch {
    return null;
  }
}

/** The account's test login (see above), from its team keys; throws once they are wiped. */
export function testLoginSigner(team: TeamKeys): EvmSigner {
  // Derived at each use: never kept past the account (usableTeamKeys throws once it closed).
  const secret = () => deriveKey(usableTeamKeys(team).root, SALT, "evm-key/v1");
  const key = secret();
  const address = evmAddress(secp256k1.getPublicKey(key, true));
  key.fill(0);
  return {
    address,
    signDevice(deviceId) {
      const signing = secret();
      try {
        return bytesToBase64(personalSign(signing, deviceId));
      } finally {
        signing.fill(0);
      }
    }
  };
}
