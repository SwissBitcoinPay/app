import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { DueDateField } from "@/features/invoices/DueDateField";

import type * as DatePickerFake from "../../jest/datetimepicker";

/*
 * The due date field of "New invoice" on a phone: the device's own date picker, Android's dialog or
 * Apple's calendar bubble, offering only the days allowed.
 */

const datePicker = jest.requireMock<typeof DatePickerFake>(
  "@react-native-community/datetimepicker"
);

async function renderField(onChange: (day: string) => void, value: string | null = "2026-11-08") {
  await render(
    <DueDateField
      value={value}
      first="2026-10-10"
      last="2027-07-09"
      onChange={onChange}
      languageTag="en-CH"
      disabled={false}
    />
  );
}

describe("DueDateField", () => {
  it("shows the date chosen", async () => {
    await renderField(jest.fn());
    // On iOS (Jest's platform) the field is drawn for the eye; Apple's button is what is read.
    expect(screen.getByText("8 November 2026", { includeHiddenElements: true })).toBeTruthy();
  });

  it("opens Android's date dialog, within the days offered", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onChange = jest.fn();
    await renderField(onChange);
    await fireEvent.press(screen.getByTestId("invoice-due-date"));

    const dialog = datePicker.openDialog();
    expect(dialog).toMatchObject({
      mode: "date",
      value: new Date(2026, 10, 8),
      minimumDate: new Date(2026, 9, 10),
      maximumDate: new Date(2027, 6, 9)
    });
    // No button of Apple's on Android.
    expect(screen.queryByTestId("invoice-due-picker")).toBeNull();
    await act(async () => datePicker.pickDate(new Date(2027, 0, 15, 12)));
    expect(onChange).toHaveBeenCalledWith("2027-01-15");
  });

  it("lays Apple's compact button over the field on iOS, invisible, stretched to cover it", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const onChange = jest.fn();
    await renderField(onChange);
    const button = screen.getByTestId("invoice-due-picker");
    expect(button.props.display).toBe("compact");
    expect(datePicker.shownPicker()?.mode).toBe("date");
    expect(datePicker.openDialog()).toBeNull();
    // Out of screen readers' reach: Apple's button, named after the field, is read instead.
    expect(screen.queryByTestId("invoice-due-date")).toBeNull();
    expect(screen.getByTestId("invoice-due-date", { includeHiddenElements: true })).toBeTruthy();
    expect(button.props.accessibilityLabel).toBe("Due date, 8 November 2026");

    // Measured: its centre on the field's, scaled to the field's size; still invisible.
    await fireEvent(screen.getByTestId("invoice-due-field"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 82 } }
    });
    await fireEvent(button, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 34 } }
    });
    const style = StyleSheet.flatten(screen.getByTestId("invoice-due-picker").props.style);
    expect(style).toMatchObject({
      position: "absolute",
      left: 110,
      top: 24,
      transform: [{ scaleX: 340 / 120 }, { scaleY: 82 / 34 }]
    });
    expect(style.opacity).toBeGreaterThan(0.01);
    expect(style.opacity).toBeLessThan(0.05);

    // A day chosen in Apple's bubble is the field's at once; the button stays for the next one.
    await act(async () => datePicker.pickDate(new Date(2026, 11, 24, 9)));
    expect(onChange).toHaveBeenCalledWith("2026-12-24");
    expect(screen.getByTestId("invoice-due-picker")).toBeTruthy();
  });

  it("opens Apple's bubble within its bounds on a draft's past due date", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await renderField(jest.fn(), "2026-09-30");
    expect(datePicker.shownPicker()).toMatchObject({
      value: new Date(2026, 9, 10),
      minimumDate: new Date(2026, 9, 10),
      maximumDate: new Date(2027, 6, 9)
    });
  });

  it("opens the pickers within their bounds on a draft's past due date", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderField(jest.fn(), "2026-09-30");
    // The date of the draft still shows in the field until another is chosen.
    expect(screen.getByText("30 September 2026")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-due-date"));
    expect(datePicker.openDialog()?.value).toEqual(new Date(2026, 9, 10));
  });

  it("ignores a day outside the ones offered", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onChange = jest.fn();
    await renderField(onChange);
    await fireEvent.press(screen.getByTestId("invoice-due-date"));
    const dialog = datePicker.openDialog()!;
    const late = new Date(2027, 7, 1);
    await act(async () =>
      dialog.onValueChange?.({ nativeEvent: { timestamp: late.getTime(), utcOffset: 0 } }, late)
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
