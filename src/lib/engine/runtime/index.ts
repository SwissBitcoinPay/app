import { URL, URLSearchParams } from "whatwg-url-minimum";

import type { EngineRuntimeHost } from "../host";

import { EngineAbortController, EngineAbortSignal } from "./abort";
import { engineFetch } from "./fetch";
import { engineWebSocket } from "./socket";
import { engineConsole, enginePerformance, engineTimers } from "./timers";

/*
 * What the app's code expects of its runtime and JavaScriptCore lacks, given by the host: timers,
 * performance.now, console, AbortController, fetch and WebSocket (timers.ts, abort.ts, fetch.ts,
 * socket.ts). URL and URLSearchParams are the app's own: whatwg-url-minimum, which Expo installs in
 * the app (expo/src/winter/url.ts), so that a URL reads the same in both. Each is installed only
 * where missing, once, before the code that uses it runs; the console always, so that what it
 * writes goes to the extension's journal.
 */

let installed = false;

export function installEngineRuntime(host: EngineRuntimeHost): void {
  if (installed) return;
  installed = true;
  const scope = globalThis as Record<string, unknown>;
  const missing = (name: string) => scope[name] === undefined;
  const timers = engineTimers(host);
  if (missing("setTimeout")) scope.setTimeout = timers.setTimeout;
  if (missing("clearTimeout")) scope.clearTimeout = timers.clearTimeout;
  if (missing("performance")) scope.performance = enginePerformance(host);
  scope.console = engineConsole(host);
  if (missing("AbortController")) scope.AbortController = EngineAbortController;
  if (missing("AbortSignal")) scope.AbortSignal = EngineAbortSignal;
  if (missing("fetch")) scope.fetch = engineFetch(host);
  if (missing("WebSocket")) scope.WebSocket = engineWebSocket(host);
  if (missing("URL")) scope.URL = URL;
  if (missing("URLSearchParams")) scope.URLSearchParams = URLSearchParams;
}
