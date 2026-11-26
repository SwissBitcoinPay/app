import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { StateDot } from "@/components/ui/StateDot";
import { lightColors as colors, motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Decorative: found with the hidden elements only. */
const dot = () => screen.getByTestId("dot", { includeHiddenElements: true });
const opacity = () => Number(getAnimatedStyle(dot()).opacity);
const color = () => StyleSheet.flatten(dot().props.style).backgroundColor;

describe("StateDot", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is decorative: screen readers skip it", async () => {
    await render(<StateDot testID="dot" />);
    expect(screen.queryByTestId("dot")).toBeNull();
    expect(dot()).toBeTruthy();
  });

  it("pulses in the open state's orange", async () => {
    await render(<StateDot testID="dot" />);
    expect(color()).toBe(colors.state.open.dot);

    await advance(motion.pulseDuration / 2);
    expect(opacity()).toBeCloseTo(0.25, 1);
    await advance(motion.pulseDuration / 2);
    expect(opacity()).toBeCloseTo(1, 1);
  });

  it("holds still in another state, and pulses there when asked", async () => {
    await render(<StateDot state="unconfirmed" testID="dot" />);
    expect(color()).toBe(colors.state.unconfirmed.dot);
    await advance(motion.pulseDuration / 2);
    expect(opacity()).toBe(1);

    await screen.rerender(<StateDot state="unconfirmed" pulsing testID="dot" />);
    expect(color()).toBe(colors.state.unconfirmed.dot);
    await advance(motion.pulseDuration / 2);
    expect(opacity()).toBeCloseTo(0.25, 1);
  });
});
