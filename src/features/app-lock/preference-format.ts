/**
 * Storage key of "Ask for biometrics to unlock the app", on the device only (preference.ts). Never
 * rename it: installed apps keep their choice there.
 */
export const APP_LOCK_KEY = "app-lock";

/** Format of the stored record. A change of format needs a new version. */
const APP_LOCK_VERSION = 1;

export function serializeAppLock(biometrics: boolean): string {
  return JSON.stringify({ version: APP_LOCK_VERSION, biometrics });
}

/**
 * A stored record: whether the biometrics are asked as the app opens; null when absent, damaged
 * or of another format (a newer app's: its default then, never written over unasked).
 */
export function parseAppLock(stored: string | null): boolean | null {
  if (stored === null) return null;
  try {
    const value = JSON.parse(stored) as { version?: unknown; biometrics?: unknown } | null;
    return value?.version === APP_LOCK_VERSION && typeof value.biometrics === "boolean"
      ? value.biometrics
      : null;
  } catch {
    return null;
  }
}
