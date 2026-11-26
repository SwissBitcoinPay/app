import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { RichText } from "@/components/ui/RichText";
import { makeStyles, proseLineHeight, sans, type } from "@/theme";

import { Calendar } from "./Calendar";
import { DueDateField } from "./DueDateField";
import { dueDateLabel } from "./format";
import { dueRange } from "./invoices";
import { StepTitle } from "./WizardFrame";

/**
 * Step 3, the due date: one value, from tomorrow to 9 months (MAX_DUE_MONTHS), the date in orange
 * in the title. It decides how long the payment link stays open. Desktop: the calendar in the page;
 * mobile: the field opens the device's date picker (DueDateField).
 */
export function DueStep({
  dueDate,
  onChange,
  languageTag,
  disabled
}: {
  dueDate: string | null;
  onChange: (day: string) => void;
  languageTag: string;
  disabled: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { first, last } = dueRange();
  const title = dueDate
    ? t("invoices.due.title", { date: dueDateLabel(dueDate, languageTag, "dayMonth") })
    : t("invoices.due.label");

  return (
    <View>
      <StepTitle>
        <RichText>{title}</RichText>
      </StepTitle>
      <Text style={[styles.lead, desktop && styles.leadDesktop]}>{t("invoices.due.lead")}</Text>
      {desktop ? (
        // Stacked on the title's left edge.
        <View style={[styles.field, styles.fieldDesktop]}>
          <Text style={styles.label}>{t("invoices.due.label")}</Text>
          <View style={styles.calendar} pointerEvents={disabled ? "none" : "auto"}>
            <Calendar
              value={dueDate}
              first={first}
              last={last}
              onChange={onChange}
              languageTag={languageTag}
              testID="invoice-calendar"
            />
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <DueDateField
            value={dueDate}
            first={first}
            last={last}
            onChange={onChange}
            languageTag={languageTag}
            disabled={disabled}
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  lead: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    marginTop: 8
  },
  leadDesktop: { fontSize: type.body, lineHeight: type.body * 1.5, marginTop: 10 },
  field: { marginTop: 22, gap: 6 },
  fieldDesktop: { marginTop: 28 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  calendar: { width: 372 }
}));
