import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createRef, useState } from "react";

import { CodeField } from "@/features/sell/CodeField";

import { fieldCalls } from "../../jest/text-input";

/*
 * "Sell"'s SMS code in six boxes (src/features/sell/CodeField.tsx): one unseen field under them
 * whose caret stays after the digits, wherever a tap put it. The web's selection
 * (`setSelectionRange`, react-native-web's <input>) was checked in Chromium.
 */

function Code({ focusRef }: { focusRef?: React.Ref<{ focus: () => void }> }) {
  const [value, setValue] = useState("");
  return (
    <CodeField
      ref={focusRef}
      label="6-digit code"
      value={value}
      onChangeText={setValue}
      length={6}
      disabled={false}
      testID="code"
    />
  );
}

const field = () => screen.getByTestId("code");

/** The caret (or selection) the field tells, as a tap or the keys put it. */
const select = (start: number, end: number) =>
  fireEvent(field(), "selectionChange", { nativeEvent: { selection: { start, end } } });

const selectionsSet = () => fieldCalls().filter((call) => call.call === "setSelection");

describe("CodeField", () => {
  it("keeps the digits only, six at most", async () => {
    await render(<Code />);
    await fireEvent.changeText(field(), "12 3a4");
    expect(field().props.value).toBe("1234");
    await fireEvent.changeText(field(), "12345678");
    expect(field().props.value).toBe("123456");
  });

  // A tap on the first box put the caret before the digits: the keys did nothing, the boxes full.
  it("puts the caret back after the digits, wherever it went", async () => {
    await render(<Code />);
    await fireEvent.changeText(field(), "123456");
    await select(0, 0);
    await select(3, 3);
    await select(2, 5);
    expect(selectionsSet()).toEqual([
      { testID: "code", call: "setSelection", start: 6, end: 6 },
      { testID: "code", call: "setSelection", start: 6, end: 6 },
      { testID: "code", call: "setSelection", start: 6, end: 6 }
    ]);
  });

  it("leaves the caret after the digits, and all of them selected (typed over, pasted over)", async () => {
    await render(<Code />);
    await select(0, 0);
    await fireEvent.changeText(field(), "123");
    await select(3, 3);
    await select(0, 3);
    // In the apps, a key just typed may be told before the text it gave.
    await select(4, 4);
    expect(selectionsSet()).toEqual([]);
  });

  it("is focused by its caller", async () => {
    const ref = createRef<{ focus: () => void }>();
    await render(<Code focusRef={ref} />);
    await act(() => ref.current?.focus());
    expect(fieldCalls()).toContainEqual({ testID: "code", call: "focus" });
  });
});
