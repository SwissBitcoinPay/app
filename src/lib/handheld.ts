/*
 * Whether this device is a phone or a tablet, held in the hand, its camera at hand for QR codes,
 * rather than a computer: the device itself, never the window's width.
 * Web: handheld.web.ts, same API.
 */

/** The apps run on phones and tablets only. */
export function isHandheld(): boolean {
  return true;
}
