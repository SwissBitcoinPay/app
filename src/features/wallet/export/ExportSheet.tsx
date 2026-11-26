import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { DocumentLanguageButton } from "@/components/DocumentLanguage";
import { Callout } from "@/components/ui/Callout";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet, useSheetInset } from "@/components/ui/Sheet";
import type { ExportSources } from "@/features/activity/useActivity";
import { DueDateField } from "@/features/invoices/DueDateField";
import { dueDateLabel } from "@/features/invoices/format";
import { calendarDate } from "@/features/invoices/invoices";
import { usePos } from "@/features/terminal/pos";
import { documentLocale, toLanguage, type Language } from "@/i18n/languages";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { makeStyles, sans, space, tracked, type, useTheme } from "@/theme";

import { ColumnChip } from "./ColumnChip";
import { DEFAULT_COLUMNS, EXPORT_COLUMNS, type ExportColumn } from "./csv";
import { ExactDaysToggle, PeriodTile } from "./PeriodChoice";
import {
  EXPORT_FIRST_DAY,
  PRESET_PERIODS,
  isYearPeriod,
  periodDays,
  periodGlyph,
  type DayRange,
  type ExportPeriod
} from "./period";
import type { ReportUnit } from "./report-html";
import { ExportError, type ExportFailure } from "./rows";
import { runExport, type ExportFormat } from "./run";

/*
 * "Export" of "Wallet" (as v2's manual export of the dashboard's activity; no recurring export,
 * which needs a server): the period (v2's presets, or two days), the file ("Simple (PDF)", its
 * amounts in the currency or in BTC; "Detailed (CSV)", its columns), then "Export", which reads the
 * period's transactions done and opens the share sheet with the file (the browser downloads the
 * CSV, prints the PDF). A sheet of the design system, as "Send":
 * what it exports under the title, the presets as calendar pages and the period's days once, under
 * them, the columns as pills. Closing it while the file is made drops the file; a failure says why,
 * in place (Callout), and "Export" tries again.
 */

type ExportSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What "Wallet"'s list was built from (useOwnerActivity); null until it shows. */
  sources: ExportSources | null;
};

export function ExportSheet({ visible, onClose, sources }: ExportSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("walletExport.title")}
      subtitle={t("walletExport.lead")}
      closeLabel={t("walletExport.close")}
      visible={visible}
      onClose={onClose}
      testID="wallet-export"
    >
      <ExportForm sources={sources} onDone={onClose} />
    </Sheet>
  );
}

/** Why the last "Export" failed: the export's own reasons, else "failed". */
type Failure = ExportFailure | "failed";

/** The first day of `today`'s month and `today`: "Specific dates"'s days when it opens. */
function thisMonth(today: Date): DayRange {
  return {
    first: calendarDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    last: calendarDate(today)
  };
}

/** Mounted while the sheet shows (Sheet): its choices start afresh at each opening. */
function ExportForm({ sources, onDone }: { sources: ExportSources | null; onDone: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const { profile, digits, languageTag } = usePos();
  const inset = useSheetInset();
  const today = new Date();
  const [period, setPeriod] = useState<ExportPeriod>("thisMonth");
  const [custom, setCustom] = useState<DayRange>(() => thisMonth(today));
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [unit, setUnit] = useState<ReportUnit>("fiat");
  const [columns, setColumns] = useState<readonly ExportColumn[]>(DEFAULT_COLUMNS);
  // The file's language: the app's until the merchant picks another.
  const [language, setLanguage] = useState<Language>(() => toLanguage(i18n.language));
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Closed (unmounted) while the file was made: it is not offered any more.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const days = periodDays(period, today, custom);
  const ready = days !== null && sources !== null && (format === "pdf" || columns.length > 0);
  const dayText = (day: string) => dueDateLabel(day, languageTag, "numeric");
  const spanText = (span: DayRange) =>
    t("walletExport.days", { first: dayText(span.first), last: dayText(span.last) });

  const toggle = (column: ExportColumn) =>
    setColumns((ticked) =>
      ticked.includes(column) ? ticked.filter((c) => c !== column) : [...ticked, column]
    );

  const submit = () => {
    if (!ready || days === null || sources === null || running) return;
    setRunning(true);
    setFailure(null);
    runExport(
      { days, format, unit, columns },
      {
        sources,
        businessName: profile.businessName,
        currency: profile.currency,
        digits,
        language,
        languageTag: documentLocale(language, languageTag),
        t: i18n.getFixedT(language),
        shareTitle: t("walletExport.title")
      },
      () => shown.current
    ).then(
      () => {
        if (!shown.current) return;
        setRunning(false);
        onDone();
      },
      (error: unknown) => {
        logFailure("Exporting the transactions failed", error);
        if (!shown.current) return;
        setRunning(false);
        setFailure(error instanceof ExportError ? error.failure : "failed");
      }
    );
  };

  return (
    <>
      <ScrollView
        // As wide as the panel, its scroll bar at the panel's edge; the fields keep its inset.
        style={[styles.scroll, { marginHorizontal: -inset }]}
        contentContainerStyle={[styles.content, { paddingHorizontal: inset }]}
        keyboardShouldPersistTaps="handled"
        testID="wallet-export-form"
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("walletExport.period")}
          style={styles.field}
        >
          <Text style={styles.fieldLabel}>{t("walletExport.period")}</Text>
          <View style={styles.tiles}>
            {PRESET_PERIODS.map((value) => {
              const span = periodDays(value, today, custom);
              const label = t(`walletExport.periods.${value}`);
              return (
                <PeriodTile
                  key={value}
                  label={label}
                  glyph={periodGlyph(value, span, languageTag)}
                  year={isYearPeriod(value)}
                  chosen={value === period}
                  disabled={running}
                  accessibilityLabel={`${label}, ${spanText(span)}`}
                  onPress={() => setPeriod(value)}
                  testID={`wallet-export-period-${value}`}
                />
              );
            })}
          </View>
          <View style={styles.daysLine}>
            <View style={styles.days}>
              {days ? (
                <>
                  <Icon name="calendar-day" size={13} color={colors.text.secondary} />
                  <Text style={styles.daysText} testID="wallet-export-days">
                    {spanText(days)}
                  </Text>
                </>
              ) : null}
            </View>
            <ExactDaysToggle
              label={t("walletExport.periods.custom")}
              chosen={period === "custom"}
              disabled={running}
              onPress={() => setPeriod("custom")}
              testID="wallet-export-period-custom"
            />
          </View>
          {period === "custom" ? (
            <View style={styles.dates}>
              <View style={styles.date}>
                <DueDateField
                  label={t("walletExport.from")}
                  value={custom.first}
                  first={EXPORT_FIRST_DAY}
                  last={custom.last}
                  onChange={(first) => setCustom((range) => ({ ...range, first }))}
                  languageTag={languageTag}
                  disabled={running}
                  testID="wallet-export-from"
                />
              </View>
              <View style={styles.date}>
                <DueDateField
                  label={t("walletExport.to")}
                  value={custom.last}
                  first={custom.first}
                  last={calendarDate(today)}
                  onChange={(last) => setCustom((range) => ({ ...range, last }))}
                  languageTag={languageTag}
                  disabled={running}
                  testID="wallet-export-to"
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t("walletExport.format")}</Text>
          <SegmentedControl
            label={t("walletExport.format")}
            options={(["pdf", "csv"] as const).map((value) => ({
              value,
              label: t(`walletExport.formats.${value}`)
            }))}
            value={format}
            onChange={setFormat}
            stretch
            disabled={running}
            testID="wallet-export-format"
          />
        </View>

        {format === "pdf" ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t("walletExport.amounts")}</Text>
            <SegmentedControl
              label={t("walletExport.amounts")}
              options={(["fiat", "btc"] as const).map((value) => ({
                value,
                label: t(`walletExport.units.${value}`, { currency: profile.currency })
              }))}
              value={unit}
              onChange={setUnit}
              stretch
              disabled={running}
              testID="wallet-export-unit"
            />
          </View>
        ) : (
          <View style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.fieldLabel}>{t("walletExport.columnsTitle")}</Text>
              <Text style={styles.fieldCount} testID="wallet-export-columns-ticked">
                {t("walletExport.columnsTicked", {
                  ticked: formatInteger(columns.length, languageTag),
                  total: formatInteger(EXPORT_COLUMNS.length, languageTag)
                })}
              </Text>
            </View>
            <View style={styles.chips}>
              {EXPORT_COLUMNS.map((column) => (
                <ColumnChip
                  key={column}
                  label={t(`walletExport.columns.${column}`, { currency: profile.currency })}
                  ticked={columns.includes(column)}
                  disabled={running}
                  onPress={() => toggle(column)}
                  testID={`wallet-export-column-${column}`}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {failure ? (
        <Callout tone="error" testID="wallet-export-failed">
          {t(`walletExport.errors.${failure}`)}
        </Callout>
      ) : null}
      {/* The file's language at the end of "Export" (a split button). */}
      <DocumentLanguageButton
        icon="download"
        loading={running}
        disabled={!ready}
        onPress={submit}
        testID="wallet-export-submit"
        document="export"
        language={language}
        onLanguageChange={setLanguage}
        languageTestID="wallet-export-language"
      >
        {t("walletExport.submit")}
      </DocumentLanguageButton>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: space[7], paddingBottom: space[2] },
  field: { gap: 9 },
  fieldHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fieldLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary,
    marginBottom: 2
  },
  fieldCount: {
    ...sans(500),
    fontSize: type.fieldLabel,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  tiles: { flexDirection: "row", gap: space[4] },
  daysLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[4]
  },
  days: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[4] },
  daysText: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  dates: { flexDirection: "row", gap: space[5] },
  date: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[4] }
}));
