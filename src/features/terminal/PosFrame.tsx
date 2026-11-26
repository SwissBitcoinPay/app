import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { IconButton } from "@/components/ui/IconButton";
import type { IconName } from "@/components/ui/Icon";
import { outOfReach } from "@/components/ui/reach";
import {
  UnderDockFrameProvider,
  useFramePadding,
  useUnderDockFrame
} from "@/features/navigation/dock-area";
import { gutter, makeStyles, sans, TITLE_EM, tracked, tracking, type, useTheme } from "@/theme";

/** The mobile header's height: what its title may take at most (the mode switch, `fit`). */
export const HEADER_HEIGHT = 64;

/** The point of sale's column on desktop: the keypad and its amount, the basket, an outcome. */
export const POS_COLUMN_WIDTH = 560;

/**
 * A point of sale's screen in the mobile layout, its content in that column, centred: on a tablet
 * (an iPad held upright), no keypad nor button across its whole width, as the dock stays narrow
 * there (DOCK.maxWidth). Phones are narrower than it.
 */
export const posColumn: ViewStyle = {
  alignSelf: "center",
  width: "100%",
  maxWidth: POS_COLUMN_WIDTH + 2 * gutter
};

export type HeaderAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
};

type PosFrameProps = {
  /** Mobile header: the centre (a title). */
  title?: ReactNode;
  leading?: HeaderAction;
  /**
   * Mobile header, on the right: one action, or two side by side, the second at the edge
   * ("Cards": "Where to pay" beside "Organise" or "Settings"). The left side then keeps as
   * much room, the title centred between them.
   */
  trailing?: HeaderAction | readonly [HeaderAction, HeaderAction];
  /**
   * Mobile header: its actions leaving (the paid screen arriving, PaidArrival.tsx), with this
   * style; they then take no tap and are hidden from accessibility.
   */
  leavingActions?: AnimatedStyle<ViewStyle>;
  /** Desktop header: the title, "Point of Sale" by default. */
  desktopTitle?: string;
  /** Desktop header: the line under the title. */
  subtitle?: string;
  /** Desktop header, right side. */
  desktopAside?: ReactNode;
  children: ReactNode;
  /**
   * The screen draws the gutter itself, inside its scroll view: the frame has no side padding
   * around it, so the scroll view takes the whole width (its bar at the screen's edge, the shadows
   * of its cards not cut). On a phone only ("mobile"), or on a computer too ("always").
   */
  flush?: "mobile" | "always";
  /**
   * Mobile: the content reaches the window's bottom edge and keeps clear of the home indicator or
   * the navigation bar itself (isMobileEdgeToEdgeRoute: the shell keeps no band below either).
   */
  toWindowEdge?: boolean;
  /** Of the content column (mobile) or the centred body (desktop). */
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Frame of the point of sale's screens. Mobile: a 64 px header (ScreenHeader: action, title,
 * action), then the content over the full height. Desktop: the "Point of Sale" header over a
 * centred body. The app's navigation (dock, side bar) is drawn around it by AppShell.
 */
export function PosFrame({
  title,
  leading,
  trailing,
  leavingActions,
  desktopTitle,
  subtitle,
  desktopAside,
  children,
  flush,
  toWindowEdge = false,
  contentStyle
}: PosFrameProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  // Mobile: what the screen shows ends above the dock (or the bottom safe area without one), but
  // a DockScrollView, which runs under it and tells the frame so (dock-area.tsx).
  const { underDock, frame } = useUnderDockFrame();
  const bottomPadding = useFramePadding(underDock);

  if (desktop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.desktopHeader}>
          <View style={styles.desktopTitles}>
            <Text accessibilityRole="header" style={styles.desktopTitle}>
              {desktopTitle ?? t("pos.title")}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.desktopSubtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {desktopAside}
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.desktopBody,
            { paddingBottom: Math.max(insets.bottom, 24) },
            flush === "always" && styles.flush,
            contentStyle
          ]}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  const leaving = leavingActions !== undefined;
  // `edge`: the action next to the screen's edge, pulled outward (IconButton's `overhang`).
  const action = (a: HeaderAction | undefined, side: "left" | "right", edge = true, at = 0) =>
    a ? (
      <Animated.View
        // A view keeps the last values of a style taken off it (Reanimated 4.5): an action left
        // over once the leaving stops (the arrival cut short) is a new one.
        key={`${side}-${at}-${leaving ? "leaving" : "shown"}`}
        style={[{ pointerEvents: leaving ? "none" : "auto" }, leavingActions]}
        // Out of reach of screen readers and, on the web, of the keyboard too.
        {...outOfReach(leaving)}
      >
        <IconButton
          icon={a.icon}
          label={a.label}
          onPress={a.onPress}
          overhang={edge ? side : undefined}
          size={a.icon === "arrow-left" ? 19 : 17}
          color={a.icon === "arrow-left" ? colors.text.primary : undefined}
          testID={a.testID}
        />
      </Animated.View>
    ) : (
      <View key={`${side}-${at}-spacer`} style={styles.spacer} />
    );
  const leadingActions = leading ? [leading] : [];
  const trailingActions: readonly HeaderAction[] =
    trailing === undefined ? [] : "onPress" in trailing ? [trailing] : trailing;
  const slots = Math.max(leadingActions.length, trailingActions.length);
  // Each side as wide as the other: a missing action keeps its room (a spacer). Without any action,
  // the title takes the whole width (the point of sale's "Amount" / "Items" / "Scan").
  const side = (actions: readonly HeaderAction[], at: "left" | "right") => {
    if (slots === 0) return null;
    if (slots === 1) return action(actions[0], at);
    const kept = Array.from({ length: slots }, (_, i) =>
      at === "left" ? actions[i] : actions[i - (slots - actions.length)]
    );
    return (
      <View style={styles.actions}>
        {kept.map((a, i) => action(a, at, at === "left" ? i === 0 : i === slots - 1, i))}
      </View>
    );
  };

  return (
    <Animated.View
      style={[styles.screen, { paddingTop: insets.top }, toWindowEdge ? null : bottomPadding]}
    >
      <View style={styles.header}>
        {side(leadingActions, "left")}
        <View style={styles.headerTitle}>
          {typeof title === "string" ? (
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        {side(trailingActions, "right")}
      </View>
      <View style={[styles.content, flush && styles.flush, contentStyle]}>
        <UnderDockFrameProvider value={frame}>{children}</UnderDockFrameProvider>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  header: {
    height: HEADER_HEIGHT,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitle: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  title: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  spacer: { width: 44 },
  actions: { flexDirection: "row", alignItems: "center" },
  content: { flex: 1, paddingHorizontal: gutter, minHeight: 0 },
  flush: { paddingHorizontal: 0 },
  desktopHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    paddingTop: 30,
    paddingHorizontal: 38,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  desktopTitles: { gap: 4, flexShrink: 1 },
  desktopTitle: {
    ...sans(700),
    fontSize: 28,
    letterSpacing: tracking(TITLE_EM, 28),
    lineHeight: 28 * 1.1,
    color: colors.text.primary
  },
  desktopSubtitle: { ...sans(500), fontSize: 14, color: colors.text.secondary },
  desktopBody: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: 38
  }
}));
