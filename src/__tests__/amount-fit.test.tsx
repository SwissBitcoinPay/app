import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { AmountBlock } from "@/components/ui/AmountBlock";
import { motion, type } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

// Reanimated runs for real here (driven by fake timers); only Reduce Motion is switchable.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

const LONG = "12 345 678,90";
const LABEL = `${LONG} CHF`;
/** The figure and the code at their full size, with the 8-point gap between them. */
const FIGURE = 400;
const CODE = 40;
const NATURAL = FIGURE + 8 + CODE;

type Node = typeof screen.container;

const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } }
});

const flat = (node: Node) => StyleSheet.flatten(node.props.style as StyleProp<TextStyle>) ?? {};

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The block's own style: the outermost view. */
function blockStyle(): ViewStyle {
  const root = screen.root;
  if (root === null) throw new Error("Nothing rendered");
  return StyleSheet.flatten(root.props.style as StyleProp<ViewStyle>) ?? {};
}

const figure = () => screen.getByText(LONG);
const row = () => screen.getByLabelText(LABEL);
const scale = () => (getAnimatedStyle(row()).transform as [{ scale: number }])[0].scale;

/** Reports the row's width (its room), then the figure's and the code's at their full size. */
async function report(room: number) {
  await fireEvent(row(), "layout", layout(room));
  await fireEvent(figure(), "layout", layout(FIGURE));
  await fireEvent(screen.getByText("CHF"), "layout", layout(CODE));
}

describe("fixed amount fitted to its space", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("keeps adjustsFontSizeToFit on native, not scaled", async () => {
    await render(<AmountBlock amount={LONG} currency="CHF" />);
    expect(figure().props.adjustsFontSizeToFit).toBe(true);
    expect(figure().props.numberOfLines).toBe(1);
    expect(row().props.jestAnimatedStyle).toBeUndefined();
    expect(blockStyle().alignSelf).toBeUndefined();
  });

  describe("on the web", () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, "OS", "web");
    });

    it("stretches its block: centred by its parent, it would be as wide as its figure", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      expect(blockStyle().alignSelf).toBe("stretch");
    });

    it("never cuts the figure, drawn at its full size", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" bold />);
      expect(figure().props.numberOfLines).toBeUndefined();
      expect(flat(figure()).flexShrink).toBe(0);
      expect(flat(figure()).fontSize).toBe(type.amountLarge);
      await report(300);
      await advance(motion.amountSlide);
      expect(flat(figure()).fontSize).toBe(type.amountLarge);
      expect(flat(screen.getByText("CHF")).fontSize).toBe(18);
    });

    it("stays at scale 1 until every width is known", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      await fireEvent(row(), "layout", layout(300));
      await fireEvent(figure(), "layout", layout(FIGURE));
      await advance(motion.amountSlide);
      expect(scale()).toBe(1);
    });

    it("fits a figure mounted too wide at once, without shrinking it in", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      await report(300);
      // One frame: already there, not on its way.
      await advance(16);
      expect(scale()).toBe(300 / NATURAL);
    });

    it("keeps scale 1 when the row fits, a sub-point rounding included", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      await report(NATURAL);
      await advance(16);
      expect(scale()).toBe(1);
      await fireEvent(row(), "layout", layout(NATURAL - 0.4));
      await advance(motion.amountSlide);
      expect(scale()).toBe(1);
    });

    it("animates the scale when its space narrows, then when it widens again", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" size="display" />);
      await report(NATURAL);
      await advance(16);
      expect(scale()).toBe(1);

      // A narrower window: on its way down, then there.
      await fireEvent(row(), "layout", layout(300));
      await advance(motion.amountSlide / 2);
      expect(scale()).toBeLessThan(1);
      expect(scale()).toBeGreaterThan(300 / NATURAL);
      await advance(motion.amountSlide);
      expect(scale()).toBe(300 / NATURAL);

      // Wider again: back up to its full size.
      await fireEvent(row(), "layout", layout(600));
      await advance(motion.amountSlide / 2);
      expect(scale()).toBeGreaterThan(300 / NATURAL);
      expect(scale()).toBeLessThan(1);
      await advance(motion.amountSlide);
      expect(scale()).toBe(1);
    });

    it("ignores a width of 0 (display: none on the web)", async () => {
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      await report(300);
      await advance(16);
      await fireEvent(row(), "layout", layout(0));
      await fireEvent(figure(), "layout", layout(0));
      await advance(motion.amountSlide);
      expect(scale()).toBe(300 / NATURAL);
    });

    it("drops the movement with Reduce Motion: the new scale at once", async () => {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      await render(<AmountBlock amount={LONG} currency="CHF" />);
      await report(NATURAL);
      await advance(16);
      await fireEvent(row(), "layout", layout(300));
      await advance(16);
      expect(scale()).toBe(300 / NATURAL);
    });
  });
});
