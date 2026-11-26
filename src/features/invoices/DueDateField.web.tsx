import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";

import { Calendar } from "./Calendar";
import { dueDateLabel } from "./format";
import type { DueDateFieldProps } from "./DueDateField";

/**
 * The web's due date field on a phone (DueDateField.tsx for the apps): a browser has no date picker
 * React Native can show, so the field opens the app's calendar in a bottom sheet.
 */
export function DueDateField({
  value,
  first,
  last,
  onChange,
  languageTag,
  disabled,
  label: named,
  testID = "invoice-due-date"
}: DueDateFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = named ?? t("invoices.due.label");
  return (
    <>
      <Select
        label={label}
        value={value ? dueDateLabel(value, languageTag, "long") : null}
        onPress={() => setOpen(true)}
        disabled={disabled}
        testID={testID}
      />
      <Sheet
        title={label}
        closeLabel={t("invoices.due.close")}
        visible={open}
        onClose={() => setOpen(false)}
      >
        <Calendar
          value={value}
          first={first}
          last={last}
          onChange={(day) => {
            onChange(day);
            setOpen(false);
          }}
          languageTag={languageTag}
          testID={testID === "invoice-due-date" ? "invoice-calendar" : `${testID}-calendar`}
        />
      </Sheet>
    </>
  );
}
