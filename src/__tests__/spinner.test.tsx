import { act, render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";

import { Spinner } from "@/components/ui/Spinner";
import { lightColors as colors, motion, palette } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";
import { dashed, drawn, svgColour } from "../../jest/svg";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Hidden from screen readers: found with the hidden elements only. */
const spinner = () => screen.getByTestId("spinner", { includeHiddenElements: true });

function angle(): number {
  const [{ rotate }] = getAnimatedStyle(spinner()).transform as { rotate: string }[];
  return parseFloat(rotate);
}

const opacity = () => Number(getAnimatedStyle(spinner()).opacity);

/** The two rings drawn, the rail, then the arc: each one's colour (#RRGGBB, opacity) and dashes. */
function rings() {
  const circles = drawn("RNSVGCircle");
  expect(circles).toHaveLength(2);
  const [rail, arc] = circles.map((circle) => ({
    ...svgColour(circle.props.stroke),
    dashed: dashed(circle)
  }));
  return { rail: rail!, arc: arc! };
}

/** The rail: the ink at 10 %, whole, whatever the arc's colour. */
const RAIL = { rgb: palette.ink, alpha: expect.closeTo(0.1, 2), dashed: false };

describe("Spinner", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is decorative: screen readers skip it", async () => {
    await render(<Spinner testID="spinner" />);
    expect(screen.queryByTestId("spinner")).toBeNull();
    expect(spinner()).toBeTruthy();
  });

  it("turns an orange arc on an ink rail, or an arc of the colour asked on the same rail", async () => {
    await render(<Spinner testID="spinner" />);
    expect(rings()).toEqual({ rail: RAIL, arc: { rgb: palette.orange, alpha: 1, dashed: true } });

    await render(<Spinner testID="spinner" color={colors.state.unconfirmed.dot} />);
    expect(rings()).toEqual({
      rail: RAIL,
      arc: { rgb: colors.state.unconfirmed.dot, alpha: 1, dashed: true }
    });
  });

  it("turns one turn a second, round and round, without fading", async () => {
    await render(<Spinner testID="spinner" />);
    expect(angle()).toBe(0);

    await advance(motion.spin / 4);
    expect(angle()).toBeGreaterThan(80);
    expect(angle()).toBeLessThan(100);

    // A turn later, the same place: it starts again from 0 at each turn.
    await advance(motion.spin);
    expect(angle()).toBeGreaterThan(80);
    expect(angle()).toBeLessThan(100);
    expect(opacity()).toBe(1);
  });

  it("no longer turns with Reduce Motion: the ring pulses instead", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(<Spinner testID="spinner" color={colors.state.unconfirmed.dot} />);
    // The whole ring, in the colour asked.
    expect(rings()).toEqual({
      rail: RAIL,
      arc: { rgb: colors.state.unconfirmed.dot, alpha: 1, dashed: false }
    });

    await advance(motion.pulseDuration / 2);
    expect(angle()).toBe(0);
    expect(opacity()).toBeCloseTo(0.25, 1);

    await advance(motion.pulseDuration / 2);
    expect(angle()).toBe(0);
    expect(opacity()).toBeCloseTo(1, 1);
  });
});
