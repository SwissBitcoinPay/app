import * as SecureStore from "expo-secure-store";

import { LEGACY_WALLET_OWNER_KEY } from "./wallet-owner-format";

/** The stored record of wallet-owner-format.ts. Same API on the web: wallet-owner-store.web.ts. */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export function readLegacyWalletOwnerText(): Promise<string | null> {
  return SecureStore.getItemAsync(LEGACY_WALLET_OWNER_KEY, OPTIONS);
}

export function writeLegacyWalletOwnerText(text: string): Promise<void> {
  return SecureStore.setItemAsync(LEGACY_WALLET_OWNER_KEY, text, OPTIONS);
}

export function removeLegacyWalletOwnerText(): Promise<void> {
  return SecureStore.deleteItemAsync(LEGACY_WALLET_OWNER_KEY, OPTIONS);
}
