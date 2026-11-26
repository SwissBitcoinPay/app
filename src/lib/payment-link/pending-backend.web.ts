/**
 * Same API as pending-backend.ts, in the browser's `localStorage`: the web has no secure storage.
 * In this browser only, gone with the site data, like the point of sale's profile.
 */

export async function getItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  localStorage.removeItem(key);
}
