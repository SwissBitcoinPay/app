import { useEffect } from "react";
import { PixelRatio, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue
} from "react-native-reanimated";

import { motion } from "@/theme";

/*
 * The sign of the "Confirming" pill: an endless mined chain, in the square of the pill's
 * other signs (StatusPill's SIGN_SIZES: 12, 10 in the `xs` pill). The block being mined arrives
 * empty, its four cells flicker, it fills with a pop (mined) and grows a link on its right; then
 * the chain slides one step left, the mined block leaving with its link to the next block, which
 * arrives empty from the right. One Reanimated loop drives it all on the UI thread.
 *
 * Not the design system's ChainLoader (32 × 8.5): a sign the size of an icon, its blocks sliding,
 * their cells spaced. Its flicker is the design system's (FLICKER, the same
 * tick), its cells clear of the outline and of each other as the design system's are.
 */

/** The chain's geometry, in twelfths of the box: blocks of 10, 1 from its left edge. */
const BOX = 12;
const BLOCK = 10;
const INSET = 1;
const LINK = 3;
const LINK_THICKNESS = 1.6;
/**
 * The block's four cells: 2.5 wide, 1 inside the outline (itself 1 thick) and 1 apart. Flush with
 * the outline (3.5 wide), a lit cell merged with it at 12 points.
 */
const CELL = 2.5;
const CELL_PLACES = [2, 5.5];
const RADIUS = { block: 2.5, cell: 0.6, link: 0.8 };
/** The chain's step: a block and its link. */
export const STEP = BLOCK + LINK;
/**
 * Where the drawing starts, left of the box: the link the leaving block keeps to the block before
 * it, whose end shows at the box's left edge.
 */
const ORIGIN = INSET + BLOCK - STEP;

/** The slide at the start of each loop, the block arriving with it. */
const SLIDE = motion.chainSlide;
/** One flicker of the block being mined, from the end of the slide; mined after 14. */
const TICK = motion.chainTick;
const MINED = SLIDE + 14 * TICK;
/** The pop of the block once mined, then its link growing toward the next block. */
const POP = motion.chainPop;
const GROW = motion.chainGrow;
export const CYCLE = motion.chainCycle;

/**
 * Cells lit at each flicker. A fixed pattern that looks random (the design system draws them at
 * random; the app never uses `Math.random`, AGENTS.md).
 */
const FLICKER = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [1, 1, 0, 0],
  [0, 0, 1, 1],
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [1, 1, 1, 0],
  [0, 1, 1, 1],
  [1, 0, 0, 0],
  [0, 0, 0, 1],
  [1, 1, 0, 1]
];
/** With Reduce Motion: a still chain, its block half mined. */
const STILL = [1, 0, 0, 1];

/**
 * The time (ms) into the loop at `position`; a position a hair outside the loop reads as its ends.
 * Reanimated's timing can start a repeat a hair below 0 (-0.001, seen on the web: a frame dated
 * just before the animation's start); unclamped, the block being mined read the flicker table at
 * tick -1, and the worklet threw.
 */
function timeAt(position: number): number {
  "worklet";
  return Math.min(1, Math.max(0, position)) * CYCLE;
}

/** Share 0 to 1 of the span from `start` to `start + duration` at `time` (ms). */
function share(time: number, start: number, duration: number): number {
  "worklet";
  return Math.min(1, Math.max(0, (time - start) / duration));
}

function easeOut(x: number): number {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}

function easeInOut(x: number): number {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** How far the chain has slid one step left, 0 to 1, at `position` (0 to 1); still: slid. */
export function slid(position: number, still: boolean): number {
  "worklet";
  return still ? 1 : easeInOut(share(timeAt(position), 0, SLIDE));
}

/** Whether the block being mined is mined (filled) at `position`; never with Reduce Motion. */
export function isMined(position: number, still: boolean): boolean {
  "worklet";
  return !still && timeAt(position) >= MINED;
}

/** Whether cell `index` of the block being mined is lit at `position` (0 to 1) of the loop. */
export function cellLit(position: number, index: number, still: boolean): boolean {
  "worklet";
  if (still) return STILL[index] === 1;
  const time = timeAt(position);
  if (time >= MINED) return true;
  // It arrives empty, and is mined from the moment it rests.
  if (time < SLIDE) return false;
  return FLICKER[Math.floor((time - SLIDE) / TICK) % FLICKER.length][index] === 1;
}

/** The block's scale: once mined, a short pop from 1.2 back to 1. */
export function popScale(position: number, still: boolean): number {
  "worklet";
  const time = timeAt(position);
  if (still || time < MINED) return 1;
  return 1 + 0.2 * (1 - easeOut(share(time, MINED, POP)));
}

/** How far the mined block's link to the next block has grown, 0 to 1, at `position`. */
export function linkGrown(position: number, still: boolean): number {
  "worklet";
  return still ? 0 : easeOut(share(timeAt(position), MINED + POP, GROW));
}

/** A cell's place in the block being mined, from twelfths of the box to points. */
function box(
  unit: number,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): ViewStyle {
  return {
    position: "absolute",
    left: x * unit,
    top: y * unit,
    width: width * unit,
    height: height * unit,
    borderRadius: radius * unit
  };
}

/**
 * `points` on the screen's pixel grid. Layout (Yoga) rounds every view's place to it, a transform
 * is not: the chain slid by STEP's exact points (10.83 at 10, 0.33 to 0.5 pixel off the rounded
 * places) jumped by that much at each restart. Its pieces are placed on the grid and it slides by
 * a whole number of pixels (chainStep), so a still piece takes exactly the place of the one it
 * replaces.
 */
function snap(points: number): number {
  return PixelRatio.roundToNearestPixel(points);
}

/** The chain's step in points at `size`: STEP twelfths, a whole number of the screen's pixels. */
export function chainStep(size: number): number {
  return snap((STEP * size) / BOX);
}

/**
 * A piece's place in the drawing at `size`: `x` in twelfths of the box from its left edge,
 * `behind` the steps it lies left of the moving pieces (the block being mined and its link), from
 * which it is placed whole steps (chainStep) apart, whatever the rounding.
 */
function place(
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  behind: number
): ViewStyle {
  const unit = size / BOX;
  return {
    position: "absolute",
    left: snap((x + behind * STEP - ORIGIN) * unit) - behind * chainStep(size),
    top: snap(y * unit),
    width: snap(width * unit),
    height: snap(height * unit),
    borderRadius: radius * unit
  };
}

/** A link from the block ending at `x` to the next one. */
function linkPlace(size: number, x: number, behind: number): ViewStyle {
  return place(size, x, (BOX - LINK_THICKNESS) / 2, LINK, LINK_THICKNESS, RADIUS.link, behind);
}

function Cell({
  index,
  phase,
  color,
  still,
  unit
}: {
  index: number;
  phase: SharedValue<number>;
  color: string;
  still: boolean;
  unit: number;
}) {
  const style = useAnimatedStyle(() => {
    return { backgroundColor: cellLit(phase.get(), index, still) ? color : "transparent" };
  }, [still, color, index]);
  const x = CELL_PLACES[index % 2];
  const y = CELL_PLACES[Math.floor(index / 2)];
  return (
    <Animated.View
      testID={`chain-cell-${index}`}
      style={[box(unit, x, y, CELL, CELL, RADIUS.cell), style]}
    />
  );
}

export function ChainLoader({ color, size }: { color: string; size: number }) {
  const still = useReducedMotion();
  const phase = useSharedValue(0);
  const unit = size / BOX;

  useEffect(() => {
    phase.set(0);
    if (still) return;
    phase.set(withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1));
    return () => cancelAnimation(phase);
  }, [still, phase]);

  const step = chainStep(size);
  const track = useAnimatedStyle(() => {
    return { transform: [{ translateX: -step * slid(phase.get(), still) }] };
  }, [still, step]);
  const miner = useAnimatedStyle(() => {
    return { transform: [{ scale: popScale(phase.get(), still) }] };
  }, [still]);
  // Mined: the block is its fill alone, the same edges as the mined block that takes its place.
  const outline = useAnimatedStyle(() => {
    return { opacity: isMined(phase.get(), still) ? 0 : 1 };
  }, [still]);
  const fill = useAnimatedStyle(() => {
    return { opacity: isMined(phase.get(), still) ? 1 : 0 };
  }, [still]);
  const link = useAnimatedStyle(() => {
    const grown = linkGrown(phase.get(), still);
    return { opacity: grown > 0 ? 1 : 0, transform: [{ scaleX: grown }] };
  }, [still]);

  const tint = { backgroundColor: color };
  // The block being mined rests at INSET once slid: one step right of it before the slide.
  const minerX = INSET + STEP;
  // The block being mined's own box, for its outline and its fill: the size of the mined block
  // that takes its place.
  const whole = {
    position: "absolute",
    left: 0,
    top: 0,
    width: snap(BLOCK * unit),
    height: snap(BLOCK * unit),
    borderRadius: RADIUS.block * unit
  } as const;
  return (
    <View aria-hidden testID="chain-loader" style={[styles.root, { width: size, height: size }]}>
      <Animated.View
        testID="chain-track"
        style={[
          styles.track,
          {
            left: snap(ORIGIN * unit),
            width: snap((minerX + BLOCK + LINK - ORIGIN) * unit),
            height: size
          },
          track
        ]}
      >
        {/* The mined block that leaves on the left, with its links to its neighbours. */}
        <View testID="chain-link-older" style={[linkPlace(size, ORIGIN, 2), tint]} />
        <View
          testID="chain-block-mined"
          style={[place(size, INSET, INSET, BLOCK, BLOCK, RADIUS.block, 1), tint]}
        />
        <View testID="chain-link-mined" style={[linkPlace(size, INSET + BLOCK, 1), tint]} />
        <Animated.View
          testID="chain-block-mining"
          style={[place(size, minerX, INSET, BLOCK, BLOCK, RADIUS.block, 0), miner]}
        >
          <Animated.View
            testID="chain-block-outline"
            style={[whole, { borderWidth: unit, borderColor: color }, outline]}
          />
          {[0, 1, 2, 3].map((index) => (
            <Cell key={index} index={index} phase={phase} color={color} still={still} unit={unit} />
          ))}
          <Animated.View testID="chain-block-fill" style={[whole, tint, fill]} />
        </Animated.View>
        <Animated.View
          testID="chain-link-growing"
          style={[linkPlace(size, minerX + BLOCK, 0), styles.growingLink, tint, link]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  // Wider than the box (the leaving block on its left, the block being mined on its right), the
  // drawing overflows it, clipped. A fixed width and an absolute place, not the box's flex
  // alignment, so every layout engine draws it at the same place.
  track: { position: "absolute", top: 0 },
  growingLink: { transformOrigin: "left center" }
});
