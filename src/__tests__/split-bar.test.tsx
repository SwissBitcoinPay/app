import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import type { PayoutCurrency } from "@/config/payout-currencies";
import { SplitBar, splitGeometry } from "@/features/onboarding/SplitBar";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

const WIDTH = 346;

function renderBar(
  bitcoinPercent: number,
  onChange = jest.fn(),
  currency: PayoutCurrency = "CHF",
  onPickCurrency = jest.fn()
) {
  return render(
    <SplitBar
      bitcoinPercent={bitcoinPercent}
      onChange={onChange}
      currency={currency}
      onPickCurrency={onPickCurrency}
      languageTag="fr-CH"
      bitcoinLabel="Bitcoin"
      accessibilityLabel="Bitcoin share"
      accessibilityValueText={`${bitcoinPercent}%`}
      currencyLabel="Payout currency: Swiss francs"
      testID="bar"
    />
  );
}

async function measure() {
  await fireEvent(screen.getByTestId("bar"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: 96 } }
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** A share's figure: hidden from screen readers, which hear the bar's value instead. */
function figure(testID: string) {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

/** The figure's slide out of its block: 0 in it, -96 out of it. */
function shift(testID: string): number {
  const transform = getAnimatedStyle(figure(testID)).transform as {
    translateY?: number;
  }[];
  // + 0: the style computes -96 × 0, which is -0.
  return (transform[0].translateY ?? 0) + 0;
}

describe("splitGeometry", () => {
  it("fills the bar with the only share, the handle off the rounded ends", () => {
    expect(splitGeometry(100, WIDTH)).toMatchObject({ bitcoinWidth: WIDTH, handle: WIDTH - 17 });
    expect(splitGeometry(0, WIDTH)).toMatchObject({ bitcoinWidth: 0, handle: 17 });
  });

  it("puts the handle on the gap between the blocks", () => {
    const { bitcoinWidth, handle } = splitGeometry(70, WIDTH);
    expect(bitcoinWidth).toBeCloseTo(0.7 * WIDTH - 2);
    expect(handle).toBeCloseTo(0.7 * WIDTH);
  });

  it("keeps a thin share visible as a 12 point band", () => {
    expect(splitGeometry(1, WIDTH)).toMatchObject({ bitcoinWidth: 12, handle: 17 });
    // The fiat block is the rest after the 4 point gap: 12 points.
    expect(splitGeometry(99, WIDTH)).toMatchObject({
      bitcoinWidth: WIDTH - 16,
      handle: WIDTH - 17
    });
  });
});

describe("SplitBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("follows the finger, and hands the whole % over on release", async () => {
    const onChange = jest.fn();
    await renderBar(50, onChange);
    await measure();
    const bar = screen.getByTestId("bar");

    // Touched at 30 % of the bar, its left edge at page x 10, then dragged.
    await fireEvent(bar, "responderGrant", {
      nativeEvent: { pageX: 10 + 0.3 * WIDTH, locationX: 0.3 * WIDTH }
    });
    await fireEvent(bar, "responderMove", { nativeEvent: { pageX: 10 + 0.333 * WIDTH } });
    // The bar alone shows the share while the finger moves: the screen is not rendered at each %.
    expect(onChange).not.toHaveBeenCalled();
    expect(figure("split-bitcoin-figure")).toHaveTextContent(/Bitcoin33%$/);
    expect(figure("split-fiat-figure")).toHaveTextContent(/67%$/);
    expect(bar.props.accessibilityValue.now).toBe(33);

    await fireEvent(bar, "responderRelease", { nativeEvent: {} });
    expect(onChange.mock.calls).toEqual([[33]]);
  });

  it("puts the handle under the finger at once while dragging, between the whole %", async () => {
    await renderBar(50);
    await measure();
    const bar = screen.getByTestId("bar");
    const handleLeft = () =>
      getAnimatedStyle(screen.getByTestId("bar").children[2] as never).left as number;

    await fireEvent(bar, "responderGrant", {
      nativeEvent: { pageX: 0.5 * WIDTH, locationX: 0.5 * WIDTH }
    });
    // No animation behind the finger (160 ms): it is there on the next frame.
    await fireEvent(bar, "responderMove", { nativeEvent: { pageX: 0.4321 * WIDTH } });
    // One frame: Reanimated applies a value set without animation on the next one.
    await advance(16);
    expect(handleLeft()).toBeCloseTo(splitGeometry(43.21, WIDTH).handle - 11);

    // Let go: it settles on the whole %.
    await fireEvent(bar, "responderRelease", { nativeEvent: {} });
    await advance(motion.splitBar);
    expect(handleLeft()).toBeCloseTo(splitGeometry(43, WIDTH).handle - 11);
  });

  it("hands the share over at once when it crosses 100 %, within 0 and 100", async () => {
    const onChange = jest.fn();
    await renderBar(100, onChange);
    await measure();
    const bar = screen.getByTestId("bar");

    await fireEvent(bar, "responderGrant", {
      nativeEvent: { pageX: 2 * WIDTH, locationX: 2 * WIDTH }
    });
    // From 100 % to some fiat: the dots and the button follow during the drag.
    await fireEvent(bar, "responderMove", { nativeEvent: { pageX: 0.9 * WIDTH } });
    expect(onChange.mock.calls).toEqual([[90]]);
    await fireEvent(bar, "responderMove", { nativeEvent: { pageX: 0.8 * WIDTH } });
    await fireEvent(bar, "responderMove", { nativeEvent: { pageX: -50 } });
    expect(onChange.mock.calls).toEqual([[90]]);

    await fireEvent(bar, "responderRelease", { nativeEvent: {} });
    expect(onChange.mock.calls).toEqual([[90], [0]]);
  });

  it("is adjusted by 1 % with the accessibility actions", async () => {
    const onChange = jest.fn();
    await renderBar(100, onChange);
    const bar = screen.getByTestId("bar");

    expect(bar.props.accessibilityRole).toBe("adjustable");
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100, text: "100%" });
    await fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    await fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "increment" } });

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([99, 100]);
  });

  it("is a keyboard tab stop on the web, operated with the slider keys", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const onChange = jest.fn();
    await renderBar(50, onChange);
    const bar = screen.getByTestId("bar");
    // RNTL 14 fires events asynchronously: each one must be awaited.
    const key = async (name: string) => {
      // As react-native-web hands it: React's keyboard event, the browser's in `nativeEvent`.
      const event = { key: name, nativeEvent: { key: name }, preventDefault: jest.fn() };
      await fireEvent(bar, "keyDown", event);
      return event;
    };

    expect(bar.props.tabIndex).toBe(0);
    expect((await key("ArrowRight")).preventDefault).toHaveBeenCalled();
    await key("ArrowLeft");
    await key("PageUp");
    await key("Home");
    await key("End");
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([51, 49, 60, 0, 100]);

    // Other keys (Tab to move on) are left to the browser.
    expect((await key("Tab")).preventDefault).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("adds no keyboard handling on native, which has the accessibility actions", async () => {
    await renderBar(50);

    expect(screen.getByTestId("bar").props.onKeyDown).toBeUndefined();
  });

  it("slides a share out of its block under 25 %, and back in", async () => {
    const view = await renderBar(100);
    await measure();
    // 0 % in fiat: out of its (empty) block from the start.
    expect(shift("split-fiat-figure")).toBe(-96);
    expect(shift("split-bitcoin-figure")).toBe(0);

    await view.rerender(
      <SplitBar
        bitcoinPercent={20}
        onChange={jest.fn()}
        currency="CHF"
        onPickCurrency={jest.fn()}
        languageTag="fr-CH"
        bitcoinLabel="Bitcoin"
        accessibilityLabel="Bitcoin share"
        accessibilityValueText="20%"
        currencyLabel="Payout currency: Swiss francs"
        testID="bar"
      />
    );
    await advance(motion.splitFigure / 2);
    // Halfway: bitcoin is on its way out, fiat on its way back in.
    expect(shift("split-bitcoin-figure")).toBeLessThan(0);
    expect(shift("split-bitcoin-figure")).toBeGreaterThan(-96);
    expect(shift("split-fiat-figure")).toBeGreaterThan(-96);

    await advance(motion.splitFigure);
    expect(shift("split-bitcoin-figure")).toBe(-96);
    expect(shift("split-fiat-figure")).toBe(0);
  });

  it("shows each share with a smaller percent sign, in the device locale's format", async () => {
    await renderBar(70);

    expect(figure("split-bitcoin-figure")).toHaveTextContent(/Bitcoin70%$/);
    expect(figure("split-fiat-figure")).toHaveTextContent(/CHF.*30%$/);
    expect(screen.getAllByText("%", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("opens the currency picker from the currency tag", async () => {
    const onPickCurrency = jest.fn();
    await renderBar(70, jest.fn(), "EUR", onPickCurrency);

    const tag = screen.getByRole("button", { name: "Payout currency: Swiss francs" });
    expect(tag).toHaveTextContent(/EUR/);
    await fireEvent.press(tag);

    expect(onPickCurrency).toHaveBeenCalledTimes(1);
  });
});
