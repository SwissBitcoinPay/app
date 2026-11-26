import { useState } from "react";
import { Text, View, type TextInputProps } from "react-native";

import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { logFailure } from "@/lib/log/log";
import { makeStyles, proseLineHeight, sans, space, type } from "@/theme";

type EditTextSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  description?: string;
  label: string;
  placeholder?: string;
  /** Under the field: examples of values. */
  hint?: string;
  initialValue: string;
  maxLength: number;
  /** The field's keyboard: text by default. */
  keyboardType?: TextInputProps["keyboardType"];
  saveLabel: string;
  cancelLabel: string;
  /** Message shown when `onSave` rejects: one for every failure, or the failure's own. */
  failureMessage: string | ((error: unknown) => string);
  /** Saves the trimmed value ("" to clear it); the sheet closes once it resolves. */
  onSave: (value: string) => Promise<void> | void;
  /**
   * While `onSave` runs, the field is greyed with `Spinner` at its end and the sheet cannot be
   * closed ("Settings": until a majority of the relays took the change).
   */
  lockWhileSaving?: boolean;
  testID?: string;
};

/** One text field in a sheet (mobile) or dialog (desktop), saved or cancelled. */
export function EditTextSheet(props: EditTextSheetProps) {
  const [locked, setLocked] = useState(false);
  return (
    <Sheet
      title={props.title}
      closeLabel={props.closeLabel}
      visible={props.visible}
      onClose={props.onClose}
      dismissible={!locked}
      testID={props.testID}
    >
      <EditTextForm {...props} onLockChange={setLocked} />
    </Sheet>
  );
}

/** Mounted at each opening (Sheet): the draft starts from the current value. */
function EditTextForm({
  onClose,
  description,
  label,
  placeholder,
  hint,
  initialValue,
  maxLength,
  keyboardType,
  saveLabel,
  cancelLabel,
  failureMessage,
  onSave,
  lockWhileSaving = false,
  onLockChange
}: EditTextSheetProps & { onLockChange: (locked: boolean) => void }) {
  const styles = useStyles();
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = lockWhileSaving && saving;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    if (lockWhileSaving) onLockChange(true);
    setFailure(null);
    try {
      await onSave(draft.trim());
      onLockChange(false);
      onClose();
    } catch (error) {
      logFailure("Saving failed", error);
      setFailure(typeof failureMessage === "string" ? failureMessage : failureMessage(error));
      onLockChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View>
        <TextField
          label={label}
          value={draft}
          onChangeText={(value) => setDraft(value.slice(0, maxLength))}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          disabled={locked}
          trailing={locked ? <Spinner size={16} testID="edit-text-saving" /> : undefined}
          testID="edit-text-field"
        />
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {failure !== null ? <ErrorMessage>{failure}</ErrorMessage> : null}
      <View style={styles.actions}>
        <Button onPress={() => void save()} disabled={saving} testID="edit-text-save">
          {saveLabel}
        </Button>
        <Button variant="text" size="md" onPress={onClose} disabled={locked}>
          {cancelLabel}
        </Button>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  form: { gap: space[6] },
  description: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  hint: {
    ...sans(500),
    fontSize: type.caption,
    color: colors.text.secondary,
    marginTop: 10
  },
  actions: { gap: space[2] }
}));
