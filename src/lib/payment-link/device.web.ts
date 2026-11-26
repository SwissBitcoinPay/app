import type { ShareOutcome } from "./device";

export type { ShareOutcome } from "./device";

/**
 * Opens the browser's share sheet with `url` (Web Share API), else copies it to the clipboard.
 * Browsers only open the share sheet within a user gesture: call it in the tap's handler, before
 * any `await`.
 */
export async function shareUrl(url: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (error) {
      // A DOMException: not an Error in every browser.
      if ((error as { name?: unknown } | null)?.name === "AbortError") return "dismissed";
      // Refused (no user gesture, a permissions policy, nothing to share to): the clipboard.
    }
  }
  await copyText(url);
  return "copied";
}

/**
 * Whether the browser has a share sheet for `url` (Web Share API: Safari, the mobile browsers,
 * Chrome and Edge on desktop; Firefox on desktop only behind a preference, MDN's compatibility
 * data 8.1.7). Without one, `shareUrl` only copies the link: a "Share" beside "Copy the link"
 * would do the same twice.
 */
export function canShareUrl(url: string): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  // `canShare` came after `share` in some browsers: without it, `share` is all there is to know.
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare({ url });
  } catch {
    return false;
  }
}

export function canCopyText(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
}

/** Rejects when the browser refuses (no clipboard, not a secure context, no permission). */
export async function copyText(text: string): Promise<void> {
  if (!canCopyText()) throw new Error("No clipboard in this browser");
  await navigator.clipboard.writeText(text);
}

/**
 * Opens `uri` in this tab: a `lightning:` URI in the wallet that handles it (a new tab,
 * window.open, would stay blank behind the wallet), a page, a mail, an app's link.
 */
export async function openUri(uri: string): Promise<void> {
  window.location.assign(uri);
}

/**
 * Sends the payer to a checkout link's redirect URL (src/lib/payment-link/checkout.ts), in this
 * tab: the shop's page, or its app. A browser may refuse to open an app without a tap (Chrome on
 * Android after a timer, Safari on iOS): nothing happens then, and the button stays.
 */
export async function openRedirect(url: string): Promise<void> {
  await openUri(url);
}

/**
 * Where the tab remembers the checkout links it already sent the payer back from, by 16 hex digits
 * of their author: a payer who comes back (the browser's back button) sees the receipt without
 * being sent away again. The tab's own storage (sessionStorage), gone with it. Never rename it.
 */
const REDIRECTED_PREFIX = "checkout-redirected.";

/** Without sessionStorage (blocked, private mode): for as long as the page is loaded. */
const redirected = new Set<string>();

function redirectedKey(id: string): string {
  return `${REDIRECTED_PREFIX}${id.slice(0, 16)}`;
}

/** Whether this tab already sent the payer to the redirect URL of the link `id` names. */
export function wasRedirected(id: string): boolean {
  if (redirected.has(id)) return true;
  try {
    return window.sessionStorage.getItem(redirectedKey(id)) !== null;
  } catch {
    return false;
  }
}

export function rememberRedirect(id: string): void {
  redirected.add(id);
  try {
    window.sessionStorage.setItem(redirectedKey(id), "1");
  } catch {
    // Kept for as long as the page is loaded.
  }
}
