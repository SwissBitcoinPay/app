import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming
} from "react-native-reanimated";

import { control, makeStyles, motion, radius, sans, space, tracked, type, useTheme } from "@/theme";

import { NAV_EASING } from "./easing";
import { Icon, type IconName } from "./Icon";
import { outOfReach } from "./reach";
import { useHover } from "./useHover";

type Option<T extends string> = { value: T; label: string; icon?: IconName };

type SegmentedControlProps<T extends string> = {
  /** With an icon, it shows before the label; the segments are then tighter (see `compact`). */
  options: readonly Option<T>[];
  /** null: none chosen yet (a bank account's holder, a person or a company): no thumb. */
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /**
   * Options with icons only: the control takes its parent's width and leaves labels out where they
   * would not fit it, or would make the control taller than `maxHeight` (larger text sizes). See
   * `fittedLabels`. Centred in that width, as a header's title (the point of sale's "Amount" /
   * "Items"). Options without icons always fit their parent, without it (`tightSegments`).
   */
  fit?: { maxHeight: number };
  /**
   * As wide as its parent, its segments sharing that width equally ("Customize" of a card); else
   * as wide as its segments. Options with icons (and no `fit`): the icon goes
   * above the label where a share cannot hold both side by side (see `stackedSegments`).
   */
  stretch?: boolean;
  /**
   * No choice for now (a payment being sent): the segments in stone on the
   * sand pill, the option chosen still in bold but without its white thumb (disabled = sand, not
   * opacity); a tap changes nothing.
   */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Around the segments and between them (`styles.root`). */
const INSET = space[2];
const GAP = space[2];
/** How far an idle label may pass its bold width on each side, into its segment's padding. */
export const LABEL_SLACK = space[1];

/** A segment's measured size, as drawn with its label (`compact`, in bold: the wider weight). */
export type SegmentSize = { width: number; height: number };

/** Where a segment is laid out in the control (`x` from the control's left edge, padding included). */
type SegmentPlace = { x: number; width: number };

/**
 * Where the segment at `index` is laid out, from the widths of the segments up to it (undefined:
 * not all measured yet). Derived rather than read from its own layout: on the web, onLayout tells
 * a change of size only (react-native-web's ResizeObserver), never a segment moved by a neighbour
 * gaining or losing its label (`fit`).
 */
function segmentPlace(
  widths: readonly (number | undefined)[],
  index: number
): SegmentPlace | undefined {
  const width = widths[index];
  if (index < 0 || width === undefined) return undefined;
  let x = INSET;
  for (const before of widths.slice(0, index)) {
    if (before === undefined) return undefined;
    x += before + GAP;
  }
  return { x, width };
}

/**
 * Which labels a fitted control shows: every one when the whole control fits `room` wide and
 * `maxHeight` high; else the chosen option's alone, the others an icon in a 44 px circle; else
 * none (an icon never grows with the text size: Icon does not scale). The labels stay the
 * segments' accessible names. Undefined sizes (not measured yet): every label, as unfitted.
 */
export function fittedLabels(
  sizes: readonly (SegmentSize | undefined)[],
  selected: number,
  room: number | null,
  maxHeight: number
): "all" | "selected" | "none" {
  if (room === null || sizes.some((size) => size === undefined)) return "all";
  const measured = sizes as readonly SegmentSize[];
  const fits = (labelled: readonly SegmentSize[], iconOnly: number) => {
    const count = labelled.length + iconOnly;
    const width =
      2 * INSET +
      labelled.reduce((sum, size) => sum + size.width, 0) +
      iconOnly * control.min +
      GAP * (count - 1);
    const height = 2 * INSET + Math.max(control.min, ...labelled.map((size) => size.height));
    return width <= room && height <= maxHeight;
  };
  if (fits(measured, 0)) return "all";
  const chosen = measured[selected];
  if (chosen && fits([chosen], measured.length - 1)) return "selected";
  return "none";
}

/**
 * Whether options without icons take 9 px inside their segments instead of 22: when the whole
 * control, measured with 22, is wider than its parent ("Fast / Normal / Economy" of the
 * send sheet before their icons: 342 px of the 316 px a 360 px wide phone leaves it).
 * Narrower still, the labels end in "…" (`styles.shrink`). Undefined sizes (not measured yet):
 * 22 px.
 */
export function tightSegments(
  sizes: readonly (SegmentSize | undefined)[],
  room: number | null
): boolean {
  if (room === null || sizes.some((size) => size === undefined)) return false;
  const widths = (sizes as readonly SegmentSize[]).map((size) => size.width);
  return (
    2 * INSET + widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1) > room
  );
}

/**
 * Whether stretched options with icons draw each icon above its label: when one segment, measured
 * with its icon before its label, is wider than its equal share of the room (the send sheet's
 * "Fast / Normal / Economy" on a phone: the longest takes 124 px of the 100 px a 360 px
 * wide phone gives each). Narrower still, the labels end in "…".
 * Undefined sizes (not measured yet): side by side.
 */
export function stackedSegments(
  sizes: readonly (SegmentSize | undefined)[],
  room: number | null
): boolean {
  if (room === null || sizes.some((size) => size === undefined)) return false;
  const measured = sizes as readonly SegmentSize[];
  const share = (room - 2 * INSET - GAP * (measured.length - 1)) / measured.length;
  return measured.some((size) => size.width > share);
}

/**
 * The segmented control: a sand pill
 * holding one segment per option, the one chosen raised on white in bold. Each segment keeps the
 * 44 px touch floor. Options with icons (the point of sale's "Amount" / "Items"): a 13 px icon before each label, and 9 px inside the segments instead of 22, so
 * that the control fits the point of sale's header on a 360 px wide phone in every language (about
 * 200 px in Spanish, the widest, of the 212 px its header leaves without the scan's button). With
 * larger text sizes, `fit` leaves labels out rather than let the control overflow its header,
 * as the dock keeps only its icons (PillMeasures.tsx).
 *
 * A change of option: the white thumb slides to the option chosen and the labels turn
 * bold and ink exactly where it passes, letter by letter. The segments draw every label idle
 * (stone, semi-bold); the thumb, above them, holds a copy of the segments in ink, clipped to it
 * (`InkThumb`). Each label reserves its bold width, so both rows are laid out alike and the
 * control keeps its size when an option is chosen. Until the segments are measured (the first
 * frame), the option chosen is drawn raised in place, as the thumb will draw it.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fit,
  stretch = false,
  disabled = false,
  style,
  testID
}: SegmentedControlProps<T>) {
  const styles = useStyles();
  const withIcons = options.some((option) => option.icon !== undefined);
  const fitted = fit !== undefined && withIcons;
  const measured = fitted || !withIcons || stretch;
  const [room, setRoom] = useState<number | null>(null);
  const [sizes, setSizes] = useState<Partial<Record<T, SegmentSize>>>({});
  const [widths, setWidths] = useState<Partial<Record<T, number>>>({});
  const [inner, setInner] = useState<number | null>(null);
  const selected = options.findIndex((option) => option.value === value);
  const optionSizes = options.map((option) => sizes[option.value]);
  const shown = fitted ? fittedLabels(optionSizes, selected, room, fit.maxHeight) : "all";
  const tight = !withIcons && tightSegments(optionSizes, room);
  const stacked = withIcons && stretch && !fitted && stackedSegments(optionSizes, room);
  const place = segmentPlace(
    options.map((option) => widths[option.value]),
    selected
  );
  const thumbed = place !== undefined && inner !== null && value !== null;

  const layouts = options.map((option, index) => ({
    option,
    look: {
      compact: withIcons || tight,
      stacked,
      shrink: !withIcons || stacked,
      stretch,
      muted: disabled,
      showLabel:
        option.icon === undefined || shown === "all" || (shown === "selected" && index === selected)
    }
  }));
  const keepWidth = (option: T) => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    // A hidden view on the web reports 0 (PillMeasures.tsx).
    if (width <= 0) return;
    setWidths((known) => (known[option] === width ? known : { ...known, [option]: width }));
  };

  const pill = (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.root, stretch && styles.rootStretch, fitted && styles.rootFitted, style]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width - 2 * INSET;
        if (width > 0) setInner(width);
      }}
      testID={testID ? `${testID}-group` : undefined}
    >
      {layouts.map(({ option, look }) => (
        <Segment
          key={segmentKey(option.value, look)}
          label={option.label}
          icon={option.icon}
          look={look}
          selected={option.value === value}
          raised={option.value === value && !thumbed}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          onLayout={keepWidth(option.value)}
          testID={testID ? `${testID}-${option.value}` : undefined}
        />
      ))}
      {thumbed && value !== null ? (
        <InkThumb
          place={place}
          value={value}
          inner={inner}
          raised={!disabled}
          testID={testID ? `${testID}-thumb` : undefined}
        >
          {layouts.map(({ option, look }) => (
            <View key={option.value} style={segmentStyle(styles, look)}>
              <SegmentContent label={option.label} icon={option.icon} look={look} ink />
            </View>
          ))}
        </InkThumb>
      ) : null}
    </View>
  );
  if (!measured) return pill;

  const keepSize = (option: T) => (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // A hidden view on the web reports 0 (PillMeasures.tsx).
    if (width <= 0) return;
    setSizes((known) =>
      known[option]?.width === width && known[option]?.height === height
        ? known
        : { ...known, [option]: { width, height } }
    );
  };
  // Each segment as drawn with its label, in bold.
  const measuredLook: SegmentLook = {
    compact: withIcons,
    stacked: false,
    shrink: false,
    stretch: false,
    showLabel: true,
    muted: false
  };
  return (
    // As wide as its parent, whatever the control shows: the room it measures does not depend on it.
    <View
      style={styles.fit}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        // A hidden view on the web reports 0 (PillMeasures.tsx): no room to fit, not a room of 0,
        // which made the segments `tight` until shown ("Currency shown first").
        if (width > 0) setRoom(width);
      }}
      testID={testID ? `${testID}-fit` : undefined}
    >
      {pill}
      {/* Each segment with its label, off screen: measured again when the text size changes. */}
      <View style={styles.measures} {...outOfReach(true)}>
        <View style={styles.measuresInner}>
          {options.map((option) => (
            <View
              key={option.value}
              style={segmentStyle(styles, measuredLook)}
              onLayout={keepSize(option.value)}
              testID={testID ? `${testID}-measure-${option.value}` : undefined}
            >
              <SegmentContent label={option.label} icon={option.icon} look={measuredLook} ink />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** How a segment is drawn, the same in the segments and in the thumb's ink copy of them. */
type SegmentLook = {
  compact: boolean;
  /** The icon above the label, both centred (`stackedSegments`). */
  stacked: boolean;
  /** Without icons, or stacked: narrower than its label as a last resort, which ends in "…". */
  shrink: boolean;
  /** A share of the control's width (`stretch`). */
  stretch: boolean;
  /** False: the icon alone, in a 44 px circle; the label is still the segment's accessible name. */
  showLabel: boolean;
  /** Disabled: the ink in stone too. */
  muted: boolean;
};

/**
 * A segment's key: its option, and what changes its padding (`segmentStyle`). On the web, onLayout
 * tells a change of the content box only (react-native-web observes it with a ResizeObserver,
 * which watches the content box): a segment gaining or losing its padding alone (`tight`) kept the
 * width it had, and the thumb its old place and width ("Currency shown first").
 * A new key mounts it again, so it is observed afresh and tells its width.
 */
function segmentKey(value: string, { compact, stacked, showLabel }: SegmentLook): string {
  return `${value}:${compact ? "c" : ""}${stacked ? "s" : ""}${showLabel ? "" : "i"}`;
}

function segmentStyle(
  styles: ReturnType<typeof useStyles>,
  { compact, stacked, shrink, stretch, showLabel }: SegmentLook
): StyleProp<ViewStyle> {
  return [
    styles.segment,
    compact && styles.compact,
    stacked && styles.stacked,
    shrink && styles.shrink,
    stretch && styles.stretch,
    !showLabel && styles.iconOnly
  ];
}

function Segment({
  label,
  icon,
  look,
  selected,
  raised,
  disabled,
  onPress,
  onLayout,
  testID
}: {
  label: string;
  icon: IconName | undefined;
  look: SegmentLook;
  selected: boolean;
  /** The option chosen, drawn in place until the thumb can be placed (not measured yet). */
  raised: boolean;
  disabled: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="radio"
      // Always named: the segment also holds a hidden copy of its label (`SegmentLabel`).
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      // The web reads this one: react-native-web leaves `checked` out (as for Switch).
      aria-checked={selected}
      testID={testID}
      style={[
        segmentStyle(styles, look),
        disabled ? null : raised ? styles.selected : !selected && hovered ? styles.hovered : null
      ]}
    >
      {/* Disabled, the thumb has no fill to hide the idle label under it: the option chosen is
          drawn in bold here too, exactly under the thumb's copy, rather than both weights at once. */}
      <SegmentContent
        label={label}
        icon={icon}
        look={look}
        ink={raised || (disabled && selected)}
      />
    </Pressable>
  );
}

/** A segment's icon and label: idle (stone, semi-bold) or `ink` (ink, bold). */
function SegmentContent({
  label,
  icon,
  look,
  ink
}: {
  label: string;
  icon: IconName | undefined;
  look: SegmentLook;
  ink: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      {icon ? (
        <Icon
          name={icon}
          size={13}
          color={ink && !look.muted ? colors.text.primary : colors.text.secondary}
        />
      ) : null}
      {look.showLabel ? (
        <SegmentLabel label={label} ink={ink} stacked={look.stacked} muted={look.muted} />
      ) : null}
    </>
  );
}

/**
 * A label as wide in both weights: the bold one, hidden when idle, sets its width; the idle one is
 * drawn over it, centred. The segments and the thumb's ink copy are then laid out alike.
 */
function SegmentLabel({
  label,
  ink,
  stacked,
  muted
}: {
  label: string;
  ink: boolean;
  stacked: boolean;
  muted: boolean;
}) {
  const styles = useStyles();
  return (
    // Stacked: as wide as its segment, so that a label too long for it ends in "…".
    <View style={[styles.labelBox, stacked && styles.labelStacked]}>
      <Text
        numberOfLines={1}
        aria-hidden={!ink}
        style={[
          styles.label,
          styles.labelSelected,
          muted && styles.labelMuted,
          !ink && styles.reserved
        ]}
      >
        {label}
      </Text>
      {ink ? null : (
        // In a box of its own: on the web, a Text with `numberOfLines` is never wider than its
        // parent (react-native-web's maxWidth: 100%), whatever its own left and right.
        <View style={styles.labelOver}>
          <Text numberOfLines={1} style={[styles.label, styles.labelIdle]}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The white thumb under the option chosen, above the segments: it clips an ink copy of them
 * (`children`), held in place while the thumb moves, so the labels it passes over turn ink. It
 * starts where it is mounted (`place`, measured), then slides to each option chosen in
 * `motion.segmentInk`, from wherever it is: a tap during the slide turns it back. Its segment
 * moving for the same option (laid out again, a new text size) moves it at once. With Reduce
 * Motion it never slides: it fades in at its new place, the labels changing at once. Out of reach
 * of screen readers and taps: the segments below are the control.
 */
function InkThumb({
  place,
  value,
  inner,
  raised,
  children,
  testID
}: {
  place: SegmentPlace;
  value: string;
  /** The control's width inside its padding: the ink copy's, laid out as the segments. */
  inner: number;
  /** False (disabled): no white fill nor shadow, the bold label alone shows the option chosen. */
  raised: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const left = useSharedValue(place.x);
  const width = useSharedValue(place.width);
  const opacity = useSharedValue(1);
  // The option the thumb was last placed under: a new place for the same option (a new text size,
  // a label left out) is not a change of option.
  const placedFor = useRef(value);
  // When the slide to the last option chosen ends (Date.now()): until then, a new place for the
  // same option (its label shown once chosen, with `fit`) is followed by the slide; after it, or
  // before any (the segments laid out again once measured: `tight`, `fit`), the thumb jumps to it.
  const slidingUntil = useRef(0);
  useEffect(() => {
    const changed = placedFor.current !== value;
    placedFor.current = value;
    const now = Date.now();
    if (changed) slidingUntil.current = now + motion.segmentInk;
    const remaining = slidingUntil.current - now;
    if (reduceMotion || remaining <= 0) {
      left.set(place.x);
      width.set(place.width);
      if (reduceMotion && changed) {
        opacity.set(
          withSequence(
            withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
            withTiming(1, { duration: motion.fast, reduceMotion: ReduceMotion.Never })
          )
        );
      }
      return;
    }
    const slide = {
      duration: remaining,
      easing: NAV_EASING,
      reduceMotion: ReduceMotion.Never
    };
    left.set(withTiming(place.x, slide));
    width.set(withTiming(place.width, slide));
  }, [place.x, place.width, value, reduceMotion, left, width, opacity]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: width.get(),
    opacity: opacity.get(),
    transform: [{ translateX: left.get() }]
  }));
  // The copy stays over the segments it copies, wherever the thumb is.
  const inkStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: INSET - left.get() }]
  }));
  return (
    // Never flattened: in a sheet (OverlayModal), Android crashed when that changed (AGENTS.md).
    <Animated.View
      collapsable={false}
      style={[styles.thumb, raised && styles.thumbRaised, thumbStyle]}
      {...outOfReach(true)}
      testID={testID}
    >
      <View collapsable={false} style={styles.clip}>
        <Animated.View
          collapsable={false}
          style={[styles.inkRow, { width: inner }, inkStyle]}
          testID={testID ? `${testID}-ink` : undefined}
        >
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  root: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: colors.background.subtle,
    borderRadius: radius.pill,
    padding: INSET,
    gap: GAP,
    maxWidth: "100%"
  },
  segment: {
    minHeight: control.min,
    justifyContent: "center",
    paddingHorizontal: space[8],
    borderRadius: radius.pill
  },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4]
  },
  // After `compact`, whose row it turns into a column.
  stacked: {
    flexDirection: "column",
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[2]
  },
  shrink: { flexShrink: 1, minWidth: 0 },
  rootStretch: { alignSelf: "stretch" },
  // In `styles.fit`, which takes its parent's whole width to measure the room: centred in it, as
  // the parent would place it (the point of sale's header, whose title is centred). Not at its
  // start: without the scan's button, the room left showed "Amount" / "Items" off centre.
  rootFitted: { alignSelf: "center" },
  stretch: { flexGrow: 1, flexBasis: 0 },
  iconOnly: { width: control.min, paddingHorizontal: 0, justifyContent: "center" },
  hovered: { backgroundColor: colors.hoverOverlay },
  selected: { backgroundColor: colors.background.surface, boxShadow: shadow.raised },
  label: { fontSize: type.label, letterSpacing: tracked.label, flexShrink: 1, textAlign: "center" },
  labelSelected: { ...sans(700), color: colors.text.primary },
  labelIdle: { ...sans(600), color: colors.text.secondary },
  labelMuted: { color: colors.text.secondary },
  labelBox: { flexShrink: 1, minWidth: 0 },
  labelStacked: { alignSelf: "stretch" },
  reserved: { opacity: 0 },
  // A little wider than the bold label it is drawn over, still centred: a semi-bold label can be a
  // fraction of a pixel wider than the bold one ("CHF" in Plus Jakarta Sans on the web, 0.03 px),
  // which ended it in "C…" ("Currency shown first").
  labelOver: { position: "absolute", top: 0, left: -LABEL_SLACK, right: -LABEL_SLACK },
  // Absolute: out of the row's flex lines, so it adds no gap (Yoga's FlexLine.cpp).
  thumb: {
    position: "absolute",
    top: INSET,
    bottom: INSET,
    left: 0,
    borderRadius: radius.pill,
    pointerEvents: "none"
  },
  thumbRaised: { backgroundColor: colors.background.surface, boxShadow: shadow.raised },
  clip: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, overflow: "hidden" },
  inkRow: { position: "absolute", top: 0, bottom: 0, left: 0, flexDirection: "row", gap: GAP },
  fit: { alignSelf: "stretch" },
  measures: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none"
  },
  measuresInner: { position: "absolute", top: 0, left: 0, width: 1000, alignItems: "flex-start" }
}));
