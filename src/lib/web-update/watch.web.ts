import { logFailure } from "@/lib/log/log";

import { appScriptName, appScriptsOf, isOtherVersion } from "./app-scripts";

/*
 * A new deployment of the web app while a page of it is open: the page runs
 * the version it loaded, and may ask for screens' code the host no longer has (ScreenLoadFailure.tsx).
 * While something follows it (WebUpdateNotice.tsx), this reads the page the host serves now, every
 * CHECK_EVERY_MS while the tab shows and the browser is online, and compares its scripts with those
 * the running page loaded (app-scripts.ts): another version once one of them is new. Then no more
 * reads, a reload is all that is left. Nothing to compare in development (Metro serves scripts of
 * its own): no read at all.
 */

/** Between two reads of the page: each one is a request against the hosting's quota. */
export const CHECK_EVERY_MS = 30 * 60_000;
/** How often whether a read is due is looked at: no request unless one is. */
const TICK_MS = 60_000;
/** The read's longest wait, its body included. */
const TIMEOUT_MS = 15_000;

/** The page read is not the app's: an HTTP error, a page from elsewhere, one without its scripts. */
export class WebUpdateCheckError extends Error {
  readonly code: number | "otherOrigin" | "noAppScripts";

  constructor(code: WebUpdateCheckError["code"], message: string) {
    super(message);
    this.name = "WebUpdateCheckError";
    this.code = code;
  }
}

let ready = false;
const listeners = new Set<() => void>();
/** The app's scripts of the running page, read once. */
let running: ReadonlySet<string> | undefined;
/** When the page was last read (or first followed), on the monotonic clock. */
let lastRead: number | undefined;
let reading = false;
let ticker: ReturnType<typeof setInterval> | undefined;

function runningScripts(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const script of Array.from(document.scripts)) {
    const name = appScriptName(script.src);
    if (name) names.add(name);
  }
  return names;
}

async function read(scripts: ReadonlySet<string>): Promise<void> {
  reading = true;
  lastRead = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/", location.href).href, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new WebUpdateCheckError(response.status, `The page answered HTTP ${response.status}`);
    }
    // Sent elsewhere (a captive portal): that page says nothing of the app.
    if (new URL(response.url).origin !== location.origin) {
      throw new WebUpdateCheckError("otherOrigin", "The page came from another origin");
    }
    const deployed = appScriptsOf(await response.text());
    if (deployed.length === 0) {
      throw new WebUpdateCheckError("noAppScripts", "The page loads no script of the app");
    }
    if (isOtherVersion(deployed, scripts)) {
      ready = true;
      stop();
      for (const listener of [...listeners]) listener();
    }
  } catch (error) {
    logFailure("Checking for a new version of the web app failed", error);
  } finally {
    clearTimeout(timer);
    reading = false;
  }
}

function wake(): void {
  if (ready || reading || !running?.size || lastRead === undefined) return;
  // Offline, the read waits for the next tick online: it would only fail.
  if (document.visibilityState !== "visible" || navigator.onLine === false) return;
  if (performance.now() - lastRead < CHECK_EVERY_MS) return;
  void read(running);
}

function start(): void {
  running ??= runningScripts();
  if (ready || running.size === 0) return;
  // The page that just loaded is the version deployed: the first read is due a period later.
  lastRead ??= performance.now();
  ticker = setInterval(wake, TICK_MS);
  // A tab shown again, after a night in the background: a read at once, if one is due.
  document.addEventListener("visibilitychange", wake);
}

function stop(): void {
  clearInterval(ticker);
  ticker = undefined;
  document.removeEventListener("visibilitychange", wake);
}

/** Calls `listener` once a new version of the web app is deployed; returns its release. */
export function followWebUpdate(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Whether a new version of the web app is deployed since this page loaded. */
export function webUpdateReady(): boolean {
  return ready;
}

/** For the tests: as a page that just loaded. */
export function resetWebUpdate(): void {
  stop();
  ready = false;
  running = undefined;
  lastRead = undefined;
  reading = false;
  listeners.clear();
}
