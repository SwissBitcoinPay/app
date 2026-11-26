import { act, render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";

import { LoadingScene, type LoadingSceneKind } from "@/components/ui/LoadingScene";
import {
  beamAt,
  busyAt,
  caretAt,
  coinAt,
  fillAt,
  FINDER_PASSES,
  finderAt,
  hopAt,
  LINE_LENGTHS,
  loupeAt,
  packetAt,
  phaseAt,
  SWING_DEGREES,
  swingAt
} from "@/components/ui/loading-scene-motion";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";
import { drawn, svgColour } from "../../jest/svg";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

const SCENES: LoadingSceneKind[] = [
  "wallet",
  "cards",
  "team",
  "integrations",
  "invoice",
  "payment",
  "articles"
];

/** Positions across a loop, its ends included. */
const POSITIONS = Array.from({ length: 101 }, (_, index) => index / 100);

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("loading scenes' movements", () => {
  it("reads a piece's own loop from the scene's, late by its delay, whatever the edge", () => {
    expect(phaseAt(0, 0, 1000)).toBe(0);
    expect(phaseAt(0.25, 0, 1000)).toBeCloseTo(0.25);
    expect(phaseAt(0.25, 500, 1000)).toBeCloseTo(0.75);
    // Reanimated can start a repeat a hair outside the loop: read as its ends.
    expect(phaseAt(-0.001, 0, 1000)).toBe(0);
    expect(phaseAt(1.001, 0, 1000)).toBe(0);
  });

  it("drops each coin into the wallet, speeding up, then fades it out once in", () => {
    const start = coinAt(0, 0, false);
    expect(start).toEqual({ y: -34, opacity: 0 });
    const falling = [0.2, 0.4, 0.6].map((position) => coinAt(position, 0, false).y);
    expect(falling[1]! - falling[0]!).toBeLessThan(falling[2]! - falling[1]!);
    expect(coinAt(0.7, 0, false)).toEqual({ y: 22, opacity: 1 });
    expect(coinAt(0.99, 0, false).opacity).toBeLessThan(0.1);
    // One after the other: the second falls a third of the loop later.
    expect(coinAt(1 / 3, 1, false).y).toBeCloseTo(-34);
  });

  it("sweeps the beam down the card, faded in and out at its ends", () => {
    expect(beamAt(0, false)).toEqual({ y: 0, opacity: 0 });
    expect(beamAt(0.5, false)).toEqual({ y: 26, opacity: 1 });
    expect(beamAt(1, false)).toEqual({ y: 52, opacity: 0 });
  });

  it("jumps each avatar 16 units, orange only in the air, its shadow smallest at the top", () => {
    const top = hopAt(0.28, 0, false);
    expect(top.y).toBeCloseTo(-16);
    expect(top.lit).toBe(true);
    expect(top.shadowScale).toBeCloseTo(0.55);
    expect(hopAt(0.05, 0, false).lit).toBe(false);
    expect(hopAt(0.5, 0, false).lit).toBe(false);
    for (const position of POSITIONS) {
      const { y, lit } = hopAt(position, 0, false);
      expect(y).toBeLessThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(-16);
      // Never orange on the ground: a switch in the air, never a blend.
      if (y === 0) expect(lit).toBe(false);
    }
    expect(hopAt(0.62, 0, false)).toEqual(hopAt(0.9, 0, false));
  });

  it("carries the packets across the 18 units between the shop and its server", () => {
    expect(packetAt(0, 0, false)).toEqual({ x: 0, opacity: 0 });
    expect(packetAt(0.5, 0, false)).toEqual({ x: 9, opacity: 1 });
    expect(packetAt(0.99, 0, false).x).toBeCloseTo(17.82);
    expect(busyAt(0, false)).toBeCloseTo(0.3);
    expect(busyAt(0.5, false)).toBeCloseTo(1);
  });

  it("writes the invoice line after line, the caret at the end of each, then the total", () => {
    // A line full once its span ends, the next not started.
    expect(fillAt(0.2, 0, false).scale).toBeCloseTo(1);
    expect(fillAt(0.2, 1, false).scale).toBe(0);
    expect(caretAt(0.2, false)).toMatchObject({ x: LINE_LENGTHS[0], y: 0 });
    expect(caretAt(0.36, false)).toMatchObject({ x: LINE_LENGTHS[1], y: 10 });
    expect(caretAt(0.52, false)).toMatchObject({ x: LINE_LENGTHS[2], y: 20 });
    expect(caretAt(0.68, false)).toMatchObject({ x: LINE_LENGTHS[3], y: 30 });
    expect(caretAt(0.8, false)).toMatchObject({ x: 20 + LINE_LENGTHS[4], y: 42.5, opacity: 1 });
    // All written, then gone together before the loop starts again.
    for (const index of [0, 1, 2, 3, 4]) {
      expect(fillAt(0.85, index, false)).toEqual({ scale: 1, opacity: 1 });
      expect(fillAt(0.95, index, false)).toEqual({ scale: 0, opacity: 0 });
    }
    expect(caretAt(0.9, false).opacity).toBe(0);
  });

  it("circles the loupe 12 units around the code, clockwise from above", () => {
    for (const position of POSITIONS) {
      const { x, y } = loupeAt(position, false);
      expect(Math.hypot(x, y)).toBeCloseTo(12);
    }
    expect(loupeAt(0, false)).toEqual({ x: 0, y: -12 });
    const right = loupeAt(0.25, false);
    expect(right.x).toBeCloseTo(12);
    expect(right.y).toBeCloseTo(0);
  });

  it("lights each finder square as the loupe passes over it", () => {
    for (const pass of FINDER_PASSES) {
      expect(finderAt(pass, pass, false)).toBeCloseTo(1);
      expect(finderAt((pass + 0.5) % 1, pass, false)).toBeCloseTo(0.35);
    }
  });

  it("swings the price tag both ways round its pin, its shadow following its foot", () => {
    expect(swingAt(0, false).angle).toBeCloseTo(0);
    expect(swingAt(0.25, false).angle).toBeCloseTo(SWING_DEGREES);
    expect(swingAt(0.5, false).angle).toBeCloseTo(0);
    expect(swingAt(0.75, false).angle).toBeCloseTo(-SWING_DEGREES);
    // Seamless: the loop ends where it starts.
    expect(swingAt(1, false).angle).toBeCloseTo(swingAt(0, false).angle);
    for (const position of POSITIONS) {
      const { angle, shift } = swingAt(position, false);
      expect(Math.abs(angle)).toBeLessThanOrEqual(SWING_DEGREES + 1e-9);
      // Turned clockwise, its foot goes left: the shadow with it.
      if (Math.abs(angle) > 1) expect(Math.sign(shift)).toBe(-Math.sign(angle));
    }
  });

  it("moves nothing with Reduce Motion: each piece rests where it reads best", () => {
    expect([0, 1, 2].map((index) => coinAt(0.4, index, true))).toEqual([
      { y: 0, opacity: 1 },
      { y: 0, opacity: 0 },
      { y: 0, opacity: 0 }
    ]);
    expect(beamAt(0.4, true).opacity).toBe(0);
    expect(hopAt(0.28, 0, true)).toMatchObject({ y: 0, lit: false });
    expect(packetAt(0.4, 0, true).opacity).toBe(0);
    expect(busyAt(0.4, true)).toBe(1);
    expect(fillAt(0.1, 3, true)).toEqual({ scale: 1, opacity: 1 });
    expect(caretAt(0.4, true).opacity).toBe(0);
    expect(loupeAt(0.4, true)).toEqual({ x: 0, y: 0 });
    expect(finderAt(0.4, FINDER_PASSES[0], true)).toBe(1);
    expect(swingAt(0.25, true)).toEqual({ angle: 0, shift: 0 });
  });
});

describe("LoadingScene", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(SCENES)(
    "draws the %s scene in the spinner's ring, the words of the wait under it",
    async (scene) => {
      await render(<LoadingScene scene={scene} label="Loading your cards…" testID="scene" />);
      // Screen readers read the words, as a progress bar; the drawing is decorative.
      expect(screen.getByRole("progressbar", { name: "Loading your cards…" })).toBeTruthy();
      expect(screen.getByText("Loading your cards…")).toBeTruthy();
      expect(screen.queryByTestId("scene")).toBeNull();
      const drawing = screen.getByTestId("scene", { includeHiddenElements: true });
      // The spinner's rail and arc, and the scene's own drawing.
      expect(drawn("RNSVGCircle", drawing).length).toBeGreaterThanOrEqual(2);
      expect(drawn("RNSVGSvgView", drawing).length).toBeGreaterThan(1);
    }
  );

  it("drops Bitcoin logos into the wallet", async () => {
    await render(<LoadingScene scene="wallet" label="Loading…" testID="scene" />);
    const drawing = screen.getByTestId("scene", { includeHiddenElements: true });
    const paths = drawn("RNSVGPath", drawing);
    // The logo's white sign starts where the published logo's does (parts.tsx, BITCOIN_SIGN), on
    // its orange disc.
    const signs = paths.filter((path) => String(path.props.d).startsWith("m46.103,27.444"));
    expect(signs).toHaveLength(3);
    for (const sign of signs) expect(svgColour(sign.props.fill).rgb).toBe("#FFFFFF");
    const discs = paths.filter((path) => String(path.props.d).startsWith("m63.033,39.744"));
    expect(discs.map((disc) => svgColour(disc.props.fill).rgb)).toEqual(Array(3).fill("#F7931A"));
  });

  it("shows nothing for its delay, then fades in growing to its size", async () => {
    await render(<LoadingScene scene="wallet" label="Syncing the wallet…" />);
    const root = () => screen.getByRole("progressbar");
    const style = () => getAnimatedStyle(root());
    const scale = () => (style().transform as { scale: number }[])[0]!.scale;
    expect(Number(style().opacity)).toBe(0);
    expect(scale()).toBeCloseTo(0.94);

    await advance(motion.loadingDelay - 10);
    expect(Number(style().opacity)).toBe(0);

    await advance(motion.loadingEnter + 50);
    expect(Number(style().opacity)).toBe(1);
    expect(scale()).toBe(1);
  });

  it("fades in without growing with Reduce Motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(<LoadingScene scene="invoice" label="Loading the invoice…" />);
    const style = () => getAnimatedStyle(screen.getByRole("progressbar"));
    expect((style().transform as { scale: number }[])[0]!.scale).toBe(1);

    await advance(motion.loadingDelay + motion.loadingEnter + 50);
    expect(Number(style().opacity)).toBe(1);
  });
});
