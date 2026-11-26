import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Callout } from "@/components/ui/Callout";
import { Select } from "@/components/ui/Select";
import type { SellCurrency } from "@/config/mtpelerin";
import { isSellCurrency, transferRoute } from "@/lib/mtpelerin/sale";

import { useSellNav } from "./SellSheet";

/*
 * "Payout currency": the currency a bank account is wired
 * in, among SELL_CURRENCIES, picked in a panel over "Sell"'s (pickCurrency), on the bank step
 * under "Use this account"'s account and in "Add an account". A currency Mt Pelerin wires
 * by SWIFT (transferRoute) says what it costs right under it, and only then: its delay and the
 * intermediary banks' fees.
 */
export function PayoutCurrencyField({
  value,
  onChange,
  disabled,
  testID
}: {
  value: SellCurrency;
  onChange: (currency: SellCurrency) => void;
  disabled: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  const { pickCurrency } = useSellNav();
  const label = t("sell.payoutCurrency.label");
  return (
    <View style={styles.field}>
      <Select
        label={label}
        value={`${value} — ${t(`currencyNames.${value}`)}`}
        onPress={() =>
          pickCurrency({
            title: label,
            value,
            onSelect: (code) => {
              if (isSellCurrency(code)) onChange(code);
            }
          })
        }
        disabled={disabled}
        testID={testID}
      />
      {transferRoute(value) === "swift" ? (
        <Callout tone="warning" testID={`${testID}-swift`}>
          {t("sell.payoutCurrency.swift")}
        </Callout>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 10 }
});
