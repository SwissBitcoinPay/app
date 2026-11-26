import { logFailure } from "@/lib/log/log";

import {
  AMOUNT_UNIT_KEY,
  parseAmountUnit,
  serializeAmountUnit,
  type AmountUnit
} from "./amount-unit-format";

/** Same API as amount-unit-store.ts, in this browser's `localStorage`. */

export async function readAmountUnit(): Promise<AmountUnit | null> {
  try {
    return parseAmountUnit(localStorage.getItem(AMOUNT_UNIT_KEY));
  } catch (error) {
    logFailure("Reading the amounts' unit failed", error);
    return null;
  }
}

export async function writeAmountUnit(unit: AmountUnit): Promise<void> {
  localStorage.setItem(AMOUNT_UNIT_KEY, serializeAmountUnit(unit));
}
