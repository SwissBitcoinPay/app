import { getAccountSettings } from "@/features/account/session";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import { logFailure } from "@/lib/log/log";
import { loadMerchantSettings } from "@/lib/settings/store";
import { isMemberProfile } from "@/lib/terminal/model";

/*
 * Whether a scanned product may be looked up on Open Food Facts ("Look up scanned products"): the
 * open account's choice, else, on the owner's device in till mode (the account closed: "New item"
 * at the point of sale's scan), the one of its settings saved on the device
 * (src/lib/settings/store.ts), as the app's lock reads them (src/features/app-lock/preference.ts).
 * Not known (no settings, unreadable): never looked up, the owner's choice not being known to allow
 * it.
 */
export async function productLookupAllowed(): Promise<boolean> {
  const open = getAccountSettings();
  if (open) return open.productLookup;
  try {
    const profile = await getTerminalProfile();
    if (!profile || isMemberProfile(profile)) return false;
    return (await loadMerchantSettings(profile.walletId))?.productLookup ?? false;
  } catch (error) {
    logFailure("Reading whether products are looked up failed", error);
    return false;
  }
}
