import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { NAV_EASING } from "@/components/ui/easing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { outOfReach } from "@/components/ui/reach";
import { useInvoiceWait } from "@/features/terminal/pos";
import { makeStyles, motion, palette, radius, sans, tracked, type, useTheme } from "@/theme";

import type { NavigationProps } from "./AppShell";
import { MEMBER_DESTINATIONS, type Destination } from "./destinations";
import { useShownDockArea } from "./dock-area";
import {
  DOCK,
  DOCK_HEIGHT,
  MEMBER_DOCK,
  memberDockLayout,
  type PillSizes,
  type Place
} from "./dock-layout";
import { destinationIcon, destinationLabel, destinationName, InvoiceWaitDot } from "./invoice-wait";
import { useEased, useHeldThroughFade, useSlotMark } from "./motion";
import { PillMeasures, useMeasuredSizes, type MeasuredSizes } from "./PillMeasures";

/** The icon of the screen shown, beside its name; the others' are larger. */
const ACTIVE_ICON = 16;
const ICON = 18;

/**
 * An employee's dock (a minimal navigation): "Charge", "My activity" and "Settings", the screen
 * shown in a sand pill with its
 * name, like "Charge" in the owner's till mode. No padlock, no "More": nothing else is the
 * employee's. It leaves while an invoice is shown and over a screen of the whole window, as the
 * owner's dock.
 */
export function MemberNavigation({ current, navigate }: NavigationProps) {
  const styles = useStyles();
  const { bottom, hidden, shown } = useShownDockArea();
  const reduceMotion = useReducedMotion();
  const invoiceWait = useHeldThroughFade(useInvoiceWait(), !hidden, motion.navDock);
  // With Reduce Motion, the dock only fades.
  const dockStyle = useAnimatedStyle(
    () => ({
      opacity: shown.get(),
      transform: [{ translateY: reduceMotion ? 0 : (1 - shown.get()) * (DOCK_HEIGHT + bottom) }]
    }),
    [bottom, reduceMotion]
  );
  return (
    // A plain view whose box-none comes from its sheet: the web applies it from a class, not from
    // an inline style (Reanimated's there).
    <View style={[styles.area, { paddingBottom: bottom }]}>
      <Animated.View
        // Only the pill takes taps: around it, the screen under the dock. A prop, not a style:
        // inline (Reanimated's on the web), box-none is no CSS value.
        pointerEvents={hidden ? "none" : "box-none"}
        style={[styles.dockRow, dockStyle]}
        {...outOfReach(hidden)}
      >
        <MemberDock
          destinations={MEMBER_DESTINATIONS}
          member
          current={current}
          invoiceWait={invoiceWait}
          navigate={navigate}
        />
      </Animated.View>
    </View>
  );
}

type MemberDockProps = Pick<NavigationProps, "current" | "navigate"> & {
  destinations: readonly Destination[];
  member: boolean;
  invoiceWait: ReturnType<typeof useInvoiceWait>;
};

/**
 * The pill, and the widths of the names it shows, measured off screen. Its content is placed at
 * once when they are first known (mounted again), then animated as the screen shown changes: the
 * sand mark slides to its slot, which widens for its name while the one left narrows, and the dock
 * follows (dock-layout.ts), as in the owner's dock.
 */
function MemberDock(props: MemberDockProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [measured, onSize] = useMeasuredSizes();
  const sizes = completeSizes(measured, props.destinations);
  return (
    <View
      role="navigation"
      accessibilityLabel={t("navigation.label")}
      style={styles.dock}
      testID="dock"
    >
      <MemberDockBody key={sizes ? "measured" : "unmeasured"} {...props} sizes={sizes} />
      {/* The icons as the slot of the screen shown draws them, beside its name. */}
      <PillMeasures
        destinations={props.destinations}
        iconSize={ACTIVE_ICON}
        labelStyle={styles.label}
        member={props.member}
        onSize={onSize}
      />
    </View>
  );
}

function completeSizes(
  measured: MeasuredSizes,
  destinations: readonly Destination[]
): PillSizes[] | null {
  const sizes: PillSizes[] = [];
  for (const destination of destinations) {
    const { icon, label } = measured[destination] ?? {};
    if (icon === undefined || label === undefined) return null;
    sizes.push({ icon, label });
  }
  return sizes;
}

function MemberDockBody({
  destinations,
  member,
  current,
  navigate,
  invoiceWait,
  sizes
}: MemberDockProps & { sizes: PillSizes[] | null }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const active = current === null ? -1 : destinations.indexOf(current);
  // Down to 12 px from the screen's edges (the row's padding), then the name is cut.
  const maxWidth = windowWidth - 2 * DOCK.edge;
  const layout = memberDockLayout(destinations.length, active, sizes, maxWidth);
  // Eased like the slots: its edges follow the first and the last, never clip them.
  const width = useEased(layout.width, { animate: !reduceMotion });
  const widthStyle = useAnimatedStyle(() => ({ width: width.get() }));
  const { markLeft, markWidth, markShown } = useSlotMark(active, layout.slots);
  const markStyle = useAnimatedStyle(() => ({
    opacity: markShown.get(),
    left: DOCK.padding + markLeft.get(),
    width: markWidth.get()
  }));
  return (
    <Animated.View style={[styles.body, widthStyle]}>
      <Animated.View style={[styles.mark, markStyle, styles.passThrough]} testID="dock-mark" />
      {destinations.map((destination, index) => (
        <MemberSlot
          key={destination}
          index={index}
          destination={destination}
          member={member}
          place={layout.slots[index]!}
          active={index === active}
          labelled={index === layout.labelled}
          labelWidth={index === layout.labelled ? layout.labelWidth : 0}
          natural={sizes?.[index]?.label ?? 0}
          wait={destination === "pos" && current !== "pos" ? invoiceWait : null}
          onPress={() => navigate(destination)}
        />
      ))}
    </Animated.View>
  );
}

function MemberSlot({
  index,
  destination,
  member,
  place,
  active,
  labelled,
  labelWidth,
  natural,
  wait,
  onPress
}: {
  index: number;
  destination: Destination;
  member: boolean;
  place: Place;
  /** The screen shown. */
  active: boolean;
  /** Shows its name (the screen shown, once the names are measured). */
  labelled: boolean;
  /** Room for its name while labelled: less than the name when it is cut ("…"). */
  labelWidth: number;
  /** The name's measured width. */
  natural: number;
  wait: ReturnType<typeof useInvoiceWait>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const left = useEased(place.left, { animate: !reduceMotion });
  const width = useEased(place.width, { animate: !reduceMotion });
  const placeStyle = useAnimatedStyle(() => ({
    left: DOCK.padding + left.get(),
    width: width.get()
  }));
  // The name: its room opens with the slot, it comes in once there is room and leaves at once.
  // Kept once shown, while it fades and after (adjusted while rendering); none before.
  const [named, setNamed] = useState(labelled);
  if (labelled && !named) setNamed(true);
  const room = useEased(labelled ? MEMBER_DOCK.gap + labelWidth : 0, { animate: !reduceMotion });
  const nameShown = useEased(labelled ? 1 : 0, {
    duration: labelled ? motion.navLabelIn : motion.navLabelOut,
    delay: labelled ? motion.navEnterDelay : 0
  });
  const roomStyle = useAnimatedStyle(() => ({ width: room.get() }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameShown.get() }));
  // Cut ("…") only when the dock has no room for the whole name (narrow screens, large text).
  const cut = labelled && labelWidth < natural - 0.5;
  return (
    <Animated.View style={[styles.slotPlace, placeStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={destinationLabel(destination, wait, t, member)}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={styles.slot}
        testID={`dock-slot-${index}`}
      >
        <View>
          <ResizingIcon
            name={destinationIcon(destination, member)}
            size={active ? ACTIVE_ICON : ICON}
            color={active ? palette.orange : colors.text.secondary}
            testID={`dock-slot-${index}-icon`}
          />
          {wait ? (
            <InvoiceWaitDot
              wait={wait}
              style={[styles.iconDot, styles.passThrough]}
              testID={`dock-slot-${index}-pending`}
            />
          ) : null}
        </View>
        <Animated.View style={[styles.labelRoom, roomStyle]}>
          {named ? (
            <Animated.View
              style={[
                styles.labelBox,
                { left: MEMBER_DOCK.gap, width: cut ? labelWidth : natural + 2 },
                nameStyle
              ]}
            >
              <Text numberOfLines={1} style={styles.label} testID={`dock-label-${index}`}>
                {destinationName(destination, t, member)}
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * An icon whose size eases to a new one: drawn at once at its new size, it starts scaled to the
 * size before. Nothing moves at the first render; with Reduce Motion, it changes at once.
 */
function ResizingIcon({
  name,
  size,
  color,
  testID
}: {
  name: IconName;
  size: number;
  color: string;
  testID: string;
}) {
  // The size before (adjusted while rendering): each change, a new size, starts its own scaling.
  const [shown, setShown] = useState({ size, from: size });
  if (shown.size !== size) setShown({ size, from: shown.size });
  return (
    <ScaledIn key={shown.size} from={shown.from / shown.size} testID={testID}>
      <Icon name={name} size={shown.size} color={color} />
    </ScaledIn>
  );
}

function ScaledIn({
  from,
  testID,
  children
}: {
  from: number;
  testID: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : from);
  useEffect(() => {
    scale.set(
      withTiming(1, {
        duration: motion.navIndicator,
        easing: NAV_EASING,
        reduceMotion: ReduceMotion.Never
      })
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // Over the bottom of the screens, as the owner's dock (dock-area.tsx).
  area: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    overflow: "visible",
    pointerEvents: "box-none"
  },
  dockRow: { alignItems: "center", paddingHorizontal: DOCK.edge },
  dock: {
    height: DOCK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  // The slots are placed by the dock's layout, in a body as wide as they are.
  body: { height: DOCK_HEIGHT },
  mark: {
    position: "absolute",
    top: DOCK.padding,
    height: DOCK.item,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  slotPlace: { position: "absolute", top: DOCK.padding, height: DOCK.item },
  slot: {
    width: "100%",
    height: DOCK.item,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  },
  labelRoom: { alignSelf: "stretch", overflow: "hidden" },
  labelBox: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  passThrough: { pointerEvents: "none" },
  iconDot: { position: "absolute", top: -2, right: -8 },
  label: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  }
}));
