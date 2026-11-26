/** Same API as biometrics.ts: the web app has no lock of its own. */

export type HolderProof = "given" | "refused" | "impossible";

export async function deviceLocked(): Promise<boolean> {
  return false;
}

export async function proveHolder(): Promise<HolderProof> {
  return "impossible";
}
