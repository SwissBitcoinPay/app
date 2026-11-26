import { act, fireEvent, render, screen } from "@testing-library/react-native";
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

/** Advances of the glyphs, as the hidden measuring texts report them (Jest has no layout). */
const DIGIT = 40;
const COMMA = 15;
const CURRENCY = 50;
const ROW = 346;
/** How far a glyph rises into place (AnimatedAmount: 0.2 em of the 76-point figure). */
const RISE = 0.2 * type.amountDisplay;
/** Long enough for any change to settle, its last glyph's delay included. */
const SETTLE =
  motion.amountSlide + motion.amountEnterDelay + 4 * motion.amountStagger + motion.amountEnter;

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Node = typeof screen.container;

const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 82 } }
});

const hostTexts = () => screen.container.queryAll((node) => node.type === "Text");
const textOf = (node: Node) => node.children.join("");

/** Reports every hidden measuring text's width, the row's and the currency code's. */
async function measure({ row = ROW }: { row?: number } = {}) {
  for (const node of hostTexts().filter((n) => n.props["aria-hidden"] && n.props.onLayout)) {
    await fireEvent(node, "layout", layout(textOf(node) === "," ? COMMA : DIGIT));
  }
  await fireEvent(screen.getByText("CHF"), "layout", layout(CURRENCY));
  await fireEvent(screen.getByLabelText(/ CHF$/), "layout", layout(row));
}

type Shown = { char: string; right: number; lift: number; opacity: number };

/** The animated glyphs, left to right: offset from the figure's right edge, lift, opacity. */
function glyphs(): Shown[] {
  return hostTexts()
    .filter((n) => n.props["aria-hidden"] && !n.props.onLayout && n.props.jestAnimatedStyle)
    .map((node) => {
      const style = getAnimatedStyle(node) as {
        opacity: number;
        transform: [{ translateX: number }, { translateY: number }];
      };
      return {
        char: textOf(node),
        right: -style.transform[0].translateX,
        lift: style.transform[1].translateY / RISE,
        opacity: style.opacity
      };
    })
    .sort((a, b) => b.right - a.right);
}

/** The settled glyphs, as text: "24,50". */
const shown = () =>
  glyphs()
    .filter((glyph) => glyph.opacity === 1 && glyph.lift === 0)
    .map((glyph) => glyph.char)
    .join("");

const figureWidth = () => {
  const glyph = hostTexts().find((n) => n.props.jestAnimatedStyle && n.props["aria-hidden"]);
  return getAnimatedStyle(glyph!.parent as Node).width as number;
};

/** As the keypad does (formatFiat of 1234567890): every glyph measured ahead. */
const GLYPHS = "12 345 678,90";

const block = (amount: string, minor: number, glyphs = GLYPHS) => (
  <AmountBlock amount={amount} minor={minor} glyphs={glyphs} currency="CHF" size="display" />
);

// Its first test pays for loading Reanimated and the glyphs' measurer: 250 ms here, past Jest's
// default 5 s on a loaded CI runner (10 to 30 times slower than a local run).
jest.setTimeout(20_000);

describe("AnimatedAmount (AmountBlock with minor)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is a plain text until its glyphs are measured, then places each glyph from the right", async () => {
    await render(block("2,45", 245));
    expect(screen.getByText("2,45")).toBeTruthy();
    expect(glyphs()).toEqual([]);

    await measure();
    expect(glyphs()).toEqual([
      { char: "2", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "4", right: 40, lift: 0, opacity: 1 },
      { char: "5", right: 0, lift: 0, opacity: 1 }
    ]);
    expect(figureWidth()).toBe(135);
    // Screen readers still get the whole amount.
    expect(screen.getByLabelText("2,45 CHF")).toBeTruthy();
    expect(screen.getByText("2,45")).toBeTruthy();
  });

  it("slides the digits one place left, the comma staying, the new digit rising after", async () => {
    const view = await render(block("2,45", 245));
    await measure();

    await view.rerender(block("24,50", 2450));
    // The new digit starts below, transparent, and waits for the 5 to move away.
    expect(glyphs().find((g) => g.char === "0")).toEqual({
      char: "0",
      right: 0,
      lift: 1,
      opacity: 0
    });
    await advance(motion.amountEnterDelay / 2);
    let now = glyphs();
    const five = now.find((g) => g.char === "5")!;
    expect(five.right).toBeGreaterThan(0);
    expect(five.right).toBeLessThan(DIGIT);
    expect(now.find((g) => g.char === "0")!.opacity).toBe(0);
    // Each digit is one glyph sliding (not one going out and another coming in); the comma stays.
    expect(now.filter((g) => g.char === "4")).toHaveLength(1);
    const four = now.find((g) => g.char === "4")!;
    expect(four.right).toBeGreaterThan(DIGIT);
    expect(four.right).toBeLessThan(95);
    expect(now.find((g) => g.char === ",")).toMatchObject({ opacity: 1, lift: 0 });

    await advance(motion.amountEnterDelay);
    now = glyphs();
    const zero = now.find((g) => g.char === "0")!;
    expect(zero.opacity).toBeGreaterThan(0);
    expect(zero.lift).toBeGreaterThan(0);

    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "2", right: 135, lift: 0, opacity: 1 },
      { char: "4", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "5", right: 40, lift: 0, opacity: 1 },
      { char: "0", right: 0, lift: 0, opacity: 1 }
    ]);
    expect(figureWidth()).toBe(175);
  });

  it("places a glyph not measured yet approximately, then where it belongs", async () => {
    const view = await render(block("2,45", 245, ""));
    await measure();

    // No 0 measured yet: an approximate width (0.6 em) until the measure comes.
    await view.rerender(block("24,50", 2450, ""));
    await advance(SETTLE);
    expect(glyphs()[0]).toMatchObject({ char: "2", right: 95 + 0.6 * type.amountDisplay });

    await measure();
    await advance(SETTLE);
    expect(glyphs()[0]).toMatchObject({ char: "2", right: 135 });
    expect(shown()).toBe("24,50");
  });

  it("slides the leading zero out at the left under 1,00", async () => {
    const view = await render(block("0,24", 24));
    await measure();

    await view.rerender(block("2,45", 245));
    await advance(motion.amountOut / 4);
    const zero = glyphs().find((g) => g.char === "0")!;
    expect(zero.right).toBeGreaterThan(95);
    expect(zero.opacity).toBeGreaterThan(0);
    expect(zero.opacity).toBeLessThan(1);

    await advance(SETTLE);
    expect(glyphs().map((g) => g.char)).toEqual(["2", ",", "4", "5"]);
    expect(shown()).toBe("2,45");
  });

  it("unfolds the decimals of a bare 0 from below, one glyph after the other from the right", async () => {
    const view = await render(block("0", 0));
    await measure();
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);

    await view.rerender(block("0,01", 1));
    await measure();
    // The units' 0 is the one already there; the tenths' 0 is new.
    const parts = () => {
      const now = glyphs();
      return {
        units: now.find((g) => g.char === "0" && g.lift === 0 && g.opacity === 1)!,
        tenths: now.find((g) => g.char === "0" && g.lift > 0)!,
        comma: now.find((g) => g.char === ",")!,
        one: now.find((g) => g.char === "1")!
      };
    };
    await advance(motion.amountEnterDelay + motion.amountStagger / 2);
    let { units, tenths, comma, one } = parts();
    expect(units.right).toBeGreaterThan(0);
    expect(one.opacity).toBeGreaterThan(0);
    expect(tenths).toMatchObject({ opacity: 0, lift: 1 });
    expect(comma).toMatchObject({ opacity: 0, lift: 1 });

    await advance(motion.amountStagger);
    ({ units, tenths, comma, one } = parts());
    expect(tenths.opacity).toBeGreaterThan(0);
    expect(tenths.opacity).toBeLessThan(one.opacity);
    expect(comma.opacity).toBe(0);

    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "0", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "0", right: 40, lift: 0, opacity: 1 },
      { char: "1", right: 0, lift: 0, opacity: 1 }
    ]);
  });

  it("sinks the deleted digit, the others sliding back one place", async () => {
    const view = await render(block("24,50", 2450));
    await measure();

    await view.rerender(block("2,45", 245));
    await advance(motion.amountDeleted / 2);
    const now = glyphs();
    const deleted = now.find((g) => g.char === "0")!;
    expect(deleted.lift).toBeGreaterThan(0);
    expect(deleted.opacity).toBeLessThan(0.5);
    const five = now.find((g) => g.char === "5")!;
    expect(five.right).toBeGreaterThan(0);
    expect(five.right).toBeLessThan(DIGIT);

    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "2", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "4", right: 40, lift: 0, opacity: 1 },
      { char: "5", right: 0, lift: 0, opacity: 1 }
    ]);
  });

  it("brings a waiting zero back from the left when the amount goes under 1,00", async () => {
    const view = await render(block("2,45", 245));
    await measure();

    await view.rerender(block("0,24", 24));
    // The 2 goes from 95 to 40: the new zero comes from as far on the left.
    expect(glyphs().find((g) => g.char === "0")).toEqual({
      char: "0",
      right: 150,
      lift: 0,
      opacity: 0
    });
    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "0", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "2", right: 40, lift: 0, opacity: 1 },
      { char: "4", right: 0, lift: 0, opacity: 1 }
    ]);
  });

  it("folds the decimals back into a bare 0", async () => {
    const view = await render(block("0,01", 1));
    await measure();

    await view.rerender(block("0", 0));
    await advance(motion.amountDeleted / 2);
    const now = glyphs();
    // The units' 0 slides back, the comma, the tenths' 0 and the 1 sink out.
    const units = now.find((g) => g.char === "0" && g.opacity === 1)!;
    expect(units.right).toBeGreaterThan(0);
    expect(units.right).toBeLessThan(95);
    const going = now.filter((g) => g !== units);
    expect(going.map((g) => g.char).sort()).toEqual([",", "0", "1"]);
    for (const glyph of going) {
      expect(glyph.lift).toBeGreaterThan(0);
      expect(glyph.opacity).toBeLessThan(0.5);
    }

    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it("slides two places for 00, both zeros rising one after the other", async () => {
    const view = await render(block("0,02", 2));
    await measure();

    await view.rerender(block("2,00", 200));
    await advance(motion.amountEnterDelay + motion.amountStagger / 2);
    const coming = glyphs().filter((g) => g.char === "0" && g.right < 80);
    expect(coming).toHaveLength(2);
    const [left, right] = coming;
    expect(right.opacity).toBeGreaterThan(0);
    expect(left.opacity).toBe(0);

    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "2", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "0", right: 40, lift: 0, opacity: 1 },
      { char: "0", right: 0, lift: 0, opacity: 1 }
    ]);
  });

  it("replaces the figure after a sale", async () => {
    const view = await render(block("24,50", 2450));
    await measure();

    await view.rerender(block("0", 0));
    await advance(motion.amountOut / 4);
    // The old figure goes down, the new 0 comes from above.
    const now = glyphs();
    const fresh = now.filter((g) => g.lift < 0);
    expect(fresh.map((g) => g.char)).toEqual(["0"]);
    for (const glyph of now.filter((g) => g.lift >= 0)) expect(glyph.lift).toBeGreaterThan(0);

    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);
  });

  it("goes on from where the digits are when keys follow each other fast", async () => {
    const view = await render(block("2,45", 245));
    await measure();

    await view.rerender(block("24,50", 2450));
    await advance(motion.amountSlide / 4);
    const five = glyphs().find((g) => g.char === "5")!.right;
    // Undone at once: the 0 sinks, the 5 slides back from where it is, without a jump.
    await view.rerender(block("2,45", 245));
    expect(glyphs().find((g) => g.char === "5")!.right).toBe(five);

    await advance(SETTLE);
    expect(shown()).toBe("2,45");
    expect(glyphs()).toHaveLength(4);
  });

  it("leaves no glyph behind", async () => {
    const view = await render(block("0", 0));
    await measure();
    const steps: [string, number][] = [
      ["0,02", 2],
      ["0,24", 24],
      ["2,45", 245],
      ["24,50", 2450],
      ["2,45", 245],
      ["0,24", 24],
      ["0,02", 2],
      ["0", 0],
      ["0,09", 9],
      ["9,00", 900],
      ["0", 0]
    ];
    for (const [amount, minor] of steps) {
      await view.rerender(block(amount, minor));
      await measure();
      await advance(70);
    }
    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);
  });

  it("scales the row down when the figure is wider than its space", async () => {
    const view = await render(block("0", 0));
    await measure({ row: 200 });
    await advance(SETTLE);
    expect(getAnimatedStyle(screen.getByLabelText("0 CHF")).transform).toEqual([{ scale: 1 }]);

    await view.rerender(block("24,50", 2450));
    await measure({ row: 200 });
    await advance(SETTLE);
    const natural = 4 * DIGIT + COMMA + 8 + CURRENCY;
    expect(getAnimatedStyle(screen.getByLabelText("24,50 CHF")).transform).toEqual([
      { scale: 200 / natural }
    ]);
  });

  it("fits a figure mounted too wide at once, without shrinking it in", async () => {
    await render(block("24,50", 2450));
    await measure({ row: 200 });
    // One frame: already there, not on its way.
    await advance(16);
    const natural = 4 * DIGIT + COMMA + 8 + CURRENCY;
    expect(getAnimatedStyle(screen.getByLabelText("24,50 CHF")).transform).toEqual([
      { scale: 200 / natural }
    ]);
  });

  it("keeps its places while hidden (the web's display: none measures everything as 0)", async () => {
    const view = await render(block("24,50", 2450));
    await measure();
    await advance(SETTLE);
    const settled = glyphs();

    for (const node of hostTexts().filter((n) => n.props.onLayout)) {
      await fireEvent(node, "layout", layout(0));
    }
    await fireEvent(screen.getByLabelText("24,50 CHF"), "layout", layout(0));
    await advance(SETTLE);
    expect(glyphs()).toEqual(settled);
    expect(figureWidth()).toBe(175);

    // Paid meanwhile: the keypad starts afresh where it is, with the widths it had.
    await view.rerender(block("0", 0));
    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);
    expect(figureWidth()).toBe(DIGIT);
  });

  it("puts a group separator in its place from 1 000, and takes it away below", async () => {
    const view = await render(block("123,45", 12345, "12\u202f345\u202f678,90"));
    await measure();

    await view.rerender(block("1\u202f234,56", 123456, "12\u202f345\u202f678,90"));
    await advance(SETTLE);
    expect(glyphs()).toEqual([
      { char: "1", right: 255, lift: 0, opacity: 1 },
      { char: "\u202f", right: 215, lift: 0, opacity: 1 },
      { char: "2", right: 175, lift: 0, opacity: 1 },
      { char: "3", right: 135, lift: 0, opacity: 1 },
      { char: "4", right: 95, lift: 0, opacity: 1 },
      { char: ",", right: 80, lift: 0, opacity: 1 },
      { char: "5", right: 40, lift: 0, opacity: 1 },
      { char: "6", right: 0, lift: 0, opacity: 1 }
    ]);

    await view.rerender(block("123,45", 12345, "12\u202f345\u202f678,90"));
    await advance(SETTLE);
    expect(shown()).toBe("123,45");
    expect(glyphs()).toHaveLength(6);
  });

  it("slides a bare 0 out at the left, and back, in a currency without decimals", async () => {
    const view = await render(block("0", 0, "1\u202f234\u202f567\u202f890"));
    await measure();

    await view.rerender(block("5", 5, "1\u202f234\u202f567\u202f890"));
    await advance(motion.amountOut / 4);
    // Out of the way of the 5 rising in its place, not fading under it.
    const zero = glyphs().find((g) => g.char === "0")!;
    expect(zero.right).toBeGreaterThan(0);
    expect(zero.opacity).toBeGreaterThan(0);
    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "5", right: 0, lift: 0, opacity: 1 }]);

    await view.rerender(block("0", 0, "1\u202f234\u202f567\u202f890"));
    expect(glyphs().find((g) => g.char === "0")).toEqual({
      char: "0",
      right: DIGIT,
      lift: 0,
      opacity: 0
    });
    await advance(SETTLE);
    expect(glyphs()).toEqual([{ char: "0", right: 0, lift: 0, opacity: 1 }]);
  });

  it("only fades with Reduce Motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(block("2,45", 245));
    await measure();

    await view.rerender(block("24,50", 2450));
    await advance(motion.amountEnterDelay + motion.amountEnter / 2);
    const zero = glyphs().find((g) => g.char === "0")!;
    expect(Math.abs(zero.lift)).toBe(0);
    expect(zero.opacity).toBeGreaterThan(0);
    expect(zero.opacity).toBeLessThan(1);

    await advance(SETTLE);
    expect(shown()).toBe("24,50");
  });
});
