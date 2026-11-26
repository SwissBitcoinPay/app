/**
 * Same API as preference-store.ts: the web app has no lock of its own (the apps only), nothing is
 * kept.
 */

export async function readAppLock(): Promise<boolean | null> {
  return false;
}

export async function writeAppLock(): Promise<void> {
  throw new Error("The web app has no lock of its own");
}
