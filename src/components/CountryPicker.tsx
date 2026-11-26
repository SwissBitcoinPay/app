import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Text } from "react-native";

import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet, useSheetInset } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import type { Language } from "@/i18n/languages";
import { groupCountries, searchCountries } from "@/lib/countries";
import { control, makeStyles, sans, space, type, useTheme } from "@/theme";

type CountryPickerProps = {
  /** The label of the field that opens it. */
  title: string;
  visible: boolean;
  value: string | null;
  /** Shown first in the list (the detected country). */
  suggested: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
  /** Once it is out of sight after closing (Sheet's `onHidden`). */
  onHidden?: () => void;
  /** Only the countries it keeps ("Sell"'s phone: those with a calling code). */
  include?: (code: string) => boolean;
  /** Beside a country's name, at the row's end ("+41"). */
  detail?: (code: string) => string | null;
};

/** Every country, searchable. Bottom sheet on mobile, centred dialog on desktop. */
export function CountryPicker({
  title,
  visible,
  value,
  suggested,
  onSelect,
  onClose,
  onHidden,
  include,
  detail
}: CountryPickerProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={title}
      closeLabel={t("countryPicker.close")}
      visible={visible}
      onClose={onClose}
      onHidden={onHidden}
    >
      <CountryList
        value={value}
        suggested={suggested}
        onSelect={onSelect}
        onClose={onClose}
        include={include}
        detail={detail}
      />
    </Sheet>
  );
}

// Every row is one control high, its bottom border included; the first group ends with a gap.
const ROW = control.md;
const GROUP_GAP = space[6];

/** Mounted while the sheet shows: the search starts empty at each opening. */
function CountryList({
  value,
  suggested,
  onSelect,
  onClose,
  include,
  detail
}: Pick<
  CountryPickerProps,
  "value" | "suggested" | "onSelect" | "onClose" | "include" | "detail"
>) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const inset = useSheetInset();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const [first, rest] = groupCountries(i18n.language as Language, suggested);
    if (!include) return [first, rest] as const;
    return [first.filter((c) => include(c.code)), rest.filter((c) => include(c.code))] as const;
  }, [i18n.language, suggested, include]);
  const { rows, groupEnd } = useMemo(() => {
    const first = searchCountries(groups[0], query);
    const rest = searchCountries(groups[1], query);
    // The gap only shows between two groups that both have rows (-1: no gap).
    const end = first.length > 0 && rest.length > 0 ? first.length - 1 : -1;
    return { rows: [...first, ...rest], groupEnd: end };
  }, [groups, query]);

  return (
    <>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t("countryPicker.search")}
        icon="magnifying-glass"
        autoCorrect={false}
        autoCapitalize="none"
        testID="country-search"
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.code}
        // Rows have a known height: the list has its full length at once, instead of growing as
        // it renders rows in batches (the scroll bar would shrink for seconds after opening).
        getItemLayout={(_, index) => ({
          length: ROW + (index === groupEnd ? GROUP_GAP : 0),
          offset: ROW * index + (groupEnd >= 0 && index > groupEnd ? GROUP_GAP : 0),
          index
        })}
        keyboardShouldPersistTaps="handled"
        // As wide as the panel: its rows are pressed up to its edges (ListRow).
        style={[styles.list, { marginHorizontal: -inset }]}
        ListEmptyComponent={
          <Text style={[styles.empty, { paddingHorizontal: inset }]}>
            {t("countryPicker.noResult")}
          </Text>
        }
        renderItem={({ item, index }) => {
          const selected = item.code === value;
          const rowDetail = detail?.(item.code) ?? null;
          return (
            <ListRow
              inset={inset}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onSelect(item.code);
                onClose();
              }}
              containerStyle={index === groupEnd && styles.groupEnd}
              style={styles.row}
            >
              <Flag code={item.code} />
              <Text numberOfLines={1} style={[styles.rowLabel, selected ? sans(700) : sans(500)]}>
                {item.name}
              </Text>
              {rowDetail ? <Text style={styles.rowDetail}>{rowDetail}</Text> : null}
              {selected ? <Icon name="check" size={14} color={colors.text.accent} /> : null}
            </ListRow>
          );
        }}
      />
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: { flexGrow: 0 },
  row: {
    height: ROW,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  groupEnd: { marginBottom: GROUP_GAP },
  rowLabel: { flex: 1, fontSize: type.body, color: colors.text.primary },
  rowDetail: { ...sans(600), fontSize: type.body, color: colors.text.secondary },
  empty: {
    ...sans(500),
    fontSize: type.prose,
    color: colors.text.secondary,
    paddingVertical: space[6]
  }
}));
