import { OBSERVE_BY_DEFAULT } from "@/config/observe";
import { logFailure } from "@/lib/log/log";
import { safeErrorCopy } from "@/lib/log/safe-error";

import { readObserveChoice, writeObserveChoice } from "./choice-store";

/*
 * Expo Observe (expo-observe): the app's startup times, its native crashes
 * and the JavaScript errors nothing caught, sent from release builds to the project's dashboard on
 * expo.dev. The only module that reaches expo-observe. Same
 * API on the web, where it does nothing (observe.web.ts).
 *
 * Sent only while this device's holder lets it ("Send crash reports" in
 * "Settings"), else its variant's default (src/config/observe.ts).
 * Otherwise Observe's dispatch is off (`dispatchingEnabled`, which the library keeps across
 * launches and checks as it sends, only once the app leaves the foreground: read in its code),
 * and so is its handler of uncaught errors.
 *
 * Nothing that could hold a value of the app's (the journal's rule, src/lib/log/entry.ts): the
 * errors reach it as safe copies only (safe-error.ts), the uncaught ones through the journal's
 * handler (crashes.ts), which wraps Observe's; and none of what would send more: no navigation
 * integration (Expo Router's params carry a payment link's or an invitation's fragment, `#`), no
 * time to interactive (`markInteractive` adds the host of the launch's slowest request), no network
 * traces, no error boundary of Observe's (it records the error as it is, and keeps the app from
 * stopping), no events nor global attributes.
 */

type ObserveModule = typeof import("expo-observe");

let observe: ObserveModule["Observe"] | null = null;
/** The app's variant, which records are tagged with (startObserve). */
let environment: string | null = null;
/** Whether reports leave this device now. */
let sending = false;
/** This device's choice, or its variant's default while it has none; null until read. */
let choice: boolean | null = null;
const listeners = new Set<() => void>();

/** At most this many errors reported in a run, each told once: a failure that repeats is one. */
export const MAX_REPORTS_PER_RUN = 50;
const reported = new Set<string>();

function byDefault(variant: string): boolean {
  return OBSERVE_BY_DEFAULT[variant] === true;
}

/** Observe's whole configuration (each call replaces it): everything is said, every time. */
function configuration(variant: string, send: boolean) {
  return {
    environment: variant,
    dispatchingEnabled: send,
    errorHandlingEnabled: send,
    networkTraces: false
  };
}

/** Sends from now on, or no more, as `send` says; then tells the screens that follow the choice. */
function apply(send: boolean): void {
  choice = send;
  for (const listener of listeners) listener();
  if (!observe || environment === null || sending === send) return;
  try {
    observe.configure(configuration(environment, send));
    sending = send;
  } catch (error) {
    logFailure("Configuring Expo Observe failed", error);
  }
}

/**
 * Starts Observe, its records tagged with `variant` (the app's), once. Before the journal's handler
 * of uncaught errors (startAppLog, crashes.ts): Observe installs its own as it is loaded, which the
 * journal's then wraps, handing it a safe copy only. Nothing is sent until this device's choice is
 * read (the library sends by default). A build whose native module is missing (Jest's, a binary
 * older than it) goes on without it.
 */
export function startObserve(variant: string): void {
  if (observe) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    const { Observe } = require("expo-observe") as ObserveModule;
    Observe.configure(configuration(variant, false));
    observe = Observe;
    environment = variant;
  } catch (error) {
    logFailure("Starting Expo Observe failed", error);
    return;
  }
  void readObserveChoice().then((saved) => {
    // A choice saved meanwhile stands over the one read before it.
    if (choice === null) apply(saved ?? byDefault(variant));
  });
}

/**
 * Whether Expo Observe started (startObserve, as the app starts, before any screen): without it, its
 * choice is never read, and "Settings" cannot change it.
 */
export function observeStarted(): boolean {
  return observe !== null;
}

/** This device's choice, or its variant's default; null until read, or without Observe. */
export function observeChoice(): boolean | null {
  return choice;
}

/** Calls `listener` at each change of the choice ("Settings"); returns how to stop. */
export function followObserveChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saves this device's choice, then applies it. Rejects when it was not saved: nothing changes. */
export async function saveObserveChoice(send: boolean): Promise<void> {
  if (!observe) throw new Error("Expo Observe is not started");
  await writeObserveChoice(send);
  apply(send);
}

/** "Log out" (device-wipe.ts): the choice is wiped, the variant's default applies again. */
export function resetObserveChoice(): void {
  if (environment !== null) apply(byDefault(environment));
}

/**
 * The app's first screen is drawn (src/app/_layout.tsx, once its fonts are loaded): the end of its
 * time to first render. Observe's own root would mark it when the layout first renders nothing.
 * Kept on the device, as all Observe measures, while nothing is sent.
 */
export function markObservedFirstRender(): void {
  if (!observe) return;
  try {
    observe.markFirstRender();
  } catch (error) {
    logFailure("Marking the first render for Expo Observe failed", error);
  }
}

/**
 * Reports an error nothing caught that Observe's own handler does not hear (an error while
 * rendering, a promise rejected with nothing to catch it), as a safe copy, once a run, while
 * reports are sent.
 */
export function reportUncaught(error: unknown): void {
  if (!observe || !sending || reported.size >= MAX_REPORTS_PER_RUN) return;
  const copy = safeErrorCopy(error);
  // The same error, from the same place: its kind, what it says and its innermost frame.
  const key = (copy.stack ?? "").split("\n", 2).join("\n");
  if (reported.has(key)) return;
  reported.add(key);
  try {
    observe.reportError(copy);
  } catch (failure) {
    logFailure("Reporting an error to Expo Observe failed", failure);
  }
}
