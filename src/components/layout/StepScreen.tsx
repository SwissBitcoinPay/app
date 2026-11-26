import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { gutter, makeStyles } from "@/theme";

import { useIsDesktop } from "./useIsDesktop";

/**
 * Width of the desktop content column. The step header (StepHeader) aligns its back button and
 * dots on it: it stays in place from one step to the next, so all steps share this width.
 */
export const STEP_CONTENT_WIDTH = 560;

type StepScreenProps = {
  children: ReactNode;
  /** The screen's action: pinned to the bottom on mobile, under the content on desktop. */
  footer?: ReactNode;
  /**
   * Mobile: something below the screen keeps the bottom safe area (the band the app's shell keeps
   * below its hidden dock, src/features/navigation/dock-area.tsx): no inset of its own.
   */
  insetBelow?: boolean;
  /**
   * Desktop: the column takes the screen's whole height, its content laid out in it (the sign-up's
   * card step on a computer: its wait at the bottom).
   */
  fill?: boolean;
  testID?: string;
};

/**
 * Content of every step after the welcome screen, under the step header that their layout draws
 * above them (StepHeader). Mobile: 22 px gutter, action pinned to the bottom. Desktop: content at
 * the top of the cream canvas, no card around it: each step's title at the same height, 24 px under
 * the header (it never moves from one step to the next). Both end above
 * the navigation bar or home indicator: tablets wide enough for the desktop layout have one too.
 *
 * Neither iOS nor Android (edge-to-edge) resizes the screen for the keyboard: the scroll view of
 * react-native-keyboard-controller scrolls the focused field above it, and lets the content, the
 * pinned action included, scroll past it (no layout change while the keyboard moves).
 */
export function StepScreen({
  children,
  footer,
  insetBelow = false,
  fill = false,
  testID
}: StepScreenProps) {
  const styles = useStyles();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();

  if (desktop) {
    return (
      <View style={styles.screen} testID={testID}>
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.desktopBody,
            { paddingBottom: Math.max(insets.bottom, DESKTOP_PADDING_VERTICAL) }
          ]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={KEYBOARD_GAP}
        >
          <View style={[styles.desktopColumn, fill && styles.desktopFill]}>
            {children}
            {footer ? <View style={styles.desktopFooter}>{footer}</View> : null}
          </View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID={testID}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.mobileBody,
          { paddingBottom: Math.max(insetBelow ? 0 : insets.bottom, 20) }
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={KEYBOARD_GAP}
      >
        {children}
        <View style={styles.push} />
        {footer}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** Above and below the desktop content; below, the navigation bar's height when it is taller. */
const DESKTOP_PADDING_VERTICAL = 24;
/** Kept between the focused field and the keyboard: as much as on the screen's sides. */
const KEYBOARD_GAP = gutter;

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  mobileBody: { flexGrow: 1, paddingHorizontal: gutter },
  push: { flexGrow: 1, minHeight: 14 },
  desktopBody: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: DESKTOP_PADDING_VERTICAL
  },
  desktopColumn: { width: STEP_CONTENT_WIDTH, maxWidth: "100%" },
  desktopFill: { flexGrow: 1 },
  desktopFooter: { marginTop: 26 }
}));
