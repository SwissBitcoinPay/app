/**
 * Fake of @react-native-community/datetimepicker for Jest (a native module): iOS's picker is a
 * plain view, Android's dialog is remembered while "open". Tests choose a day with `pickDate`, as
 * the person would in whichever picker shows (the last rendered on iOS, the open dialog on
 * Android); the pickers' own bounds are checked as the system's would.
 */
import { useEffect } from "react";
import { View, type ViewProps } from "react-native";

type ChangeEvent = { nativeEvent: { timestamp: number; utcOffset: number } };
type PickerProps = {
  value: Date;
  mode?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onValueChange?: (event: ChangeEvent, date: Date) => void;
  onDismiss?: () => void;
};

let shown: PickerProps | null = null;
let dialog: PickerProps | null = null;

export function resetDatePicker(): void {
  shown = null;
  dialog = null;
}

/** iOS's picker, while one is rendered. */
export function shownPicker(): PickerProps | null {
  return shown;
}

/** Android's dialog, while one is open. */
export function openDialog(): PickerProps | null {
  return dialog;
}

/** Chooses `date` in the picker showing: Android's dialog if one is open, else iOS's. */
export function pickDate(date: Date): void {
  const picker = dialog ?? shown;
  if (!picker) throw new Error("No date picker is showing");
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (picker.minimumDate && day(date) < day(picker.minimumDate)) throw new Error("Before minimum");
  if (picker.maximumDate && day(date) > day(picker.maximumDate)) throw new Error("After maximum");
  dialog = null;
  picker.onValueChange?.({ nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } }, date);
}

export default function DateTimePicker({
  value,
  mode,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
  ...props
}: PickerProps & ViewProps) {
  const picker = { value, mode, minimumDate, maximumDate, onValueChange, onDismiss };
  shown = picker;
  // Unmounted (its sheet closed): no picker shows any more, `pickDate` must not reach it.
  useEffect(
    () => () => {
      if (shown === picker) shown = null;
    },
    [picker]
  );
  return <View {...props} />;
}

export const DateTimePickerAndroid = {
  open: (props: PickerProps) => {
    dialog = props;
  },
  dismiss: async () => {
    const was = dialog !== null;
    dialog?.onDismiss?.();
    dialog = null;
    return was;
  }
};
