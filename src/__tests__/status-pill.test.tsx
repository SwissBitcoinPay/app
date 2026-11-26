import { act, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";

import { StatusPill, StatusPillBox } from "@/components/ui/StatusPill";
import { PILL_SIGNS } from "@/features/activity/format";
import { lightColors as colors, motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";
import { dashed, drawn, svgColour } from "../../jest/svg";

/** The glyph of Font Awesome's triangle-exclamation (Icon.tsx). */
const TRIANGLE = String.fromCodePoint(0xf071);
/** The glyph of Font Awesome's check. */
const CHECK = String.fromCodePoint(0xf00c);

/** Decorative signs, hidden from screen readers: found with the hidden elements only. */
const HIDDEN = { includeHiddenElements: true };

/** The colour of the turning arc of `spinner` as #RRGGBB. */
function arcColour(spinner: TestInstance): string {
  // The arc is the ring drawn in part (Spinner's rail is whole).
  const arcs = drawn("RNSVGCircle", spinner).filter(dashed);
  expect(arcs).toHaveLength(1);
  return svgColour(arcs[0]!.props.stroke).rgb;
}

describe("StatusPill", () => {
  it("carries no sign unless asked", async () => {
    await render(<StatusPill state="open" label="Open" size="sm" />);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByTestId("status-pill-pulse", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("status-pill-warning", { includeHiddenElements: true })).toBeNull();
  });

  it("carries the open state's dot, which pulses", async () => {
    jest.useFakeTimers();
    try {
      await render(<StatusPill state="open" label="Open" sign="pulse" size="sm" />);
      // Decorative, as StateDot: the label says what it means.
      const dot = screen.getByTestId("status-pill-pulse", { includeHiddenElements: true });
      expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(colors.state.open.dot);
      const before = Number(getAnimatedStyle(dot).opacity);
      await act(async () => {
        jest.advanceTimersByTime(motion.pulseDuration / 2);
      });
      expect(Number(getAnimatedStyle(dot).opacity)).toBeLessThan(before);
    } finally {
      jest.useRealTimers();
    }
  });

  it("carries the warning triangle in the state's colour", async () => {
    await render(<StatusPill state="underpaid" label="Underpaid" sign="warning" size="xs" />);
    // Decorative, as the dot: the label says what it means.
    const triangle = screen.getByText(TRIANGLE, { includeHiddenElements: true });
    expect(
      screen.getByTestId("status-pill-warning", { includeHiddenElements: true })
    ).toContainElement(triangle);
    expect(StyleSheet.flatten(triangle.props.style).color).toBe(colors.state.underpaid.dot);
  });

  it("carries the mined chain while being confirmed, unless asked for another sign", async () => {
    await render(<StatusPill state="unconfirmed" label="Confirming" />);
    expect(screen.getByTestId("chain-track", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("status-pill-spinner", HIDDEN)).toBeNull();

    // One sign at most: any sign asked takes the chain's place.
    for (const sign of ["pulse", "warning", "check"] as const) {
      await render(<StatusPill state="unconfirmed" label={sign} sign={sign} />);
      const pill = within(screen.getByText(sign).parent!);
      expect(pill.getByTestId(`status-pill-${sign}`, HIDDEN)).toBeTruthy();
      expect(pill.queryByTestId("chain-track", HIDDEN)).toBeNull();
    }
  });

  // The size of an icon: the other signs' square, 10 in a list row's pill.
  it("draws the mined chain in the square of the other signs", async () => {
    for (const [size, side] of [
      ["md", 12],
      ["sm", 12],
      ["xs", 10]
    ] as const) {
      await render(<StatusPill state="unconfirmed" label="Confirming" size={size} />);
      expect(
        StyleSheet.flatten(screen.getByTestId("chain-loader", HIDDEN).props.style)
      ).toMatchObject({ width: side, height: side });
    }
  });

  // A transaction being confirmed, on the payer's page.
  it("carries the turning arc in the state's colour, in place of the mined chain", async () => {
    jest.useFakeTimers();
    try {
      await render(<StatusPill state="unconfirmed" label="1/3" sign="spinner" size="sm" />);
      const pill = within(screen.getByText("1/3").parent!);
      const spinner = pill.getByTestId("status-pill-spinner", HIDDEN);
      // Decorative, as the other signs: the label, or the pill's own accessible name, says it.
      expect(pill.queryByTestId("status-pill-spinner")).toBeNull();
      expect(StyleSheet.flatten(spinner.props.style)).toMatchObject({ width: 12, height: 12 });
      expect(arcColour(spinner)).toBe(colors.state.unconfirmed.dot);
      expect(pill.queryByTestId("chain-track", HIDDEN)).toBeNull();
      // It turns.
      const angle = () =>
        parseFloat((getAnimatedStyle(spinner).transform as { rotate: string }[])[0].rotate);
      expect(angle()).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(motion.spin / 4);
      });
      expect(angle()).toBeGreaterThan(80);
    } finally {
      jest.useRealTimers();
    }
  });

  it("carries a tick in the state's text colour", async () => {
    await render(<StatusPill state="settled" label="3/3" sign="check" size="sm" />);
    // Decorative: the label, or the pill's own accessible name, says what it means.
    const tick = screen.getByText(CHECK, { includeHiddenElements: true });
    expect(
      screen.getByTestId("status-pill-check", { includeHiddenElements: true })
    ).toContainElement(tick);
    expect(StyleSheet.flatten(tick.props.style).color).toBe(colors.state.settled.fg);
    expect(screen.queryByTestId("status-pill-warning", { includeHiddenElements: true })).toBeNull();
  });

  // "Pagadas de menos" in a desktop tile of 1024 px, "Confirming" beside a total on a 360 px
  // phone: a pill that runs out of its tile pushes the total out of its row.
  it("is never wider than its parent: a row's pill ends in \"…\", the point of sale's wraps", async () => {
    await render(
      <>
        <StatusPill state="underpaid" label="Pagadas de menos" sign="warning" size="sm" />
        <StatusPill state="unconfirmed" label="Confirming" size="xs" />
        <StatusPill state="settled" label="Payment received" />
      </>
    );
    for (const [label, lines] of [
      ["Pagadas de menos", 1],
      ["Confirming", 1],
      ["Payment received", undefined]
    ] as const) {
      const text = screen.getByText(label);
      expect(text.props.numberOfLines).toBe(lines);
      expect(StyleSheet.flatten(text.props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(text.parent!.props.style)).toMatchObject({
        flexShrink: 1,
        maxWidth: "100%"
      });
    }
  });
});

describe("StatusPillBox", () => {
  it("gives way to its row, or keeps the pill whole while the row's other words give way", async () => {
    await render(
      <>
        <StatusPillBox>
          <StatusPill state="open" label="Open" size="sm" />
        </StatusPillBox>
        <StatusPillBox whole>
          <StatusPill state="underpaid" label="Underpaid" size="xs" />
        </StatusPillBox>
      </>
    );
    const box = (label: string) =>
      StyleSheet.flatten(screen.getByText(label).parent!.parent!.props.style);
    expect(box("Open")).toEqual({ flexShrink: 1, minWidth: 0 });
    expect(box("Underpaid")).toEqual({ flexShrink: 0, maxWidth: "100%" });
  });
});

describe("the activity's pills", () => {
  it('give "Open" the pulsing dot and "Underpaid" the triangle, nothing else', () => {
    expect(PILL_SIGNS).toEqual({ open: "pulse", underpaid: "warning" });
  });
});
