import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue
} from "react-native-reanimated";

import { NAV_EASING } from "@/components/ui/easing";
import { Icon, type IconName } from "@/components/ui/Icon";
import { usePulse } from "@/components/ui/pulse";
import { outOfReach } from "@/components/ui/reach";
import { RichText } from "@/components/ui/RichText";
import { Spinner } from "@/components/ui/Spinner";
import { useInvoiceWait, type InvoiceWait } from "@/features/terminal/pos";
import { logFailure } from "@/lib/log/log";
import {
  gutter,
  makeStyles,
  motion,
  palette,
  radius,
  sans,
  tracked,
  type,
  useTheme
} from "@/theme";

import type { NavigationProps } from "./AppShell";
import {
  DEFAULT_DOCK,
  DESTINATION_ICONS,
  DESTINATIONS,
  DOCK_SLOTS,
  keepPlaces,
  restOf,
  swapInDock,
  type Destination
} from "./destinations";
import { useShownDockArea } from "./dock-area";
import {
  DOCK,
  DOCK_HEIGHT,
  dockLayout,
  type DockLayout,
  type PillSizes,
  type PillSpacing,
  type Place
} from "./dock-layout";
import { loadDock, saveDock } from "./dock-store";
import { destinationLabel, InvoiceWaitDot } from "./invoice-wait";
import { useEased, useHeldThroughFade, useSlotMark } from "./motion";
import { PillMeasures, useMeasuredSizes, type MeasuredSizes } from "./PillMeasures";

/** "More" alone: its menu icon's box. */
const MENU_WIDTH = 54;
/**
 * "More" shared with the screen shown when it is out of the dock: the screen's icon, a hairline,
 * the menu. Equal margins outside
 * (19), equal gaps around the hairline (10).
 */
const SPLIT_ICON_LEFT = 19;
const SPLIT_ICON_WIDTH = 18;
const SPLIT_LINE_LEFT = 46;
/** The screen's name shows this long on arrival, then only its icon stays beside the menu. */
const NAME_MS = 2400;
/** How far an icon slides when a swap updates a slot or a tile. */
const SLIDE = 18;
/** The "More" grid's tiles per row. */
const GRID_COLUMNS = 3;

/** The empty cells that complete the grid's last row of `tiles`. */
function emptyCells(tiles: number): number {
  return (GRID_COLUMNS - (tiles % GRID_COLUMNS)) % GRID_COLUMNS;
}

type Panel = "closed" | "more" | "customize";
type Sizes = Readonly<Record<Destination, PillSizes>>;

/**
 * Mobile navigation: a floating white dock over the safe area.
 * - Till mode: "Charge" and a padlock only; the padlock asks for the passkey at once.
 *   Between them, "Settings", reduced, without the passkey.
 * - Unlocked: "Charge" leaves the dock, morphing into four free slots and "More"; the
 *   screen stays the till. Default: Charge, Wallet, Employees, Settings. The slot of the
 *   screen shown also shows its name, like "Charge" in till mode (dock-layout.ts).
 * - "More": the destinations out of the dock, "Customize" and "Switch to till mode".
 * - Personnaliser (mobile only): the slot of the screen shown is selected (orange ring); tap a
 *   slot, then a destination: they swap. Saved on this device.
 * The dock leaves while an invoice is shown (`invoiceShown`): the payment has the whole screen.
 * Drawn over the bottom of the screens (AppShell, dock-area.tsx), what they scroll passing under it;
 * the panel and its scrim cover them.
 */
export function MobileNavigation(navigation: NavigationProps) {
  const styles = useStyles();
  const { current, unlocked, navigate } = navigation;
  // Hidden while the invoice is the screen shown, and over a screen of the whole window (AppShell).
  const { bottom, hidden, shown } = useShownDockArea();
  // Read here, not in AppShell: subscribed, the shell (left out of the React Compiler) would render
  // again with every screen it holds. Its own context: not again at each key of the keypad. Not
  // once the dock is hidden (the invoice shown): its dot would pulse there for nothing. Held as it
  // was through the dock's fade-out: it neither leaves at its start nor appears during it.
  const invoiceWait = useHeldThroughFade(useInvoiceWait(), !hidden, motion.navDock);
  const reduceMotion = useReducedMotion();
  const [dock, setDock] = useState<readonly Destination[]>(DEFAULT_DOCK);
  const [panel, setPanel] = useState<Panel>("closed");
  const [selected, setSelected] = useState(0);
  const open = panel !== "closed" && unlocked && !hidden;

  useEffect(() => {
    let alive = true;
    void loadDock().then((stored) => {
      if (alive && stored) setDock(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Locked or left for an invoice: the panel closes with it (adjusted while rendering).
  if ((!unlocked || hidden) && panel !== "closed") setPanel("closed");

  // Android's back button and the web's Escape close the panel first.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPanel("closed");
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", close);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.addEventListener("keydown", onKey);
    }
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("keydown", onKey);
      }
    };
  }, [open]);

  const go = (destination: Destination) => {
    setPanel("closed");
    navigate(destination);
  };
  const swap = (destination: Destination) => {
    const next = swapInDock(dock, selected, destination);
    setDock(next);
    saveDock(next).catch((error: unknown) => {
      logFailure("Saving the dock failed", error);
    });
  };

  // With Reduce Motion, the dock only fades.
  const dockStyle = useAnimatedStyle(
    () => ({
      opacity: shown.get(),
      transform: [{ translateY: reduceMotion ? 0 : (1 - shown.get()) * (DOCK_HEIGHT + bottom) }]
    }),
    [bottom, reduceMotion]
  );

  return (
    <>
      <MorePanel
        open={open}
        mode={panel === "customize" ? "customize" : "more"}
        bottom={bottom + DOCK_HEIGHT + 10}
        dock={dock}
        current={current}
        invoiceWait={invoiceWait}
        selected={selected}
        onClose={() => setPanel("closed")}
        onCustomize={() => {
          // The slot of the screen shown, when it is in the dock.
          setSelected(Math.max(current === null ? -1 : dock.indexOf(current), 0));
          setPanel("customize");
        }}
        onDone={() => setPanel("more")}
        onGo={go}
        onSwap={swap}
        onLock={() => {
          setPanel("closed");
          navigation.lock();
        }}
      />
      {/* A plain view whose box-none comes from its sheet: the web applies it from a class, not
          from an inline style (Reanimated's there). */}
      <View style={[styles.area, { paddingBottom: bottom }]}>
        <Animated.View
          // Only the pill takes taps: around it, the screen under the dock. A prop, not a style:
          // inline (Reanimated's on the web), box-none is no CSS value.
          pointerEvents={hidden ? "none" : "box-none"}
          style={[styles.dockRow, dockStyle]}
          // Hidden while an invoice shows: out of reach of screen readers and the keyboard too.
          {...outOfReach(hidden)}
        >
          <Dock
            {...navigation}
            invoiceWait={invoiceWait}
            dock={dock}
            panel={panel}
            selected={selected}
            onSelect={setSelected}
            onGo={go}
            onMore={() => setPanel((now) => (now === "closed" ? "more" : "closed"))}
          />
        </Animated.View>
      </View>
    </>
  );
}

type DockProps = NavigationProps & {
  /** What the point of sale's invoice waits for: a dot on "Charge". */
  invoiceWait: InvoiceWait;
  dock: readonly Destination[];
  panel: Panel;
  selected: number;
  onSelect: (slot: number) => void;
  onGo: (destination: Destination) => void;
  onMore: () => void;
};

/**
 * The pill, and the widths of the names it shows, measured off screen. Its content is placed at
 * once when they are first known (mounted again), then animated.
 */
function Dock(props: DockProps) {
  const styles = useStyles();
  const { current, unlocked, dock } = props;
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  // Width of the till-mode layer ("Charge", "Settings", the padlock), measured: its label
  // depends on the language. Kept here, out of the body mounted again once the names are measured:
  // the pill would collapse until measured anew.
  const [lockedWidth, setLockedWidth] = useState(0);
  const [measured, onSize] = useMeasuredSizes();
  const sizes = completeSizes(measured);
  const activeSlot = current === null ? -1 : dock.indexOf(current);
  // The screen shown, when it is out of the dock (opened from "More"). Not in till mode: only
  // the point of sale shows, beside the padlock, even when the dock chosen leaves it out.
  const outOfDock = unlocked && current !== null && activeSlot === -1 ? current : null;
  const layout = dockLayout({
    windowWidth,
    gutter,
    dock,
    active: activeSlot,
    split: outOfDock !== null,
    sizes
  });
  return (
    <View
      role="navigation"
      accessibilityLabel={t("navigation.label")}
      style={styles.dock}
      testID="dock"
    >
      <DockBody
        key={sizes ? "measured" : "unmeasured"}
        {...props}
        activeSlot={activeSlot}
        outOfDock={outOfDock}
        layout={layout}
        sizes={sizes}
        lockedWidth={lockedWidth}
        onLockedWidth={setLockedWidth}
      />
      <PillMeasures
        destinations={DESTINATIONS}
        iconSize={18}
        labelStyle={styles.slotLabel}
        onSize={onSize}
      />
    </View>
  );
}

function completeSizes(measured: MeasuredSizes): Sizes | null {
  const sizes: Partial<Record<Destination, PillSizes>> = {};
  for (const destination of DESTINATIONS) {
    const { icon, label } = measured[destination] ?? {};
    if (icon === undefined || label === undefined) return null;
    sizes[destination] = { icon, label };
  }
  return sizes as Sizes;
}

/** The till-mode layer and the unlocked slots, morphing into each other. */
function DockBody({
  current,
  unlocked,
  unlocking,
  preparing,
  invoiceWait,
  unlock,
  dock,
  panel,
  selected,
  onSelect,
  onGo,
  onMore,
  activeSlot,
  outOfDock,
  layout,
  sizes,
  lockedWidth,
  onLockedWidth
}: DockProps & {
  activeSlot: number;
  outOfDock: Destination | null;
  layout: DockLayout;
  sizes: Sizes | null;
  lockedWidth: number;
  onLockedWidth: (width: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const progress = useEased(unlocked ? 1 : 0, { duration: motion.navDock });
  // The slots' dot, held as it was through their fade-out, none once they faded out. Till mode has
  // none: it only shows the keypad, without an invoice, or the invoice.
  const slotsWait = useHeldThroughFade(invoiceWait, unlocked, motion.navDock);
  const customizing = panel === "customize";
  // "More" shared with the screen out of the dock, the panel open or not: until another
  // screen is shown.
  const split = outOfDock !== null;
  const splitShown = useEased(split ? 1 : 0, { duration: motion.navDock });
  // Eased like the slots (useEased's default duration): its edge follows "More", never clips it.
  const unlockedWidth = useEased(layout.width, { animate: !reduceMotion });

  // Its name, for a moment, each time such a screen is reached (adjusted while rendering).
  const [arrived, setArrived] = useState<Destination | null>(null);
  const [flash, setFlash] = useState<Destination | null>(null);
  if (outOfDock !== arrived) {
    setArrived(outOfDock);
    setFlash(outOfDock);
  }
  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), NAME_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const pillStyle = useAnimatedStyle(
    () => ({
      width:
        lockedWidth === 0
          ? undefined
          : interpolate(progress.get(), [0, 1], [lockedWidth, unlockedWidth.get()])
    }),
    [lockedWidth]
  );
  const lockedStyle = useAnimatedStyle(
    () => ({
      opacity: 1 - progress.get(),
      transform: [{ scale: reduceMotion ? 1 : 1 - progress.get() * 0.08 }]
    }),
    [reduceMotion]
  );

  // Till mode's sand mark: under "Settings" while it shows, under "Charge" otherwise. Its
  // places as laid out (in the layer, its padding included); the mark slides once both are known.
  const tillShown: "pos" | "settings" = current === "settings" ? "settings" : "pos";
  const [tillPlaces, setTillPlaces] = useState<Partial<Record<"pos" | "settings", Place>>>({});
  const onTillPlace = (key: "pos" | "settings", event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setTillPlaces((places) => {
      const known = places[key];
      return known?.left === x && known.width === width
        ? places
        : { ...places, [key]: { left: x, width } };
    });
  };
  const tillMarkPlaces =
    tillPlaces.pos && tillPlaces.settings ? [tillPlaces.pos, tillPlaces.settings] : null;
  const tillMarked = tillMarkPlaces !== null;

  // The mark under the screen shown.
  const { markLeft, markWidth, markShown } = useSlotMark(activeSlot, layout.slots);
  const markStyle = useAnimatedStyle(() => ({
    opacity: markShown.get() * progress.get(),
    left: DOCK.padding + markLeft.get(),
    width: markWidth.get()
  }));

  return (
    <>
      <NameBubble
        destination={split && panel === "closed" && flash === outOfDock ? outOfDock : null}
      />
      <Animated.View style={[styles.pillInner, pillStyle]}>
        {/* Till mode: "Charge" (labelled), "Settings" and the padlock. */}
        <Animated.View
          style={[styles.layer, { pointerEvents: unlocked ? "none" : "auto" }, lockedStyle]}
          // The layer's width includes its own padding (DOCK.padding on each side).
          onLayout={(event) => onLockedWidth(event.nativeEvent.layout.width)}
          // Faded out once unlocked: out of reach of screen readers and the keyboard too.
          {...outOfReach(unlocked)}
        >
          {tillMarked ? (
            <TillMark active={tillShown === "settings" ? 1 : 0} places={tillMarkPlaces} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("navigation.destinations.pos")}
            accessibilityState={{ selected: current === "pos" }}
            onPress={() => onGo("pos")}
            disabled={unlocked}
            // The sand mark on the screen shown: the till's, or "Settings"'s below. Drawn here
            // only until both are laid out, then by TillMark, which slides from one to the other.
            style={[styles.chargePill, !tillMarked && tillShown === "pos" && styles.tillShown]}
            onLayout={(event) => onTillPlace("pos", event)}
            testID="dock-charge"
          >
            <Icon name={DESTINATION_ICONS.pos} size={16} color={palette.orange} />
            <Text style={styles.chargeLabel}>{t("navigation.destinations.pos")}</Text>
          </Pressable>
          {/* "Settings" without the passkey, reduced, before the padlock that opens the rest. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("navigation.destinations.settings")}
            accessibilityState={{ selected: current === "settings" }}
            onPress={() => onGo("settings")}
            disabled={unlocked}
            style={[styles.lock, !tillMarked && tillShown === "settings" && styles.tillShown]}
            onLayout={(event) => onTillPlace("settings", event)}
            testID="dock-settings"
          >
            <Icon
              name={DESTINATION_ICONS.settings}
              size={17}
              color={current === "settings" ? colors.text.primary : colors.text.secondary}
            />
          </Pressable>
          <LockButton
            unlocked={unlocked}
            unlocking={unlocking}
            preparing={preparing}
            // No destination: the screen shown stays.
            onPress={() => unlock(null)}
          />
        </Animated.View>
        {/* Unlocked: four slots and "More". */}
        <View
          // Box-none from the sheet, never inline: the web drops an inline box-none (no CSS value),
          // so the `none` of till mode stayed once unlocked, and no slot took a tap.
          style={[
            styles.slots,
            { width: layout.width },
            unlocked ? styles.boxNone : styles.passThrough
          ]}
          // Faded out in till mode: out of reach of screen readers and the keyboard too.
          {...outOfReach(!unlocked)}
        >
          <Animated.View style={[styles.slotMark, markStyle, styles.passThrough]} />
          {dock.map((destination, index) => (
            <Slot
              key={index}
              index={index}
              destination={destination}
              place={layout.slots[index]!}
              unlocked={unlocked}
              active={index === activeSlot}
              labelled={index === layout.labelled}
              pill={layout.pill}
              labelWidth={layout.labelWidth}
              sizes={sizes}
              customizing={customizing}
              ringed={customizing && index === selected}
              invoiceWait={slotsWait}
              progress={progress}
              onPress={() => (customizing ? onSelect(index) : onGo(destination))}
            />
          ))}
          <MoreButton
            open={panel !== "closed"}
            outOfDock={outOfDock}
            // "Charge" out of the dock: its dot on "More", which holds it.
            wait={dock.includes("pos") ? null : slotsWait}
            place={layout.plus}
            splitShown={splitShown}
            unlocked={unlocked}
            progress={progress}
            onPress={onMore}
          />
        </View>
      </Animated.View>
    </>
  );
}

/**
 * Till mode's sand mark under the screen shown (`active`: 0 "Charge", 1 "Settings"), at
 * `places` as laid out: it slides from one to the other as the unlocked slots' mark does (the
 * dock would otherwise stand still when "Settings" opens). Mounted once both places
 * are known, at its place without sliding; with Reduce Motion, it jumps (useSlotMark).
 */
function TillMark({ active, places }: { active: number; places: readonly Place[] }) {
  const styles = useStyles();
  const { markLeft, markWidth } = useSlotMark(active, places);
  const style = useAnimatedStyle(() => ({ left: markLeft.get(), width: markWidth.get() }));
  return (
    <Animated.View style={[styles.slotMark, style, styles.passThrough]} testID="dock-till-mark" />
  );
}

/**
 * A slot's (or "More"'s) place and entrance. They come in one after the other once unlocked
 * (`order`), all at once when locking; their places follow the dock's layout, at once with Reduce
 * Motion.
 */
function usePlacedStyle({
  place,
  unlocked,
  order,
  progress
}: {
  place: Place;
  unlocked: boolean;
  order: number;
  progress: SharedValue<number>;
}) {
  const reduceMotion = useReducedMotion();
  const entered = useEased(unlocked ? 1 : 0, {
    duration: motion.navDock,
    delay: unlocked ? motion.navEnterDelay + order * motion.navStagger : 0
  });
  const left = useEased(place.left, { animate: !reduceMotion });
  const width = useEased(place.width, { animate: !reduceMotion });
  return useAnimatedStyle(
    () => ({
      left: DOCK.padding + left.get(),
      width: width.get(),
      opacity: entered.get() * progress.get(),
      transform: [{ scale: reduceMotion ? 1 : 0.7 + entered.get() * 0.3 }]
    }),
    [reduceMotion]
  );
}

function LockButton({
  unlocked,
  unlocking,
  preparing,
  onPress
}: {
  unlocked: boolean;
  unlocking: boolean;
  preparing: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const pulse = usePulse(unlocking);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const label = preparing
    ? t("navigation.lock.preparing")
    : unlocking
      ? t("navigation.lock.unlocking")
      : t("navigation.lock.unlock");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: unlocking || preparing }}
      onPress={onPress}
      disabled={unlocking || unlocked || preparing}
      style={styles.lock}
      testID="dock-unlock"
    >
      <Animated.View style={pulseStyle}>
        {/* Web: a spinner until the SDK is loaded. The padlock opens as the dock morphs away from
            till mode. */}
        {preparing ? (
          <Spinner size={20} testID="dock-unlock-spinner" />
        ) : (
          <Icon name={unlocked ? "lock-open" : "lock"} size={18} color={colors.text.secondary} />
        )}
      </Animated.View>
    </Pressable>
  );
}

function Slot({
  index,
  destination,
  place,
  unlocked,
  active,
  labelled,
  pill,
  labelWidth,
  sizes,
  customizing,
  ringed,
  invoiceWait,
  progress,
  onPress
}: {
  index: number;
  destination: Destination;
  place: Place;
  unlocked: boolean;
  /** The screen shown. */
  active: boolean;
  /** Shows the name of its destination (the screen shown, once the names are measured). */
  labelled: boolean;
  pill: PillSpacing;
  labelWidth: number;
  sizes: Sizes | null;
  customizing: boolean;
  ringed: boolean;
  /** What the point of sale's invoice waits for: a dot on its icon. */
  invoiceWait: InvoiceWait;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const style = usePlacedStyle({ place, unlocked, order: index, progress });
  const ring = useEased(ringed ? 1 : 0, { duration: motion.fast });
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));

  // The name: its room opens with the slot, it comes in once there is room and leaves at once.
  // The last one shown stays while it fades (adjusted while rendering); none before.
  const [named, setNamed] = useState(labelled ? destination : null);
  if (labelled && named !== destination) setNamed(destination);
  const room = useEased(labelled ? pill.gap + labelWidth : 0, { animate: !reduceMotion });
  const nameShown = useEased(labelled ? 1 : 0, {
    duration: labelled ? motion.navLabelIn : motion.navLabelOut,
    delay: labelled ? motion.navEnterDelay : 0
  });
  const roomStyle = useAnimatedStyle(() => ({ width: room.get() }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameShown.get() }));
  const natural = named === null ? 0 : (sizes?.[named].label ?? 0);
  // Cut ("…") only when the dock has no room for the whole name (narrow screens).
  const cut = labelled && labelWidth < natural - 0.5;

  const name = destinationLabel(destination, invoiceWait, t);
  const color = active ? palette.orange : ringed ? colors.text.primary : colors.text.secondary;
  return (
    <Animated.View style={[styles.slotPlace, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ringed ? t("navigation.slotLabel", { name, index: index + 1 }) : name}
        // Customising, the slot picked for a swap is the selected one (not the screen shown).
        accessibilityState={{ selected: customizing ? ringed : active }}
        onPress={onPress}
        style={styles.slot}
        testID={`dock-slot-${index}`}
      >
        <Animated.View style={[styles.slotRing, ringStyle, styles.passThrough]} />
        <SlideSwap
          value={destination}
          rise={SLIDE}
          render={(shown) => (
            <DestinationIcon
              destination={shown}
              size={18}
              color={color}
              wait={invoiceWait}
              testID={`dock-slot-${index}-pending`}
            />
          )}
        />
        <Animated.View style={[styles.labelRoom, roomStyle]}>
          {named !== null ? (
            <Animated.View
              style={[
                styles.labelBox,
                { left: pill.gap, width: cut ? labelWidth : natural + 2 },
                nameStyle
              ]}
            >
              <Text numberOfLines={1} style={styles.slotLabel} testID={`dock-label-${index}`}>
                {t(`navigation.destinations.${named}`)}
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * "More": opens the panel, a cross while it is open. When the screen shown is out of the dock,
 * it widens into a sand pill shared with that screen: its icon, a hairline, the menu, which always
 * stays in sight.
 */
function MoreButton({
  open,
  outOfDock,
  wait,
  place,
  splitShown,
  unlocked,
  progress,
  onPress
}: {
  open: boolean;
  /** The screen shown when it is out of the dock, else null. */
  outOfDock: Destination | null;
  /** What the invoice of "Charge", in the panel (out of the dock), waits for. */
  wait: InvoiceWait;
  place: Place;
  splitShown: SharedValue<number>;
  unlocked: boolean;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  // Kept while the pill narrows back: the icon fades out instead of vanishing.
  const [shownIcon, setShownIcon] = useState(outOfDock);
  if (outOfDock !== null && outOfDock !== shownIcon) setShownIcon(outOfDock);
  const style = usePlacedStyle({ place, unlocked, order: DOCK_SLOTS, progress });
  // The menu's box: on the right of the shared pill, the whole button otherwise.
  const menuWidth = useEased(outOfDock !== null ? MENU_WIDTH : place.width, {
    animate: !reduceMotion
  });
  const menuStyle = useAnimatedStyle(() => ({ width: menuWidth.get() }));
  const filled = useEased(open || outOfDock !== null ? 1 : 0, { duration: motion.fast });
  const fillStyle = useAnimatedStyle(() => ({ opacity: filled.get() }));
  const splitStyle = useAnimatedStyle(() => ({ opacity: splitShown.get() }));
  const more =
    outOfDock !== null
      ? t("navigation.moreWith", { name: t(`navigation.destinations.${outOfDock}`) })
      : t("navigation.more");
  const label = open
    ? t("navigation.close")
    : wait
      ? t("navigation.moreWithWait", { more, name: destinationLabel("pos", wait, t) })
      : more;
  return (
    <Animated.View style={[styles.slotPlace, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={styles.more}
        testID="dock-more"
      >
        <Animated.View style={[styles.slotFill, fillStyle, styles.passThrough]} />
        {shownIcon ? (
          <Animated.View
            style={[styles.splitPart, splitStyle, styles.passThrough]}
            testID="dock-more-screen"
          >
            <View style={styles.splitIcon}>
              <Icon name={DESTINATION_ICONS[shownIcon]} size={17} color={palette.orange} />
            </View>
            <View style={styles.splitLine} />
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.menuIcon, menuStyle]}>
          <SwapIn key={open ? "close" : "more"}>
            <WaitIcon
              name={open ? "xmark" : "grip"}
              size={18}
              color={open ? colors.text.primary : colors.text.secondary}
              // Open, the tile of "Charge" carries it.
              wait={open ? null : wait}
              testID="dock-more-pending"
            />
          </SwapIn>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** The name of a screen out of the dock, above "More", for a moment after reaching it. */
function NameBubble({ destination }: { destination: Destination | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  // Kept while it fades out.
  const [shown, setShown] = useState(destination);
  if (destination !== null && destination !== shown) setShown(destination);
  const visible = useEased(destination !== null ? 1 : 0, { duration: motion.navPanel });
  const style = useAnimatedStyle(
    () => ({
      opacity: visible.get(),
      transform: [
        { translateY: reduceMotion ? 0 : (1 - visible.get()) * 6 },
        { scale: reduceMotion ? 1 : 0.92 + visible.get() * 0.08 }
      ]
    }),
    [reduceMotion]
  );
  if (shown === null) return null;
  return (
    <Animated.View
      style={[styles.bubble, style, styles.passThrough]}
      accessibilityLiveRegion="polite"
      testID="dock-name"
    >
      <Icon name={DESTINATION_ICONS[shown]} size={13} color={palette.orange} />
      <Text style={styles.bubbleLabel}>{t(`navigation.destinations.${shown}`)}</Text>
      <View style={styles.bubbleCaret} />
    </Animated.View>
  );
}

type MorePanelProps = {
  open: boolean;
  mode: "more" | "customize";
  bottom: number;
  dock: readonly Destination[];
  current: Destination | null;
  invoiceWait: InvoiceWait;
  selected: number;
  onClose: () => void;
  onCustomize: () => void;
  onDone: () => void;
  onGo: (destination: Destination) => void;
  onSwap: (destination: Destination) => void;
  onLock: () => void;
};

/**
 * "More" and "Customize the bar": a white card rising from the
 * dock over a scrim. The grid always shows what is not in the dock.
 */
function MorePanel({ open, mode, bottom, onClose, ...body }: MorePanelProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const shown = useEased(open ? 1 : 0, { duration: motion.navPanel });
  // Kept mounted while it fades out; its content is new at each opening, even one while it
  // still fades out (adjusted while rendering), and keeps its mode while it fades out.
  const [mounted, setMounted] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  const [opening, setOpening] = useState(0);
  const [shownMode, setShownMode] = useState(mode);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMounted(true);
      setOpening(opening + 1);
    }
  }
  if (open && shownMode !== mode) setShownMode(mode);
  // Only once it was shown: a timer setting `mounted` to false while it already is leaves an
  // update React replays after the next opening, which then unmounts the panel at once (seen on
  // the web: "More" opened from the first screen showed nothing).
  useEffect(() => {
    if (open || !mounted) return;
    const timer = setTimeout(() => setMounted(false), motion.navPanel);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const cardStyle = useAnimatedStyle(
    () => ({
      opacity: shown.get(),
      transform: reduceMotion
        ? []
        : [{ translateY: (1 - shown.get()) * 14 }, { scale: 0.97 + shown.get() * 0.03 }]
    }),
    [reduceMotion]
  );

  if (!mounted) return null;
  return (
    <>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.scrim,
          { pointerEvents: open ? "auto" : "none" },
          scrimStyle
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t("navigation.close")}
          onPress={onClose}
          testID="more-scrim"
        />
      </Animated.View>
      {/* Not modal: the dock's slots stay reachable, "Customize" needs them. */}
      <Animated.View
        style={[styles.card, { bottom, pointerEvents: open ? "auto" : "none" }, cardStyle]}
        testID="more-panel"
      >
        <PanelBody key={opening} mode={shownMode} {...body} />
      </Animated.View>
    </>
  );
}

/**
 * The card's content. It fades in just after the card, without moving. "Customize" ↔ "Done"
 * updates it in place: the title and the action
 * cross-fade, the hint and "Switch to till mode" fold in or out, the card's height follows.
 */
function PanelBody({
  mode,
  dock,
  current,
  invoiceWait,
  selected,
  onCustomize,
  onDone,
  onGo,
  onSwap,
  onLock
}: Omit<MorePanelProps, "open" | "bottom" | "onClose">) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const content = useSharedValue(0);
  useEffect(() => {
    content.set(
      withDelay(
        motion.navTileDelay,
        withTiming(1, {
          duration: motion.navContent,
          easing: NAV_EASING,
          reduceMotion: ReduceMotion.Never
        }),
        ReduceMotion.Never
      )
    );
  }, [content]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: content.get() }));

  // The grid's order: a swap puts the destination leaving the dock where the one tapped was
  // (adjusted while rendering); the usual order comes back at the next opening.
  const [grid, setGrid] = useState(() => ({ dock, order: restOf(dock) }));
  if (grid.dock !== dock) setGrid({ dock, order: keepPlaces(grid.order, grid.dock, dock) });

  const customizing = mode === "customize";
  const selectedName = t(`navigation.destinations.${dock[selected]!}`);
  return (
    <Animated.View style={contentStyle}>
      <View style={styles.cardHeader}>
        <Crossfade
          index={customizing ? 1 : 0}
          align="left"
          style={styles.titles}
          items={[
            <Text key="more" accessibilityRole="header" numberOfLines={1} style={styles.cardTitle}>
              {t("navigation.more")}
            </Text>,
            <Text
              key="customize"
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.cardTitle}
            >
              {t("navigation.customizeTitle")}
            </Text>
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={customizing ? t("navigation.done") : t("navigation.customize")}
          onPress={customizing ? onDone : onCustomize}
          style={styles.headerAction}
          hitSlop={6}
          testID={customizing ? "customize-done" : "customize"}
        >
          <Crossfade
            index={customizing ? 1 : 0}
            align="right"
            items={[
              <View key="customize" style={styles.headerActionContent}>
                <Icon name="pen" size={12} color={colors.button.text.label} />
                <Text style={styles.headerActionLabel}>{t("navigation.customize")}</Text>
              </View>,
              <Text key="done" style={styles.headerActionLabel}>
                {t("navigation.done")}
              </Text>
            ]}
          />
        </Pressable>
      </View>
      <Collapsible open={customizing}>
        <RichText style={styles.hint} accentStyle={styles.hintName}>
          {t("navigation.customizeHint", { name: selectedName })}
        </RichText>
      </Collapsible>
      <View style={styles.grid}>
        {grid.order.map((destination, index) => (
          <Tile
            key={index}
            destination={destination}
            current={!customizing && destination === current}
            swapping={customizing}
            invoiceWait={invoiceWait}
            onPress={() => (customizing ? onSwap(destination) : onGo(destination))}
          />
        ))}
        {/* The last row's empty cells, when the tiles do not fill it: its tiles keep the
            column's width, where they would share the whole row. */}
        {Array.from({ length: emptyCells(grid.order.length) }, (_, index) => (
          <View key={`empty-${index}`} style={styles.tileCell} testID="more-empty-cell" />
        ))}
      </View>
      <Collapsible open={!customizing}>
        <View style={styles.footer}>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            onPress={onLock}
            // Folded away: out of the keyboard's reach too (web).
            disabled={customizing}
            style={styles.tillRow}
            testID="till-mode"
          >
            <Icon name="lock" size={13} color={colors.text.secondary} style={styles.tillIcon} />
            <Text style={styles.tillLabel}>{t("navigation.lock.tillMode")}</Text>
          </Pressable>
        </View>
      </Collapsible>
    </Animated.View>
  );
}

/**
 * The opacity of what "Customize" ↔ "Done" shows or hides: out first, then in after
 * a moment, so that the two never read over each other.
 */
function useFade(shown: boolean): SharedValue<number> {
  return useEased(shown ? 1 : 0, {
    duration: shown ? motion.navFadeIn : motion.navFadeOut,
    delay: shown ? motion.navFadeDelay : 0
  });
}

/** One of `items` shows (`index`), the others are drawn over it, faded out. */
function Crossfade({
  index,
  align,
  items,
  style
}: {
  index: number;
  align: "left" | "right";
  items: ReactNode[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {items.map((item, i) => (
        <CrossfadeItem key={i} shown={i === index} align={align}>
          {item}
        </CrossfadeItem>
      ))}
    </View>
  );
}

function CrossfadeItem({
  shown,
  align,
  children
}: {
  shown: boolean;
  align: "left" | "right";
  children: ReactNode;
}) {
  const styles = useStyles();
  const opacity = useFade(shown);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        styles.crossfadeItem,
        !shown && [styles.stacked, align === "left" ? styles.stackedLeft : styles.stackedRight],
        style
      ]}
      {...outOfReach(!shown)}
    >
      {children}
    </Animated.View>
  );
}

/** Its content folds in or out: its height follows (at once with Reduce Motion), it fades. */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState<number | null>(null);
  const unfolded = useEased(open ? 1 : 0, { duration: motion.navPanel, animate: !reduceMotion });
  const opacity = useFade(open);
  const style = useAnimatedStyle(
    () =>
      height === null
        ? { opacity: opacity.get() }
        : { opacity: opacity.get(), height: unfolded.get() * height },
    [height]
  );
  return (
    <Animated.View
      style={[
        styles.collapsible,
        height === null && !open && styles.folded,
        { pointerEvents: open ? "auto" : "none" },
        style
      ]}
      {...outOfReach(!open)}
    >
      <View
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.height;
          if (measured > 0) setHeight(measured);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function Tile({
  destination,
  current,
  swapping,
  invoiceWait,
  onPress
}: {
  destination: Destination;
  current: boolean;
  swapping: boolean;
  invoiceWait: InvoiceWait;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const currentShown = useEased(current ? 1 : 0, { duration: motion.fast });
  const badge = useFade(swapping);
  const currentStyle = useAnimatedStyle(() => ({ opacity: currentShown.get() }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.get() }));
  const name = destinationLabel(destination, invoiceWait, t);
  return (
    <View style={styles.tileCell}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          swapping
            ? // The bare name: "Put {{name}} in the bar" is about the destination.
              t("navigation.swapLabel", { name: t(`navigation.destinations.${destination}`) })
            : current
              ? t("navigation.currentLabel", { name })
              : name
        }
        accessibilityState={{ selected: current }}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && !current && styles.tilePressed]}
        testID={`more-${destination}`}
      >
        <Animated.View style={[styles.tileCurrent, currentStyle, styles.passThrough]} />
        {/* A swap: the destination leaving the dock comes down into the tile, the one tapped
            leaves downwards, towards the dock. */}
        <SlideSwap
          value={destination}
          rise={-SLIDE}
          render={(shown) => (
            <View style={styles.tileFace}>
              <DestinationIcon
                destination={shown}
                size={18}
                color={current ? palette.orange : colors.text.secondary}
                wait={invoiceWait}
                testID={`more-${shown}-pending`}
              />
              <Text
                numberOfLines={1}
                style={[styles.tileLabel, current && styles.tileLabelCurrent]}
              >
                {t(`navigation.destinations.${shown}`)}
              </Text>
            </View>
          )}
        />
        <Animated.View style={[styles.swapBadge, badgeStyle, styles.passThrough]}>
          <Icon name="right-left" size={8} color={palette.white} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Its content changes by sliding: the new one comes in from
 * `rise` points below (above when negative) and fades in, the one before leaves the other way and
 * fades out. Nothing moves at the first render; with Reduce Motion they only cross-fade.
 */
function SlideSwap<T extends string>({
  value,
  rise,
  render
}: {
  value: T;
  rise: number;
  render: (value: T) => ReactNode;
}) {
  const styles = useStyles();
  const [shown, setShown] = useState<{ value: T; previous: T | null; count: number }>({
    value,
    previous: null,
    count: 0
  });
  if (shown.value !== value) setShown({ value, previous: shown.value, count: shown.count + 1 });
  useEffect(() => {
    if (shown.previous === null) return;
    const count = shown.count;
    const timer = setTimeout(
      () => setShown((now) => (now.count === count ? { ...now, previous: null } : now)),
      motion.navSlide
    );
    return () => clearTimeout(timer);
  }, [shown.previous, shown.count]);
  return (
    <View style={styles.slideSwap}>
      {shown.previous !== null ? (
        <SlideLayer key={`out-${shown.count}`} mode="out" shift={-rise} style={styles.slideOut}>
          {render(shown.previous)}
        </SlideLayer>
      ) : null}
      <SlideLayer key={`in-${shown.count}`} mode={shown.count === 0 ? "still" : "in"} shift={rise}>
        {render(shown.value)}
      </SlideLayer>
    </View>
  );
}

function SlideLayer({
  mode,
  shift,
  style,
  children
}: {
  mode: "still" | "in" | "out";
  /** Where it comes from (in) or goes to (out), in points. */
  shift: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(mode === "in" ? 0 : 1);
  const offset = useSharedValue(mode === "in" ? shift : 0);
  useEffect(() => {
    const timing = (to: number, duration: number) =>
      withTiming(to, { duration, easing: NAV_EASING, reduceMotion: ReduceMotion.Never });
    if (mode === "in") {
      opacity.set(withDelay(motion.navTileDelay, timing(1, motion.navSlideIn), ReduceMotion.Never));
      offset.set(withDelay(motion.navTileDelay, timing(0, motion.navSlide), ReduceMotion.Never));
    } else if (mode === "out") {
      opacity.set(timing(0, motion.navSlideOut));
      offset.set(timing(shift, motion.navSlide));
    }
  }, [mode, shift, opacity, offset]);
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: opacity.get(),
      transform: [{ translateY: reduceMotion ? 0 : offset.get() }]
    }),
    [reduceMotion]
  );
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/** Fades and zooms in on mount: the menu's icon becoming a cross and back. */
function SwapIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(1, {
        duration: motion.navIndicator,
        easing: NAV_EASING,
        reduceMotion: ReduceMotion.Never
      })
    );
  }, [shown]);
  const animatedStyle = useAnimatedStyle(
    () => ({
      opacity: shown.get(),
      transform: [{ scale: reduceMotion ? 1 : 0.6 + shown.get() * 0.4 }]
    }),
    [reduceMotion]
  );
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

type WaitIconProps = {
  size: number;
  color: string;
  /** What the point of sale's invoice waits for (`InvoiceWait`): its dot, at the top right. */
  wait: InvoiceWait;
  testID: string;
};

/** An icon carrying the dot of the point of sale's invoice while it waits. */
function WaitIcon({ name, size, color, wait, testID }: WaitIconProps & { name: IconName }) {
  const styles = useStyles();
  return (
    <View>
      <Icon name={name} size={size} color={color} />
      {wait ? (
        <InvoiceWaitDot wait={wait} style={[styles.iconDot, styles.passThrough]} testID={testID} />
      ) : null}
    </View>
  );
}

/** A destination's icon. The point of sale's carries the dot of its invoice while it waits. */
function DestinationIcon({
  destination,
  wait,
  ...icon
}: WaitIconProps & { destination: Destination }) {
  return (
    <WaitIcon
      name={DESTINATION_ICONS[destination]}
      wait={destination === "pos" ? wait : null}
      {...icon}
    />
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  // Over the bottom of the screens: what they scroll passes under it (dock-area.tsx).
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
  pillInner: { height: DOCK_HEIGHT, overflow: "hidden", borderRadius: radius.pill },
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    height: DOCK_HEIGHT,
    padding: DOCK.padding,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  // The unlocked slots, placed by the dock's layout; the pill clips what it does not show.
  slots: { position: "absolute", top: 0, left: 0, height: DOCK_HEIGHT },
  slotPlace: { position: "absolute", top: DOCK.padding, height: DOCK.item },
  slot: {
    width: "100%",
    height: DOCK.item,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  labelRoom: { alignSelf: "stretch", overflow: "hidden" },
  labelBox: { position: "absolute", top: 0, bottom: 0, justifyContent: "center" },
  slotLabel: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  more: { width: "100%", height: DOCK.item, borderRadius: radius.pill },
  splitPart: { ...StyleSheet.absoluteFill },
  splitIcon: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: SPLIT_ICON_LEFT,
    width: SPLIT_ICON_WIDTH,
    alignItems: "center",
    justifyContent: "center"
  },
  splitLine: {
    position: "absolute",
    top: 15,
    bottom: 15,
    left: SPLIT_LINE_LEFT,
    width: 1.5,
    borderRadius: 1,
    backgroundColor: colors.border.subtle
  },
  menuIcon: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  bubble: {
    position: "absolute",
    right: 0,
    bottom: DOCK_HEIGHT + 10,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 12,
    paddingRight: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card
  },
  bubbleLabel: {
    ...sans(600),
    fontSize: 13,
    color: colors.text.primary
  },
  // Points at the screen's icon in "More": dock padding + pill width − icon centre.
  bubbleCaret: {
    position: "absolute",
    right: DOCK.padding + DOCK.split - SPLIT_ICON_LEFT - SPLIT_ICON_WIDTH / 2 - 5,
    bottom: -4,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.background.surface,
    transform: [{ rotate: "45deg" }]
  },
  chargePill: {
    height: DOCK.item,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill
  },
  tillShown: { borderRadius: radius.pill, backgroundColor: colors.background.subtle },
  chargeLabel: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  // At the icon's top right corner, a little apart from the glyph.
  iconDot: { position: "absolute", top: -2, right: -8 },
  lock: { width: DOCK.lock, height: DOCK.item, alignItems: "center", justifyContent: "center" },
  slotMark: {
    position: "absolute",
    top: DOCK.padding,
    height: DOCK.item,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  slotFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    backgroundColor: colors.background.subtle
  },
  slotRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: palette.orange,
    backgroundColor: colors.background.accentSubtle
  },
  // No wider than its parent: a tile's name then ends in "…" (`tileLabel`).
  slideSwap: { maxWidth: "100%" },
  slideOut: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  scrim: { backgroundColor: colors.scrim },
  passThrough: { pointerEvents: "none" },
  // From a sheet: the web applies box-none from a class, not from an inline style.
  boxNone: { pointerEvents: "box-none" },
  card: {
    position: "absolute",
    left: gutter,
    right: gutter,
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    padding: 16
  },
  cardHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 4,
    paddingRight: 2
  },
  titles: { flex: 1, minWidth: 0 },
  cardTitle: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  crossfadeItem: { justifyContent: "center" },
  stacked: { position: "absolute", top: 0, bottom: 0 },
  stackedLeft: { left: 0 },
  stackedRight: { right: 0 },
  headerAction: { minHeight: 32, justifyContent: "center", paddingHorizontal: 6 },
  headerActionContent: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerActionLabel: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.button.text.label,
    textAlign: "right"
  },
  collapsible: { overflow: "hidden" },
  folded: { height: 0 },
  hint: {
    ...sans(500),
    paddingTop: 14,
    paddingHorizontal: 4,
    fontSize: type.caption,
    lineHeight: type.caption * 1.45,
    color: colors.text.secondary
  },
  hintName: { ...sans(700), color: colors.text.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  // Three per row (GRID_COLUMNS): 30 % each, then they share what is left.
  tileCell: { flexBasis: "30%", flexGrow: 1, flexShrink: 1, minWidth: 0 },
  tile: {
    height: 84,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.background.app
  },
  tileCurrent: { ...StyleSheet.absoluteFill, backgroundColor: colors.background.subtle },
  tilePressed: { backgroundColor: colors.background.subtle },
  // Never wider than the tile: a name too long for it ends in "…" instead of being cut at the
  // tile's edges ("Mitarbeitende" in bold on a 360 px wide phone).
  tileFace: { alignItems: "center", gap: 8, maxWidth: "100%" },
  tileLabel: {
    ...sans(600),
    maxWidth: "100%",
    fontSize: type.caption,
    color: colors.text.primary
  },
  tileLabelCurrent: { ...sans(700) },
  swapBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.orange
  },
  footer: { paddingTop: 14, gap: 14 },
  divider: { height: 1, backgroundColor: colors.border.subtle },
  tillRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4
  },
  tillIcon: { width: 16 },
  tillLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  }
}));
