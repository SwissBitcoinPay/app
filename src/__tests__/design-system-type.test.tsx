import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { AmountBlock } from "@/components/ui/AmountBlock";
import { Button } from "@/components/ui/Button";
import { ScreenTitle } from "@/components/ui/Heading";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  AMOUNT_EM,
  lightColors as colors,
  darkTheme,
  lightShadow as shadow,
  lightTheme,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type
} from "@/theme";
import { focusRingCss } from "@/theme/focus-ring-css";
import type * as FocusRing from "@/theme/focus-ring.web";

const flat = (style: unknown): TextStyle => StyleSheet.flatten(style as StyleProp<TextStyle>) ?? {};
const styleOf = (text: string) => flat(screen.getByText(text).props.style);

const hostTexts = () => screen.container.queryAll((node) => node.type === "Text");
const textOf = (node: ReturnType<typeof hostTexts>[number]) => node.children.join("");
const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 82 } }
});

// The design system's letter-spacing, set by the app: the
// amounts −0.05 em, the titles −0.02 em, the buttons' labels and the labels −0.01 em.
describe("the design system's letter-spacing", () => {
  it("turns each role's em into points at its size", () => {
    expect(tracked).toEqual({
      amountDisplay: -3.8,
      amountLarge: -2.6,
      title: -0.38,
      action: -0.17,
      // −0.135, rounded to the hundredth as `tracking` does.
      label: -0.13
    });
    expect(tracking(TITLE_EM, 26)).toBe(-0.52);
    expect(tracking(AMOUNT_EM, 34)).toBe(-1.7);
  });

  it("tightens a button's label, whatever its level", async () => {
    await render(
      <>
        <Button>Charge</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="text">Add a note</Button>
      </>
    );
    for (const label of ["Charge", "Cancel", "Add a note"]) {
      expect(styleOf(label).fontSize).toBe(type.action);
      expect(styleOf(label).letterSpacing).toBe(tracked.action);
    }
  });

  it("tightens a screen title at its own size", async () => {
    await render(<ScreenTitle size={24}>Bank details</ScreenTitle>);
    expect(styleOf("Bank details").letterSpacing).toBe(tracking(TITLE_EM, 24));
  });

  it("tightens an amount, at either size, and not its currency code", async () => {
    await render(<AmountBlock amount="24.50" currency="CHF" />);
    expect(styleOf("24.50").letterSpacing).toBe(tracked.amountLarge);
    expect(styleOf("CHF").letterSpacing).toBeUndefined();
  });

  it("measures a typed amount's glyphs in the spacing they are drawn in (AnimatedAmount)", async () => {
    await render(
      <AmountBlock amount="24.50" minor={2450} glyphs="0123456789." currency="CHF" size="display" />
    );
    // Jest has no layout: report the measuring texts' widths, then the row's and the currency's,
    // so that the figure is drawn glyph by glyph, as on a device.
    for (const node of hostTexts().filter((n) => n.props["aria-hidden"] && n.props.onLayout)) {
      await fireEvent(node, "layout", layout(textOf(node) === "." ? 15 : 40));
    }
    await fireEvent(screen.getByText("CHF"), "layout", layout(50));
    await fireEvent(screen.getByLabelText("24.50 CHF"), "layout", layout(346));

    const figures = hostTexts().filter((node) => ["2", "4", ".", "5", "0"].includes(textOf(node)));
    expect(figures.length).toBeGreaterThan(5);
    for (const node of figures) {
      expect(flat(node.props.style).letterSpacing).toBe(tracked.amountDisplay);
    }
  });

  it("keeps the smallest pill's label untightened: the tab bar's size, not the label's", async () => {
    await render(
      <>
        <StatusPill state="settled" label="Paid" />
        <StatusPill state="expired" label="Expired" size="xs" />
      </>
    );
    expect(styleOf("Paid").letterSpacing).toBe(tracked.label);
    expect(styleOf("Expired").fontSize).toBe(type.tabLabel);
    expect(styleOf("Expired").letterSpacing).toBe(0);
  });

  it("leaves text outside those roles as it was", async () => {
    await render(<Text style={{ fontSize: type.body }}>CHF — Swiss franc</Text>);
    expect(styleOf("CHF — Swiss franc").letterSpacing).toBeUndefined();
  });
});

// The design system's keyboard focus on the web, in place of the
// browser's ring.
describe("the web's keyboard focus", () => {
  it("is the design system's: a 1.5 px orange ring and a 4 px apricot halo, fields left out", () => {
    expect(stroke.control).toBe(1.5);
    expect(colors.border.accent).toBe("#F7931A");
    expect(shadow.focusRing).toBe("0px 0px 0px 4px #F5E7D2");
    expect(focusRingCss(lightTheme)).toBe(
      ":focus-visible:not(input):not(textarea){outline:1.5px solid #F7931A;" +
        "outline-offset:-1.5px;box-shadow:0px 0px 0px 4px #F5E7D2 !important}"
    );
  });

  // The dark theme: the same orange ring, its halo the orange at 45 % (the apricot
  // shows as a stain on navy).
  it("keeps the ring in the dark theme, its halo the dark theme's", () => {
    expect(focusRingCss(darkTheme)).toBe(
      ":focus-visible:not(input):not(textarea){outline:1.5px solid #F7931A;" +
        "outline-offset:-1.5px;box-shadow:0px 0px 0px 4px rgba(247, 147, 26, 0.45) !important}"
    );
  });

  describe("installed in the document", () => {
    type FakeElement = { id: string; textContent: string };
    let head: FakeElement[];

    beforeEach(() => {
      head = [];
      // The parts of the browser document it uses (Jest runs without a DOM here).
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
          getElementById: (id: string) => head.find((element) => element.id === id) ?? null,
          createElement: (): FakeElement => ({ id: "", textContent: "" }),
          head: { appendChild: (element: FakeElement) => head.push(element) }
        }
      });
    });

    afterEach(() => {
      delete (globalThis as { document?: unknown }).document;
    });

    it("adds its rule once, however often it is installed, in the theme drawn", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the web's own module
      const { installFocusRing } = require("../theme/focus-ring.web") as typeof FocusRing;
      installFocusRing(lightTheme);
      installFocusRing(lightTheme);
      expect(head).toEqual([{ id: "focus-ring", textContent: focusRingCss(lightTheme) }]);
      // The other theme: the same element, its rule replaced.
      installFocusRing(darkTheme);
      expect(head).toEqual([{ id: "focus-ring", textContent: focusRingCss(darkTheme) }]);
    });

    it("does nothing without a document (the apps)", () => {
      delete (globalThis as { document?: unknown }).document;
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the web's own module
      const { installFocusRing } = require("../theme/focus-ring.web") as typeof FocusRing;
      expect(() => installFocusRing(lightTheme)).not.toThrow();
      expect(head).toEqual([]);
    });
  });
});
