import { act, render, screen } from "@testing-library/react-native";
import { PixelRatio, StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  cellLit,
  ChainLoader,
  chainStep,
  CYCLE,
  isMined,
  linkGrown,
  popScale,
  slid,
  STEP
} from "@/components/ui/ChainLoader";
import { lightColors as colors, motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

/** The pieces are decorative (aria-hidden): found with the hidden elements only. */
const HIDDEN = { includeHiddenElements: true };
const CELLS = [0, 1, 2, 3];
/** The loop's moments (motion tokens): the slide's end, the block mined, its pop's end. */
const SLIDE = motion.chainSlide;
const MINED = SLIDE + 14 * motion.chainTick;
const POPPED = MINED + motion.chainPop;

function piece(testID: string) {
  return screen.getByTestId(testID, HIDDEN);
}

/** A piece's place, as laid out (left, top, width, height). */
function placeOf(testID: string) {
  const { left, top, width, height } = StyleSheet.flatten(piece(testID).props.style);
  return { left: Number(left), top: Number(top), width: Number(width), height: Number(height) };
}

/** Whether `a` and `b` (points) are within half a pixel of the screen: what layout rounds. */
function withinHalfAPixel(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.5 / PixelRatio.get() + 1e-9;
}

/** Whether `points` is a whole number of the screen's pixels. */
function onPixelGrid(points: number): boolean {
  const pixels = points * PixelRatio.get();
  return Math.abs(pixels - Math.round(pixels)) < 1e-9;
}

function transformOf(testID: string): Record<string, number> {
  return Object.assign({}, ...(getAnimatedStyle(piece(testID)).transform as object[]));
}

type Frame = {
  slide: number;
  scale: number;
  fill: number;
  outline: number;
  link: number;
  linkOpacity: number;
  cells: boolean[];
};

/** What the loader shows now. */
function frameNow(): Frame {
  return {
    slide: transformOf("chain-track").translateX,
    scale: transformOf("chain-block-mining").scale,
    fill: Number(getAnimatedStyle(piece("chain-block-fill")).opacity),
    outline: Number(getAnimatedStyle(piece("chain-block-outline")).opacity),
    link: transformOf("chain-link-growing").scaleX,
    linkOpacity: Number(getAnimatedStyle(piece("chain-link-growing")).opacity),
    cells: CELLS.map(
      (index) => getAnimatedStyle(piece(`chain-cell-${index}`)).backgroundColor !== "transparent"
    )
  };
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("ChainLoader", () => {
  it("never reads out of its flicker table, even a hair outside the loop", () => {
    // Reanimated's timing can start a repeat a hair below 0 (seen on the web): tick -1 threw.
    for (const position of [-0.001, -1, 0, 0.5, 0.999, 1, 1.001, 2]) {
      for (const index of CELLS) {
        expect(() => cellLit(position, index, false)).not.toThrow();
      }
    }
    // Outside the loop: its ends.
    expect(CELLS.map((index) => cellLit(-0.001, index, false))).toEqual(
      CELLS.map((index) => cellLit(0, index, false))
    );
    expect(CELLS.map((index) => cellLit(1.001, index, false))).toEqual(
      CELLS.map((index) => cellLit(1, index, false))
    );
  });

  it("arrives empty, flickers while mined, then fills with a pop", () => {
    // Sliding in: empty.
    for (const ms of [0, SLIDE / 2, SLIDE - 1]) {
      expect(CELLS.map((index) => cellLit(ms / CYCLE, index, false))).toEqual([
        false,
        false,
        false,
        false
      ]);
    }
    // At rest: its cells flicker, never all lit, until mined (14 flickers).
    const patterns = new Set<string>();
    for (let ms = SLIDE; ms < MINED; ms += 10) {
      const lit = CELLS.map((index) => cellLit(ms / CYCLE, index, false));
      expect(lit.every(Boolean)).toBe(false);
      expect(isMined(ms / CYCLE, false)).toBe(false);
      patterns.add(lit.join());
    }
    expect(patterns.size).toBeGreaterThan(5);
    // Mined: whole, with a pop from 1.2 back to 1.
    const mined = MINED / CYCLE;
    expect(isMined(mined, false)).toBe(true);
    expect(CELLS.every((index) => cellLit(mined, index, false))).toBe(true);
    expect(popScale(mined, false)).toBeCloseTo(1.2);
    expect(popScale(mined - 0.001, false)).toBe(1);
    expect(popScale(POPPED / CYCLE, false)).toBe(1);
  });

  it("grows the mined block's link once its pop is done, before the next loop", () => {
    const grown = POPPED + motion.chainGrow;
    expect(linkGrown((POPPED - 1) / CYCLE, false)).toBe(0);
    expect(linkGrown((POPPED + motion.chainGrow / 2) / CYCLE, false)).toBeGreaterThan(0);
    expect(linkGrown(grown / CYCLE, false)).toBe(1);
    // The motion tokens leave the link grown before the loop starts again: retuned so that it
    // would not be, the chain would snap back with its link half grown.
    expect(grown).toBeLessThanOrEqual(CYCLE);
    expect(CYCLE).toBe(motion.chainCycle);
  });

  // The loop starts again with the chain one step right: the mined block, linked, takes the place
  // of the still block on its left (with its links). Both must show the same.
  it("ends each loop the way the next one starts", () => {
    expect(slid(1, false)).toBe(1);
    expect(isMined(1, false)).toBe(true);
    expect(popScale(1, false)).toBe(1);
    expect(linkGrown(1, false)).toBe(1);
    // The new block, right of the box, arrives empty, its link not grown yet.
    expect(slid(0, false)).toBe(0);
    expect(isMined(0, false)).toBe(false);
    expect(linkGrown(0, false)).toBe(0);
    expect(popScale(0, false)).toBe(1);
  });

  it("slides one step left steadily, at rest once its slide is done", () => {
    let previous = -Infinity;
    for (let ms = 0; ms <= CYCLE; ms += 10) {
      const now = slid(ms / CYCLE, false);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(slid(SLIDE / CYCLE, false)).toBe(1);
    expect(slid(SLIDE / 2 / CYCLE, false)).toBeCloseTo(0.5);
  });

  it("holds a half-mined block with Reduce Motion", () => {
    for (const position of [0, 0.3, 0.9, 1]) {
      expect(slid(position, true)).toBe(1);
      expect(isMined(position, true)).toBe(false);
      expect(popScale(position, true)).toBe(1);
      expect(linkGrown(position, true)).toBe(0);
      expect(CELLS.map((index) => cellLit(position, index, true))).toEqual([
        true,
        false,
        false,
        true
      ]);
    }
  });

  describe("rendered", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.mocked(useReducedMotion).mockReturnValue(false);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("is the size asked: the pill's other signs' (12, 10 in xs)", async () => {
      for (const size of [12, 10]) {
        await render(<ChainLoader color={colors.state.unconfirmed.dot} size={size} />);
        expect(StyleSheet.flatten(piece("chain-loader").props.style)).toMatchObject({
          width: size,
          height: size,
          overflow: "hidden"
        });
        // Its blocks: 10 twelfths of it, 1 from its edge once slid (to the screen's pixel).
        const mining = placeOf("chain-block-mining");
        expect(withinHalfAPixel(mining.width, (10 * size) / 12)).toBe(true);
        expect(withinHalfAPixel(mining.top, size / 12)).toBe(true);
      }
    });

    // Flush with the outline, a lit cell would merge with it at 12 points.
    it("keeps its cells one twelfth clear of the outline and of each other", async () => {
      for (const size of [12, 10]) {
        await render(<ChainLoader color={colors.state.unconfirmed.dot} size={size} />);
        const unit = size / 12;
        const block = placeOf("chain-block-mining").width;
        const outline = Number(
          StyleSheet.flatten(piece("chain-block-outline").props.style).borderWidth
        );
        expect(outline).toBeCloseTo(unit);
        const cells = [0, 1, 2, 3].map((index) => placeOf(`chain-cell-${index}`));
        // Across (cells 0 and 1) and down (cells 0 and 2): outline, gap, cell, gap, cell, gap,
        // outline.
        for (const [axis, extent, second] of [
          ["left", "width", 1],
          ["top", "height", 2]
        ] as const) {
          const [first, next] = [cells[0], cells[second]];
          // The block is on the pixel grid (its size the mined block's), the cells as drawn:
          // the gaps are a twelfth to the screen's pixel.
          expect(withinHalfAPixel(first[axis] - outline, unit)).toBe(true);
          expect(withinHalfAPixel(next[axis] - (first[axis] + first[extent]), unit)).toBe(true);
          expect(withinHalfAPixel(block - outline - (next[axis] + next[extent]), unit)).toBe(true);
        }
        // All four the same size.
        for (const cell of cells) {
          expect([cell.width, cell.height]).toEqual([cells[0].width, cells[0].width]);
        }
      }
    });

    // What the restart puts in place of the mined block and its links: the still pieces one step
    // left, of the same size.
    it("draws the leaving block and its links one step left of the block being mined", async () => {
      for (const size of [12, 10]) {
        await render(<ChainLoader color={colors.state.unconfirmed.dot} size={size} />);
        const step = chainStep(size);
        const pairs = [
          ["chain-block-mined", "chain-block-mining"],
          ["chain-link-mined", "chain-link-growing"],
          ["chain-link-older", "chain-link-mined"]
        ] as const;
        for (const [still, moving] of pairs) {
          const [a, b] = [placeOf(still), placeOf(moving)];
          expect(Math.abs(a.left + step - b.left)).toBeLessThan(1e-9);
          expect([a.top, a.width, a.height]).toEqual([b.top, b.width, b.height]);
        }
        // At rest, the block being mined is one twelfth of the box from its left edge.
        const track = StyleSheet.flatten(piece("chain-track").props.style);
        const atRest = Number(track.left) + placeOf("chain-block-mining").left - step;
        expect(withinHalfAPixel(atRest, size / 12)).toBe(true);
      }
    });

    // Layout (Yoga) rounds every view's place to the screen's pixels, a transform is not: slid by
    // STEP's exact points (10.83 at 10), the chain jumped 0.33 to 0.5 pixel at each restart.
    it("places its pieces on the pixel grid and slides whole pixels, at common densities", async () => {
      const ratio = jest.spyOn(PixelRatio, "get");
      try {
        for (const density of [1, 2, 2.625, 3, 3.5]) {
          ratio.mockReturnValue(density);
          for (const size of [12, 10]) {
            await render(<ChainLoader color={colors.state.unconfirmed.dot} size={size} />);
            const step = chainStep(size);
            expect(onPixelGrid(step)).toBe(true);
            // At rest, slid exactly one step: whole pixels.
            await advance(CYCLE / 2);
            expect(transformOf("chain-track").translateX).toBe(-step);
            expect(withinHalfAPixel(step, (STEP * size) / 12)).toBe(true);
            const track = StyleSheet.flatten(piece("chain-track").props.style);
            expect(onPixelGrid(Number(track.left))).toBe(true);
            for (const id of [
              "chain-link-older",
              "chain-block-mined",
              "chain-link-mined",
              "chain-block-mining",
              "chain-link-growing"
            ]) {
              const { left, top, width, height } = placeOf(id);
              expect([left, top, width, height].map(onPixelGrid)).toEqual([true, true, true, true]);
            }
            // Each still piece exactly one step left of the piece it replaces at the restart.
            for (const [still, moving] of [
              ["chain-block-mined", "chain-block-mining"],
              ["chain-link-mined", "chain-link-growing"],
              ["chain-link-older", "chain-link-mined"]
            ] as const) {
              expect(Math.abs(placeOf(still).left + step - placeOf(moving).left)).toBeLessThan(
                1e-9
              );
            }
          }
        }
      } finally {
        ratio.mockRestore();
      }
    });

    it("loops without a jump: the restart shows what the end of the loop showed", async () => {
      await render(<ChainLoader color={colors.state.unconfirmed.dot} size={12} />);
      const frames: Frame[] = [];
      // A loop and a half, frame by frame: the restart is at CYCLE.
      for (let ms = 0; ms <= CYCLE * 1.5; ms += 16) {
        frames.push(frameNow());
        await advance(16);
      }
      let restarts = 0;
      for (let i = 1; i < frames.length; i++) {
        const [before, after] = [frames[i - 1], frames[i]];
        if (after.slide > before.slide) {
          restarts += 1;
          // Before: the chain slid, the block mined, popped, linked.
          expect(before.slide).toBeCloseTo(-chainStep(12));
          expect([before.fill, before.outline, before.scale]).toEqual([1, 0, 1]);
          expect(before.link).toBeCloseTo(1);
          // After: one step right, within one frame of the slide (the still pieces in its
          // place); the new block, out of the box, empty, its link not grown.
          expect(Math.abs(after.slide)).toBeLessThan(0.5);
          expect([after.fill, after.outline, after.linkOpacity]).toEqual([0, 1, 0]);
          expect(after.cells).toEqual([false, false, false, false]);
          continue;
        }
        // Between restarts the chain moves less than 2 px a frame (an ease-in-out of 13 px over
        // its slide: 1.4 px at most).
        expect(before.slide - after.slide).toBeLessThan(2);
        expect(after.slide).toBeLessThanOrEqual(before.slide);
      }
      expect(restarts).toBe(1);
      // Mid-loop: at rest, being mined.
      const atRest = frames[Math.round(CYCLE / 2 / 16)];
      expect(atRest.slide).toBe(-chainStep(12));
      expect([atRest.fill, atRest.outline, atRest.scale]).toEqual([0, 1, 1]);
    });

    it("holds still with Reduce Motion", async () => {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      await render(<ChainLoader color={colors.state.unconfirmed.dot} size={10} />);
      for (let step = 0; step < 3; step++) {
        const frame = frameNow();
        expect(frame.slide).toBeCloseTo(-chainStep(10));
        expect([frame.fill, frame.outline, frame.scale, frame.linkOpacity]).toEqual([0, 1, 1, 0]);
        expect(frame.cells).toEqual([true, false, false, true]);
        await advance(CYCLE / 3);
      }
    });
  });
});
