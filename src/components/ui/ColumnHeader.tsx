import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewInstance,
  type ViewStyle
} from "react-native";

import type { SortDirection, SortKind } from "@/lib/table";
import {
  control as controlSize,
  makeStyles,
  mono,
  radius,
  sans,
  space,
  tracked,
  type,
  useTheme
} from "@/theme";

import { CheckBox, type CheckState } from "./CheckBox";
import { Icon, type IconName } from "./Icon";
import { ListRow } from "./ListRow";
import { Popover } from "./Popover";
import type { ColumnControl } from "./useTableView";
import { useHover } from "./useHover";

/** The menu's rows start where its texts do. */
const MENU_INSET = space[6];
/** Its button's room around the name, out of the column's own (the name stays in place). */
const BUTTON_PAD = space[4];

const DIRECTIONS: readonly SortDirection[] = ["ascending", "descending"];

/** The icon of each order, by what the column holds. */
const ORDER_ICONS: Record<SortKind, Record<SortDirection, IconName>> = {
  text: { ascending: "arrow-down-a-z", descending: "arrow-down-z-a" },
  number: { ascending: "arrow-down-1-9", descending: "arrow-down-9-1" },
  date: { ascending: "arrow-down-short-wide", descending: "arrow-down-wide-short" }
};

/**
 * A table's column header: its name, a button that
 * opens its menu, dropping from it, to sort the table by it and to choose the values it shows
 * (useTableView). Sorted, an arrow after its name (up: ascending); filtered, a funnel; either turns
 * its name umber. Else a small chevron says it opens something. A column neither sortable nor
 * filterable: its name alone. `align`: its name at the start or at the end of its cell
 * (amounts).
 */
export function ColumnHeader({
  control,
  align = "start",
  style,
  testID
}: {
  control: ColumnControl;
  align?: "start" | "end";
  /** Of its cell: its width, or its flex. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const anchor = useRef<ViewInstance>(null);
  const [open, setOpen] = useState(false);
  const { hovered, hoverProps } = useHover();
  const cell = [styles.cell, align === "end" && styles.cellEnd, style];
  if (control.sortKind === null && !control.filterable) {
    return (
      <View style={cell}>
        <Text numberOfLines={1} style={styles.name} testID={testID}>
          {control.label}
        </Text>
      </View>
    );
  }
  const active = control.sorted !== null || control.filtered;
  const order =
    control.sorted && control.sortKind
      ? t(`table.orders.${control.sortKind}.${control.sorted}`)
      : null;
  const label = [
    control.label,
    order ? t("table.sortedBy", { order }) : null,
    control.filtered ? t("table.filtered") : null
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <View style={cell}>
      <Pressable
        ref={anchor}
        {...hoverProps}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t("table.headerHint")}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          (hovered || pressed || open) && styles.buttonHovered
        ]}
        testID={testID}
      >
        <Text numberOfLines={1} style={[styles.name, active && styles.nameActive]}>
          {control.label}
        </Text>
        {control.sorted ? (
          <Icon
            name={control.sorted === "ascending" ? "arrow-up" : "arrow-down"}
            size={10}
            color={colors.text.accent}
          />
        ) : null}
        {control.filtered ? <Icon name="filter" size={10} color={colors.text.accent} /> : null}
        {active ? null : <Icon name="chevron-down" size={8} color={colors.text.secondary} />}
      </Pressable>
      <Popover
        visible={open}
        anchor={anchor}
        align={align}
        label={t("table.menu", { name: control.label })}
        onClose={() => setOpen(false)}
        testID={testID && `${testID}-menu`}
      >
        <ColumnMenu control={control} testID={testID && `${testID}-menu`} />
      </Popover>
    </View>
  );
}

/**
 * A column's menu: "Sort" (its two orders, named by what it holds: "A to Z"… ; the order
 * chosen checked, chosen again for the rows' own order), then, for a filterable column,
 * "Show": "Select all" and each value it shows, as the table draws it
 * (`renderValue`), checked while its rows show, with their count. The table follows each
 * change at once. The values scroll within the panel.
 */
function ColumnMenu({ control, testID }: { control: ColumnControl; testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const values = control.filterable ? control.values() : [];
  const shownCount = values.filter(({ shown }) => shown).length;
  const all: CheckState = shownCount === values.length ? true : shownCount === 0 ? false : "mixed";
  const { sortKind } = control;
  return (
    <>
      {sortKind ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t("table.sort")}>
          <MenuTitle>{t("table.sort")}</MenuTitle>
          {DIRECTIONS.map((direction) => {
            const chosen = control.sorted === direction;
            return (
              <ListRow
                key={direction}
                inset={MENU_INSET}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen }}
                onPress={() => control.sortBy(chosen ? null : direction)}
                style={styles.row}
                testID={testID && `${testID}-${direction}`}
              >
                <Icon
                  name={ORDER_ICONS[sortKind][direction]}
                  size={13}
                  color={chosen ? colors.text.accent : colors.text.secondary}
                  style={styles.rowIcon}
                />
                <Text numberOfLines={1} style={[styles.rowText, chosen && styles.rowTextChosen]}>
                  {t(`table.orders.${sortKind}.${direction}`)}
                </Text>
                {chosen ? <Icon name="check" size={12} color={colors.text.accent} /> : null}
              </ListRow>
            );
          })}
        </View>
      ) : null}
      {sortKind && control.filterable ? <View style={styles.separator} /> : null}
      {control.filterable ? (
        <>
          <MenuTitle>{t("table.show")}</MenuTitle>
          <ListRow
            inset={MENU_INSET}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: all }}
            onPress={() =>
              control.show(
                values.map(({ key }) => key),
                all !== true
              )
            }
            style={styles.row}
            testID={testID && `${testID}-all`}
          >
            <CheckBox checked={all} />
            <Text numberOfLines={1} style={[styles.rowText, styles.rowTextChosen]}>
              {t("table.selectAll")}
            </Text>
          </ListRow>
          <ScrollView style={styles.values} showsVerticalScrollIndicator>
            {values.map((value) => {
              return (
                <ListRow
                  key={value.key}
                  inset={MENU_INSET}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: value.shown }}
                  accessibilityLabel={t("table.value", {
                    label: value.spoken ?? value.label,
                    count: value.count
                  })}
                  onPress={() => control.show([value.key], !value.shown)}
                  style={styles.row}
                  testID={testID && `${testID}-value-${value.key}`}
                >
                  <CheckBox checked={value.shown} />
                  {/* Drawn only: the row's name says it to screen readers. */}
                  <View
                    style={styles.valueCell}
                    aria-hidden
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {value.view ?? <ColumnValueText>{value.label}</ColumnValueText>}
                  </View>
                  <Text style={styles.count}>{value.count}</Text>
                </ListRow>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </>
  );
}

/**
 * A value's words in a column's menu, as its label is drawn there: for a column's `renderValue`
 * that draws its words after its icon or avatar.
 */
export function ColumnValueText({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text numberOfLines={1} style={styles.valueText}>
      {children}
    </Text>
  );
}

function MenuTitle({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <Text accessibilityRole="header" style={styles.menuTitle}>
      {children}
    </Text>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  cell: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  cellEnd: { justifyContent: "flex-end" },
  // A 44 pt target around the name, which stays where the column's content starts (or ends).
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: controlSize.min,
    maxWidth: "100%",
    marginHorizontal: -BUTTON_PAD,
    paddingHorizontal: BUTTON_PAD,
    borderRadius: radius.sm
  },
  buttonHovered: { backgroundColor: colors.hoverOverlay },
  name: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  nameActive: { color: colors.text.accent },

  menuTitle: {
    ...sans(600),
    paddingHorizontal: MENU_INSET,
    paddingTop: space[3],
    paddingBottom: space[2],
    fontSize: type.caption,
    color: colors.text.secondary
  },
  separator: {
    height: 1,
    marginVertical: space[3],
    backgroundColor: colors.border.subtle
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[5], minHeight: controlSize.min },
  rowIcon: { width: 16 },
  rowText: {
    ...sans(500),
    flex: 1,
    minWidth: 0,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  rowTextChosen: { ...sans(600) },
  // A value as the table draws it (its icon, its avatar, its pill), then its words.
  valueCell: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[4] },
  valueText: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  count: { ...mono(500), flexShrink: 0, fontSize: 12, color: colors.text.secondary },
  // Takes what is left of the panel's height (Popover's maxHeight), then scrolls.
  values: { flexGrow: 0, flexShrink: 1 }
}));
