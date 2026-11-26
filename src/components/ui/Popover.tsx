import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewInstance } from "react-native";
import Animated, { clamp, useAnimatedStyle, useReducedMotion } from "react-native-reanimated";

import { makeStyles, motion, radius, space } from "@/theme";

import { DIALOG_EASING, OverlayModal, useOverlay } from "./overlay";

/** Between the anchor and the panel. */
const GAP = space[2];
/** The panel stays this far from the window's edges. */
const MARGIN = space[5];
/** How far it slides into place (towards its anchor's side when leaving). */
const SLIDE = 4;
/** Below this room under its anchor, the panel opens above it when there is more room there. */
const MIN_BELOW = 240;

type Box = { x: number; y: number; width: number; height: number };

/** Where the panel goes in the window: its side of the anchor, and the room it has there. */
type Placement = { left: number; top?: number; bottom?: number; maxHeight: number; above: boolean };

/**
 * The panel's place for `anchor` in a window (`frame`): under it (above it when the room under it
 * is short and there is more above), its start (or its end: `align`) at the anchor's, kept MARGIN
 * inside the window.
 */
export function placePopover(
  anchor: Box,
  panelWidth: number,
  align: "start" | "end",
  frame: { width: number; height: number }
): Placement {
  const wanted = align === "start" ? anchor.x : anchor.x + anchor.width - panelWidth;
  const left = Math.max(MARGIN, Math.min(wanted, frame.width - panelWidth - MARGIN));
  const below = frame.height - (anchor.y + anchor.height + GAP) - MARGIN;
  const above = anchor.y - GAP - MARGIN;
  if (below < MIN_BELOW && above > below) {
    return { left, bottom: frame.height - anchor.y + GAP, maxHeight: above, above: true };
  }
  return { left, top: anchor.y + anchor.height + GAP, maxHeight: below, above: false };
}

/**
 * A panel dropping from what opened it (`anchor`, a column's header): placed from the anchor's box
 * in the window, measured at every frame while shown, transparent until first measured. Over a transparent layer that
 * closes it (a click or a tap elsewhere), as do Escape (web), the system's back (Android) and
 * VoiceOver's escape (iOS). Its Modal (OverlayModal) keeps the keyboard's focus inside it on the
 * web, from its first element, and gives it back to the anchor once closed (react-native-web). It
 * fades in sliding SLIDE into place; with Reduce Motion, it only fades. Its children scroll
 * themselves within `maxHeight`.
 */
export function Popover({
  visible,
  anchor,
  align = "start",
  width = 288,
  label,
  onClose,
  onClosed,
  children,
  testID
}: {
  visible: boolean;
  anchor: RefObject<ViewInstance | null>;
  /** The panel's start (left) at its anchor's, or its end. */
  align?: "start" | "end";
  width?: number;
  /** Its accessible name. */
  label: string;
  onClose: () => void;
  /**
   * Once it closed, its Modal gone: what opens a window of the system over the app (the camera, the
   * photo library) waits for it. On iOS, expo-image-picker presents it from the topmost view
   * controller, this Modal's while it is there, and React Native's dismissal of the Modal would then
   * dismiss that window (UIKit's dismissViewControllerAnimated).
   */
  onClosed?: () => void;
  /** Mounted while it shows: their state starts afresh at each opening. */
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const frame = useWindowDimensions();
  const [box, setBox] = useState<Box | null>(null);
  const { mounted, progress } = useOverlay(visible, DIALOG_EASING, box !== null, motion.popover);
  // Measured again at the next opening.
  if (!mounted && box !== null) setBox(null);

  // Its Modal shown since `onClosed` was last called.
  const opened = useRef(false);
  useEffect(() => {
    if (mounted) {
      opened.current = true;
    } else if (opened.current) {
      opened.current = false;
      onClosed?.();
    }
  }, [mounted, onClosed]);

  // Follows its anchor at every frame while shown: the anchor moves without anything telling the
  // panel (rows read again push the table down, "To follow up" appearing above it, a column widened
  // after a resize). One measure at a time,
  // the box set only when it changed (no render otherwise). Jest's views never call back: the
  // panel stays transparent, its content there all the same, and nothing is asked again.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let measuring = false;
    let request = 0;
    const follow = () => {
      if (!active) return;
      const view = anchor.current;
      if (view && !measuring) {
        measuring = true;
        view.measureInWindow((x, y, measuredWidth, height) => {
          measuring = false;
          if (!active) return;
          setBox((last) =>
            last !== null &&
            last.x === x &&
            last.y === y &&
            last.width === measuredWidth &&
            last.height === height
              ? last
              : { x, y, width: measuredWidth, height }
          );
        });
      }
      request = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      active = false;
      cancelAnimationFrame(request);
    };
  }, [visible, anchor]);

  const place = box ? placePopover(box, width, align, frame) : null;
  const above = place?.above ?? false;
  const panelStyle = useAnimatedStyle(() => {
    const shown = clamp(progress.get(), 0, 1);
    if (reduceMotion) return { opacity: shown };
    return { opacity: shown, transform: [{ translateY: (1 - shown) * (above ? SLIDE : -SLIDE) }] };
  }, [reduceMotion, above]);

  return (
    <OverlayModal mounted={mounted} visible={visible} onRequestClose={onClose}>
      {/* Never flattened (`collapsable`), its pointerEvents changing inside a Modal: see
          ConfirmDialog. */}
      <View
        collapsable={false}
        style={[styles.layer, { pointerEvents: visible ? "auto" : "none" }]}
      >
        {/* First: the Modal's focus trap (web) starts at the panel's first element. Above the
            layer that closes it (zIndex), which comes after it. */}
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          accessibilityLabel={label}
          // VoiceOver's escape (a two-finger scrub): iOS has no system's back.
          onAccessibilityEscape={onClose}
          style={[
            styles.panel,
            { width, maxWidth: frame.width - 2 * MARGIN },
            place
              ? {
                  left: place.left,
                  top: place.top,
                  bottom: place.bottom,
                  maxHeight: place.maxHeight
                }
              : styles.unplaced,
            panelStyle
          ]}
        >
          {children}
        </Animated.View>
        {/* Not a tab stop (web) nor an element for screen readers: Escape and the system's back
            close the panel for them. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          tabIndex={-1}
          onPress={onClose}
          testID={testID && `${testID}-outside`}
        />
      </View>
    </OverlayModal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  layer: { flex: 1 },
  panel: {
    position: "absolute",
    zIndex: 1,
    paddingVertical: space[3],
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    // A hairline as well as the card's shadow: over the table's rows, white on the cream alone
    // hardly shows where the panel ends.
    borderWidth: 1,
    borderColor: colors.border.subtle,
    boxShadow: shadow.card,
    overflow: "hidden"
  },
  // Until measured: out of the way, transparent (its progress has not started).
  unplaced: { top: 0, left: 0 }
}));
