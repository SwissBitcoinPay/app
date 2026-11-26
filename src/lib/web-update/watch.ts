/*
 * The apps update themselves (EAS Update on staging, the stores): only the web app watches for a
 * new deployment of itself (watch.web.ts). Here, never one.
 */

/** Calls `listener` once a new version of the web app is deployed; returns its release. */
export function followWebUpdate(_listener: () => void): () => void {
  return () => undefined;
}

/** Whether a new version of the web app is deployed: never on the apps. */
export function webUpdateReady(): boolean {
  return false;
}

/** For the tests: as a page that just loaded. */
export function resetWebUpdate(): void {}
