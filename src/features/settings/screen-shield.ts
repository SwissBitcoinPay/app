import {
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  preventScreenCaptureAsync
} from "expo-screen-capture";
import { Platform } from "react-native";

import { logFailure } from "@/lib/log/log";

/**
 * The screen kept out of captures while the recovery phrase shows (expo-screen-capture).
 * Android: FLAG_SECURE, screenshots and recordings black, the
 * recent apps' preview blank. iOS 13+: screenshots and recordings hide the app, and its app
 * switcher snapshot is blurred at most. The web has no such thing: nothing is blocked there.
 */
const KEY = "recovery-phrase";

/** One change at a time, in call order: a phrase shown again is never left unblocked by the last. */
let last: Promise<unknown> = Promise.resolve();

function inTurn<T>(change: () => Promise<T>): Promise<T> {
  const run = last.then(change, change);
  last = run.catch(() => undefined);
  return run;
}

/**
 * Blocks screen capture; resolves whether it is blocked: never on the web, and not when the
 * system refused (iOS, without a key window), which the screen then says.
 */
export function shieldScreen(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(false);
  return inTurn(async () => {
    try {
      await preventScreenCaptureAsync(KEY);
    } catch (error) {
      logFailure("Screen capture could not be blocked", error);
      return false;
    }
    if (Platform.OS === "ios") {
      // A blur only: the words also leave the screen as soon as the app is not active.
      await enableAppSwitcherProtectionAsync(1).catch(() => undefined);
    }
    return true;
  });
}

/** Lets screen capture go again, once the phrase no longer shows. */
export function unshieldScreen(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  return inTurn(async () => {
    await Promise.allSettled([
      allowScreenCaptureAsync(KEY),
      Platform.OS === "ios" ? disableAppSwitcherProtectionAsync() : Promise.resolve()
    ]);
  });
}
