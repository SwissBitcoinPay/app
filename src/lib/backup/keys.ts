import { bytesToHex } from "@noble/hashes/utils.js";

import { deriveKey, nostrKeys } from "@/lib/nostr/keys";

/**
 * HKDF salt of every backup key: the domain of this app's backups, apart from any other use of the
 * wallet secret. Never change it nor the `info` strings below: the keys of every existing backup
 * derive from them, a change would lose them all.
 */
const SALT = "sattle.me/merchant-settings-backup";

/**
 * The keys of a wallet's settings backup (src/lib/backup/), derived from the wallet secret
 * (walletSecret in src/lib/breez/seed.ts): the passkey gives them back on any device. In memory
 * only, like the seed. Independent of the wallet's own keys (its Spark identity key included):
 * a relay cannot link a backup to a wallet.
 */
export type BackupKeys = {
  /** BIP-340 secret key of the Nostr identity that signs the backup events. */
  secretKey: Uint8Array;
  /** Its x-only public key, hex: the author of the backup events. */
  publicKey: string;
  /** Key (32 bytes) of the backup contents: NIP-44 (record.ts). */
  encryptionKey: Uint8Array;
  /** `d` tag of the backup event (NIP-78): opaque, it does not name the app. */
  address: string;
};

export function deriveBackupKeys(walletSecret: Uint8Array): BackupKeys {
  const derive = (info: string) => deriveKey(walletSecret, SALT, info);
  return {
    // Throws for the 0 or ≥ n keys BIP-340 refuses: an HKDF output has odds below 2^-127.
    ...nostrKeys(derive("nostr-secret-key/v1")),
    encryptionKey: derive("encryption-key/v1"),
    address: bytesToHex(derive("event-address/v1"))
  };
}

/** Keys overwritten by wipeBackupKeys: never used again. */
const wiped = new WeakSet<BackupKeys>();

/**
 * Overwrites the secret keys with zeros, once their account closes (session.ts). Best effort: the
 * JavaScript engine may hold other copies (noble's computations work on bigints, which cannot be
 * cleared) and memory freed by the garbage collector is not cleared; but the arrays the account
 * held no longer contain them.
 */
export function wipeBackupKeys(keys: BackupKeys): void {
  keys.secretKey.fill(0);
  keys.encryptionKey.fill(0);
  wiped.add(keys);
}

/** `keys`, unless wiped: throws then, so that zeros never sign nor encrypt anything. */
export function usableKeys(keys: BackupKeys): BackupKeys {
  if (wiped.has(keys)) throw new Error("The backup keys were wiped");
  return keys;
}
