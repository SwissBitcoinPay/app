import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View, type LayoutChangeEvent } from "react-native";

import { Select } from "@/components/ui/Select";
import { useTheme } from "@/theme";

import { dueDateLabel } from "./format";
import { calendarDate, dateOf } from "./invoices";

export type DueDateFieldProps = {
  /** "YYYY-MM-DD", null when none is chosen yet. */
  value: string | null;
  /** The first and last days that can be chosen, "YYYY-MM-DD". */
  first: string;
  last: string;
  onChange: (day: string) => void;
  languageTag: string;
  disabled: boolean;
  /**
   * The field's name, "Due date" unless said: "From" and "To" of "Export"
   * (src/features/wallet/export/ExportSheet.tsx) use the same field.
   */
  label?: string;
  /** Of the field; the picker's and its frame's add "-picker" and "-field" to it. */
  testID?: string;
};

type Size = { width: number; height: number };

/**
 * Below 0.01, iOS no longer sends touches to a view (UIView's hit-testing ignores it): just above,
 * Apple's button is invisible yet still pressed.
 */
const HIDDEN_OPACITY = 0.02;

/**
 * The due date field on a phone (the device's own date picker,
 * @react-native-community/datetimepicker). The field shows the date chosen, in the app's style.
 *
 * Android: pressed, it opens the system's date dialog (its own "OK" and "Cancel").
 *
 * iOS: Apple's compact date button lies over the field, invisible (HIDDEN_OPACITY), so that a press
 * on the field opens Apple's own calendar bubble; a day chosen there is the field's at once, and
 * the bubble closes as Apple's does (a tap beside it). The button's size is set natively (the
 * library ignores a style's width and height), so it is measured and scaled to cover the field
 * exactly. Screen readers reach Apple's button, named after the field; the field itself is out of
 * their reach (pressing it would do nothing).
 *
 * Both offer only the days from `first` to `last`; a day outside them (never sent by the pickers)
 * is ignored. The web has its own (DueDateField.web.tsx).
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
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();
  const [field, setField] = useState<Size | null>(null);
  const [button, setButton] = useState<Size | null>(null);
  const ios = Platform.OS === "ios";
  // A draft's due date may have passed (or lie beyond `last`): the pickers open within their bounds.
  const shown = dateOf(value === null || value < first ? first : value > last ? last : value);
  const minimumDate = dateOf(first);
  const maximumDate = dateOf(last);
  const label = named ?? t("invoices.due.label");
  const dateText = value ? dueDateLabel(value, languageTag, "long") : null;
  const pick = (date: Date) => {
    const day = calendarDate(date);
    if (day >= first && day <= last) onChange(day);
  };
  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value: shown,
      mode: "date",
      minimumDate,
      maximumDate,
      onValueChange: (_event, date) => pick(date)
    });
  const sizeOf = (event: LayoutChangeEvent): Size => ({
    width: event.nativeEvent.layout.width,
    height: event.nativeEvent.layout.height
  });

  const select = (
    <Select
      label={label}
      value={dateText}
      onPress={ios ? undefined : openAndroid}
      disabled={disabled}
      testID={testID}
    />
  );
  if (!ios) return select;

  // Apple's button, its centre on the field's, stretched over it once both are measured.
  const cover =
    field && button && button.width > 0 && button.height > 0
      ? {
          left: (field.width - button.width) / 2,
          top: (field.height - button.height) / 2,
          transform: [
            { scaleX: field.width / button.width },
            { scaleY: field.height / button.height }
          ]
        }
      : null;
  return (
    <View onLayout={(event) => setField(sizeOf(event))} testID={pairedID(testID, "field")}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {select}
      </View>
      <DateTimePicker
        value={shown}
        mode="date"
        display="compact"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        locale={languageTag}
        accentColor={colors.text.accent}
        themeVariant={scheme}
        disabled={disabled}
        accessibilityLabel={dateText ? `${label}, ${dateText}` : label}
        onValueChange={(_event, date) => pick(date)}
        onLayout={(event) => {
          // Its own size (a transform leaves the layout alone): it changes with the date's text.
          const size = sizeOf(event);
          if (size.width !== button?.width || size.height !== button?.height) setButton(size);
        }}
        style={[styles.button, cover]}
        testID={pairedID(testID, "picker")}
      />
    </View>
  );
}

/**
 * The test id of the field's frame or picker: the due date's own ("invoice-due-field",
 * "invoice-due-picker"), else the field's with the part's name after it.
 */
function pairedID(testID: string, part: "field" | "picker"): string {
  return testID === "invoice-due-date" ? `invoice-due-${part}` : `${testID}-${part}`;
}

const styles = StyleSheet.create({
  button: { position: "absolute", left: 0, top: 0, opacity: HIDDEN_OPACITY }
});
