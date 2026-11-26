import type { ErrorUtils } from "react-native";

import { reportUncaught } from "@/lib/observe/observe";

import { logUncaught } from "./log";
import { safeErrorCopy } from "./safe-error";

/*
 * The errors nothing caught, in the journal (log.ts):
 * - those React Native's global handler gets (an error thrown outside rendering), before it takes
 *   them: the red box in development, the app's stop when fatal. In a release build, the handlers
 *   after the journal's get a safe copy only (safe-error.ts): Expo Observe's (src/lib/observe/),
 *   then React Native's, whose report of a crash leaves the device too;
 * - the promises rejected with nothing to catch them, in a release build (React Native tracks them
 *   in development only, polyfillPromise.js: its tracker is left there), told to Expo Observe too;
 * - an error while rendering never reaches the global handler (React Native 0.88 reports it
 *   itself, ErrorHandlers.js): LogRenderErrors (src/components/) notes it.
 * Each is appended at once (journal.ts), before the app stops. Web: crashes.web.ts.
 */

type RejectionTracker = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

let installed = false;

/** Installs the journal's handler of uncaught errors, once. */
export function logUncaughtErrors(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtils }).ErrorUtils;
  if (installed || !utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error: unknown, isFatal: boolean) => {
    logUncaught(isFatal ? "The app stopped on an uncaught error" : "An uncaught error", error);
    previous(__DEV__ ? error : safeErrorCopy(error), isFatal);
  });
  logUnhandledRejections();
}

let tracking = false;

/** In a release build of Hermes: notes each promise rejected with nothing to catch it, once. */
export function logUnhandledRejections(): void {
  if (tracking || __DEV__) return;
  const hermes = (globalThis as { HermesInternal?: RejectionTracker }).HermesInternal;
  if (!hermes?.enablePromiseRejectionTracker) return;
  tracking = true;
  hermes.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      logUncaught("A promise rejected with nothing to catch it", rejection);
      reportUncaught(rejection);
    },
    onHandled: () => undefined
  });
}
