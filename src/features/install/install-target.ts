import type { BrowserDevice } from "@/lib/browser-device";

/*
 * "Install the app" (a banner on the welcome screen, a block in "Settings › Display"). One action,
 * which leads where this browser's device installs sattle.me:
 * - an iPhone or an iPad: the app on the App Store (the iPad too, though it reads no card),
 *   whatever its browser;
 * - an Android device: the app on Google Play, whatever its browser;
 * - a computer whose browser offers to install the web app (Chrome, Edge: their
 *   `beforeinstallprompt`): that browser's own prompt;
 * - Safari on a Mac: no prompt a page can open (WebKit has no `beforeinstallprompt`), the steps of
 *   "File › Add to Dock" instead;
 * - anything else (Firefox on a computer, which installs no web app for a page): nothing.
 * Nothing either in the web app already installed, nor in the apps.
 */

/** Where "Install the app" leads. */
export type InstallTarget = "appStore" | "googlePlay" | "prompt" | "dock";

/** What "Install the app" offers on this browser: where it leads, for which device. */
export type InstallOffer = { target: InstallTarget; device: BrowserDevice };

/** What decides it. */
export type InstallSituation = {
  /** This browser's device (browser-device.ts); null in the apps. */
  device: BrowserDevice | null;
  /** The web app runs installed, in a window of its own. */
  standalone: boolean;
  /** The browser offered its install prompt (`beforeinstallprompt`) and it was not used yet. */
  promptReady: boolean;
  /** Safari on a Mac that has "Add to Dock" (isSafariWithDock). */
  safariDock: boolean;
};

/** What "Install the app" offers in this situation; null: nothing to offer. */
export function installOfferOf(situation: InstallSituation): InstallOffer | null {
  const { device } = situation;
  if (device === null || situation.standalone) return null;
  if (device === "iphone" || device === "ipad") return { target: "appStore", device };
  if (device === "android") return { target: "googlePlay", device };
  if (situation.promptReady) return { target: "prompt", device };
  if (situation.safariDock) return { target: "dock", device };
  return null;
}

/** Browsers that say "Safari" in their user agent, but are not Safari. */
const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|OPR|Opera/;

/**
 * Whether a user agent is Safari on a Mac, version 17 or later: "File › Add to Dock" (WebKit,
 * "WebKit Features in Safari 17.0"; Apple's "Use Safari web apps on Mac": macOS Sonoma or later,
 * which the user agent does not tell, its macOS version being frozen). An iPad's Safari claims a
 * Mac too, with several touch points: it is an iPad.
 */
export function isSafariWithDock(userAgent: string, maxTouchPoints: number): boolean {
  if (!/Macintosh/.test(userAgent) || maxTouchPoints > 1 || NOT_SAFARI.test(userAgent)) {
    return false;
  }
  const version = /\bVersion\/(\d+)[.\d]* .*\bSafari\//.exec(userAgent);
  return version !== null && Number(version[1]) >= 17;
}

/**
 * The banner's "Close, don't offer again" on this device (localStorage on the web:
 * install-offer.web.ts), a flag: present, the banner shows no more. Never rename it: browsers keep
 * the choice there.
 */
export const INSTALL_BANNER_DISMISSED_KEY = "install-banner-dismissed";

/**
 * The variant's icon the web app serves at its root (scripts/web-manifest.js, ICON_FILE): the
 * banner's, a file the web app serves already, no other file to host.
 */
export const WEB_APP_ICON_PATH = "/apple-touch-icon.png";
