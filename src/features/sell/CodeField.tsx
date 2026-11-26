import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Text, View, type TextInputSelectionChangeEvent } from "react-native";

import { TextField, type TextFieldHandle } from "@/components/ui/TextField";
import { makeStyles, mono, radius, sans, type } from "@/theme";

/*
 * The SMS code as six boxes of one digit: one field under them,
 * transparent, takes the keys, the system's suggestion of the code just received (iOS, Android) and
 * a paste, all six digits at once; the boxes show what it holds, the next one to fill outlined
 * while it is focused. A field of TextField (its `caption` variant, no frame), as every field of the
 * app: it waits for its panel to show before it opens the keyboard.
 *
 * Its caret stays after the digits, where the outlined box says the next one goes: a tap on a box
 * put it where the tap fell in the field's own text, centred and unseen, and the keys then did
 * nothing at its start (the boxes full: a wrong code typed again) or
 * changed a digit in the middle. Moved anywhere else, it is put back; all the digits selected
 * (select all, a double click) stay so: what is typed or pasted then replaces them.
 */

export function CodeField({
  ref,
  label,
  value,
  onChangeText,
  length,
  disabled,
  onSubmitEditing,
  testID
}: {
  /** Its `focus()`: the code to type again (CodeStep). */
  ref?: Ref<Pick<TextFieldHandle, "focus">>;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  length: number;
  disabled: boolean;
  onSubmitEditing?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const field = useRef<TextFieldHandle>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, length);
  const next = Math.min(digits.length, length - 1);
  useImperativeHandle(ref, () => ({ focus: () => field.current?.focus() }));
  const keepCaretAtEnd = ({ nativeEvent: { selection } }: TextInputSelectionChangeEvent) => {
    const count = digits.length;
    const { start, end } = selection;
    // After the digits (or past them: in the apps, a key just typed may be told before the text it
    // gave), or all of them selected.
    if (end >= count && (start === end || start === 0)) return;
    field.current?.select(count, count);
  };
  return (
    <View style={styles.root}>
      <Text style={styles.label} accessible={false}>
        {label}
      </Text>
      <View style={styles.host}>
        <View
          style={styles.boxes}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }, (_, index) => (
            <View key={index} style={[styles.box, focused && index === next && styles.boxFocused]}>
              <Text style={styles.digit}>{digits[index] ?? ""}</Text>
            </View>
          ))}
        </View>
        <View style={styles.input}>
          <TextField
            ref={field}
            variant="caption"
            label={label}
            value={digits}
            onChangeText={(text) => onChangeText(text.replace(/\D/g, "").slice(0, length))}
            onSelectionChange={keepCaretAtEnd}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={length}
            autoFocus
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={onSubmitEditing}
            testID={testID}
          />
        </View>
      </View>
    </View>
  );
}

const BOX_HEIGHT = 58;

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: 8 },
  label: { ...sans(600), fontSize: type.fieldLabel, color: colors.text.secondary },
  host: { height: BOX_HEIGHT },
  boxes: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: {
    flex: 1,
    maxWidth: 52,
    height: BOX_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center"
  },
  boxFocused: { borderWidth: 2, borderColor: colors.border.accent },
  digit: { ...mono(700), fontSize: 22, color: colors.text.primary },
  // Over the boxes, all but invisible: taps on them reach it, the system reads it as the field.
  input: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "center",
    opacity: 0.011
  }
}));
