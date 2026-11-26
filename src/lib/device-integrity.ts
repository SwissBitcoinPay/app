import JailMonkey from "jail-monkey";
import { Platform } from "react-native";

import { logFailure } from "@/lib/log/log";

/*
 * Signs that this phone's system was modified, read by jail-monkey (an existing package rather than
 * the app's own code; on Android, RootBeer
 * and its own checks: `su`, Magisk, root apps, dangerous properties, writable system paths, test
 * keys; and hooking frameworks, Xposed, Substrate): where the phone keeps its cards' passes, a
 * modified system protects them less, and the holder is told (src/features/card/modified-phone.ts).
 * Best effort: a phone that hides its root shows nothing, and nothing here ever refuses anything.
 * Android only: the package is not linked on iOS (`expo.autolinking.ios.exclude`), where no card
 * pays with the app closed; nothing on the web (device-integrity.web.ts).
 */

/** What a phone may show. */
export type PhoneRiskSignal =
  /** Rooted, as jail-monkey reads it (`isJailBroken`). */
  | "root"
  /** A hooking framework, which can read and change what an app does (`hookDetected`). */
  | "hooks";

/** Read once: a phone's system does not change while the app runs. */
let reading: Promise<PhoneRiskSignal[]> | null = null;

/**
 * The signs this phone shows; none off Android. Never rejects: a failed read is logged, says none,
 * and is tried again at the next call. jail-monkey's checks run on the JavaScript thread (its
 * methods are synchronous: a few files, `getprop`, `mount`): read only where a warning may show.
 */
export function phoneRiskSignals(): Promise<PhoneRiskSignal[]> {
  if (Platform.OS !== "android") return Promise.resolve([]);
  reading ??= (async () => {
    const found: PhoneRiskSignal[] = [];
    if (JailMonkey.isJailBroken() === true) found.push("root");
    if (JailMonkey.hookDetected() === true) found.push("hooks");
    return found;
  })().catch((error: unknown) => {
    logFailure("Reading the phone's integrity failed", error);
    reading = null;
    return [];
  });
  return reading;
}

/** Forgets what was read (tests). */
export function forgetPhoneRiskSignals(): void {
  reading = null;
}
