import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { logFailure } from "@/lib/log/log";
import { PASSKEY_RECORD_VERSION } from "@/lib/terminal/model";
import { loadPasskeyRecord, savePasskeyRecord } from "@/lib/terminal/profile";

/*
 * Which passkey opens this device's account (PasskeyRecord, src/lib/terminal/model.ts): saved each
 * time the account opens with a passkey the platform named (session.ts), read where the account is
 * closed and its passkey asked: unlocking (lock.ts) and a card payment while the app is locked
 * (src/features/card/payment.ts). Once the account is open, its own passkey's id is in memory with
 * it (getAccountCredentialId, wallet-access.ts).
 *
 * The pin only narrows the system's prompt: the seed the passkey gives is still checked against
 * the account (its backup key). Anything unsure (no record, another account's, unreadable) asks
 * as before, with every passkey of the app offered.
 */

/**
 * Saves `credentialId` as the passkey of the account of `walletId` on this device. A failure is
 * only logged: the account opens all the same, its passkey is asked without a pin next time.
 */
export async function rememberDevicePasskey(
  walletId: string,
  credentialId: ArrayBuffer
): Promise<void> {
  const bytes = new Uint8Array(credentialId);
  // A WebAuthn credential id has 1 to 1023 bytes (the record's validator): nothing else is saved.
  if (bytes.length === 0 || bytes.length > 1023) return;
  try {
    await savePasskeyRecord({
      version: PASSKEY_RECORD_VERSION,
      account: walletId.toLowerCase(),
      credentialId: bytesToHex(bytes)
    });
  } catch (error) {
    logFailure("Saving the account's passkey on the device failed", error);
  }
}

/**
 * The id of the passkey that opens the account of `walletId`, as this device saved it; undefined
 * when it saved none, or another account's (any passkey of the app is then offered).
 */
export async function devicePasskeyOf(walletId: string): Promise<ArrayBuffer | undefined> {
  const record = await loadPasskeyRecord();
  if (!record || record.account.toLowerCase() !== walletId.toLowerCase()) return undefined;
  return new Uint8Array(hexToBytes(record.credentialId)).buffer;
}
