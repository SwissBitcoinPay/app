import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Callout } from "@/components/ui/Callout";
import { lightColors as colors, palette } from "@/theme";

/** Font Awesome's glyphs (Icon.tsx). */
const GLYPHS = {
  check: String.fromCodePoint(0xf00c),
  circleCheck: String.fromCodePoint(0xf058),
  circleExclamation: String.fromCodePoint(0xf06a),
  clock: String.fromCodePoint(0xf017),
  triangle: String.fromCodePoint(0xf071)
};

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

describe("Callout", () => {
  it.each([
    ["success", colors.success, GLYPHS.circleCheck],
    ["warning", colors.warning, GLYPHS.triangle],
    ["error", colors.danger, GLYPHS.circleExclamation]
  ] as const)("shows a %s in its tint, with its icon", async (tone, palette, glyph) => {
    await render(
      <Callout tone={tone} title="Title" testID="callout">
        Text
      </Callout>
    );
    expect(styleOf(screen.getByTestId("callout")).backgroundColor).toBe(palette.bg);
    expect(styleOf(screen.getByText("Title")).color).toBe(palette.fg);
    expect(styleOf(screen.getByText("Text")).color).toBe(palette.fg);
    // Decorative: the title says what it means.
    expect(screen.queryByText(glyph)).toBeNull();
    expect(styleOf(screen.getByText(glyph, { includeHiddenElements: true })).color).toBe(
      palette.fg
    );
  });

  it("shows a small one, its text at the caption's size in its tint", async () => {
    await render(
      <Callout tone="warning" small testID="callout">
        Text
      </Callout>
    );
    expect(styleOf(screen.getByTestId("callout")).backgroundColor).toBe(colors.warning.bg);
    expect(styleOf(screen.getByText("Text"))).toMatchObject({
      color: colors.warning.fg,
      fontSize: 12.5
    });
    expect(
      styleOf(screen.getByText(GLYPHS.triangle, { includeHiddenElements: true })).fontSize
    ).toBe(13);
  });

  it("takes another icon, and a text without a title", async () => {
    await render(
      <Callout tone="warning" icon="clock-regular">
        Just wait.
      </Callout>
    );
    expect(screen.getByText("Just wait.")).toBeTruthy();
    expect(screen.getByText(GLYPHS.clock, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(GLYPHS.triangle, { includeHiddenElements: true })).toBeNull();
  });

  it("shows its steps, done in green, the others with a clock in its tone, then its text", async () => {
    await render(
      <Callout
        tone="warning"
        steps={[
          { label: "Payment received", detail: "3 confirmations", done: true },
          { label: "Added to your balance", detail: "pending", done: false },
          { label: "No detail", done: false }
        ]}
        testID="callout"
      >
        Why.
      </Callout>
    );
    // Each step read as one element: its label, then its detail.
    const done = screen.getByLabelText("Payment received, 3 confirmations");
    const waiting = screen.getByLabelText("Added to your balance, pending");
    expect(screen.getByLabelText("No detail")).toBeTruthy();
    expect(done.props.testID).toBe("callout-step-0");
    expect(waiting.props.testID).toBe("callout-step-1");

    expect(styleOf(screen.getByText("Payment received")).color).toBe(colors.success.fg);
    expect(styleOf(screen.getByText("3 confirmations")).color).toBe(colors.success.fg);
    expect(styleOf(screen.getByText("Added to your balance")).color).toBe(colors.warning.fg);
    expect(styleOf(screen.getByText("pending")).color).toBe(colors.warning.fg);
    // A check on the green disc once done, a clock in a dashed ring of the tone otherwise.
    const check = screen.getByText(GLYPHS.check, { includeHiddenElements: true });
    expect(styleOf(check).color).toBe(palette.white);
    expect(
      styleOf(screen.getByTestId("callout-step-0-marker", { includeHiddenElements: true }))
        .backgroundColor
    ).toBe(colors.success.solid);
    const clocks = screen.getAllByText(GLYPHS.clock, { includeHiddenElements: true });
    expect(clocks).toHaveLength(2);
    const ring = styleOf(
      screen.getByTestId("callout-step-1-marker", { includeHiddenElements: true })
    );
    expect(ring).toMatchObject({ borderStyle: "dashed", borderColor: colors.warning.solid });

    // The text under the steps, set apart by a line; no title, so no icon of the tone.
    expect(screen.getByText("Why.")).toBeTruthy();
    expect(styleOf(screen.getByTestId("callout-text")).borderTopWidth).toBe(1);
    expect(screen.queryByText(GLYPHS.triangle, { includeHiddenElements: true })).toBeNull();
  });

  it("shows a title above its steps, with its icon", async () => {
    await render(
      <Callout tone="success" title="Credited" steps={[{ label: "Received", done: true }]} />
    );
    expect(screen.getByText("Credited")).toBeTruthy();
    expect(screen.getByText(GLYPHS.circleCheck, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText("Received")).toBeTruthy();
  });
});
