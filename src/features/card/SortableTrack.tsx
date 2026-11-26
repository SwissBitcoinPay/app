import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ScrollView,
  View,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type AnimatedStyle,
  type SharedValue
} from "react-native-reanimated";

import { IconButton } from "@/components/ui/IconButton";
import { control, makeStyles, motion, radius } from "@/theme";

import { edgeScroll, moveId, pageScroll, swayOf, targetIndex, withCurrentIds } from "./reorder";

/*
 * Cards of one size in a line that scrolls, one dragged along it ("Organise" of "Cards"): the "Card
 * order" panel on a phone (a column), the row of cards on a desktop (a line that never wraps). The
 * finger, or
 * the pointer, takes a card by its handle (`handle`, spread on the view that takes it): the card
 * follows it, the ones it passes slide to make room, and it settles into its place once let go;
 * near an end of what shows, the line scrolls under it. Only then is the new order handed over
 * (`onMove`): what is shown meanwhile is this track's alone. The cards are drawn in the order
 * handed in (screen readers and the keyboard follow it), each placed by a transform.
 *
 * Taken, the card lifts and leans (`lift`); carried, it leans with its movement and swings back as
 * the pointer slows, as a card held by one point. Only what a card's view puts in `lifted` follows
 * the pointer: the rest (its
 * name under it) keeps to the card's place in the line, the place it will settle into.
 *
 * On a desktop, arrows over the line's ends (`arrows`) scroll it a page at a time, each shown only
 * while cards are hidden on its side: the line takes no room of its own for them.
 */

/** How far the line scrolls at each step while a card is dragged near one of its ends. */
const EDGE_STEP = 14;
/** One step every this many ms: about 350 points a second. */
const EDGE_EVERY_MS = 40;
/** An arrow's button: the touch floor. */
const ARROW = control.min;
/** The swing back after a lean: a little under half critical, a sway or two before it rests. */
const SWING_DAMPING = 0.35;
/**
 * The pointer's speed, for the card's lean, is measured over this much time at least (ms): a jitter
 * between two close events never leans it, whatever the pointer's rate (60 or 120 events a second).
 */
const SPEED_WINDOW_MS = 16;
/**
 * Toward the lean of each pointer event: fast at first. Each event starts it again, an ease-in
 * would barely move before the next (the card would hardly lean).
 */
const LEAN = { duration: motion.reorderLean, easing: Easing.out(Easing.cubic) };

export type SortableItem = {
  /** The card is being dragged: it is lifted (its own drawing), the others make room. */
  dragged: boolean;
  /** Spread on the view a finger or a pointer takes the card by. */
  handle: GestureResponderHandlers;
  /**
   * Of the Animated.View around what follows the pointer (a card's face): where it is from the
   * card's place, how it leans and how big it is. Nothing at rest.
   */
  lifted: AnimatedStyle<ViewStyle>;
  /**
   * Of an Animated.View inside `lifted`, behind the card, that draws its shadow: faded in once the
   * card is taken, out as it settles, never shown at once. A fade: kept with Reduce Motion.
   */
  shadow: AnimatedStyle<ViewStyle>;
};

/** How a dragged card lifts (no movement with Reduce Motion: it follows the pointer only). */
export type SortableLift = {
  /** Its lean once taken, held still (degrees). */
  tilt: number;
  /** How far its movement leans it more, either way (degrees). */
  sway: number;
  /** Its size once taken (1: as it is). */
  scale: number;
};

type SortableTrackProps = {
  axis: "x" | "y";
  /** The cards' ids, in their order. */
  ids: readonly string[];
  /** A card's length along the line, and the space after it. */
  itemSize: number;
  gap: number;
  /** A card's size across the line (its height on a row): the line's. */
  crossSize?: number;
  /** Whether a card can be taken: two at least. */
  enabled: boolean;
  /** The new order, once a card dragged was let go elsewhere. */
  onMove: (ids: string[]) => void;
  renderItem: (id: string, item: SortableItem) => ReactNode;
  lift: SortableLift;
  /** The scroll's padding at both ends of the line (a page's gutter): the cards scroll under it. */
  inset?: number;
  /** Within this of an end of what shows, a dragged card scrolls the line. */
  edge: number;
  /**
   * A row's arrows (axis "x"): their accessible names, and where their centre is from the line's
   * top (the cards' faces').
   */
  arrows?: { previous: string; next: string; center: number };
  /** Of the scroll (its size: a panel's list takes what is left of it). */
  scrollStyle?: StyleProp<ViewStyle>;
  /** Of the scroll's content, across the line (room for the cards' shadows and rings). */
  contentStyle?: StyleProp<ViewStyle>;
  /** While a card is dragged (the panel's other controls wait). */
  onDragging?: (dragging: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
};

type Gesture = {
  id: string;
  /** Its place when taken. */
  from: number;
  /** The pointer's position along the line when it took the card, and now. */
  page: number;
  last: number;
  /** The line's scroll when the card was taken. */
  offset: number;
  /** The order it points to. */
  live: string[];
  /** The line's scroll at each step while the card is near an end: 0, back or on. */
  speed: number;
  /** Where the pointer was, and when (Date.now()), as its speed was last measured (the lean's). */
  sampled: number;
  at: number;
};

export function SortableTrack({
  axis,
  ids,
  itemSize,
  gap,
  crossSize,
  enabled,
  onMove,
  renderItem,
  lift,
  inset = 0,
  edge,
  arrows,
  scrollStyle,
  contentStyle,
  onDragging,
  accessibilityLabel,
  testID
}: SortableTrackProps) {
  const styles = useStyles();
  const horizontal = axis === "x";
  const reduceMotion = useReducedMotion();
  const pitch = itemSize + gap;
  const count = ids.length;
  const length = count > 0 ? count * pitch - gap : 0;
  const content = 2 * inset + length;

  const scroll = useRef<ScrollViewInstance>(null);
  const [drag, setDrag] = useState<{ id: string; from: number } | null>(null);
  const [live, setLive] = useState<string[] | null>(null);
  // The card dragged last: drawn above the others until another is taken, so that, let go, it
  // settles over its neighbours, never under them.
  const [top, setTop] = useState<string | null>(null);
  // How far the dragged card is from its place when taken, frame by frame (no render).
  const delta = useSharedValue(0);
  // How far its movement leans it (degrees), springing back to none.
  const sway = useSharedValue(0);
  // Read by the handlers only.
  const gesture = useRef<Gesture | null>(null);
  const offset = useRef(0);
  const visible = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Which arrows show: cards hidden before the visible part, after it.
  const [hidden, setHidden] = useState({ before: false, after: false });

  const edges = () => {
    const before = offset.current > 1;
    const after = offset.current + visible.current < content - 1;
    if (before !== hidden.before || after !== hidden.after) setHidden({ before, after });
  };
  // The cards (or the window) changed: what is hidden too.
  useEffect(edges);

  const stopScrolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopScrolling, []);

  /** The dragged card under the pointer: its place pointed to, the line scrolled near an end. */
  const follow = () => {
    const held = gesture.current;
    if (!held) return;
    const moved = held.last - held.page + (offset.current - held.offset);
    delta.set(moved);
    const to = targetIndex(held.from, moved, pitch, count);
    if (held.live.indexOf(held.id) !== to) {
      held.live = moveId(held.live, held.id, to);
      setLive(held.live);
    }
    const start = inset + held.from * pitch + moved - offset.current;
    // Only toward the end the card was carried to: a card taken where it rests near an end (the
    // first one shown, under the page's gutter) never scrolls the line before it is moved there.
    const taken = inset + held.from * pitch - held.offset;
    const toward = edgeScroll(start, itemSize, visible.current, edge, EDGE_STEP);
    held.speed = (toward < 0 && start < taken) || (toward > 0 && start > taken) ? toward : 0;
    if (held.speed === 0) {
      stopScrolling();
    } else if (!timer.current) {
      timer.current = setInterval(() => {
        const current = gesture.current;
        const end = Math.max(0, content - visible.current);
        const next = Math.max(0, Math.min(end, offset.current + (current?.speed ?? 0)));
        if (!current || next === offset.current) {
          stopScrolling();
          return;
        }
        offset.current = next;
        scroll.current?.scrollTo(
          horizontal ? { x: next, animated: false } : { y: next, animated: false }
        );
        follow();
      }, EDGE_EVERY_MS);
    }
  };

  const pageOf = (event: GestureResponderEvent) =>
    horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;

  /** Let go (`commit`), or taken from it (the system's gesture): back to its place then. */
  const end = (commit: boolean) => {
    const held = gesture.current;
    gesture.current = null;
    stopScrolling();
    if (!held) return;
    sway.set(
      reduceMotion
        ? 0
        : withSpring(0, { duration: motion.reorderSwing, dampingRatio: SWING_DAMPING })
    );
    setDrag(null);
    setLive(null);
    onDragging?.(false);
    if (commit && held.live.join() !== ids.join()) onMove(held.live);
  };

  const handleOf = (id: string): GestureResponderHandlers => ({
    // A second finger on another card while one is dragged: refused by the one dragged (below).
    onStartShouldSetResponder: () => enabled && count > 1,
    onMoveShouldSetResponder: () => false,
    onResponderGrant: (event) => {
      const page = pageOf(event);
      const from = ids.indexOf(id);
      gesture.current = {
        id,
        from,
        page,
        last: page,
        offset: offset.current,
        live: [...ids],
        speed: 0,
        sampled: page,
        at: Date.now()
      };
      delta.set(0);
      sway.set(0);
      setDrag({ id, from });
      setTop(id);
      onDragging?.(true);
      // True: the native scroll (Android's) never takes the gesture over, before the render that
      // disables it (`scrollEnabled`) reaches it (React Native's responder: blocks the host one).
      return true;
    },
    onResponderMove: (event) => {
      const held = gesture.current;
      if (!held) return;
      const page = pageOf(event);
      held.last = page;
      follow();
      if (reduceMotion || lift.sway <= 0) return;
      // Too soon to measure: the lean started last goes on meanwhile.
      const now = Date.now();
      if (now - held.at < SPEED_WINDOW_MS) return;
      const speed = (page - held.sampled) / (now - held.at);
      held.sampled = page;
      held.at = now;
      // Leans with its movement, then, once no movement keeps it there, swings back.
      sway.set(
        withSequence(
          withTiming(swayOf(speed, lift.sway), LEAN),
          withSpring(0, { duration: motion.reorderSwing, dampingRatio: SWING_DAMPING })
        )
      );
    },
    onResponderRelease: () => end(true),
    onResponderTerminate: () => end(false),
    // Once a card follows the pointer, the scroll (or the panel) never takes it back.
    onResponderTerminationRequest: () => false
  });

  // The cards read again meanwhile (one deleted, one added elsewhere): each still has a place.
  const shown = live ? withCurrentIds(live, ids) : ids;
  const scrollBy = (direction: 1 | -1) => {
    const end = Math.max(0, content - visible.current);
    const next = Math.max(
      0,
      Math.min(end, offset.current + direction * pageScroll(visible.current - 2 * inset, pitch))
    );
    scroll.current?.scrollTo(
      horizontal ? { x: next, animated: !reduceMotion } : { y: next, animated: !reduceMotion }
    );
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <ScrollView
        ref={scroll}
        horizontal={horizontal}
        scrollEnabled={drag === null}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={!horizontal}
        scrollEventThrottle={16}
        onLayout={(event: LayoutChangeEvent) => {
          const { width, height } = event.nativeEvent.layout;
          visible.current = horizontal ? width : height;
          edges();
        }}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { x, y } = event.nativeEvent.contentOffset;
          offset.current = horizontal ? x : y;
          edges();
        }}
        style={scrollStyle}
        contentContainerStyle={[
          horizontal ? { paddingHorizontal: inset } : { paddingVertical: inset },
          contentStyle
        ]}
        accessibilityLabel={accessibilityLabel}
        testID={testID && `${testID}-scroll`}
      >
        <View
          style={
            horizontal
              ? { width: length, height: crossSize }
              : { height: length, alignSelf: "stretch" }
          }
        >
          {ids.map((id) => (
            <TrackItem
              key={id}
              slot={shown.indexOf(id) * pitch}
              dragged={drag?.id === id}
              above={top === id}
              from={drag?.id === id ? drag.from : null}
              pitch={pitch}
              delta={delta}
              sway={sway}
              lift={lift}
              horizontal={horizontal}
              itemSize={itemSize}
              crossSize={crossSize}
              reduceMotion={reduceMotion}
              render={renderItem}
              id={id}
              handle={handleOf(id)}
            />
          ))}
        </View>
      </ScrollView>
      {arrows && hidden.before ? (
        <View style={[styles.arrow, styles.arrowBefore, { top: arrows.center - ARROW / 2 }]}>
          <IconButton
            icon="chevron-left"
            tone="outline"
            size={16}
            label={arrows.previous}
            onPress={() => scrollBy(-1)}
            testID={testID && `${testID}-previous`}
          />
        </View>
      ) : null}
      {arrows && hidden.after ? (
        <View style={[styles.arrow, styles.arrowAfter, { top: arrows.center - ARROW / 2 }]}>
          <IconButton
            icon="chevron-right"
            tone="outline"
            size={16}
            label={arrows.next}
            onPress={() => scrollBy(1)}
            testID={testID && `${testID}-next`}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * One card on the line: at its place (`slot`), sliding there when the order changes; what it lifts
 * (`lifted`) under the pointer while dragged, settling back once let go.
 */
function TrackItem({
  slot,
  dragged,
  above,
  from,
  pitch,
  delta,
  sway,
  lift,
  horizontal,
  itemSize,
  crossSize,
  reduceMotion,
  render,
  id,
  handle
}: {
  slot: number;
  dragged: boolean;
  /** Drawn above the others (the card dragged last). */
  above: boolean;
  /** Its place when taken, while dragged. */
  from: number | null;
  pitch: number;
  delta: SharedValue<number>;
  sway: SharedValue<number>;
  lift: SortableLift;
  horizontal: boolean;
  itemSize: number;
  crossSize?: number;
  reduceMotion: boolean;
  render: SortableTrackProps["renderItem"];
  id: string;
  handle: GestureResponderHandlers;
}) {
  const styles = useStyles();
  // Its place in the line, dragged or not: where it settles, what stays out of `lifted` with it.
  const place = useSharedValue(slot);
  // Where it was taken from while dragged (NaN otherwise): what it lifts is then drawn under the
  // pointer, `delta` from there, whatever its place does meanwhile (nothing copied frame to frame).
  const held = useSharedValue(Number.NaN);
  // Once let go, how far what it lifts is from its place, back to none.
  const float = useSharedValue(0);
  // 0 at rest, 1 taken: its lean and size.
  const raised = useSharedValue(0);
  // 0 at rest, 1 taken: its shadow's opacity (a fade, with Reduce Motion too).
  const shadowed = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    const animate = placed.current && !reduceMotion;
    place.set(animate ? withTiming(slot, { duration: motion.reorder }) : slot);
    placed.current = true;
  }, [slot, place, reduceMotion]);
  useEffect(() => {
    raised.set(reduceMotion ? 0 : withTiming(dragged ? 1 : 0, { duration: motion.reorderLift }));
    // Gone by the time the card has settled.
    shadowed.set(
      withTiming(dragged ? 1 : 0, { duration: dragged ? motion.reorderLift : motion.reorder })
    );
    if (dragged) {
      if (from !== null) held.set(from * pitch);
      return;
    }
    // Let go: it settles from where it was dropped, never from where it was taken.
    const dropped = held.get();
    if (!Number.isNaN(dropped)) {
      float.set(dropped + delta.get() - place.get());
      held.set(Number.NaN);
    }
    float.set(reduceMotion ? 0 : withTiming(0, { duration: motion.reorder }));
  }, [dragged, from, pitch, delta, held, float, place, raised, shadowed, reduceMotion]);
  const style = useAnimatedStyle(() => {
    const at = place.get();
    return horizontal ? { transform: [{ translateX: at }] } : { transform: [{ translateY: at }] };
  }, [horizontal]);
  const lifted = useAnimatedStyle(() => {
    const up = raised.get();
    const from = held.get();
    const along = Number.isNaN(from) ? float.get() : from + delta.get() - place.get();
    return {
      transform: [
        horizontal ? { translateX: along } : { translateY: along },
        { rotate: `${(lift.tilt + sway.get()) * up}deg` },
        { scale: 1 + (lift.scale - 1) * up }
      ]
    };
  }, [horizontal, lift.tilt, lift.scale]);
  const shadow = useAnimatedStyle(() => ({ opacity: shadowed.get() }));
  return (
    <Animated.View
      // Its props change while it shows, in a panel's Modal (Android: addViewAt failed).
      collapsable={false}
      style={[
        styles.item,
        horizontal ? { width: itemSize, height: crossSize } : { height: itemSize, right: 0 },
        above && styles.itemAbove,
        style
      ]}
    >
      {render(id, { dragged, handle, lifted, shadow })}
    </Animated.View>
  );
}

const useStyles = makeStyles(({ shadow }) => ({
  wrap: { position: "relative" },
  item: { position: "absolute", top: 0, left: 0, zIndex: 0 },
  itemAbove: { zIndex: 2 },
  arrow: {
    position: "absolute",
    zIndex: 3,
    borderRadius: radius.pill,
    boxShadow: shadow.card
  },
  arrowBefore: { left: 14 },
  arrowAfter: { right: 14 }
}));
