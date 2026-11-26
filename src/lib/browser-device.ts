/*
 * Which device the web app's browser runs on, to say what only the app can do there: an Android
 * phone or an iPhone gets its store's page (src/config/app-stores.ts), an iPad the words of a
 * device that reads no card. Never the window's width: a phone's browser in landscape, a computer's
 * narrow window. Web: browser-device.web.ts, same API.
 */

/** A browser on an Android device, an iPhone (or iPod touch), an iPad, or anything else. */
export type BrowserDevice = "android" | "iphone" | "ipad" | "other";

/** The apps are no browser. */
export function browserDevice(): BrowserDevice | null {
  return null;
}
