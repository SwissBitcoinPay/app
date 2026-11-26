import { render } from "@testing-library/react-native";
import { createRef } from "react";
import { TextInput, type TextInputInstance } from "react-native";

import { openKeyboardOnceFocused } from "@/components/ui/soft-keyboard";

import { keyboardFields } from "../../jest/soft-keyboard";

type Native = { showOnceFocused: jest.Mock };

/** soft-keyboard.ts loaded afresh with `native` as the app's module (null: absent). */
function loadNative(native: Native | null) {
  let open!: typeof openKeyboardOnceFocused;
  jest.isolateModules(() => {
    jest.doMock("expo", () => ({ requireOptionalNativeModule: () => native }));
    type Module = typeof import("@/components/ui/soft-keyboard");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("@/components/ui/soft-keyboard") as Module;
    open = loaded.openKeyboardOnceFocused;
  });
  return open;
}

/** A field as its native view's React tag: findNodeHandle gives a number as it is. */
const TAGGED = 42;

afterEach(() => {
  jest.dontMock("expo");
});

describe("openKeyboardOnceFocused", () => {
  it("asks the app's module for the field's keyboard by its React tag", async () => {
    const field = createRef<TextInputInstance>();
    const other = createRef<TextInputInstance>();
    await render(
      <>
        <TextInput ref={field} testID="field" />
        <TextInput ref={other} testID="other" />
      </>
    );
    openKeyboardOnceFocused(field.current);
    openKeyboardOnceFocused(other.current);
    expect(keyboardFields()).toEqual(["field", "other"]);
  });

  it("asks nothing for no field", () => {
    openKeyboardOnceFocused(null);
    expect(keyboardFields()).toEqual([]);
  });

  it("asks nothing without the module (iOS, the web, a binary built before it)", () => {
    // No warning either: without its guard, the call would fail and be caught (a warning).
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(() => loadNative(null)(TAGGED)).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("passes the field's tag to the module", () => {
    const native = { showOnceFocused: jest.fn(async () => undefined) };
    loadNative(native)(TAGGED);
    expect(native.showOnceFocused.mock.calls).toEqual([[42]]);
  });

  it("throws nothing when the module fails: the field is gone, no keyboard to open", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const rejected = new Error("No view found with tag 42");
      const rejecting = { showOnceFocused: jest.fn(() => Promise.reject(rejected)) };
      expect(() => loadNative(rejecting)(TAGGED)).not.toThrow();
      const thrown = new Error("Cannot convert the argument");
      const throwing = {
        showOnceFocused: jest.fn(() => {
          throw thrown;
        })
      };
      expect(() => loadNative(throwing)(TAGGED)).not.toThrow();
      // The rejection is caught, not left unhandled.
      await Promise.resolve();
      expect(warn.mock.calls.map(([, error]) => error)).toEqual([thrown, rejected]);
    } finally {
      warn.mockRestore();
    }
  });
});
