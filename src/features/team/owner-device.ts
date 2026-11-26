import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { MAX_OWNER_DEVICES } from "@/config/team";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import { logFailure } from "@/lib/log/log";
import { nowUnix } from "@/lib/rates/snapshot";
import {
  deriveMemberKeys,
  newMemberId,
  ownerDeviceSecret,
  ownerDevicesSecret,
  type MemberKeys
} from "@/lib/team/keys";
import { OWNER_DEVICE_VERSION, type OwnerDeviceRecord } from "@/lib/team/owner-device";
import { loadOwnerDeviceRecord, saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";

/*
 * The owner's own devices: each publishes its sales and payment links as an
 * employee does (member.ts, recordSale and recordLink), signed with keys derived from its id in the
 * account's settings, so that the owner sees from any of its devices whether a sale of the business
 * is not final yet (unsettled.ts), and finalizes the links a device left (owner-finals.ts). A device
 * is added once the account opens on it; in till mode, it signs with the secret it kept, and reads
 * the notice of a move of the account's relays with the secret the owner's devices share
 * (src/features/relays/moved-notice.ts).
 */

/** This device's record, read once, then from memory. */
let current: Promise<OwnerDeviceRecord | null> | null = null;

function getRecord(): Promise<OwnerDeviceRecord | null> {
  current ??= loadOwnerDeviceRecord();
  return current;
}

/** Tests only: forgets what was read. */
export function resetOwnerDeviceCache(): void {
  current = null;
}

/**
 * Adds this device to the open account's devices, once its settings are as the relays left them,
 * with a new id the first time (and after "Log out", which forgets it), and keeps its secret.
 * Never rejects: a device not added publishes nothing, and the next opening adds it.
 */
export async function registerOwnerDevice(): Promise<void> {
  try {
    await whenAccountSynced();
    const team = getAccountTeamKeys();
    const settings = getAccountSettings();
    const walletId = getAccountWalletId();
    if (!team || !settings || settings.signUp !== "done" || !walletId) return;
    const account = walletId.toLowerCase();
    const stored = await getRecord();
    let record = stored?.account === account ? stored : null;
    if (!record) {
      const id = newMemberId();
      record = {
        version: OWNER_DEVICE_VERSION,
        account,
        id,
        secret: bytesToHex(ownerDeviceSecret(team, id)),
        shared: bytesToHex(ownerDevicesSecret(team))
      };
      await saveOwnerDeviceRecord(record);
      current = Promise.resolve(record);
    }
    const { id } = record;
    if (settings.devices.some((device) => device.id === id)) return;
    // The list as it is when the write runs: a device added meanwhile on another one stays.
    await updateAccount((latest) =>
      latest.devices.some((device) => device.id === id)
        ? {}
        : { devices: [...latest.devices, { id, addedAt: nowUnix() }].slice(-MAX_OWNER_DEVICES) }
    );
  } catch (error) {
    logFailure("Adding this device to the account failed", error);
  }
}

/**
 * The secret the owner's devices share (ownerDevicesSecret), as this device keeps it for account
 * `walletId` (the point of sale's profile); null before the account first opened on it.
 */
export async function ownerDevicesShared(walletId: string): Promise<Uint8Array | null> {
  const record = await getRecord();
  if (!record || record.account !== walletId.toLowerCase()) return null;
  return hexToBytes(record.shared);
}

/**
 * The keys this device signs its sales and links with, as one of the owner's devices of account
 * `walletId` (the point of sale's profile); null before the account first opened on it.
 */
export async function ownerDeviceKeys(walletId: string): Promise<MemberKeys | null> {
  const record = await getRecord();
  if (!record || record.account !== walletId.toLowerCase()) return null;
  return deriveMemberKeys(hexToBytes(record.secret));
}
