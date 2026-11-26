import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { clamp, useAnimatedStyle, useReducedMotion } from "react-native-reanimated";

import { makeStyles, proseLineHeight, radius, sans, space, tracked, type } from "@/theme";

import { Button } from "./Button";
import type { IconName } from "./Icon";
import { DIALOG_EASING, DIALOG_RISE, OverlayModal, Scrim, useOverlay } from "./overlay";
import { RichText } from "./RichText";

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  body: string;
  /**
   * Whether `title` and `body` carry RichText's spans ("Empty Daily first": the card's name in
   * orange, its amounts in bold). Off by default. A value typed by a user goes in through
   * `escapeRichText`: shown as it is.
   */
  markup?: boolean;
  /**
   * The destructive action, named by its result ("Remove access"). None for a dialog that only
   * tells what must come first while nothing can be done here yet: "Back" alone.
   */
  confirmLabel?: string;
  /** Before the confirm button's label ("Delete"'s trash can). */
  confirmIcon?: IconName;
  /**
   * The confirm button's label on several lines, its line breaks kept ("I have the 12
   * words, erase without moving"). Off by default: one line.
   */
  confirmWrap?: boolean;
  /**
   * `destructive` (the default): the confirm button red; `primary`: orange, for a way to what
   * must come first ("Empty Daily first": "Withdraw", its key: the passkey).
   */
  tone?: "destructive" | "primary";
  /** The way back, "Back". */
  cancelLabel: string;
  /** With `confirmLabel`. */
  onConfirm?: () => void;
  /**
   * Waiting for what the confirm button started ("Cancel the invoice"):
   * a `Spinner` in the confirm button, "Back" disabled, and nothing closes the dialog (neither
   * the scrim, nor the system's back, nor Escape) until the caller ends it.
   */
  working?: boolean;
  onCancel: () => void;
  testID?: string;
  confirmTestID?: string;
};

/**
 * Confirmation of a destructive action: a card centred over the
 * scrim, on mobile as on desktop, with "Back" and a solid red confirm button (orange, `tone`
 * primary, for what must come first: "Delete the card"), or "Back" alone while what
 * must come first cannot be done yet. Fades in while rising slightly; with Reduce Motion, it only
 * fades. The scrim and the system's back cancel, except while `working`.
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  markup = false,
  confirmLabel,
  confirmIcon,
  confirmWrap = false,
  tone = "destructive",
  cancelLabel,
  onConfirm,
  working = false,
  onCancel,
  testID,
  confirmTestID
}: ConfirmDialogProps) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  // Every way out (the scrim, the system's back, Escape, "Back") goes through here.
  const cancel = () => {
    if (!working) onCancel();
  };
  // Outlives `visible` by the exit animation (useOverlay), with the texts it showed.
  const { mounted, progress } = useOverlay(visible, DIALOG_EASING);
  const [shown, setShown] = useState({ title, body, confirmLabel });
  if (
    visible &&
    (shown.title !== title || shown.body !== body || shown.confirmLabel !== confirmLabel)
  ) {
    setShown({ title, body, confirmLabel });
  }

  const Line = markup ? RichText : Text;

  const cardStyle = useAnimatedStyle(() => {
    const at = clamp(progress.get(), 0, 1);
    return reduceMotion
      ? { opacity: at }
      : { opacity: at, transform: [{ translateY: (1 - at) * DIALOG_RISE }] };
  }, [reduceMotion]);

  return (
    <OverlayModal mounted={mounted} visible={visible} onRequestClose={cancel}>
      <Scrim progress={progress} />
      {/* Never flattened (`collapsable`): with "auto", nothing else makes this view a native one,
          and "none" does (Fabric, ViewShadowNode.cpp). Closing would then create it and move the
          scrim's Pressable and the card into it, inside the Modal, which Android refuses
          ("addViewAt: failed to insert view"): closing only changes its pointerEvents. */}
      <View
        collapsable={false}
        style={[styles.layer, { pointerEvents: visible ? "auto" : "none" }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={cancelLabel}
          onPress={cancel}
        />
        <Animated.View testID={testID} accessibilityViewIsModal style={[styles.card, cardStyle]}>
          <Line accessibilityRole="header" style={styles.title}>
            {shown.title}
          </Line>
          <Line style={styles.body}>{shown.body}</Line>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              fullWidth={false}
              disabled={working}
              onPress={cancel}
              style={styles.cancel}
            >
              {cancelLabel}
            </Button>
            {shown.confirmLabel !== undefined && onConfirm ? (
              <Button
                variant={tone === "primary" ? "primary" : "destructiveSolid"}
                size="sm"
                icon={confirmIcon}
                fullWidth={false}
                wrap={confirmWrap}
                loading={working}
                onPress={onConfirm}
                style={styles.confirm}
                testID={confirmTestID}
              >
                {shown.confirmLabel}
              </Button>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: space[8] },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    paddingTop: space[9],
    paddingHorizontal: 24,
    paddingBottom: space[7],
    boxShadow: shadow.card,
    gap: 10
  },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  body: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  // 112 + 210: the confirm button takes the rest of the row (1000 to 1). Labels too
  // long for one row ("Conservar el borrador", "Delete for good"): each button on a
  // line of its own, the full width (alone on its line, a button takes all of its free space).
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: space[5] },
  cancel: { minWidth: 112, flexGrow: 1 },
  confirm: { flexGrow: 1000 }
}));
