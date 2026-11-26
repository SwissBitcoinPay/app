import * as LocalAuthentication from "expo-local-authentication";

import { logFailure } from "@/lib/log/log";
import { withSystemUi } from "@/lib/system-ui";

/*
 * The system's biometrics for the app's lock (AppLock.tsx: the phone's own, as a banking app): Face
 * ID, Touch ID or a fingerprint, the device's code after failed attempts or without them (the
 * system's own fallback). The web has none (biometrics.web.ts).
 */

/** Whether the device has a lock at all (biometrics or a code): without one, nothing can be asked. */
export async function deviceLocked(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE
    );
  } catch (error) {
    logFailure("Reading the device's lock failed", error);
    // Not proven unlocked: asked, the system says the rest.
    return true;
  }
}

/** What the holder's proof came to: given, refused (or dismissed), or impossible on this device. */
export type HolderProof = "given" | "refused" | "impossible";

/** Asks the system's biometrics (or the device's code), over the app. Never rejects. */
export async function proveHolder(texts: { prompt: string; cancel: string }): Promise<HolderProof> {
  try {
    const result = await withSystemUi(() =>
      LocalAuthentication.authenticateAsync({
        promptMessage: texts.prompt,
        cancelLabel: texts.cancel,
        disableDeviceFallback: false
      })
    );
    if (result.success) return "given";
    // Impossible only when the device has no lock left: anything else stays refused.
    if (
      ["not_enrolled", "passcode_not_set", "not_available"].includes(result.error) &&
      !(await deviceLocked())
    ) {
      return "impossible";
    }
    return "refused";
  } catch (error) {
    logFailure("Asking the device's biometrics failed", error);
    return "refused";
  }
}
