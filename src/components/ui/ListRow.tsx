import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { makeStyles } from "@/theme";

type ListRowProps = Omit<PressableProps, "style" | "children"> & {
  /**
   * The horizontal padding of what holds the list (a card, a sheet, the screen), which the list
   * leaves out: the row takes it back around its content, which stays in place.
   */
  inset: number;
  /** Of the row's content, as a row without `ListRow` would be (its height, its line under it). */
  style?: StyleProp<ViewStyle>;
  /**
   * Of the whole row, the inset included: its paddings (a room the pressed tint covers too) and
   * its margins (outside the tint).
   */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * The radius of the corners of what holds the list, when it clips its rows to them (a card): the
   * keyboard's focus ring, drawn inside the row (web), follows them.
   */
  cornerRadius?: number;
  children: ReactNode;
};

/**
 * Web: how far inside the row the browser's focus ring is drawn (`outline-offset`), so that a
 * container that clips its rows (a card's corners, a scroll view) leaves it whole. Chromium's
 * `auto` ring is 2 px thick; Safari's and Firefox's not checked.
 */
const FOCUS_RING_INSET = 2;

/**
 * A row pressed as a whole: its press area and its pressed tint reach the edges of what holds the
 * list (a card, a sheet, the screen), not only those of its content (else, on
 * Android, the tint stopped at the card's padding and at the screen's gutter, a tap there did
 * nothing). The container leaves its horizontal padding out where the rows go, and each row takes
 * it back (`inset`) around its content: the content, and its line under it (a bottom border of
 * `style`), stay where they were. A card holding such rows clips them to its rounded corners
 * (`overflow: "hidden"`, which leaves its own shadow drawn).
 */
export function ListRow({
  inset,
  style,
  containerStyle,
  cornerRadius = 0,
  disabled,
  children,
  ...props
}: ListRowProps) {
  const styles = useStyles();
  return (
    <Pressable
      {...props}
      disabled={disabled}
      // `focused`: react-native-web's, on any focus (a tap or a click too); the browser draws the
      // ring on keyboard focus only (`:focus-visible`). The row takes the container's corners only
      // then, never while pressed: its tint stays square, as the container clips it anyway.
      style={({ pressed, focused }: PressableStateCallbackType & { focused?: boolean }) => [
        { paddingHorizontal: inset },
        containerStyle,
        Platform.OS === "web" && styles.focusRingInside,
        focused && !pressed && cornerRadius > 0 && { borderRadius: cornerRadius },
        pressed && !disabled && styles.pressed
      ]}
    >
      <View style={style}>{children}</View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pressed: { backgroundColor: colors.hoverOverlay },
  focusRingInside: { outlineOffset: -FOCUS_RING_INSET }
}));
