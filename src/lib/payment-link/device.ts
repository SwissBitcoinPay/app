import { Linking, Platform, Share } from "react-native";

import { shareWithSystem } from "@/lib/system-ui";

/*
 * What payment links need from the platform (web: device.web.ts, same API): the share sheet, the
 * clipboard, and opening the payer's wallet.
 */

/** "copied": the platform has no share sheet, the link went to the clipboard instead. */
export type ShareOutcome = "shared" | "copied" | "dismissed";

/**
 * Opens the system share sheet with `url`. On the web it must be called within the tap's handler
 * (browsers only open their share sheet right after a user gesture): call it before any `await`.
 */
export async function shareUrl(url: string): Promise<ShareOutcome> {
  // iOS shares `url` as a link (AirDrop, previews); Android only takes a message.
  const result = await shareWithSystem(Platform.OS === "ios" ? { url } : { message: url });
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}

/** Whether a share sheet opens here for `url`: the apps always have the system's. */
export function canShareUrl(_url: string): boolean {
  return true;
}

/** Whether `copyText` can work here. No clipboard module in the apps (no native dependency). */
export function canCopyText(): boolean {
  return false;
}

export async function copyText(_text: string): Promise<void> {
  throw new Error("No clipboard in the apps");
}

/** Opens `uri` with the app that handles it: a `lightning:` URI in the wallet, a page, a mail. */
export async function openUri(uri: string): Promise<void> {
  await Linking.openURL(uri);
}

/**
 * Sends the payer to a checkout link's redirect URL (src/lib/payment-link/checkout.ts): the shop's
 * page in the browser, or its app. The apps open it with the system: there is no tab to leave.
 */
export async function openRedirect(url: string): Promise<void> {
  await openUri(url);
}

/**
 * Whether this page already sent the payer to the redirect URL of the link `id` names, and the
 * memory of it: in the apps, for the session (web: device.web.ts, for the browser's tab).
 */
const redirected = new Set<string>();

export function wasRedirected(id: string): boolean {
  return redirected.has(id);
}

export function rememberRedirect(id: string): void {
  redirected.add(id);
}
