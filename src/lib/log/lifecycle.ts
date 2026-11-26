import { AppState, Platform } from "react-native";

import type { AppInfo } from "@/lib/app-info";

import { logUncaughtErrors } from "./crashes";
import { logEvent, logStart } from "./log";

/*
 * What the journal (log.ts) notes of the app itself: each start, with its build, and each coming
 * to the foreground or going to the background, so that support reads a failure in its context.
 * Started once, as the app's routes load (src/app/_layout.tsx).
 */

/** The build as "App started" notes it: "3.0.0 (3000000) f82ecab staging ios 18.1". */
export function appBuild(info: AppInfo): string {
  const update = info.updates?.updateId ? ` update ${info.updates.updateId.slice(0, 8)}` : "";
  const os = Platform.Version === undefined ? "" : ` ${String(Platform.Version)}`;
  const build = `${info.version} (${info.buildNumber ?? "-"}) ${info.commit ?? "-"}`;
  return `${build} ${info.variant}${update} ${Platform.OS}${os}`;
}

let started = false;

/** Notes the start, then the app's comings and goings; installs the uncaught errors' handler. */
export function startAppLog(info: AppInfo): void {
  if (started) return;
  started = true;
  logUncaughtErrors();
  logStart(appBuild(info));
  let last = AppState.currentState;
  AppState.addEventListener("change", (state) => {
    // iOS' "inactive" (a call, the app switcher) is a moment between the two: not noted.
    if (state === last || (state !== "active" && state !== "background")) return;
    last = state;
    logEvent(state === "active" ? "App in the foreground" : "App in the background");
  });
}
