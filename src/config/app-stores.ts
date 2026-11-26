/*
 * The production app's pages on the stores, which a phone's browser offers where only the app
 * can do what was asked (programming a card). The store id and the App Store id are the same as
 * the v2 app's, which this app replaces. The staging app is not on the
 * stores: these lead to production in both variants.
 */

/** The production app on Google Play (its application id, app.config.ts). */
export const ANDROID_APP_URL =
  "https://play.google.com/store/apps/details?id=ch.swissbitcoinpay.checkout";

/** The production app on the App Store (App Store ID 6444370155). */
export const IOS_APP_URL = "https://apps.apple.com/app/id6444370155";
