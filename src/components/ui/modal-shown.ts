import { createContext } from "react";

/**
 * Inside the Modal of a panel (`OverlayModal`: Sheet, ConfirmDialog): whether that Modal has been
 * shown (its `onShow`); null outside any panel. Each Modal gives its own: a field of a dialog
 * opened over a sheet follows the dialog's.
 *
 * A field of a Modal cannot open the keyboard with `autoFocus` in the apps: on Android, React
 * Native shows the Modal's window not focusable (`FLAG_NOT_FOCUSABLE`, ReactModalHostView,
 * 0.86) and only clears that flag once it is shown, but `autoFocus` focuses the field as it
 * attaches to that window: the field is focused, the keyboard refuses to open, and a later
 * `focus()` does nothing (React Native skips a field already focused). `TextField` focuses its
 * field once this is true instead. Shown is not yet focused: Android gives the Modal's window the
 * focus later, and ignores a keyboard asked for before; `TextField` asks for it again then
 * (soft-keyboard.ts, modules/soft-keyboard).
 */
export const ModalShownContext = createContext<boolean | null>(null);
