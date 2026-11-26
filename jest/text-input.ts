/**
 * What the app does to its fields itself (TextField's handle, src/components/ui/TextField.tsx):
 * their focus and their selection, in order, read by their testID (`fieldCalls`). React Native's
 * Jest mock of TextInput (@react-native/jest-preset, mocks/TextInput.js) has one `focus` for every
 * field and no `setSelection`: installed, both are each field's own and recorded.
 */
import { TextInput } from "react-native";

/** A TextInput as Jest renders it: the mock's class instance, which holds its props. */
type JestTextInput = { props: { testID?: string } };

export type FieldCall =
  | { testID?: string; call: "focus" }
  | { testID?: string; call: "setSelection"; start: number; end: number };

let calls: FieldCall[] = [];

/** The fields' focus and selections set since the test started, in order. */
export function fieldCalls(): FieldCall[] {
  return calls;
}

export function resetFieldCalls(): void {
  calls = [];
}

/**
 * On the mock's own prototype, not as Jest spies: a test file's `restoreAllMocks` keeps them, as
 * the native methods they stand for.
 */
export function installTextInput(): void {
  const prototype = TextInput.prototype as unknown as {
    focus: (this: JestTextInput) => void;
    setSelection: (this: JestTextInput, start: number, end: number) => void;
  };
  prototype.focus = function () {
    calls.push({ testID: this.props.testID, call: "focus" });
  };
  prototype.setSelection = function (start, end) {
    calls.push({ testID: this.props.testID, call: "setSelection", start, end });
  };
}
