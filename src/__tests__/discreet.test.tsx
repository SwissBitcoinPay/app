import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { DiscreetProvider, Masked } from "@/components/ui/Discreet";
import { lightColors as colors } from "@/theme";

import { drawn } from "../../jest/svg";

const value = (hidden: boolean | null) => {
  const masked = (
    <Masked color={colors.text.secondary}>
      <Text>1 284,53 CHF</Text>
    </Masked>
  );
  return hidden === null ? (
    masked
  ) : (
    <DiscreetProvider value={{ hidden, label: "Amount hidden" }}>{masked}</DiscreetProvider>
  );
};

describe("Masked", () => {
  it("draws the value as it is outside a screen with a discreet mode, without a box", async () => {
    await render(value(null));
    expect(screen.getByText("1 284,53 CHF")).toBeTruthy();
    // The text is the whole drawing: no view around it.
    expect(screen.toJSON()?.type).toBe("Text");
  });

  it("shows the value while the mode does not hide it", async () => {
    await render(value(false));
    expect(screen.getByText("1 284,53 CHF")).toBeTruthy();
    expect(screen.queryByLabelText("Amount hidden")).toBeNull();
    expect(drawn("RNSVGRect")).toHaveLength(0);
  });

  it("hides the value from screen readers, which read the label, and draws blurred glyphs over it", async () => {
    await render(value(true));
    // Still laid out, out of reach.
    expect(screen.queryByText("1 284,53 CHF")).toBeNull();
    expect(screen.getByText("1 284,53 CHF", { includeHiddenElements: true })).toBeTruthy();
    const box = screen.getByLabelText("Amount hidden");
    // Jest has no layout: the glyphs come with the box's size.
    expect(drawn("RNSVGRect")).toHaveLength(0);
    await fireEvent(box, "layout", { nativeEvent: { layout: { width: 100, height: 21 } } });
    const glyphs = drawn("RNSVGRect");
    // About a digit's advance each (0.42 × the line's height), over the value's whole width.
    expect(glyphs).toHaveLength(Math.round(100 / (21 * 0.42)));
    expect(glyphs.every((glyph) => glyph.props.fill !== undefined)).toBe(true);
    expect(drawn("RNSVGFeGaussianBlur")).toHaveLength(1);
  });

  it("keeps the glyphs and their blur within the value's width: a container that clips cuts nothing", async () => {
    await render(value(true));
    const box = screen.getByLabelText("Amount hidden");
    await fireEvent(box, "layout", { nativeEvent: { layout: { width: 120, height: 20 } } });
    // Two deviations of the blur (0.17 × the line's height) from each end, where it has faded.
    const inset = 2 * 0.17 * 20;
    const glyphs = drawn("RNSVGRect");
    expect(glyphs.length).toBeGreaterThan(1);
    const xs = glyphs.map((glyph) => Number(glyph.props.x));
    const widths = glyphs.map((glyph) => Number(glyph.props.width));
    expect(Math.min(...xs)).toBeCloseTo(inset);
    expect(Math.max(...xs.map((x, i) => x + widths[i]!))).toBeCloseTo(120 - inset);
    // The drawing itself is as wide as the value, taller for the blur above and below.
    const [svg] = drawn("RNSVGSvgView");
    expect(svg!.props.width).toBe(120);
  });
});
