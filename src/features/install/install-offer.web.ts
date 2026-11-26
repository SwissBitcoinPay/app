import { useSyncExternalStore } from "react";

import { openExternal } from "@/components/ui/external-link";
import { ANDROID_APP_URL, IOS_APP_URL } from "@/config/app-stores";
import { browserDevice } from "@/lib/browser-device";
import { logFailure } from "@/lib/log/log";

import {
  INSTALL_BANNER_DISMISSED_KEY,
  installOfferOf,
  isSafariWithDock,
  type InstallOffer,
  type InstallTarget
} from "./install-target";

/*
 * Same API as install-offer.ts, on the web: what "Install the app" offers this browser
 * (install-target.ts), and what it does.
 */

/**
 * Chrome's and Edge's `beforeinstallprompt` (not in TypeScript's DOM types): its `prompt()` opens
 * the browser's install prompt, once, within a user gesture.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };

/** The browser's install prompt not used yet: none until the browser offers it. */
let pending: InstallPromptEvent | null = null;
/** The web app was just installed from this page (`appinstalled`): nothing more to offer. */
let installed = false;
let following = false;
/** Counts the changes of the two above: what React compares (useInstallOffer). */
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Calls `listener` at each change of what "Install the app" offers; returns the unsubscribe. */
export function subscribeInstallOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return typeof (event as Partial<InstallPromptEvent>).prompt === "function";
}

/**
 * Listens for the browser's install prompt, from the bundle's start (the root layout): the browser
 * offers it once per page, soon after it loads, whichever screen shows then. Its own prompt
 * (Chrome's "mini-infobar" on Android) is held back: the app offers it where it chooses, and a
 * phone gets its store's app instead. Once only.
 */
export function followInstallPrompt(): void {
  if (following || typeof window === "undefined") return;
  following = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    pending = event;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    installed = true;
    changed();
  });
}

/** Whether the web app runs installed: its window, or iOS's Home Screen web app. */
function runsStandalone(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    // A browser without the media feature: not installed, as far as it says.
  }
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function safariDock(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string") return false;
  const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  return isSafariWithDock(navigator.userAgent, touchPoints);
}

/** What "Install the app" offers this browser now. */
export function currentInstallOffer(): InstallOffer | null {
  if (installed || typeof window === "undefined") return null;
  return installOfferOf({
    device: browserDevice(),
    standalone: runsStandalone(),
    promptReady: pending !== null,
    safariDock: safariDock()
  });
}

/** currentInstallOffer, the same object until a change: what React keeps (useSyncExternalStore). */
let snapshot: { version: number; offer: InstallOffer | null } | null = null;

function offerSnapshot(): InstallOffer | null {
  if (snapshot?.version !== version) snapshot = { version, offer: currentInstallOffer() };
  return snapshot.offer;
}

const noOffer = () => null;

/** currentInstallOffer, followed as the browser's prompt comes and goes. */
export function useInstallOffer(): InstallOffer | null {
  return useSyncExternalStore(subscribeInstallOffer, offerSnapshot, noOffer);
}

/**
 * Installs where `target` leads, within the press's handler (a new tab, or the browser's prompt,
 * only open right after a user gesture). The stores' pages in a new tab: the phone hands them to
 * its store's app. The browser's prompt is used once: whatever the person answers, the browser
 * offers another only on a later page, if it does. "Add to Dock" shows its steps instead
 * (InstallDockSheet), which is not done here.
 */
export function startInstall(target: InstallTarget): void {
  if (target === "appStore") return openExternal(IOS_APP_URL);
  if (target === "googlePlay") return openExternal(ANDROID_APP_URL);
  if (target !== "prompt" || pending === null) return;
  const event = pending;
  pending = null;
  changed();
  event.prompt().catch((error: unknown) => logFailure("Opening the install prompt failed", error));
}

/** Whether this device's person closed the banner for good. False when unreadable. */
export function readInstallBannerDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) !== null;
  } catch (error) {
    logFailure("Reading the install banner's choice failed", error);
    return false;
  }
}

/** "Close, don't offer again": no more banner on this device (until its data is erased). */
export function dismissInstallBanner(): void {
  try {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, "1");
  } catch (error) {
    logFailure("Saving the install banner's choice failed", error);
  }
}
