import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View, type ScrollViewInstance } from "react-native";

import { AddAction } from "@/components/ui/AddAction";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { makeStyles, proseLineHeight, sans, space, tracked, type } from "@/theme";

import {
  RelayNotes,
  RelayRows,
  relayErrorKey,
  useRelaysEditor,
  type RelaysEditor
} from "./RelaysEditor";

/*
 * The list of relays, edited: the mobile screen (its sheet, a red relay) and the desktop
 * dialog. "Save" gives the draft to `onSave` once
 * every relay of it answered (RelaysEditor.check: the relays not tested yet are tested first).
 */

type SaveProps = {
  saved: readonly string[];
  /** Saves the list; rejects when it could not be saved (the screen says so). */
  onSave: (relays: readonly string[]) => Promise<void>;
  /**
   * What a change means beyond the list, under its lead (the account's integrations,
   * useIntegrationsRelaysNotice).
   */
  notice?: string | null;
};

/** The notice of SaveProps, when there is one. */
function Notice({ text }: { text: string | null | undefined }) {
  const styles = useStyles();
  return text ? (
    <Text style={styles.notice} testID="relays-notice">
      {text}
    </Text>
  ) : null;
}

/** The field of an address to add: `wss://` fixed before it, its error once "Add" tried. */
function useAddressField(editor: RelaysEditor) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  return {
    input,
    error,
    set: (value: string) => {
      // A pasted address keeps its scheme out of the field: `wss://` is the fixed prefix.
      setInput(value.replace(/^\s*wss:\/\//i, ""));
      setError(null);
    },
    /** Adds the address: true once added. */
    add: (): boolean => {
      const failure = editor.add(input);
      if (failure) {
        const key = relayErrorKey(failure);
        setError(key ? t(key as "relays.errors.incomplete") : null);
        return false;
      }
      setInput("");
      setError(null);
      return true;
    }
  };
}

/**
 * Mobile: the list in a card, "Add a relay" in a sheet, then the two buttons (at the bottom of the
 * screen; right under the list when another setting follows it, `below`).
 * `failure`: why the last save failed, above the buttons, for a screen without notifications
 * ("Advanced settings", before the sign-in).
 */
export function RelaysScreenBody({
  saved,
  onSave,
  notice,
  lead,
  failure = null,
  below
}: SaveProps & {
  lead?: string;
  failure?: string | null;
  /** Another setting of the screen, under the relays ("Advanced settings": country.is). */
  below?: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const editor = useRelaysEditor(saved);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    editor
      .check()
      .then((ok) => (ok ? onSave(editor.draft) : undefined))
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };
  // The relays' own buttons: they test and save the list only.
  const actions = (
    <>
      {failure ? <ErrorMessage testID="relays-save-failed">{failure}</ErrorMessage> : null}
      <View style={styles.actions}>
        <Button
          variant="secondary"
          size="md"
          icon="plug"
          loading={editor.testing}
          onPress={editor.test}
          testID="test-relays"
        >
          {t("relays.test")}
        </Button>
        <Button disabled={editor.blocked} loading={saving} onPress={save} testID="save-relays">
          {t("settings.save")}
        </Button>
      </View>
    </>
  );
  return (
    <View style={styles.body}>
      <Text style={styles.lead}>{lead ?? t("relays.lead")}</Text>
      <Notice text={notice} />
      <RelayRows editor={editor} variant="card" />
      <RelayNotes editor={editor} />
      {editor.full ? (
        <Text style={styles.note}>{t("relays.tooMany")}</Text>
      ) : (
        <AddAction
          label={t("relays.add")}
          height={44}
          onPress={() => setAdding(true)}
          testID="add-relay"
        />
      )}
      {below ? (
        // Another setting under the relays: the relays' buttons stay right under their list,
        // before it, since that setting saves itself (country.is as it is switched) and "Save"
        // does not save it.
        <>
          <View style={styles.actionsGap} />
          {actions}
          <View style={styles.below}>{below}</View>
        </>
      ) : (
        <>
          <View style={styles.push} />
          {actions}
        </>
      )}
      <Sheet
        title={t("relays.add")}
        closeLabel={t("settings.close")}
        visible={adding}
        onClose={() => setAdding(false)}
        testID="add-relay-sheet"
      >
        <AddRelaySheetBody editor={editor} onAdded={() => setAdding(false)} />
      </Sheet>
    </View>
  );
}

/** Mounted at each opening (Sheet): the field starts empty. */
function AddRelaySheetBody({ editor, onAdded }: { editor: RelaysEditor; onAdded: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const field = useAddressField(editor);
  const add = () => {
    if (field.add()) onAdded();
  };
  return (
    <View style={styles.sheetBody}>
      <Text style={styles.lead}>{t("relays.addLead")}</Text>
      <TextField
        label={t("relays.address")}
        prefix="wss://"
        placeholder={t("relays.placeholder")}
        value={field.input}
        onChangeText={field.set}
        error={field.error}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={add}
        testID="relay-address"
      />
      <Button disabled={field.input.trim() === ""} onPress={add} testID="add-relay-confirm">
        {t("relays.addConfirm")}
      </Button>
    </View>
  );
}

/** Desktop: the list, the field to add, "Test the connection", "Cancel", "Save". */
export function RelaysDialog({
  visible,
  onClose,
  saved,
  onSave,
  notice
}: SaveProps & { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t("relays.title")}
      closeLabel={t("settings.close")}
      visible={visible}
      onClose={onClose}
      dialogWidth={560}
      // RELAYS_DIALOG_MAX_HEIGHT, but shrinking to the window (and an iPad's keyboard): up to
      // MAX_RELAYS relays, each red one's line and the notes under them take more than any
      // window, so the list scrolls and its buttons stay.
      dialogMaxHeight={RELAYS_DIALOG_MAX_HEIGHT}
      testID="relays-dialog"
    >
      <RelaysDialogBody saved={saved} onSave={onSave} notice={notice} onClose={onClose} />
    </Sheet>
  );
}

/** Mounted at each opening (Sheet): the draft starts from the saved list. */
function RelaysDialogBody({ saved, onSave, notice, onClose }: SaveProps & { onClose: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const editor = useRelaysEditor(saved);
  const field = useAddressField(editor);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  // The field to add stays under the list, out of what scrolls: a
  // relay added goes last in the list, perhaps out of sight; the list then scrolls to its end once
  // the new row is laid out, once only, so that the owner's own scroll is never taken.
  const addedToShow = useRef(false);
  const add = () => {
    if (field.add()) addedToShow.current = true;
  };
  const showAdded = () => {
    if (!addedToShow.current) return;
    addedToShow.current = false;
    scroll.current?.scrollToEnd({ animated: false });
  };
  const save = () => {
    setSaving(true);
    void editor.check().then((ok) => {
      if (!ok) {
        setSaving(false);
        return;
      }
      onSave(editor.draft).then(onClose, () => setSaving(false));
    });
  };
  return (
    <View style={styles.dialogFrame}>
      <ScrollView
        ref={scroll}
        style={styles.dialogScroll}
        contentContainerStyle={styles.dialogBody}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={showAdded}
        testID="relays-dialog-scroll"
      >
        <Text style={styles.lead}>{t("relays.lead")}</Text>
        <Notice text={notice} />
        <View style={styles.dialogList}>
          <RelayRows editor={editor} variant="lines" />
          <RelayNotes editor={editor} />
        </View>
      </ScrollView>
      {editor.full ? (
        <Text style={styles.note}>{t("relays.tooMany")}</Text>
      ) : adding ? (
        <View style={styles.addRow} testID="relay-add-row">
          <TextField
            label={t("relays.address")}
            prefix="wss://"
            placeholder={t("relays.placeholder")}
            value={field.input}
            onChangeText={field.set}
            error={field.error}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            onSubmitEditing={add}
            style={styles.addField}
            testID="relay-address"
          />
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            disabled={field.input.trim() === ""}
            onPress={add}
            style={styles.addButton}
            testID="add-relay-confirm"
          >
            {t("relays.addShort")}
          </Button>
        </View>
      ) : (
        <AddAction
          label={t("relays.add")}
          height={44}
          onPress={() => setAdding(true)}
          testID="add-relay"
        />
      )}
      <View style={styles.dialogActions}>
        <Button
          variant="text"
          icon="plug"
          fullWidth={false}
          loading={editor.testing}
          onPress={editor.test}
          style={styles.testButton}
          testID="test-relays"
        >
          {t("relays.test")}
        </Button>
        <View style={styles.push} />
        <View style={styles.dialogEnd}>
          <Button
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={onClose}
            style={styles.cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            fullWidth={false}
            disabled={editor.blocked}
            loading={saving}
            onPress={save}
            style={styles.save}
            testID="save-relays"
          >
            {t("settings.save")}
          </Button>
        </View>
      </View>
    </View>
  );
}

/** "Nostr relays" on a desktop: at most this height (Sheet's default). */
const RELAYS_DIALOG_MAX_HEIGHT = 640;

const useStyles = makeStyles(({ colors }) => ({
  body: { flex: 1, gap: 10, paddingTop: space[3] },
  lead: {
    ...sans(500),
    marginBottom: 12,
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  notice: {
    ...sans(600),
    marginBottom: 12,
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: type.label * 1.45,
    color: colors.text.primary
  },
  note: {
    ...sans(500),
    paddingHorizontal: 4,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  push: { flexGrow: 1, minHeight: 14 },
  // The push's least height, without growing: the buttons right under the list.
  actionsGap: { minHeight: 14 },
  below: { marginTop: space[8] },
  actions: { gap: 10 },
  sheetBody: { gap: 18 },
  // The dialog's content: what scrolls, then its buttons, which stay.
  dialogFrame: { flexShrink: 1, gap: 18 },
  dialogScroll: { flexGrow: 0, flexShrink: 1 },
  dialogBody: { gap: 18 },
  dialogList: { gap: 10 },
  // The button on the field's frame, under its label: a Button not full width aligns itself to
  // the start (Button.tsx), which would put it at the label's height.
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  addField: { flex: 1 },
  addButton: { minWidth: 130, alignSelf: "flex-end" },
  // These widths at least: a longer label widens its button; a row too long puts
  // "Cancel" and "Save" (`dialogEnd`) on a line of their own, on the right.
  dialogActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 4
  },
  testButton: { minWidth: 210 },
  dialogEnd: { flexDirection: "row", gap: 10 },
  cancel: { minWidth: 120 },
  save: { minWidth: 160 }
}));
