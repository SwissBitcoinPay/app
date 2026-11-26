import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { ORDER_ROW_LIFT } from "@/features/card/CardOrderSheet";
import { SortableTrack, type SortableLift } from "@/features/card/SortableTrack";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

/** Rows 60 high, side by side, none apart. */
const ROW = 60;
const LIFT: SortableLift = { tilt: -3, sway: 6, scale: 1.04 };
/** Long enough for every animation started to end (the swing's spring included). */
const SETTLED = 3 * motion.reorderSwing;

/** Each row: what it lifts (its card), then what stays at its place (its name). */
function Track({
  rows = ["a", "b", "c"],
  edge = 0,
  lift = LIFT
}: {
  rows?: string[];
  edge?: number;
  lift?: SortableLift;
}) {
  const [ids, setIds] = useState(rows);
  return (
    <SortableTrack
      axis="y"
      ids={ids}
      itemSize={ROW}
      gap={0}
      enabled
      edge={edge}
      lift={lift}
      onMove={setIds}
      testID="track"
      renderItem={(id, { handle, lifted, shadow }) => (
        <View {...handle} testID={`row-${id}`}>
          <Animated.View style={lifted} testID={`card-${id}`}>
            <Animated.View style={shadow} testID={`shadow-${id}`} />
            <Text>{id}</Text>
          </Animated.View>
          <Text testID={`name-${id}`}>{id}</Text>
        </View>
      )}
    />
  );
}

type Transform = { translateY?: number; rotate?: string; scale?: number };

function transformOf(node: { props: Record<string, unknown> }): Transform {
  const transform = getAnimatedStyle(node).transform as Transform[] | undefined;
  return Object.assign({}, ...(transform ?? []));
}

/** A row's place in the line: where its name is (the animated view around the row). */
function placeOf(id: string): number {
  let at = screen.getByTestId(`row-${id}`).parent as {
    props: Record<string, unknown>;
    parent: unknown;
  } | null;
  while (at) {
    const along = transformOf(at).translateY;
    if (along !== undefined) return along;
    at = at.parent as typeof at;
  }
  throw new Error(`row ${id} is not placed`);
}

/** Where its card is drawn along the line, how it leans (degrees) and how big it is. */
function cardOf(id: string) {
  const lifted = transformOf(screen.getByTestId(`card-${id}`));
  return {
    at: placeOf(id) + (lifted.translateY ?? 0),
    lean: parseFloat(lifted.rotate ?? "0deg"),
    scale: lifted.scale ?? 1
  };
}

/** How much of its shadow a row's card shows (0 to 1). */
function shadowOf(id: string): number {
  return getAnimatedStyle(screen.getByTestId(`shadow-${id}`)).opacity as number;
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The pointer, on `row`, moved to each point, `gap` ms apart (a pointer's events: 60 a second). */
async function moveTo(row: ReturnType<typeof screen.getByTestId>, points: number[], gap = 16) {
  for (const point of points) {
    await advance(gap);
    await fireEvent(row, "responderMove", { nativeEvent: { pageY: point } });
  }
}

/** The pointer on row `id`'s card: taken at 300, then moved to each point. */
async function drag(id: string, points: number[]) {
  const row = screen.getByTestId(`row-${id}`);
  await fireEvent(row, "responderGrant", { nativeEvent: { pageY: 300 } });
  await moveTo(row, points);
  return row;
}

describe("a card dragged along its line", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("follows the pointer, its name staying at the place it will settle into", async () => {
    await render(<Track />);
    await drag("a", [320, 340]);
    await advance(motion.reorder);
    // Its card under the pointer; its place (its name), the next one, where it now points.
    expect(cardOf("a").at).toBeCloseTo(40);
    expect(placeOf("a")).toBe(ROW);
    // The next row made room: it slid up to the first place.
    expect(placeOf("b")).toBe(0);
  });

  it("lifts and leans, with its movement, then swings back to its lean held still", async () => {
    await render(<Track />);
    // Taken: lifted, leaning as the design's.
    await drag("a", []);
    await advance(motion.reorderLift);
    expect(cardOf("a").lean).toBeCloseTo(LIFT.tilt);
    expect(cardOf("a").scale).toBeCloseTo(LIFT.scale);
    // Carried down fast (20 points every 16 ms): it leans with its movement, no further than
    // the most.
    const row = screen.getByTestId("row-a");
    await moveTo(row, [310, 330, 350]);
    await advance(motion.reorderLean);
    const leaning = cardOf("a").lean;
    expect(leaning).toBeGreaterThan(LIFT.tilt + 1);
    expect(leaning).toBeLessThanOrEqual(LIFT.tilt + LIFT.sway + 1e-6);
    // Held still: it swings past its lean, then rests there.
    let past = false;
    for (let elapsed = 0; elapsed < SETTLED; elapsed += 16) {
      await advance(16);
      if (cardOf("a").lean < LIFT.tilt - 0.1) past = true;
    }
    expect(past).toBe(true);
    expect(cardOf("a").lean).toBeCloseTo(LIFT.tilt, 1);
    // Carried up: it leans the other way.
    await moveTo(row, [340, 320, 300]);
    await advance(motion.reorderLean);
    expect(cardOf("a").lean).toBeLessThan(LIFT.tilt - 1);
  });

  it("leans at once with an unhurried movement, each pointer event starting it again", async () => {
    await render(<Track />);
    await drag("a", []);
    await advance(motion.reorderLift);
    // 5 points every 16 ms (about 300 a second): within two events' time, it leans clearly.
    await moveTo(screen.getByTestId("row-a"), [305, 310, 315]);
    await advance(16);
    expect(cardOf("a").lean).toBeGreaterThan(LIFT.tilt + 1.5);
  });

  it("never leans from a jitter between two close pointer events", async () => {
    await render(<Track />);
    await drag("a", []);
    await advance(motion.reorderLift);
    // Held still (an event where it was taken), then 5 points within 1 ms (a hand barely
    // moving), then nothing.
    await moveTo(screen.getByTestId("row-a"), [300]);
    await moveTo(screen.getByTestId("row-a"), [305], 1);
    await advance(motion.reorderLean);
    expect(cardOf("a").lean).toBeCloseTo(LIFT.tilt, 1);
    // The same pace at 120 events a second (5 points every 8 ms): it leans, measured over two.
    await moveTo(screen.getByTestId("row-a"), [310, 315, 320, 325], 8);
    await advance(8);
    expect(cardOf("a").lean).toBeGreaterThan(LIFT.tilt + 1.5);
  });

  it('never leans, taken nor carried, as a row of "Card order"', async () => {
    await render(<Track lift={ORDER_ROW_LIFT} />);
    const row = await drag("a", []);
    await advance(motion.reorderLift);
    expect(cardOf("a").lean).toBe(0);
    // Carried fast both ways, then held still: straight all along.
    for (const points of [
      [310, 330, 350],
      [340, 320, 300]
    ]) {
      await moveTo(row, points);
      for (let elapsed = 0; elapsed < motion.reorderLean + motion.reorderSwing; elapsed += 16) {
        await advance(16);
        expect(cardOf("a").lean).toBe(0);
      }
    }
    expect(cardOf("a").scale).toBe(1);
  });

  it("fades its shadow in once taken and out as it settles, never at once", async () => {
    await render(<Track />);
    expect(shadowOf("a")).toBe(0);
    const row = await drag("a", []);
    await advance(16);
    // The first frame: hardly any shadow yet.
    expect(shadowOf("a")).toBeLessThan(0.5);
    await advance(motion.reorderLift);
    expect(shadowOf("a")).toBe(1);
    // The others have none.
    expect(shadowOf("b")).toBe(0);
    await fireEvent(row, "responderRelease", { nativeEvent: { pageY: 300 } });
    await advance(16);
    expect(shadowOf("a")).toBeGreaterThan(0.5);
    await advance(motion.reorder);
    expect(shadowOf("a")).toBe(0);
  });

  it("settles from where it was let go into its place, upright", async () => {
    await render(<Track />);
    const row = await drag("a", [320, 340]);
    await advance(motion.reorder);
    await fireEvent(row, "responderRelease", { nativeEvent: { pageY: 340 } });
    // The first frame after: still about where it was let go, never back at its former place.
    await advance(16);
    expect(cardOf("a").at).toBeGreaterThanOrEqual(38);
    expect(cardOf("a").at).toBeLessThanOrEqual(ROW);
    await advance(SETTLED);
    expect(cardOf("a")).toEqual({ at: ROW, lean: 0, scale: 1 });
    expect(placeOf("a")).toBe(ROW);
    expect(placeOf("b")).toBe(0);
    expect(placeOf("c")).toBe(2 * ROW);
  });

  it("scrolls the line only toward the end a card was carried to", async () => {
    // Two rows of four show, the line scrolled by one: the second row rests at the top, within
    // the edge.
    await render(<Track rows={["a", "b", "c", "d"]} edge={40} />);
    const scroll = screen.getByTestId("track-scroll");
    await fireEvent(scroll, "layout", { nativeEvent: { layout: { width: 300, height: 2 * ROW } } });
    await fireEvent(scroll, "scroll", { nativeEvent: { contentOffset: { x: 0, y: ROW } } });
    // Taken there and carried down a little: the line stays, the row too.
    const row = await drag("b", [305]);
    await advance(10 * motion.reorder);
    // Then whatever the rows it passed would slide to.
    await advance(motion.reorder);
    expect(placeOf("a")).toBe(0);
    expect(placeOf("b")).toBe(ROW);
    // Carried up: the line scrolls back under it, to the first place.
    await moveTo(row, [295]);
    await advance(10 * motion.reorder);
    // The rows it passed slide to their place.
    await advance(motion.reorder);
    expect(placeOf("b")).toBe(0);
    expect(placeOf("a")).toBe(ROW);
  });

  it("neither lifts nor leans with Reduce Motion: it follows the pointer only", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(<Track />);
    const row = await drag("a", [330, 340]);
    await advance(motion.reorderLift);
    expect(cardOf("a")).toEqual({ at: 40, lean: 0, scale: 1 });
    // Its shadow still fades in: a fade, no movement.
    expect(shadowOf("a")).toBe(1);
    // Let go: at its place at once, its shadow fading out.
    await fireEvent(row, "responderRelease", { nativeEvent: { pageY: 340 } });
    await advance(16);
    expect(cardOf("a")).toEqual({ at: ROW, lean: 0, scale: 1 });
    expect(shadowOf("a")).toBeGreaterThan(0);
    await advance(motion.reorder);
    expect(shadowOf("a")).toBe(0);
  });
});
