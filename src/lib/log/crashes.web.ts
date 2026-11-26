import { logUncaught } from "./log";

/*
 * Same API as crashes.ts, in the browser: the page's uncaught errors and the promises rejected with
 * nothing to catch them, in the journal (log.ts). The browser reports them as before.
 */

let installed = false;

/** Installs the journal's listeners of uncaught errors, once. */
export function logUncaughtErrors(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    logUncaught("An uncaught error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    logUncaught("A promise rejected with nothing to catch it", event.reason);
  });
}
