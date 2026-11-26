import { createContext, useContext, type ReactNode } from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { makeStyles, radius, space, stroke } from "@/theme";

import { useHover } from "./useHover";

/** The rows' side padding in the card, where their content starts (TableNoMatch's too). */
const START_INSET = space[8];
/** The gap between a row's cells. */
const CELL_GAP = space[6];

/** The card's padding after the cells, shared by its head and its rows. */
const EndInsetContext = createContext<number>(START_INSET);

/**
 * The card of a desktop table ("All transactions" of "Wallet" / "My activity",
 * "Employees"): white, its corners clipping its rows' hover tint, 6 px
 * above its head and nothing below its last row (else a white band shows under
 * it, its hover tint stopping short of the card's edge). One component for every table, so that
 * they stay alike. `head`: its `ColumnHeader`s (44 px buttons), a line under them; then its rows
 * (`TableRow`), or a message in their place (`TableNoMatch`). `endInset`: the padding after the
 * cells, 22 px as before them unless its rows' last cell holds its own room (buttons: "Employees",
 * 16 px), the same for the head and the rows.
 *
 * Each row's line is above it, so that a row folding away ("To follow up", `Fold`) takes its line
 * with it, and the card's last row shown has none under it whichever rows fold below it (with
 * the line under each row but the last, the new last row would lose its line at
 * once, while the rows under it still folded). The line above the first row would double the
 * head's: the body hides its first pixel (`bodyContent`, 1 px up, clipped).
 */
export function TableCard({
  head,
  headTestID,
  endInset = START_INSET,
  onLayout,
  testID,
  children
}: {
  head: ReactNode;
  headTestID?: string;
  endInset?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <EndInsetContext.Provider value={endInset}>
      <View style={styles.card} onLayout={onLayout} testID={testID}>
        <View style={[styles.row, styles.head, { paddingRight: endInset }]} testID={headTestID}>
          {head}
        </View>
        <View style={styles.body}>
          <View style={styles.bodyContent}>{children}</View>
        </View>
      </View>
    </EndInsetContext.Provider>
  );
}

/**
 * A row of the table, `height` tall, its cells `CELL_GAP` apart, tinted under a pointer, a line
 * above it (see `TableCard`). With `onPress`, a button (the row's details); without, not one: the
 * tint only follows the pointer along the table, and its cells hold their own
 * controls.
 */
export function TableRow({
  height,
  onPress,
  testID,
  children
}: {
  height: number;
  onPress?: () => void;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const endInset = useContext(EndInsetContext);
  const { hovered, hoverProps } = useHover();
  const style: StyleProp<ViewStyle> = [
    styles.row,
    styles.line,
    { height, paddingRight: endInset },
    hovered && styles.hovered
  ];
  return onPress ? (
    <Pressable
      {...hoverProps}
      accessibilityRole="button"
      onPress={onPress}
      style={style}
      testID={testID}
    >
      {children}
    </Pressable>
  ) : (
    <Pressable accessible={false} {...hoverProps} style={style} testID={testID}>
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    overflow: "hidden",
    paddingTop: space[3]
  },
  row: { flexDirection: "row", alignItems: "center", gap: CELL_GAP, paddingLeft: START_INSET },
  head: { borderBottomWidth: stroke.hairline, borderBottomColor: colors.border.subtle },
  body: { overflow: "hidden" },
  bodyContent: { marginTop: -stroke.hairline },
  line: { borderTopWidth: stroke.hairline, borderTopColor: colors.border.subtle },
  hovered: { backgroundColor: colors.hoverOverlay }
}));
