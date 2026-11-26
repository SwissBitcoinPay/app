import { OWNER_DEVICE_KEY, parseOwnerDeviceRecord, type OwnerDeviceRecord } from "./owner-device";

/**
 * Same API as owner-device-store.ts, in the browser's `localStorage` (the web has no secure
 * storage), like an employee's membership. In this browser only, gone with the site data.
 */

export async function loadOwnerDeviceRecord(): Promise<OwnerDeviceRecord | null> {
  try {
    const stored = localStorage.getItem(OWNER_DEVICE_KEY);
    return stored === null ? null : parseOwnerDeviceRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveOwnerDeviceRecord(record: OwnerDeviceRecord): Promise<void> {
  localStorage.setItem(OWNER_DEVICE_KEY, JSON.stringify(record));
}
