import * as Clipboard from "expo-clipboard";

/*
 * The one way to copy a secret (an integration's or an assistant's key, an invitation link: its
 * fragment is a bearer secret, src/lib/team/invite.ts):
 * - Android: marked sensitive (ClipDescription.EXTRA_IS_SENSITIVE): from Android 13 the system's
 *   preview no longer shows it, and keyboards are told not to offer it (their clipboard history);
 * - iOS: removed from the pasteboard by the system after SECRET_CLIPBOARD_LIFETIME_MS (its
 *   expiration date, expo-clipboard 58.0.4). Universal Clipboard stays allowed (no `localOnly`): a
 *   merchant copies a key on the iPhone to paste it into a server or Claude Desktop on the Mac;
 * - the web: the browser's clipboard has no such option, the text is copied as it is.
 * Android has no expiry of its own: clearing it from the app would only work while the app runs,
 * and could wipe what the user copied since (left out).
 * Whatever else the app copies (payment links, addresses, diagnostics) is not secret and stays on
 * `Clipboard.setStringAsync`.
 */

/** How long iOS keeps a copied secret: time to switch to the app it is pasted in. */
export const SECRET_CLIPBOARD_LIFETIME_MS = 2 * 60 * 1000;

/**
 * Copies `secret`, protected as the platform allows. Same answer as `setStringAsync`: true once
 * copied (the web may answer false), rejects when refused.
 */
export function copySecret(secret: string): Promise<boolean> {
  return Clipboard.setStringAsync(secret, {
    android: { isSensitive: true },
    ios: { expiresAt: new Date(Date.now() + SECRET_CLIPBOARD_LIFETIME_MS) }
  });
}
