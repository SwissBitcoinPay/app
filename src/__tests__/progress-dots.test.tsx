import { act, render, screen } from "@testing-library/react-native";

import { ProgressDots } from "@/components/ui/ProgressDots";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Node = typeof screen.container;

const elements = (node: Node) =>
  node.children.filter((child): child is Node => typeof child !== "string");

/** The dots' host view (it is not an accessibility element: getByRole does not see it). */
function row(): Node {
  const [view] = screen.container.queryAll(
    (node) => typeof node.type === "string" && node.props.accessibilityRole === "progressbar"
  );
  return view;
}

/** Each dot's animated width and gap before it, and the opacity of its orange fill. */
function dots() {
  return elements(row()).map((dot) => {
    const style = getAnimatedStyle(dot);
    const fill = getAnimatedStyle(elements(dot)[0]);
    return {
      width: style.width,
      gap: style.marginLeft,
      opacity: style.opacity,
      fill: fill.opacity
    };
  });
}

const total = (row: ReturnType<typeof dots>) =>
  row.reduce((sum, dot) => sum + Number(dot.width) + Number(dot.gap), 0);

describe("ProgressDots", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("moves the capsule to the next step, the row keeping its width", async () => {
    const view = await render(<ProgressDots count={3} current={0} />);
    expect(dots()).toEqual([
      { width: 24, gap: 0, opacity: 1, fill: 1 },
      { width: 7, gap: 7, opacity: 1, fill: 0 },
      { width: 7, gap: 7, opacity: 1, fill: 0 }
    ]);

    await view.rerender(<ProgressDots count={3} current={1} />);
    await advance(motion.dots / 2);
    const [passed, next] = dots();
    // Halfway: the capsule shrinks back into a dot while the next one stretches and turns orange.
    expect(passed.width).toBeGreaterThan(7);
    expect(passed.width).toBeLessThan(24);
    expect(next.width).toBeGreaterThan(7);
    expect(next.width).toBeLessThan(24);
    expect(next.fill).toBeGreaterThan(0);
    expect(next.fill).toBeLessThan(1);
    expect(total(dots())).toBeCloseTo(24 + 7 + 7 + 2 * 7);

    await advance(motion.dots);
    expect(dots()).toEqual([
      { width: 7, gap: 0, opacity: 1, fill: 1 },
      { width: 24, gap: 7, opacity: 1, fill: 1 },
      { width: 7, gap: 7, opacity: 1, fill: 0 }
    ]);

    // Back: the step empties again.
    await view.rerender(<ProgressDots count={3} current={0} />);
    await advance(motion.dots + 100);
    expect(dots()[1]).toEqual({ width: 7, gap: 7, opacity: 1, fill: 0 });
  });

  it("grows a dot added to the path, and shrinks a removed one out of sight", async () => {
    const view = await render(<ProgressDots count={2} current={1} />);
    expect(dots()).toHaveLength(2);

    await view.rerender(<ProgressDots count={3} current={1} />);
    await advance(motion.dots / 2);
    const added = dots()[2];
    expect(added.width).toBeGreaterThan(0);
    expect(added.width).toBeLessThan(7);
    expect(added.opacity).toBeGreaterThan(0);
    expect(added.opacity).toBeLessThan(1);
    await advance(motion.dots);
    expect(dots()[2]).toEqual({ width: 7, gap: 7, opacity: 1, fill: 0 });

    await view.rerender(<ProgressDots count={2} current={1} />);
    await advance(motion.dots + 100);
    // It stays in the row, empty, so that it could come back the same way.
    expect(dots()[2]).toEqual({ width: 0, gap: 0, opacity: 0, fill: 0 });
    expect(total(dots())).toBe(7 + 24 + 7);
    expect(row().props.accessibilityValue).toEqual({ min: 1, max: 2, now: 2 });
  });
});
