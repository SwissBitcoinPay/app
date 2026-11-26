import {
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from "react";
// The only TextInput of the app's code: every field is a TextField, framed or caption
// (eslint.config.js).
/* eslint-disable no-restricted-imports */
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from "react-native";
/* eslint-enable no-restricted-imports */

import { reportActivity } from "@/lib/activity";
import {
  control,
  makeStyles,
  mono,
  palette,
  radius,
  sans,
  space,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

import { Icon, type IconName } from "./Icon";
import { ModalShownContext } from "./modal-shown";
import { openKeyboardOnceFocused } from "./soft-keyboard";

/** What a caller does to its field itself ("Sell"'s SMS code, CodeField.tsx). */
export type TextFieldHandle = {
  focus: () => void;
  /** Selects the text from `start` to `end`: the caret there when they are equal. */
  select: (start: number, end: number) => void;
};

type TextFieldProps = {
  ref?: Ref<TextFieldHandle>;
  label?: string;
  /**
   * A link on the label row, at its end ("Change relay": "Default relay"),
   * in the umber of a text button: a field's related link (its `error` is text only); its sign
   * before it, when it has one (a card's withdrawal on a desktop: "Empty the card").
   */
  labelAction?: { label: string; onPress: () => void; icon?: IconName; testID?: string };
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  icon?: IconName;
  /**
   * Instruction shown inside the field, at the bottom of the frame, with a
   * danger border and glyph. Text only: a related link goes on the label row.
   */
  error?: string | null;
  /** For values that are counted or copied (amounts, a node's address); an IBAN is in the sans. */
  monospace?: boolean;
  align?: "left" | "right";
  /** Drawn at the field's right end, after the value: a unit, an icon button (44 px). */
  trailing?: ReactNode;
  /**
   * Fixed text before the value, not editable ("Settings": `wss://` for a
   * relay's address), in grey; a tap on it focuses the field.
   */
  prefix?: string;
  /**
   * Drawn at the field's left end, before the value: a control of its own ("Sell"'s phone: the
   * number's country, its flag and dial code).
   */
  leading?: ReactNode;
  /** Not editable: sand fill, grey value ("Settings": fields wait while a check runs). */
  disabled?: boolean;
  /**
   * Several lines ("Items": the description, 3 lines): the frame is that many lines
   * high, the text wraps and starts at its top, a filled value in 600.
   */
  multiline?: number;
  /**
   * "caption": a line of text written in place, without frame nor label (the label names it for
   * screen readers), centred (the keypad's note, NoteCaption.tsx). The caller draws the focus and
   * places it: `style` is the framed field's.
   */
  variant?: "framed" | "caption";
  onBlur?: () => void;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & Pick<
  TextInputProps,
  | "autoCapitalize"
  | "autoComplete"
  | "autoCorrect"
  | "autoFocus"
  | "editable"
  | "keyboardType"
  | "inputMode"
  | "maxLength"
  | "returnKeyType"
  | "onSubmitEditing"
  | "onKeyPress"
  | "onSelectionChange"
  | "textContentType"
  /** A password (the v2 account's, src/features/migration/LegacyPasswordForm.tsx): never shown as typed. */
  | "secureTextEntry"
>;

// Web: the browser's focus ring, drawn around the input inside the frame, is `outline-style: auto`,
// for which CSS UI 4 ignores `outline-width`: `outline-width: 0` hides it in Chromium 141, not in
// every browser; `none` does. The frame's accent border shows the focus. React Native's types do
// not list "none".
const NO_FOCUS_RING = { outlineStyle: "none" } as unknown as TextStyle;

export function TextField({
  ref,
  label,
  labelAction,
  value,
  onChangeText,
  placeholder,
  icon,
  error,
  monospace = false,
  align = "left",
  trailing,
  prefix,
  leading,
  disabled = false,
  multiline,
  variant = "framed",
  onBlur,
  onFocus,
  style,
  testID,
  autoFocus,
  ...inputProps
}: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  // In a panel's Modal (Sheet, ConfirmDialog), in the apps: focused once that Modal is shown, so
  // that the keyboard opens (ModalShownContext), rather than by `autoFocus`; and focused then when
  // `autoFocus` turns on while it shows ("Items": the name, once Open Food Facts gave none for
  // a scanned product). The web focuses with `autoFocus`, as the field mounts only. On Android, the
  // Modal's window may take the focus only after its onShow (after the barcode scanner's, "New
  // item": the price had its cursor, not its keyboard): the keyboard is asked for again, for
  // when it does (soft-keyboard.ts).
  const modalShown = useContext(ModalShownContext);
  const focusOnShow = !!autoFocus && modalShown !== null && Platform.OS !== "web";
  useEffect(() => {
    if (!focusOnShow || !modalShown) return;
    input.current?.focus();
    openKeyboardOnceFocused(input.current);
  }, [focusOnShow, modalShown]);
  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    select: (start, end) => {
      const node = input.current;
      if (!node) return;
      // The web's field is the page's <input> (react-native-web), which has no setSelection.
      if (Platform.OS === "web") {
        (node as unknown as HTMLInputElement).setSelectionRange(start, end);
      } else {
        node.setSelection(start, end);
      }
    }
  }));
  const filled = value !== "";
  const hasError = !!error;
  const borderColor = hasError
    ? colors.danger.fg
    : disabled
      ? "transparent"
      : focused
        ? colors.border.accent
        : colors.border.subtle;
  const lines = multiline && multiline > 1 ? multiline : null;
  const weight = filled ? (lines ? 600 : 700) : 500;

  // What both variants give their TextInput.
  const shared = {
    ...inputProps,
    autoFocus: focusOnShow ? false : autoFocus,
    editable: disabled ? false : inputProps.editable,
    testID,
    accessibilityLabel: label,
    value,
    onChangeText: (text: string) => {
      // Typing is the user's activity (auto-lock), though it touches nothing of the app.
      reportActivity();
      onChangeText?.(text);
    },
    placeholder,
    placeholderTextColor: colors.text.secondary,
    selectionColor: palette.orange,
    cursorColor: palette.orange
  };
  const color = filled && !disabled ? colors.text.primary : colors.text.secondary;

  if (variant === "caption") {
    return (
      <TextInput
        {...shared}
        ref={input}
        onFocus={onFocus}
        onBlur={onBlur}
        style={[
          styles.caption,
          sans(filled ? 600 : 500),
          { color },
          Platform.OS === "web" ? NO_FOCUS_RING : null
        ]}
      />
    );
  }

  return (
    <View style={[styles.root, style]}>
      {labelAction ? (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          <Pressable
            accessibilityRole="button"
            onPress={labelAction.onPress}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            testID={labelAction.testID}
          >
            {({ pressed }) => {
              const color = pressed ? colors.button.text.labelActive : colors.button.text.label;
              return (
                <View style={styles.labelActionLine}>
                  {labelAction.icon ? (
                    <Icon name={labelAction.icon} size={11} color={color} />
                  ) : null}
                  <Text style={[styles.labelAction, { color }]}>{labelAction.label}</Text>
                </View>
              );
            }}
          </Pressable>
        </View>
      ) : label ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.frame,
          { borderColor },
          lines !== null && {
            height: lines * MULTILINE_LINE_HEIGHT + 2 * (MULTILINE_PADDING + stroke.control),
            alignItems: "flex-start"
          },
          disabled && styles.frameDisabled
        ]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={13}
            color={focused ? colors.text.accent : colors.text.secondary}
          />
        ) : null}
        {leading}
        {prefix ? (
          <Pressable
            accessible={false}
            onPress={() => input.current?.focus()}
            disabled={disabled}
            style={styles.prefix}
          >
            <Text style={[styles.prefixText, monospace ? mono(500) : sans(500)]}>{prefix}</Text>
          </Pressable>
        ) : null}
        <TextInput
          {...shared}
          ref={input}
          multiline={lines !== null}
          numberOfLines={lines ?? undefined}
          aria-invalid={hasError || undefined}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            styles.input,
            monospace ? mono(weight) : sans(weight),
            {
              color,
              textAlign: align,
              fontVariant: align === "right" || monospace ? ["tabular-nums"] : undefined
            },
            lines !== null && styles.inputMultiline,
            Platform.OS === "web" ? NO_FOCUS_RING : null
          ]}
        />
        {trailing}
        {hasError ? (
          <>
            <Text
              accessibilityRole="alert"
              numberOfLines={1}
              style={[styles.error, { left: icon ? 42 : 18 }]}
            >
              {error}
            </Text>
            <Icon name="circle-exclamation" size={15} color={colors.danger.fg} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Line height of a multiline field's text (type.body). */
const MULTILINE_LINE_HEIGHT = 21;
/** Above and below a multiline field's text, inside its border. */
const MULTILINE_PADDING = 14;

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: space[4] },
  caption: {
    alignSelf: "stretch",
    height: control.min,
    padding: 0,
    fontSize: type.action,
    letterSpacing: tracked.action,
    textAlign: "center"
  },
  label: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  labelActionLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  labelAction: { ...sans(600), fontSize: type.fieldLabel },
  frame: {
    position: "relative",
    height: control.md,
    backgroundColor: colors.background.surface,
    borderWidth: stroke.control,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 18
  },
  frameDisabled: { backgroundColor: colors.background.subtle },
  prefix: { height: "100%", justifyContent: "center", marginRight: -11 },
  prefixText: { fontSize: type.body, color: colors.text.secondary },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    fontSize: type.body
  },
  inputMultiline: {
    paddingVertical: MULTILINE_PADDING,
    lineHeight: MULTILINE_LINE_HEIGHT,
    textAlignVertical: "top"
  },
  error: {
    ...sans(600),
    position: "absolute",
    right: 18,
    bottom: 4,
    fontSize: 10.5,
    lineHeight: 12.6,
    color: colors.danger.fg
  }
}));
