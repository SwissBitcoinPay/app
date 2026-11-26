import { useRef, useState, type ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { makeStyles, proseLineHeight, sans, space, type } from "@/theme";

import { BUSINESS_NAME_MAX_LENGTH, normalizeBusinessName } from "./account-settings";
import { SAVING_SPINNER } from "./parts";

/*
 * The fields of "Settings", on a computer's tab as on a phone's page: a value is saved when its
 * field is left (or "Done" / Enter), when it changed.
 * While it is saved, until a relay took it, the field is greyed
 * with `Spinner` at its end and cannot change; back to the saved value when it could not be saved.
 */

/**
 * One setting of a rubric: its title, what it does, then its control(s). Without a title (the
 * rubric's first, named by the page or the tab), its description only.
 */
export function SettingBlock({
  title,
  description,
  children,
  testID
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.block} testID={testID}>
      {title || description ? (
        <View style={styles.texts}>
          {title ? (
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** The business name: an empty or unchanged name saves nothing (the field shows the saved one). */
export function NameField({
  name,
  label,
  onSave,
  onFail
}: {
  name: string;
  label: string;
  onSave: (name: string) => Promise<void>;
  onFail: (error: unknown) => void;
}) {
  const [draft, setDraft] = useState<{ from: string; value: string }>({ from: name, value: name });
  // Changed elsewhere (another device, the account reloaded, a change cancelled): the field follows.
  if (draft.from !== name) setDraft({ from: name, value: name });
  const value = draft.from === name ? draft.value : name;
  // The name being saved: Enter saves, then the field loses the focus (blurOnSubmit) before the
  // account has the new name, which would save it a second time.
  const saving = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    const next = normalizeBusinessName(value);
    if (next === saving.current) return;
    if (next === "" || next === name) {
      setDraft({ from: name, value: name });
      return;
    }
    saving.current = next;
    setBusy(true);
    onSave(next)
      .catch((error: unknown) => {
        onFail(error);
        setDraft({ from: name, value: name });
      })
      .finally(() => {
        if (saving.current === next) saving.current = null;
        setBusy(false);
      });
  };
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) =>
        setDraft({ from: name, value: text.slice(0, BUSINESS_NAME_MAX_LENGTH) })
      }
      onBlur={save}
      onSubmitEditing={save}
      returnKeyType="done"
      disabled={busy}
      trailing={busy ? <Spinner size={SAVING_SPINNER} testID="business-name-saving" /> : undefined}
      testID="business-name-field"
    />
  );
}

/**
 * A value typed (the default VAT rate, the tolerance of on-chain underpayments), its hint below
 * it.
 */
export function TextSetting({
  text,
  label,
  placeholder,
  hint,
  maxLength,
  onSave,
  onFail,
  testID
}: {
  /** The saved value, as the field shows it. */
  text: string;
  label: string;
  placeholder: string;
  hint: string;
  maxLength: number;
  onSave: (text: string) => Promise<void>;
  onFail: (error: unknown) => void;
  /** `<testID>-field` and `<testID>-saving`. */
  testID: string;
}) {
  const styles = useStyles();
  const [draft, setDraft] = useState<{ from: string; value: string }>({ from: text, value: text });
  // Changed elsewhere (another device, a change cancelled): the field follows.
  if (draft.from !== text) setDraft({ from: text, value: text });
  const value = draft.from === text ? draft.value : text;
  const saving = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    const next = value.trim();
    if (next === saving.current || next === text) return;
    saving.current = next;
    setBusy(true);
    onSave(next)
      .catch((error: unknown) => {
        onFail(error);
        setDraft({ from: text, value: text });
      })
      .finally(() => {
        if (saving.current === next) saving.current = null;
        setBusy(false);
      });
  };
  return (
    <View style={styles.valueField}>
      <TextField
        label={label}
        value={value}
        onChangeText={(next) => setDraft({ from: text, value: next.slice(0, maxLength) })}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        onBlur={save}
        onSubmitEditing={save}
        returnKeyType="done"
        disabled={busy}
        trailing={busy ? <Spinner size={SAVING_SPINNER} testID={`${testID}-saving`} /> : undefined}
        testID={`${testID}-field`}
      />
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

/**
 * A line of text typed (a line of the business's address), saved trimmed when left and changed: ""
 * empties it.
 */
export function LineField({
  text,
  label,
  maxLength,
  autoComplete,
  onSave,
  onFail,
  style,
  testID
}: {
  /** The saved line, as the field shows it. */
  text: string;
  label: string;
  maxLength: number;
  autoComplete?: "street-address" | "postal-code";
  onSave: (line: string) => Promise<void>;
  onFail: (error: unknown) => void;
  style?: StyleProp<ViewStyle>;
  /** `<testID>` and `<testID>-saving`. */
  testID: string;
}) {
  const [draft, setDraft] = useState<{ from: string; value: string }>({ from: text, value: text });
  // Changed elsewhere (another device, a change cancelled): the field follows.
  if (draft.from !== text) setDraft({ from: text, value: text });
  const value = draft.from === text ? draft.value : text;
  const saving = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => {
    const next = value.trim();
    if (next === saving.current) return;
    if (next === text) {
      setDraft({ from: text, value: text });
      return;
    }
    saving.current = next;
    setBusy(true);
    onSave(next)
      .catch((error: unknown) => {
        onFail(error);
        setDraft({ from: text, value: text });
      })
      .finally(() => {
        if (saving.current === next) saving.current = null;
        setBusy(false);
      });
  };
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(next) => setDraft({ from: text, value: next.slice(0, maxLength) })}
      autoComplete={autoComplete}
      onBlur={save}
      onSubmitEditing={save}
      returnKeyType="done"
      disabled={busy}
      trailing={busy ? <Spinner size={SAVING_SPINNER} testID={`${testID}-saving`} /> : undefined}
      style={style}
      testID={testID}
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  block: { gap: space[5] },
  texts: { gap: space[2] },
  title: { ...sans(700), fontSize: 16, color: colors.text.primary },
  description: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  valueField: { maxWidth: 320, gap: space[4] },
  hint: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
