import { useSyncExternalStore } from "react";

import { getAccountSettings, subscribeAccountSettings } from "@/features/account/session";
import type { MerchantSettings } from "@/lib/settings/merchant";

/**
 * The open account's settings, followed: a change saved here, another device's taken from the
 * relays, the account closed (null).
 */
export function useAccountSettings(): MerchantSettings | null {
  return useSyncExternalStore(subscribeAccountSettings, getAccountSettings, getAccountSettings);
}
