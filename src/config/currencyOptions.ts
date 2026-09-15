import { currencies as currencyLabels } from "./currencies";
import type { CurrencyInfo } from "@types";

export type CurrencyOption = {
  label: string;
  value: string;
  decimals: number;
  enabled: boolean;
  offramp: boolean;
};

const labelsByCode = new Map<string, string>(
  currencyLabels.map(({ label, value }) => [value, label])
);

export const buildCurrencyOptions = (
  currencies: CurrencyInfo[]
): CurrencyOption[] =>
  currencies.map(({ code, decimals, enabled, offramp }) => ({
    label: labelsByCode.get(code) ?? code,
    value: code,
    decimals,
    enabled,
    offramp
  }));

export const filterEnabledCurrencies = (
  currencies: CurrencyOption[]
): CurrencyOption[] => currencies.filter(({ enabled }) => enabled);
