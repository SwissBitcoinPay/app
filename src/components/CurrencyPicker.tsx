import { useTranslation } from "react-i18next";
import { ScrollView, Text } from "react-native";

import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet, useSheetInset } from "@/components/ui/Sheet";
import { PAYOUT_CURRENCIES, type PayoutCurrency } from "@/config/payout-currencies";
import { CURRENCY_FLAG } from "@/lib/currencies";
import { control, makeStyles, sans, space, type, useTheme } from "@/theme";

type CurrencyPickerProps = {
  visible: boolean;
  /** The currency chosen: one of the list, or another (none of the rows is then checked). */
  value: string;
  /** "Payout currency" by default; "Reference currency" in the settings. */
  title?: string;
  /** The currencies offered, in their order: every payout currency by default. */
  currencies?: readonly PayoutCurrency[];
  onSelect: (currency: PayoutCurrency) => void;
  onClose: () => void;
  /** Once it is out of sight after closing (Sheet's `onHidden`). */
  onHidden?: () => void;
};

const ROW = control.md;

/**
 * The payout currency ("Payout currency"): every payout currency, by its flag (the EU's for
 * the euro), code and name, without its colour of the split bar. Bottom sheet on mobile, centred dialog on desktop.
 */
export function CurrencyPicker({
  visible,
  value,
  title,
  currencies = PAYOUT_CURRENCIES,
  onSelect,
  onClose,
  onHidden
}: CurrencyPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const inset = useSheetInset();
  return (
    <Sheet
      title={title ?? t("currencyPicker.title")}
      closeLabel={t("currencyPicker.close")}
      visible={visible}
      onClose={onClose}
      onHidden={onHidden}
      testID="currency-picker"
    >
      {/* As wide as the panel: its rows are pressed up to its edges (ListRow). */}
      <ScrollView style={[styles.list, { marginHorizontal: -inset }]}>
        {currencies.map((code) => {
          const selected = code === value;
          return (
            <ListRow
              key={code}
              inset={inset}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${code}, ${t(`currencyNames.${code}`)}`}
              onPress={() => {
                onSelect(code);
                onClose();
              }}
              testID={`currency-${code}`}
              style={styles.row}
            >
              <Flag code={CURRENCY_FLAG[code]} />
              <Text style={[styles.code, selected ? sans(700) : sans(600)]}>{code}</Text>
              <Text numberOfLines={1} style={styles.name}>
                {t(`currencyNames.${code}`)}
              </Text>
              {selected ? <Icon name="check" size={14} color={colors.text.accent} /> : null}
            </ListRow>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { flexGrow: 0 },
  row: {
    height: ROW,
    flexDirection: "row",
    alignItems: "center",
    gap: space[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  code: { width: 40, fontSize: type.body, color: colors.text.primary },
  name: { ...sans(500), flex: 1, fontSize: type.body, color: colors.text.secondary }
}));
