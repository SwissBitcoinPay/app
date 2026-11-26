/**
 * What one of the owner's devices keeps to sign its sales and payment links, next to its point of
 * sale's profile: the account it belongs to, its id in the
 * account's settings (`MerchantSettings.devices`) and the secret derived from it
 * (`ownerDeviceSecret`), which the owner computes again from any of its devices, and the secret all
 * the owner's devices share (`ownerDevicesSecret`: the notice of a move of the account's relays).
 * It can neither spend nor read the settings. Saved by owner-device-store.ts (secure storage in the apps,
 * `localStorage` on the web), as an employee's membership.
 */
export type OwnerDeviceRecord = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** The wallet id of the account (lowercase hex), as the point of sale's profile names it. */
  account: string;
  /** 32 hex digits: the device's id in the account's settings. */
  id: string;
  /** 64 hex digits: the device's secret. */
  secret: string;
  /** 64 hex digits: the secret the owner's devices share. */
  shared: string;
};

export const OWNER_DEVICE_VERSION = 1;

/** Storage key, on the device only. Never rename it: installed apps keep their data there. */
export const OWNER_DEVICE_KEY = "terminal-owner-device";

/** Validates a stored record; anything else counts as none. */
export function parseOwnerDeviceRecord(value: unknown): OwnerDeviceRecord | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== OWNER_DEVICE_VERSION ||
    typeof record.account !== "string" ||
    !/^[0-9a-f]{2,130}$/.test(record.account) ||
    typeof record.id !== "string" ||
    !/^[0-9a-f]{32}$/.test(record.id) ||
    typeof record.secret !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.secret) ||
    typeof record.shared !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.shared)
  ) {
    return null;
  }
  return {
    version: OWNER_DEVICE_VERSION,
    account: record.account,
    id: record.id,
    secret: record.secret,
    shared: record.shared
  };
}
