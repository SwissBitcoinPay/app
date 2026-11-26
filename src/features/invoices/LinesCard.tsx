import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { lineNetMinor, type InvoiceLine } from "@/lib/invoice/amounts";
import { makeStyles, mono, radius, sans, stroke, tracked, type } from "@/theme";

import { quantityText } from "./form";
import { money, quantityTimesPrice, vatLabel } from "./format";
import { Totals } from "./LinesStep";

/** The table's figures' columns, each one's width, and the space between two columns. */
const QUANTITY_WIDTH = 76;
const UNIT_WIDTH = 110;
const VAT_WIDTH = 88;
const AMOUNT_WIDTH = 120;
const COLUMN_GAP = 16;

/** The names' column's narrowest width in the table: about twenty characters of a line's name. */
export const NAME_MIN_WIDTH = 160;

/** The lines' width from which the table keeps NAME_MIN_WIDTH for the names beside its figures. */
export const TABLE_MIN_WIDTH =
  NAME_MIN_WIDTH + QUANTITY_WIDTH + UNIT_WIDTH + VAT_WIDTH + AMOUNT_WIDTH + 4 * COLUMN_GAP;

/**
 * How the lines are laid out: as a table only on desktop and where the lines' measured `width`
 * leaves the names their column (TABLE_MIN_WIDTH); else stacked, a line's figures under its name.
 * The width is the card's own, not the window's: the side bar and an invoice's actions beside the
 * card leave it narrower than a desktop window (an iPad in portrait). Not measured yet (0), stacked:
 * readable at any width.
 */
export function linesLayout(desktop: boolean, width: number): "table" | "stacked" {
  return desktop && width >= TABLE_MIN_WIDTH ? "table" : "stacked";
}

/**
 * An invoice's lines in a white card, then its totals rate by rate ("Check the invoice", and the
 * invoice's details). Stacked (linesLayout: mobile, a narrow card): a line's name over its
 * quantity, price and VAT, its amount on the right, the totals below. Table: its columns under the
 * `columns` header when asked (the invoice's details), the totals on the right.
 */
export function LinesCard({
  lines,
  currency,
  languageTag,
  desktop,
  head,
  columns = false,
  bare = false,
  style,
  testID
}: {
  lines: readonly InvoiceLine[];
  currency: { code: string; digits: number };
  languageTag: string;
  desktop: boolean;
  /** Above the lines (the review's label and pen). */
  head?: ReactNode;
  /** Desktop: the columns' names above the lines. */
  columns?: boolean;
  /** Without the card's fill, border and padding: inside another card (the review's). */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { digits } = currency;
  // The lines' own width, desktop only (mobile is always stacked). A width of 0 is a screen under
  // another one (`display: none` on the web): the layout measured before stays.
  const [width, setWidth] = useState(0);
  const measure = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0) setWidth(measured);
  };
  const table = linesLayout(desktop, width) === "table";
  return (
    <View
      style={[!bare && styles.card, !bare && desktop && styles.cardDesktop, style]}
      testID={testID}
    >
      {head}
      <View onLayout={desktop ? measure : undefined} testID={testID && `${testID}-rows`}>
        {table && columns ? (
          <View style={[styles.tableRow, styles.columns]}>
            <Text style={[styles.column, styles.flex]}>{t("invoices.lines.name")}</Text>
            <Text style={[styles.column, styles.right, styles.qty]}>
              {t("invoices.lines.quantityShort")}
            </Text>
            <Text style={[styles.column, styles.right, styles.unit]}>
              {t("invoices.lines.unitPriceShort")}
            </Text>
            <Text style={[styles.column, styles.right, styles.vat]}>{t("invoices.lines.vat")}</Text>
            <Text style={[styles.column, styles.right, styles.amountWidth]}>
              {t("invoices.lines.amount")}
            </Text>
          </View>
        ) : null}
        {lines.map((line, index) =>
          table ? (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.lineName, styles.flex]} numberOfLines={1}>
                {line.name}
              </Text>
              <Text style={[styles.figure, styles.qty]}>
                {quantityText(line.quantity, languageTag)}
              </Text>
              <Text style={[styles.figure, styles.unit]}>
                {money(line.unitMinor, digits, languageTag)}
              </Text>
              <Text style={[styles.figure, styles.vat]}>{vatLabel(line.vatRate, languageTag)}</Text>
              <Text style={[styles.lineAmount, styles.amount]}>
                {money(lineNetMinor(line), digits, languageTag)}
              </Text>
            </View>
          ) : (
            <View key={index} style={styles.stackedLine}>
              <View style={styles.lineTexts}>
                <Text style={styles.lineName} numberOfLines={1}>
                  {line.name}
                </Text>
                <Text style={styles.lineMeta}>
                  {t("invoices.lines.summary", {
                    quantity: quantityTimesPrice(line, digits, languageTag),
                    rate: vatLabel(line.vatRate, languageTag)
                  })}
                </Text>
              </View>
              <Text style={styles.lineAmount}>
                {money(lineNetMinor(line), digits, languageTag)}
              </Text>
            </View>
          )
        )}
      </View>
      <View style={table ? styles.totalsTable : styles.totalsStacked}>
        <Totals
          lines={lines}
          currency={currency}
          languageTag={languageTag}
          desktop={desktop}
          card
          testID={testID && `${testID}-totals`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 16
  },
  cardDesktop: { paddingTop: 18, paddingHorizontal: 26, paddingBottom: 22 },
  stackedLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4
  },
  lineTexts: { flex: 1, minWidth: 0, gap: 2 },
  lineName: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  lineMeta: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  lineAmount: { ...mono(600), fontSize: type.label, color: colors.text.primary },
  tableRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: COLUMN_GAP,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border.subtle
  },
  columns: { height: 36 },
  column: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  right: { textAlign: "right" },
  figure: { ...mono(400), fontSize: type.label, color: colors.text.primary, textAlign: "right" },
  qty: { width: QUANTITY_WIDTH },
  unit: { width: UNIT_WIDTH },
  vat: { width: VAT_WIDTH, color: colors.text.secondary },
  amount: { width: AMOUNT_WIDTH, textAlign: "right", fontSize: 14.5 },
  amountWidth: { width: AMOUNT_WIDTH },
  totalsStacked: {
    marginTop: 10,
    paddingTop: 0,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border.subtle
  },
  totalsTable: { alignSelf: "flex-end", width: 320, paddingTop: 0 }
}));
