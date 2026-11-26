import * as SecureStore from "expo-secure-store";

import { logFailure } from "@/lib/log/log";

import {
  AMOUNT_UNIT_KEY,
  parseAmountUnit,
  serializeAmountUnit,
  type AmountUnit
} from "./amount-unit-format";

/**
 * This device's "Currency shown first" (amount-unit.ts). Same API on the web:
 * amount-unit-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** The stored choice, null when none (or unreadable: the default then). Never rejects. */
export async function readAmountUnit(): Promise<AmountUnit | null> {
  try {
    return parseAmountUnit(await SecureStore.getItemAsync(AMOUNT_UNIT_KEY, OPTIONS));
  } catch (error) {
    logFailure("Reading the amounts' unit failed", error);
    return null;
  }
}

export async function writeAmountUnit(unit: AmountUnit): Promise<void> {
  await SecureStore.setItemAsync(AMOUNT_UNIT_KEY, serializeAmountUnit(unit), OPTIONS);
}
