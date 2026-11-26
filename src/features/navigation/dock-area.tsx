import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
  type Ref
} from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { motion, space } from "@/theme";

import { DOCK_HEIGHT, DOCK_TOP } from "./dock-layout";
import { useEased } from "./motion";

/**
 * The mobile dock floats over the bottom of the screens: what
 * scrolls passes under it, to the window's edge. A screen's frame (PosFrame) keeps the room the
 * dock takes (`useFramePadding`) unless a DockScrollView shows in it: that scroll view then runs
 * under the dock, its content ending above it (and above the screen's DockActions). The scroll view
 * tells its frame itself (`useUnderDockFrame`): nothing else to declare, nothing to forget. Once
 * the dock left (an invoice, a screen of the whole window), the shell keeps the band below it
 * (`ShellMain`), as the dock's area did when it was laid out below the screens.
 */
export type DockArea = {
  /** Below the dock: the bottom safe area, at least space[5]. */
  bottom: number;
  /**
   * The dock left (an invoice, a screen of the whole window): the one place that decides it, for
   * the dock (its taps, its reach) as for the screens' room (`shown`).
   */
  hidden: boolean;
  /** 1 while the dock shows, 0 once it left, eased between. */
  shown: SharedValue<number>;
};

const DockAreaContext = createContext<DockArea | null>(null);

/** The shell's dock, when it has one (`docked`: a phone, not a card holder's). */
export function DockAreaProvider({
  docked,
  hidden,
  children
}: {
  docked: boolean;
  hidden: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, space[5]);
  const shown = useEased(hidden ? 0 : 1, { duration: motion.navDock });
  return (
    <DockAreaContext.Provider value={docked ? { bottom, hidden, shown } : null}>
      {children}
    </DockAreaContext.Provider>
  );
}

/** The dock's area, null without a dock (a computer, a card holder's phone, outside the shell). */
export function useDockArea(): DockArea | null {
  return useContext(DockAreaContext);
}

/** For the dock itself, always drawn in its shell's DockAreaProvider. */
export function useShownDockArea(): DockArea {
  const area = useContext(DockAreaContext);
  if (!area) throw new Error("The dock must be drawn inside a docked <DockAreaProvider>");
  return area;
}

/** The dock's height over the screens, from the window's bottom edge, while it shows. */
function dockClearance(area: DockArea): number {
  return area.bottom + DOCK_TOP + DOCK_HEIGHT;
}

/**
 * The room a scroll view running under the dock leaves after its content (DockScrollView). Without
 * a dock, the bottom safe area. The dock always shows over such a screen: what hides it covers the
 * screen.
 */
function useDockClearance(): number {
  const area = useDockArea();
  const insets = useSafeAreaInsets();
  return area ? dockClearance(area) : insets.bottom;
}

/**
 * A screen frame's bottom padding on mobile (PosFrame): the room the dock takes while it shows,
 * eased with it, so that what does not scroll ends above it; none while a DockScrollView runs
 * under it (`underDock`, from `useUnderDockFrame`). Without a dock, the bottom safe area (none for
 * `underDock`: the scroll view's content ends with it).
 */
export function useFramePadding(underDock: boolean) {
  const area = useDockArea();
  const insets = useSafeAreaInsets();
  const none = useSharedValue(0);
  const shown = area?.shown ?? none;
  const clearance = area ? dockClearance(area) : null;
  const withoutDock = insets.bottom;
  return useAnimatedStyle(
    () => ({
      paddingBottom: underDock ? 0 : clearance === null ? withoutDock : shown.get() * clearance
    }),
    [underDock, clearance, withoutDock, shown]
  );
}

/**
 * The shell's screens (AppShell). While the dock shows, nothing below them: they reach the
 * window's edge, under the dock. Once it left, the band below it, which the screens shown then
 * (an invoice, a screen of the whole window) expect, eased as the dock leaves or comes back; none
 * for a screen that reaches the window's edge itself (`toWindowEdge`, isMobileEdgeToEdgeRoute).
 * Always the same view, with or without a dock: the screens are never mounted again when the
 * window crosses the desktop width.
 */
export function ShellMain({
  style,
  toWindowEdge = false,
  children
}: {
  style: StyleProp<ViewStyle>;
  toWindowEdge?: boolean;
  children: ReactNode;
}) {
  const area = useDockArea();
  const none = useSharedValue(1);
  const shown = area?.shown ?? none;
  const bottom = toWindowEdge ? 0 : (area?.bottom ?? 0);
  const padding = useAnimatedStyle(
    () => ({ paddingBottom: (1 - shown.get()) * bottom }),
    [bottom, shown]
  );
  return <Animated.View style={[style, padding]}>{children}</Animated.View>;
}

/** What a screen's frame shares with the DockScrollView and the DockActions it holds. */
type UnderDockFrame = {
  /** A DockScrollView shows: the frame leaves no room below it. Returns its leaving. */
  enter: () => () => void;
  /** Of the frame's DockActions, as laid out; 0 without. */
  actionsHeight: number;
  setActionsHeight: (height: number) => void;
};

const UnderDockFrameContext = createContext<UnderDockFrame | null>(null);

/**
 * For a screen frame (PosFrame, mobile): whether a DockScrollView shows in it (`underDock`), and
 * what to provide its content with (`frame`, through UnderDockFrameProvider). Told by the scroll
 * view as it mounts, before the screen is drawn (a layout effect).
 */
export function useUnderDockFrame(): { underDock: boolean; frame: UnderDockFrame } {
  const [scrollViews, setScrollViews] = useState(0);
  const [actionsHeight, setActionsHeight] = useState(0);
  const [enter] = useState(() => () => {
    setScrollViews((count) => count + 1);
    return () => setScrollViews((count) => count - 1);
  });
  return { underDock: scrollViews > 0, frame: { enter, actionsHeight, setActionsHeight } };
}

export const UnderDockFrameProvider = UnderDockFrameContext.Provider;

/** A style's bottom padding, as Yoga resolves it (`paddingBottom` first); 0 when not in points. */
function bottomPaddingOf(style: StyleProp<ViewStyle>): number {
  const flat = StyleSheet.flatten(style) ?? {};
  const value = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding;
  return typeof value === "number" ? value : 0;
}

/**
 * A screen's scroll view that runs under the dock, to the window's edge: its content
 * (`contentContainerStyle`'s bottom padding included) ends above the
 * dock and the screen's DockActions, as do its scroll bars. Its frame (PosFrame) then leaves no
 * room below it, told as it mounts: no flag to keep in step. Outside such a frame (a computer's
 * layout), a plain ScrollView. `ref`: the ScrollView's ("Wallet" scrolls back up to the
 * movements arrived).
 */
export function DockScrollView({
  contentContainerStyle,
  scrollIndicatorInsets,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const frame = useContext(UnderDockFrameContext);
  const clearance = useDockClearance();
  const enter = frame?.enter;
  useLayoutEffect(() => enter?.(), [enter]);
  if (!frame) {
    return (
      <ScrollView
        {...props}
        contentContainerStyle={contentContainerStyle}
        scrollIndicatorInsets={scrollIndicatorInsets}
      />
    );
  }
  const room = clearance + frame.actionsHeight;
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: bottomPaddingOf(contentContainerStyle) + room }
      ]}
      scrollIndicatorInsets={{ ...scrollIndicatorInsets, bottom: room }}
    />
  );
}

/**
 * A screen's actions ("Add an item", "Send"…) floating over its DockScrollView, just
 * above the dock: the list passes under them too, and ends above
 * them (their height goes to it through the frame). Only the actions take taps: around them
 * (`style`'s padding included), the list.
 */
export function DockActions({
  style,
  children
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const setActionsHeight = useContext(UnderDockFrameContext)?.setActionsHeight;
  const clearance = useDockClearance();
  // Gone with them: the list no longer leaves their room.
  useLayoutEffect(() => () => setActionsHeight?.(0), [setActionsHeight]);
  return (
    <View
      style={[styles.actions, { bottom: clearance }, style]}
      onLayout={(event) => setActionsHeight?.(event.nativeEvent.layout.height)}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // From a sheet: the web applies box-none from a class, not from an inline style.
  actions: { position: "absolute", left: 0, right: 0, pointerEvents: "box-none" }
});
