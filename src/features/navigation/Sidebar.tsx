import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/layout/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import { Avatar } from "@/components/ui/Avatar";
import { NAV_EASING } from "@/components/ui/easing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { usePulse } from "@/components/ui/pulse";
import { outOfReach } from "@/components/ui/reach";
import { Spinner } from "@/components/ui/Spinner";
import { useHover } from "@/components/ui/useHover";
import { VersionTag } from "@/components/VersionLabel";
import { useImageUri } from "@/features/media/images";
import { useBranding } from "@/features/terminal/branding";
import { useInvoiceWait, usePos, type InvoiceWait } from "@/features/terminal/pos";
import { makeStyles, motion, palette, radius, sans, tracked, type, useTheme } from "@/theme";

import type { NavigationProps } from "./AppShell";
import {
  CARD_HOLDER_SIDEBAR_GROUPS,
  MEMBER_SIDEBAR_GROUPS,
  SIDEBAR_GROUPS,
  homeOf,
  opensInTillMode,
  type Destination,
  type SidebarGroup
} from "./destinations";
import { ICON_GESTURES } from "./icon-gestures";
import { destinationIcon, destinationLabel, destinationName, InvoiceWaitDot } from "./invoice-wait";
import { markDuration, useEased } from "./motion";

export const SIDEBAR_WIDTH = 248;
const ROW_HEIGHT = 44;

/** The ease of an icon's gesture over its keyframes (ICON_GESTURES), "gesture" kind. */
const GESTURE_EASING = Easing.bezier(0.3, 0, 0.2, 1);

/**
 * Desktop side bar, in ink: the logo with the build right of it (VersionTag), three groups, the
 * terms and the privacy policy at the bottom (LegalLinks), then the business card, "Switch to till
 * mode" as a padlock at its end (TillModeButton). A lighter pill slides to the
 * active row, for longer the further it goes (markDuration); it holds a copy of the rows in their
 * active look (white, bold, orange icon), clipped to it, so each name turns active exactly where
 * the pill passes, as the segmented control's thumb does. The icon it reaches makes its own small
 * gesture (icon-gestures.ts). In till mode every
 * row but the point of sale and "Settings" (reduced: TILL_MODE_DESTINATIONS) carries a padlock
 * and a click asks for the passkey, then shows that row's screen; unlocked, the padlocks fade out
 * one after the other and the business card's padlock fades in. No
 * customisation. An employee's device (`member`): "Charge", "My activity" and "Settings"
 * only, never locked, no till mode: its business card has no padlock. A card holder's (`kind`):
 * "Cards" and "Settings", both shown locked ("Cards" asks the passkey in its screen), no business
 * card (the account has no business) and "Lock the app" in its place once unlocked.
 */
export function Sidebar({
  kind,
  current,
  unlocked,
  unlocking,
  preparing,
  invoiceShown,
  navigate,
  unlock,
  lock,
  member = false
}: NavigationProps & { member?: boolean }) {
  const styles = useStyles();
  const groupsShown = member
    ? MEMBER_SIDEBAR_GROUPS
    : kind === "cardHolder"
      ? CARD_HOLDER_SIDEBAR_GROUPS
      : SIDEBAR_GROUPS;
  const home = member ? "pos" : homeOf(kind);
  const rowOrder = groupsShown.flatMap((group) => group.items);
  const { t } = useTranslation();
  // Read here, not in AppShell: subscribed, the shell (left out of the React Compiler) would render
  // again with every screen it holds. Its own context: not again at each key of the keypad.
  const invoiceWait = useInvoiceWait();
  // "Charge"'s dot, only seen from another screen: not on the invoice itself, nor in till mode
  // (it only shows the point of sale: a locked screen goes back to it).
  const posWait = unlocked && !invoiceShown ? invoiceWait : null;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // Where each group sits in the list, and each row in its group, for the sliding pill.
  const [groups, setGroups] = useState<Partial<Record<string, number>>>({});
  const [rows, setRows] = useState<Partial<Record<Destination, number>>>({});
  // The locked row clicked, whose padlock pulses while the passkey is asked.
  const [asked, setAsked] = useState<Destination | null>(null);

  const markGroup =
    groupsShown.find((group) => group.items.includes(current ?? home)) ?? groupsShown[0]!;
  const groupTop = groups[markGroup.key];
  const rowTop = rows[current ?? home];
  const markTop = groupTop === undefined || rowTop === undefined ? undefined : groupTop + rowTop;
  // Where the pill goes, how long it takes from where it was, and when it reaches the row shown,
  // for its icon's gesture (adjusted while rendering). A row shown where the pill already is (back
  // from a destination of another kind of device, to the home it went to) is reached at once.
  const [placed, setPlaced] = useState<{
    top: number;
    duration: number;
    reach: number;
    current: Destination | null;
  } | null>(null);
  if (markTop !== undefined && (placed?.top !== markTop || placed.current !== current)) {
    const moves = placed !== null && placed.top !== markTop;
    const duration = moves
      ? markDuration(markTop - placed.top)
      : (placed?.duration ?? motion.navMarkMin);
    setPlaced({ top: markTop, duration, reach: moves ? Math.round(duration / 2) : 0, current });
  }
  // Placed, hidden while the row shown is not laid out: never left on another row. Before it is
  // placed, it shows at once when it mounts, as the row's own fill leaves.
  const markShown = useEased(
    current === null || (placed !== null && markTop === undefined) ? 0 : 1,
    {
      duration: motion.fast
    }
  );
  // With Reduce Motion, no pill: the row shown fades in its own fill (Row's `filled`). Before the
  // rows are laid out, the row shown draws its own active look too, as the pill will.
  const pill = !reduceMotion && placed !== null ? placed : null;

  const rowProps = (destination: Destination) => {
    const locked = !unlocked && !opensInTillMode(destination, kind);
    return {
      destination,
      member,
      locked,
      pulsing: unlocking && asked === destination,
      preparing: locked && preparing,
      wait: destination === "pos" ? posWait : null,
      // Padlocks leave one after the other, from the top.
      delay: locked ? 0 : rowOrder.indexOf(destination) * motion.navStagger
    };
  };

  return (
    // The band under the status bar keeps the app's background: the light theme's status bar
    // content
    // is dark (_layout.tsx), unreadable over ink on a tablet. On the web, no band.
    <View style={[styles.frame, { paddingTop: insets.top }]} testID="sidebar-frame">
      {/* Scrolls only in a window too short for it (a laptop's 1366 × 768 screen: eight rows since
          "Cards"); otherwise laid out as is, the business card at the bottom. */}
      <ScrollView
        role="navigation"
        accessibilityLabel={t("navigation.label")}
        style={styles.root}
        // Still while it fits (iOS bounces a scroll view by default).
        alwaysBounceVertical={false}
        indicatorStyle="white"
        contentContainerStyle={[styles.content, { paddingBottom: 22 + insets.bottom }]}
        testID="sidebar"
      >
        <View style={styles.logo} testID="sidebar-logo">
          <Logo width={150} tone="light" />
          <VersionTag testID="sidebar-version" />
        </View>
        <View style={styles.list}>
          {groupsShown.map((group, index) => (
            <Group
              key={group.key}
              group={group}
              first={index === 0}
              testID={`sidebar-group-${group.key}`}
              onLayout={(event) => {
                const y = event.nativeEvent.layout.y;
                setGroups((known) => ({ ...known, [group.key]: y }));
              }}
            >
              {group.items.map((destination) => {
                const props = rowProps(destination);
                return (
                  <Row
                    key={destination}
                    {...props}
                    active={destination === current}
                    filled={destination === current && pill === null}
                    animateFill={reduceMotion}
                    onLayout={(event) => {
                      const y = event.nativeEvent.layout.y;
                      setRows((known) => ({ ...known, [destination]: y }));
                    }}
                    onPress={() => {
                      if (!props.locked) {
                        // "Charge" while the passkey is asked: the row asked no longer opens
                        // (AppShell), its padlock stops pulsing.
                        setAsked(null);
                        navigate(destination);
                        return;
                      }
                      setAsked(destination);
                      // Shown once the passkey opened the account.
                      unlock(destination);
                    }}
                  />
                );
              })}
            </Group>
          ))}
          {pill ? (
            <Mark top={pill.top} duration={pill.duration} shown={markShown}>
              {groupsShown.map((group, index) => (
                <Group key={group.key} group={group} first={index === 0}>
                  {group.items.map((destination) => (
                    <InkRow
                      key={destination}
                      {...rowProps(destination)}
                      active={destination === current}
                      // The gesture plays as the pill reaches its row (half its slide).
                      gestureDelay={pill.reach}
                    />
                  ))}
                </Group>
              ))}
            </Mark>
          ) : null}
        </View>
        <View style={styles.push} />
        {/* The terms and the privacy policy, from every screen (LegalLinks.tsx). */}
        <LegalLinks onDark align="start" style={styles.legal} testID="sidebar-legal" />
        {kind === "cardHolder" ? (
          <LockAppAction shown={unlocked} onPress={lock} />
        ) : (
          <BusinessCard till={member ? null : { shown: unlocked, onPress: lock }} />
        )}
      </ScrollView>
    </View>
  );
}

/** A group of rows under its title: the list's, or its copy in the pill (same layout). */
function Group({
  group,
  first,
  testID,
  onLayout,
  children
}: {
  group: SidebarGroup;
  first: boolean;
  testID?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.group} testID={testID} onLayout={onLayout}>
      <Text style={[styles.groupLabel, !first && styles.groupLabelNext]}>
        {t(`navigation.groups.${group.key}`)}
      </Text>
      {children}
    </View>
  );
}

/**
 * The pill of the active row, mounted once the rows are laid out: placed on its first row without
 * sliding there from the top of the list (the side bar shown again after a screen of the whole
 * window, a window widened to the desktop width), then sliding from row to row in `duration`. It
 * clips `children`, the rows in their active look, held over the rows they copy wherever it is.
 * Out of reach of screen readers and clicks: the rows below are the navigation.
 */
function Mark({
  top,
  duration,
  shown,
  children
}: {
  top: number;
  duration: number;
  shown: SharedValue<number>;
  children: ReactNode;
}) {
  const styles = useStyles();
  const y = useEased(top, { duration });
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: y.get() }]
  }));
  const inkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -y.get() }] }));
  return (
    <Animated.View
      collapsable={false}
      style={[styles.mark, style, styles.passThrough]}
      {...outOfReach(true)}
      testID="sidebar-mark"
    >
      <Animated.View collapsable={false} style={[styles.ink, inkStyle]} testID="sidebar-ink">
        {children}
      </Animated.View>
    </Animated.View>
  );
}

type RowState = {
  destination: Destination;
  /** An employee's device: "My activity" for "Wallet". */
  member: boolean;
  locked: boolean;
  pulsing: boolean;
  /** Web: locked while the SDK loads, the padlock is a spinner and a click does nothing. */
  preparing: boolean;
  /** What the point of sale's invoice waits for: its dot right of the name. */
  wait: InvoiceWait;
  delay: number;
};

type RowProps = RowState & {
  active: boolean;
  /** The row's own fill and active look: no pill draws them (Reduce Motion, not laid out yet). */
  filled: boolean;
  /** The fill fades (Reduce Motion); otherwise it leaves at once, the pill taking over. */
  animateFill: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
};

function Row({
  destination,
  member,
  locked,
  pulsing,
  preparing,
  wait,
  delay,
  active,
  filled,
  animateFill,
  onLayout,
  onPress
}: RowProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  const name = destinationName(destination, t, member);
  const fill = useEased(filled ? 1 : 0, { duration: motion.fast, animate: animateFill });
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.get() }));
  // The hover fades in and out, never on the row shown.
  const hover = useEased(hovered && !active ? 1 : 0, { duration: motion.fast });
  const hoverStyle = useAnimatedStyle(() => ({ opacity: hover.get() }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? t("navigation.lock.lockedLabel", { name })
          : destinationLabel(destination, wait, t, member)
      }
      accessibilityState={{ selected: active, busy: pulsing || preparing }}
      onPress={onPress}
      disabled={preparing}
      onLayout={onLayout}
      {...hoverProps}
      style={styles.row}
      testID={`sidebar-${destination}`}
    >
      <Animated.View
        style={[styles.rowHover, hoverStyle, styles.passThrough]}
        testID={`sidebar-${destination}-hover`}
      />
      <Animated.View style={[styles.rowFill, fillStyle, styles.passThrough]} />
      <RowContent
        destination={destination}
        member={member}
        locked={locked}
        pulsing={pulsing}
        preparing={preparing}
        wait={wait}
        delay={delay}
        look={filled ? "active" : "idle"}
        testPrefix={`sidebar-${destination}`}
      />
    </Pressable>
  );
}

/** A row's copy in the pill: its active look, its icon making its gesture when it becomes active. */
function InkRow({
  active,
  gestureDelay,
  ...state
}: RowState & { active: boolean; gestureDelay: number }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <RowContent
        {...state}
        look="active"
        gesture={{ active, delay: gestureDelay }}
        testPrefix={`sidebar-ink-${state.destination}`}
      />
    </View>
  );
}

function RowContent({
  destination,
  member,
  locked,
  pulsing,
  preparing,
  wait,
  delay,
  look,
  gesture,
  testPrefix
}: RowState & {
  look: "idle" | "active";
  gesture?: { active: boolean; delay: number };
  testPrefix: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const name = destinationName(destination, t, member);
  const padlock = useEased(locked ? 1 : 0, { duration: motion.navDock, delay });
  const pulse = usePulse(pulsing);
  // With Reduce Motion, the padlocks only fade.
  const padlockStyle = useAnimatedStyle(
    () => ({
      opacity: padlock.get() * pulse.get(),
      transform: [{ scale: reduceMotion ? 1 : 0.6 + padlock.get() * 0.4 }]
    }),
    [reduceMotion]
  );
  const active = look === "active";
  const iconName = destinationIcon(destination, member);
  const iconColor = active
    ? palette.orange
    : locked
      ? colors.sidebar.iconLocked
      : colors.sidebar.icon;

  return (
    <>
      {gesture ? (
        <GesturedIcon
          name={iconName}
          color={iconColor}
          active={gesture.active}
          delay={gesture.delay}
          testID={`${testPrefix}-icon`}
        />
      ) : (
        <Icon name={iconName} size={15} color={iconColor} style={styles.icon} />
      )}
      <View style={styles.rowName}>
        <Text numberOfLines={1} style={[styles.rowLabel, active && styles.rowLabelActive]}>
          {name}
        </Text>
        {wait ? <InvoiceWaitDot wait={wait} testID={`${testPrefix}-pending`} /> : null}
      </View>
      {/* Never locked on an employee's device: no room kept for a padlock, the name gets it ("A
          minha atividade" was cut). The owner's rows keep it, their names do not move as the
          padlocks fade out. */}
      {member ? null : (
        <Animated.View style={padlockStyle} testID={`${testPrefix}-padlock`}>
          {preparing ? (
            <Spinner size={12} rail={colors.onDark.ring} testID={`${testPrefix}-spinner`} />
          ) : (
            <Icon name="lock" size={10} color={colors.sidebar.iconLocked} />
          )}
        </Animated.View>
      )}
    </>
  );
}

/**
 * A row's icon in the pill: each time its row becomes active (not as it mounts), it makes its
 * gesture (ICON_GESTURES) after `delay`, as it was then: a later slide of the pill plays nothing
 * again. None with Reduce Motion: the pill, and so this icon, is not drawn then. One cut short
 * leaves the icon at rest.
 */
function GesturedIcon({
  name,
  color,
  active,
  delay,
  testID
}: {
  name: IconName;
  color: string;
  active: boolean;
  delay: number;
  testID: string;
}) {
  const styles = useStyles();
  const gesture = ICON_GESTURES[name];
  const progress = useSharedValue(0);
  // Whether the row was active at the last render, and the last time it became active since
  // mounted, null before (adjusted while rendering): a new object each time, played once.
  const [wasActive, setWasActive] = useState(active);
  const [play, setPlay] = useState<{ delay: number } | null>(null);
  if (wasActive !== active) {
    setWasActive(active);
    if (active) setPlay({ delay });
  }
  useEffect(() => {
    if (play === null || !gesture) return;
    progress.set(0);
    const timing = withTiming(1, {
      duration: gesture.duration,
      easing: gesture.easing === "turn" ? NAV_EASING : GESTURE_EASING,
      reduceMotion: ReduceMotion.Never
    });
    progress.set(withDelay(play.delay, timing, ReduceMotion.Never));
    return () => {
      cancelAnimation(progress);
      progress.set(0);
    };
  }, [play, gesture, progress]);

  const at = gesture?.at ?? [0, 1];
  const rest = (value: number) => at.map(() => value);
  const x = gesture?.x ?? rest(0);
  const y = gesture?.y ?? rest(0);
  const rotate = gesture?.rotate ?? rest(0);
  const scale = gesture?.scale ?? rest(1);
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      transform: [
        { translateX: interpolate(p, at, x) },
        { translateY: interpolate(p, at, y) },
        { rotate: `${interpolate(p, at, rotate)}deg` },
        { scale: interpolate(p, at, scale) }
      ]
    };
  });
  return (
    <Animated.View
      style={[styles.icon, { transformOrigin: gesture?.origin ?? "50% 50%" }, style]}
      testID={testID}
    >
      <Icon name={name} size={15} color={color} />
    </Animated.View>
  );
}

/**
 * "Lock the app", on a card holder's device (no till, no business card): rises into place once
 * unlocked, sinks away while locked.
 */
function LockAppAction({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  const reduceMotion = useReducedMotion();
  const progress = useEased(shown ? 1 : 0, {
    duration: motion.navDock,
    delay: shown ? motion.navTillDelay : 0
  });
  const style = useAnimatedStyle(
    () => ({
      opacity: progress.get(),
      height: progress.get() * ROW_HEIGHT,
      transform: [{ translateY: reduceMotion ? 0 : (1 - progress.get()) * 8 }]
    }),
    [reduceMotion]
  );
  return (
    <Animated.View
      style={[styles.lockWrap, { pointerEvents: shown ? "auto" : "none" }, style]}
      // Folded away while locked: out of reach of screen readers and the keyboard too.
      {...outOfReach(!shown)}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={!shown}
        {...hoverProps}
        style={[styles.lockApp, hovered && styles.lockAppHover]}
        testID="till-mode"
      >
        <Icon name="lock" size={13} color={colors.onDark.text} style={styles.icon} />
        <Text numberOfLines={1} style={styles.lockAppLabel}>
          {t("navigation.lock.lockApp")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The business (avatar and name), at the bottom of the side bar; on the owner's device (`till`),
 * "Switch to till mode" at its end (TillModeButton). Not a button itself: nothing to edit there.
 */
function BusinessCard({ till }: { till: { shown: boolean; onPress: () => void } | null }) {
  const styles = useStyles();
  const { profile } = usePos();
  // The business's logo ("Settings"), else its initials.
  const logo = useImageUri(useBranding(profile)?.logo ?? null);
  return (
    <View style={[styles.card, till === null && styles.cardAlone]} testID="business-card">
      {/* Its initials would be read before the name they repeat. */}
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Avatar name={profile.businessName} image={logo} size={28} testID="business-avatar" />
      </View>
      <Text numberOfLines={1} style={styles.business}>
        {profile.businessName}
      </Text>
      {till ? <TillModeButton {...till} /> : null}
    </View>
  );
}

/**
 * "Switch to till mode": a padlock at the end of the business card, its name for screen readers.
 * It fades in once unlocked and out in till mode, keeping its room: the business's name never
 * moves. Its name shows in a tip over the card's end while pointed at (the web, a pointer on an
 * iPad) or focused from the keyboard; the tip is the card's child, as wide as it may need.
 */
function TillModeButton({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { hovered, hoverProps } = useHover();
  const [focused, setFocused] = useState(false);
  const progress = useEased(shown ? 1 : 0, {
    duration: motion.navDock,
    delay: shown ? motion.navTillDelay : 0
  });
  const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const label = t("navigation.lock.tillMode");
  return (
    <>
      {shown && (hovered || focused) ? (
        // The button's own name, already read: out of reach of screen readers.
        <View style={styles.tip} {...outOfReach(true)} testID="till-mode-tip">
          <View style={styles.tipBubble}>
            <Text numberOfLines={1} style={styles.tipLabel}>
              {label}
            </Text>
          </View>
        </View>
      ) : null}
      <Animated.View
        style={[{ pointerEvents: shown ? "auto" : "none" }, style]}
        // Faded out in till mode: out of reach of screen readers and the keyboard too.
        {...outOfReach(!shown)}
        testID="till-mode-wrap"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          disabled={!shown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...hoverProps}
          style={({ pressed }) => [styles.till, (hovered || pressed) && styles.tillHover]}
          testID="till-mode"
        >
          <Icon name="lock" size={15} color={colors.onDark.text} />
        </Pressable>
      </Animated.View>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  frame: {
    width: SIDEBAR_WIDTH,
    // Never narrower nor wider: the screen beside it gives way.
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.background.app
  },
  root: { flex: 1, backgroundColor: colors.sidebar.bg },
  // At least the window's height: `push` keeps the business card at the bottom.
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 22 },
  // The build right of the logo, along its bottom; the logo keeps its width, the build may shorten.
  logo: {
    marginTop: 4,
    marginLeft: 9,
    marginBottom: 26,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6
  },
  list: { position: "relative" },
  group: { gap: 2 },
  mark: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: ROW_HEIGHT,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.sidebar.mark
  },
  // The copy of the list, as wide as the list (the pill's width).
  ink: { position: "absolute", left: 0, right: 0, top: 0 },
  groupLabel: {
    ...sans(600),
    fontSize: type.meta,
    color: colors.sidebar.group,
    paddingHorizontal: 14,
    paddingBottom: 6
  },
  groupLabelNext: { paddingTop: 16 },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: radius.pill
  },
  rowHover: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    backgroundColor: colors.sidebar.hover
  },
  rowFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    backgroundColor: colors.sidebar.mark
  },
  icon: { width: 20, alignItems: "center" },
  rowName: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  // Medium, dimmed; the active row's Bold, in white.
  rowLabel: { ...sans(500), flexShrink: 1, fontSize: type.body, color: colors.sidebar.label },
  rowLabelActive: { ...sans(700), color: colors.sidebar.labelActive },
  push: { flex: 1, minHeight: 16 },
  lockWrap: { overflow: "hidden" },
  passThrough: { pointerEvents: "none" },
  lockApp: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    // Aligned with the rows' icons on the left; the label needs the room on the right.
    paddingLeft: 14,
    paddingRight: 2,
    borderRadius: radius.pill
  },
  lockAppHover: { backgroundColor: colors.sidebar.hover },
  lockAppLabel: {
    ...sans(700),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.onDark.text
  },
  // On the rows' icons.
  legal: { paddingLeft: 14 },
  card: {
    minHeight: ROW_HEIGHT + 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: radius.md,
    backgroundColor: colors.sidebar.card
  },
  // An employee's device: no padlock at its end.
  cardAlone: { paddingRight: 14 },
  till: {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    borderRadius: ROW_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  tillHover: { backgroundColor: colors.sidebar.hover },
  // Over the card's end, as wide as the card: the bubble keeps to its label.
  tip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "100%",
    marginBottom: 6,
    alignItems: "flex-end",
    pointerEvents: "none"
  },
  // White over ink in both themes, as the side bar.
  tipBubble: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.white
  },
  tipLabel: { ...sans(600), fontSize: type.caption, color: palette.ink },
  business: {
    flex: 1,
    minWidth: 0,
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.onDark.text
  }
}));
