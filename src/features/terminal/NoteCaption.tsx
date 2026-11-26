import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { useHover } from "@/components/ui/useHover";
import { formatInteger } from "@/lib/locale/format";
import {
  control,
  makeStyles,
  motion,
  palette,
  sans,
  space,
  tracked,
  type,
  useTheme
} from "@/theme";

/** Longest note: it goes with the invoice as an LNURL comment (LUD-12). */
export const NOTE_MAX_LENGTH = 100;

export type NoteCaptionHandle = {
  /**
   * Ends the writing, if any, keeping its draft ("Charge", a tap elsewhere), and closes the
   * keyboard: the note to use now, trimmed. Not writing: the note as it is.
   */
  end: () => string;
};

type NoteCaptionProps = {
  ref?: Ref<NoteCaptionHandle>;
  note: string;
  /** The note written, trimmed ("" clears it). */
  onChange: (note: string) => void;
  maxLength: number;
  /** BCP 47 tag of the device, for the counter's figures. */
  languageTag: string;
  /** The writing starts or ends: on mobile, the keypad gives way to the keyboard meanwhile. */
  onEditingChange: (editing: boolean) => void;
};

/**
 * The sale's note, written in place under the amount, on mobile as on the web and desktop: no
 * panel. "Add a note" turns into the line being written, centred, an orange line under it and the
 * count of characters below; "OK" / Enter, a tap elsewhere (`end`, from the screen in the apps;
 * the web
 * field loses the focus by itself), "Charge" (`end`: the sale takes the draft) or the keyboard
 * closed keep it, Escape (web) gives the note back as it was. Written, it shows as the sale's
 * caption, pressed to write again.
 * Always as high as a field (56): the screen does not move between the three.
 */
export function NoteCaption({
  ref,
  note,
  onChange,
  maxLength,
  languageTag,
  onEditingChange
}: NoteCaptionProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  // The draft while writing, null otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  // The same, for the handlers: several can end the writing in a row (Enter, then the blur of the
  // field taken away), only the first one counts.
  const written = useRef<string | null>(null);
  const editing = draft !== null;

  const start = () => {
    written.current = note;
    setDraft(note);
  };
  const change = (value: string) => {
    const next = value.slice(0, maxLength);
    written.current = next;
    setDraft(next);
  };
  const finish = (value: string) => {
    if (written.current === null) return;
    written.current = null;
    setDraft(null);
    onChange(value.trim());
  };

  useImperativeHandle(ref, () => ({
    end: () => {
      const value = written.current;
      if (value === null) return note;
      // Blurs the field, which closes the keyboard: its blur (at once on the web, later in the
      // apps) and this end the writing with the same draft, whichever comes first.
      Keyboard.dismiss();
      finish(value);
      return value.trim();
    }
  }));

  // Reported from an effect, its cleanup included: unmounted while writing (the layout switching
  // between mobile and desktop, the window resized), the caller would otherwise keep its keypad
  // hidden and out of reach.
  const reportEditing = useEffectEvent((value: boolean) => onEditingChange(value));
  useEffect(() => {
    if (!editing) return;
    reportEditing(true);
    return () => reportEditing(false);
  }, [editing]);

  // Android: the system's back closes the keyboard and leaves the field focused. The writing ends
  // with the keyboard, as with "OK". The web has no keyboard to follow. Only a keyboard shown for
  // this writing counts: the one of a writing just ended may still be closing when the note is
  // pressed again.
  const keyboardHidden = useEffectEvent(() => finish(written.current ?? ""));
  useEffect(() => {
    if (!editing || Platform.OS === "web") return;
    let shown = false;
    const show = KeyboardEvents.addListener("keyboardDidShow", () => {
      shown = true;
    });
    const hide = KeyboardEvents.addListener("keyboardDidHide", () => {
      if (shown) keyboardHidden();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [editing]);

  if (editing) {
    return (
      <View style={styles.box}>
        <TextField
          variant="caption"
          label={t("pos.note.label")}
          placeholder={t("pos.note.placeholder")}
          value={draft}
          onChangeText={change}
          maxLength={maxLength}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => finish(draft)}
          onBlur={() => finish(written.current ?? "")}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Escape") finish(note);
          }}
          testID="note-field"
        />
        <WritingLine />
        <Text style={styles.count} testID="note-count">
          {`${formatInteger(draft.length, languageTag)}/${formatInteger(maxLength, languageTag)}`}
        </Text>
      </View>
    );
  }

  if (note === "") {
    return (
      <View style={styles.box}>
        <Button variant="text" size="md" icon="plus" onPress={start} testID="add-note">
          {t("pos.addNote")}
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("pos.editNote", { note })}
        onPress={start}
        {...hoverProps}
        style={({ pressed }) => [
          styles.written,
          (pressed || hovered) && { backgroundColor: colors.hoverOverlay }
        ]}
        testID="note"
      >
        <Text numberOfLines={1} style={styles.writtenText}>
          {note}
        </Text>
        <Icon name="pen" size={13} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

/** The orange line under the note being written: it grows from the centre (a fade with Reduce Motion). */
function WritingLine() {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: motion.noteLine, easing: Easing.out(Easing.cubic) }));
  }, [shown]);
  const style = useAnimatedStyle(
    () => (reduceMotion ? { opacity: shown.get() } : { transform: [{ scaleX: shown.get() }] }),
    [reduceMotion]
  );
  return (
    <View style={styles.lineRow}>
      <Animated.View style={[styles.line, style]} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  box: { height: control.md, alignSelf: "stretch", justifyContent: "center", alignItems: "center" },
  written: {
    minHeight: control.min,
    maxWidth: "100%",
    paddingHorizontal: space[6],
    borderRadius: control.min / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: space[4]
  },
  writtenText: {
    ...sans(600),
    fontSize: type.action,
    letterSpacing: tracked.action,
    color: colors.text.primary,
    flexShrink: 1
  },
  lineRow: { position: "absolute", left: 0, right: 0, bottom: 4, alignItems: "center" },
  line: {
    width: 240,
    maxWidth: "100%",
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.orange
  },
  // Under the box, over the space before the keypad (faded on mobile): the screen does not move.
  count: {
    ...sans(500),
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 2,
    fontSize: type.caption,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    color: colors.text.secondary
  }
}));
