import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { reportActivity } from "@/lib/activity";

/**
 * Notes the user's activity under it (src/lib/activity.ts), for the auto-lock (auto-lock.tsx): on
 * the screens, the navigation, the notifications, and the sheets too, though a Modal is a window of
 * its own: React Native's events walk the React tree, not the native views, so a touch in a Modal
 * reaches the components that render it.
 * - Touches: each touch start and move asks the views from the root down whether they take it
 *   (the responder system's capture phase), this one first; it never does, so nothing below
 *   changes.
 * - Clicks, which a screen reader's activation sends without any touch (TalkBack's double tap on a
 *   Pressable: its `onClick`, Pressability.js): `click` goes from the root down too (`onClickCapture`).
 * Typing on the keyboard touches nothing of the app: the fields note it themselves (TextField).
 */
export function ActivityDetector({ children }: { children: ReactNode }) {
  return (
    <View
      testID="activity-detector"
      style={styles.root}
      onStartShouldSetResponderCapture={observe}
      onMoveShouldSetResponderCapture={observe}
      {...CLICK_CAPTURE}
    >
      {children}
    </View>
  );
}

function observe(): boolean {
  reportActivity();
  return false;
}

// The click's capture phase is in React Native's view config (`topClick`, BaseViewConfig.android.js
// and .ios.js) and its generated types, not in the hand-written types this project compiles with.
const CLICK_CAPTURE = { onClickCapture: () => reportActivity() } as ViewProps;

const styles = StyleSheet.create({
  root: { flex: 1 }
});
