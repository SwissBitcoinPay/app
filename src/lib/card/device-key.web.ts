/*
 * Same API as device-key.ts. Cards are paired and paid from the app on a phone only, which receives
 * their wake packets: the web app has no device key.
 */

export const CARD_DEVICE_KEY = "card-device-key";

export type DeviceKey = { secretKey: Uint8Array; publicKey: string };

export function loadDeviceKey(): Promise<DeviceKey> {
  return Promise.reject(new Error("Card payments are received by the app on a phone"));
}

export async function readDeviceKey(): Promise<DeviceKey | null> {
  return null;
}

export function forgetDeviceKey(): void {}
