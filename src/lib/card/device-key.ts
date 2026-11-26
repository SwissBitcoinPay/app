import { p256 } from "@noble/curves/nist.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64Url } from "@/lib/base64";
import { secureRandomBytes } from "@/lib/random";

import { getCardItem, setCardItem } from "./card-keychain";

/*
 * The device's key for card payments: an ECDH P-256 key pair of this phone, its public key on the
 * card's relay channel (relay-client.ts). The relay encrypts each wake packet to it (wake-packet.ts):
 * the phone opens a packet as it arrives, before the app is unlocked, so that one passkey prompt
 * suffices for the payment. Not derived from the wallet: it stays on this phone, out of its backups,
 * and goes with "Log out" (wipeDevice). Kept with the card items the iOS extension reads too
 * (card-keychain.ts). Same API on the web, where cards are not paid from: device-key.web.ts.
 */

/** IRREVERSIBLE: the secure store's key of the device key. Never rename it. */
export const CARD_DEVICE_KEY = "card-device-key";

const FORMAT_VERSION = 1;

export type DeviceKey = {
  /** P-256 secret scalar (32 bytes). */
  secretKey: Uint8Array;
  /** Uncompressed SEC1 point (65 bytes), base64url: what the relay gets. */
  publicKey: string;
};

function keyOf(secretKey: Uint8Array): DeviceKey {
  return { secretKey, publicKey: bytesToBase64Url(p256.getPublicKey(secretKey, false)) };
}

function parseStored(text: string): Uint8Array | null {
  try {
    const value = JSON.parse(text) as { version?: unknown; secretKey?: unknown };
    if (value.version !== FORMAT_VERSION || typeof value.secretKey !== "string") return null;
    if (!/^[0-9a-f]{64}$/.test(value.secretKey)) return null;
    const secretKey = hexToBytes(value.secretKey);
    return p256.utils.isValidSecretKey(secretKey) ? secretKey : null;
  } catch {
    return null;
  }
}

let loading: Promise<DeviceKey> | null = null;

/**
 * This device's key, created at the first call. An unreadable stored key is replaced: the relay
 * channel gets the new public key at the next app start, which sends it, and packets encrypted
 * to the old one are lost, never paid.
 */
export function loadDeviceKey(): Promise<DeviceKey> {
  loading ??= (async () => {
    const stored = await getCardItem(CARD_DEVICE_KEY);
    const existing = stored === null ? null : parseStored(stored);
    if (existing) return keyOf(existing);
    // 48 bytes of secure randomness reduced into the scalar field (FIPS 186-5 A.2.1).
    const secretKey = p256.utils.randomSecretKey(secureRandomBytes(48));
    await setCardItem(
      CARD_DEVICE_KEY,
      JSON.stringify({ version: FORMAT_VERSION, secretKey: bytesToHex(secretKey) })
    );
    return keyOf(secretKey);
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * This device's key as stored, never created: null when there is none, or none readable. What the
 * iOS extension's engine opens wake packets with (the app is the one writer of the key).
 */
export async function readDeviceKey(): Promise<DeviceKey | null> {
  const stored = await getCardItem(CARD_DEVICE_KEY);
  const secretKey = stored === null ? null : parseStored(stored);
  return secretKey ? keyOf(secretKey) : null;
}

/** Forgets the key loaded in memory (wipeDevice removes the stored one). */
export function forgetDeviceKey(): void {
  loading = null;
}
