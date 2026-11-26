import type { InstallOffer, InstallTarget } from "./install-target";

/*
 * "Install the app" (install-target.ts) in the apps: they are installed, nothing to offer. The web:
 * install-offer.web.ts, same API.
 */

/** Nothing: the browser's install prompt is the web's. */
export function followInstallPrompt(): void {}

/** Nothing to offer: this is the app. */
export function useInstallOffer(): InstallOffer | null {
  return null;
}

/** Nothing to do. */
export function startInstall(_target: InstallTarget): void {}

/** The apps show no banner. */
export function readInstallBannerDismissed(): boolean {
  return true;
}

/** Nothing to save. */
export function dismissInstallBanner(): void {}
