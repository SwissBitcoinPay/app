import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";

import { AmountBlock } from "@/components/ui/AmountBlock";
import { Keypad } from "@/components/ui/Keypad";
import { sans } from "@/theme";

const fontOf = (text: string) =>
  StyleSheet.flatten(screen.getByText(text).props.style as StyleProp<TextStyle>)?.fontFamily;

const hostTexts = () => screen.container.queryAll((node) => node.type === "Text");
const textOf = (node: ReturnType<typeof hostTexts>[number]) => node.children.join("");
const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 82 } }
});

describe("weight of the point of sale's figures", () => {
  it("draws the amount in SemiBold by default (payment page, wallet)", async () => {
    await render(<AmountBlock amount="24,50" currency="CHF" />);
    expect(fontOf("24,50")).toBe(sans(600).fontFamily);
    expect(fontOf("CHF")).toBe(sans(600).fontFamily);
  });

  it("draws the amount in Bold with `bold`, the currency code unchanged", async () => {
    await render(<AmountBlock amount="24,50" currency="CHF" bold />);
    expect(fontOf("24,50")).toBe(sans(700).fontFamily);
    expect(fontOf("CHF")).toBe(sans(600).fontFamily);
  });

  it("measures and draws a typed amount in Bold with `bold` (AnimatedAmount)", async () => {
    await render(
      <AmountBlock
        amount="24,50"
        minor={2450}
        glyphs="12 345 678,90"
        currency="CHF"
        size="display"
        bold
      />
    );
    // Jest has no layout: report the measuring texts' widths, then the row's and the currency's,
    // so that the figure is drawn glyph by glyph (as on a device) with its spoken text.
    for (const node of hostTexts().filter((n) => n.props["aria-hidden"] && n.props.onLayout)) {
      await fireEvent(node, "layout", layout(textOf(node) === "," ? 15 : 40));
    }
    await fireEvent(screen.getByText("CHF"), "layout", layout(50));
    await fireEvent(screen.getByLabelText("24,50 CHF"), "layout", layout(346));

    // The measuring texts, the strut, each glyph drawn and the spoken figure: all of them, else
    // the glyphs' places would be measured in another weight than the one drawn.
    const figures = hostTexts().filter((node) => textOf(node) !== "CHF");
    const drawn = figures.filter((n) => n.props["aria-hidden"] && !n.props.onLayout);
    expect(drawn.map(textOf).sort()).toEqual(["0", "0", ",", "2", "4", "5"].sort());
    expect(figures.some((n) => !n.props["aria-hidden"] && textOf(n) === "24,50")).toBe(true);
    for (const node of figures) {
      expect(StyleSheet.flatten(node.props.style as StyleProp<TextStyle>)?.fontFamily).toBe(
        sans(700).fontFamily
      );
    }
    expect(fontOf("CHF")).toBe(sans(600).fontFamily);
  });

  it("draws the keypad's digits in SemiBold", async () => {
    await render(<Keypad onPress={() => undefined} deleteLabel="Delete" />);
    for (const key of ["0", "00", "1", "5", "9"]) {
      expect(fontOf(key)).toBe(sans(600).fontFamily);
    }
  });
});
