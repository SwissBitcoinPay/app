import { resetThemePreference } from "@/features/appearance/theme-preference";
import { RELEASE_NOTES_SEEN_KEY } from "@/features/release-notes/seen-format";
import { CARD_WALLETS_NAME } from "@/lib/breez/card-wallet-names";
import { clearLog } from "@/lib/log/log";
import { forgetMtpSession } from "@/lib/mtpelerin/session-store";

import { resetAmountUnit } from "./amount-unit";

/*
 * Same API as device-wipe.ts, in the browser: the app's origin keeps its data in `localStorage`
 * (every entry of the app) and the Breez SDK's in IndexedDB (`breez-sdk-spark/<network>/<id>` and
 * `…-tree`, src/lib/breez/wallet.web.ts; the card wallets' below `breez-sdk-spark-cards/`), which
 * the wallet's passkey restores at the next login.
 */

/** Prefixes of the Breez SDK's IndexedDB databases (wallet.web.ts). Never rename them. */
const BREEZ_DATABASES = ["breez-sdk-spark", CARD_WALLETS_NAME];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`${name}: not deleted`));
    // Another tab holds it open: deleted once it closes it.
    request.onblocked = () => resolve();
  });
}

/** Removes everything the app keeps in this browser. Rejects when something could not be removed. */
export async function wipeDevice(): Promise<void> {
  // The app's journal of this page (src/lib/log/), and its Mt Pelerin session
  // (src/lib/mtpelerin/session-store.web.ts): in memory only.
  clearLog();
  await forgetMtpSession();
  // The release notes opened stay, the one exception (device-wipe.ts): "What's new" opens by
  // itself once per device, never again after a "Log out".
  const seen = localStorage.getItem(RELEASE_NOTES_SEEN_KEY);
  localStorage.clear();
  if (seen !== null) localStorage.setItem(RELEASE_NOTES_SEEN_KEY, seen);
  // "Currency shown first" read again once its entry is gone: the default (amount-unit.ts).
  resetAmountUnit();
  // "Theme" too: the device's own theme again, at once (src/features/appearance/).
  resetThemePreference();
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .map(({ name }) => name)
      .filter(
        (name): name is string =>
          !!name && BREEZ_DATABASES.some((prefix) => name.startsWith(prefix))
      )
      .map(deleteDatabase)
  );
}
