/*
 * Same API as browser-device.ts. Told by the browser's user agent: only words and a store's link
 * depend on it, never what the web app does or allows, so a browser that claims another device
 * ("Request desktop website") gets the other device's words. iPadOS's Safari claims a Mac
 * ("Macintosh") by default: a Mac has no touch screen, an iPad several touch points.
 */

export type BrowserDevice = "android" | "iphone" | "ipad" | "other";

/** The device of a user agent and its touch points (navigator.maxTouchPoints). */
export function browserDeviceOf(userAgent: string, maxTouchPoints: number): BrowserDevice {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPod/.test(userAgent)) return "iphone";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ipad";
  return "other";
}

/** This browser's device: "other" without a navigator. */
export function browserDevice(): BrowserDevice | null {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string") return "other";
  const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  return browserDeviceOf(navigator.userAgent, touchPoints);
}
