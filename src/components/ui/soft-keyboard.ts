import { requireOptionalNativeModule } from "expo";
import { findNodeHandle } from "react-native";

import { logFailure } from "@/lib/log/log";

/** A field: its TextInput (findNodeHandle's handle, as React Native types it). */
type Field = Parameters<typeof findNodeHandle>[0];

type SoftKeyboardModule = {
  showOnceFocused(viewTag: number): Promise<void>;
};

// The app's own native module (modules/soft-keyboard), Android only: absent from iOS, from the web
// and from a binary built before it, where the field's focus alone opens the keyboard, as before.
const native = requireOptionalNativeModule<SoftKeyboardModule>("SoftKeyboard");

/**
 * Opens the keyboard of `input`, a field being focused (its `focus()` called), once its window has
 * the focus (Android). React Native asks for the keyboard as the field is focused only, which
 * Android ignores while the field's window has no focus yet: in a panel's Modal just shown, the
 * field got its cursor and no keyboard ("New item" after a scan).
 */
export function openKeyboardOnceFocused(input: Field): void {
  if (!native || !input) return;
  const tag = findNodeHandle(input);
  if (tag == null) return;
  // A field gone meanwhile (the panel closed): no keyboard to open.
  const failed = (error: unknown) => {
    logFailure("Opening the keyboard of a field failed", error);
  };
  try {
    native.showOnceFocused(tag).catch(failed);
  } catch (error) {
    failed(error);
  }
}
