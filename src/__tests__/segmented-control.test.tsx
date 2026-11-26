import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  LABEL_SLACK,
  SegmentedControl,
  fittedLabels,
  stackedSegments,
  tightSegments
} from "@/components/ui/SegmentedControl";
import { lightColors as colors, motion, sans, space } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

// Reanimated runs for real here (driven by fake timers); only Reduce Motion is switchable.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

// The glyphs drawn by Icon (Font Awesome 6 codepoints of Icon.tsx).
const CALCULATOR = String.fromCodePoint(0xf1ec);
const TAGS = String.fromCodePoint(0xf02c);

function segmentStyle(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe("SegmentedControl", () => {
  it("draws no icon and keeps its 22 px segments when no option has one", async () => {
    await render(
      <SegmentedControl
        options={[
          { value: "slow", label: "Slow" },
          { value: "fast", label: "Fast" }
        ]}
        value="slow"
        onChange={() => undefined}
        label="Speed"
        testID="speed"
      />
    );
    // The label alone in each segment, laid out as before (a column, 22 px inside).
    for (const id of ["speed-slow", "speed-fast"]) {
      expect(within(screen.getByTestId(id)).getAllByText(/.+/)).toHaveLength(1);
      const style = segmentStyle(id);
      expect(style.paddingHorizontal).toBe(space[8]);
      expect(style.flexDirection).toBeUndefined();
    }
  });

  // "Colour" and "Image" of a card's "Customize".
  it("shares its parent's width equally when stretched, the thumb's ink copy laid out alike", async () => {
    const hidden = { includeHiddenElements: true };
    await render(
      <SegmentedControl
        options={[
          { value: "color", label: "Colour", icon: "palette" },
          { value: "image", label: "Image", icon: "image" }
        ]}
        value="color"
        onChange={() => undefined}
        label="Look"
        stretch
        testID="kind"
      />
    );
    expect(StyleSheet.flatten(screen.getByTestId("kind-group").props.style).alignSelf).toBe(
      "stretch"
    );
    for (const id of ["kind-color", "kind-image"]) {
      expect(segmentStyle(id)).toMatchObject({ flexGrow: 1, flexBasis: 0 });
    }
    // Laid out in a dialog's 432 px: the thumb under the first half, its ink copy as the segments.
    const layout = (testID: string, x: number, width: number) =>
      fireEvent(screen.getByTestId(testID, hidden), "layout", {
        nativeEvent: { layout: { x, y: 4, width, height: 44 } }
      });
    await layout("kind-color", 4, 210);
    await layout("kind-image", 218, 210);
    await layout("kind-group", 0, 432);
    const copies = screen.getByTestId("kind-thumb-ink", hidden).children;
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      if (typeof copy === "string") throw new Error("a segment's copy expected");
      expect(StyleSheet.flatten(copy.props.style)).toMatchObject({ flexGrow: 1, flexBasis: 0 });
    }
  });

  // The send sheet's speeds on a 360 px wide phone: 316 px, 100 px a segment.
  describe("stretched with icons, the icon above the label where a share cannot hold both", () => {
    const fits = { width: 100, height: 44 };
    const wider = { width: 124, height: 44 };

    it("stacks only when a segment is wider than its equal share", () => {
      // 4 + 100 + 4 + 100 + 4 + 100 + 4 = 316 px.
      expect(stackedSegments([fits, fits, fits], 316)).toBe(false);
      expect(stackedSegments([fits, fits, wider], 316)).toBe(true);
      expect(stackedSegments([fits, fits, wider], 388)).toBe(false);
      // Not measured yet: side by side.
      expect(stackedSegments([fits, fits, wider], null)).toBe(false);
      expect(stackedSegments([wider, undefined, wider], 316)).toBe(false);
    });

    const layout = (testID: string, x: number, width: number, height = 44) =>
      fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), "layout", {
        nativeEvent: { layout: { x, y: 0, width, height } }
      });

    it('measures its segments and its room, then stacks them, a label ending in "…" last', async () => {
      await render(
        <SegmentedControl
          options={[
            { value: "fast", label: "Fast", icon: "rocket" },
            { value: "medium", label: "Normal", icon: "gauge" },
            { value: "slow", label: "Economy", icon: "piggy-bank" }
          ]}
          value="medium"
          onChange={() => undefined}
          label="Speed"
          stretch
          testID="speed"
        />
      );
      // Before it is measured: side by side, sharing the width.
      expect(segmentStyle("speed-slow")).toMatchObject({ flexDirection: "row", flexGrow: 1 });
      await layout("speed-measure-fast", 0, 86);
      await layout("speed-measure-medium", 0, 98);
      await layout("speed-measure-slow", 0, 124);
      await layout("speed-fit", 0, 316);
      for (const id of ["speed-fast", "speed-medium", "speed-slow"]) {
        expect(segmentStyle(id)).toMatchObject({
          flexDirection: "column",
          alignItems: "center",
          paddingHorizontal: space[3],
          flexGrow: 1,
          flexBasis: 0,
          flexShrink: 1
        });
        const label = within(screen.getByTestId(id)).getByText(/^[^\uf000-\uf8ff]+$/);
        expect(label.props.numberOfLines).toBe(1);
        // Its box (`labelBox`), the bold label's parent: the idle one has a box of its own.
        const [bold] = within(screen.getByTestId(id)).getAllByText(/^[^\uf000-\uf8ff]+$/, {
          includeHiddenElements: true
        });
        expect(StyleSheet.flatten(bold!.parent!.props.style).alignSelf).toBe("stretch");
      }
      // The thumb's ink copy, laid out alike.
      await layout("speed-fast", 4, 100, 48);
      await layout("speed-medium", 108, 100, 48);
      await layout("speed-slow", 212, 100, 48);
      await layout("speed-group", 0, 316, 56);
      const copies = screen.getByTestId("speed-thumb-ink", {
        includeHiddenElements: true
      }).children;
      expect(copies).toHaveLength(3);
      for (const copy of copies) {
        if (typeof copy === "string") throw new Error("a segment's copy expected");
        expect(StyleSheet.flatten(copy.props.style)).toMatchObject({ flexDirection: "column" });
      }

      // A wider room (a desktop dialog): side by side again.
      await layout("speed-fit", 0, 520);
      expect(segmentStyle("speed-slow")).toMatchObject({
        flexDirection: "row",
        paddingHorizontal: space[4]
      });
    });
  });

  // A payment being sent: enabled and laid out first, then disabled.
  it("changes nothing on a tap while disabled, its segments in stone, no white thumb", async () => {
    const hidden = { includeHiddenElements: true };
    const onChange = jest.fn();
    const control = (disabled: boolean) => (
      <SegmentedControl
        options={[
          { value: "fast", label: "Fast", icon: "rocket" },
          { value: "slow", label: "Economy", icon: "piggy-bank" }
        ]}
        value="slow"
        onChange={onChange}
        label="Speed"
        stretch
        disabled={disabled}
        testID="speed"
      />
    );
    await render(control(false));
    const layout = (testID: string, x: number, width: number) =>
      fireEvent(screen.getByTestId(testID, hidden), "layout", {
        nativeEvent: { layout: { x, y: 4, width, height: 44 } }
      });
    await layout("speed-fast", 4, 150);
    await layout("speed-slow", 158, 150);
    await layout("speed-group", 0, 312);
    const thumbStyle = () =>
      StyleSheet.flatten(screen.getByTestId("speed-thumb", hidden).props.style);
    expect(thumbStyle().backgroundColor).toBe(colors.background.surface);

    await screen.rerender(control(true));
    for (const id of ["speed-fast", "speed-slow"]) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
    await fireEvent.press(screen.getByTestId("speed-fast"));
    expect(onChange).not.toHaveBeenCalled();
    // The thumb still holds the ink copy, without its white fill: the bold label, in stone.
    expect(thumbStyle().backgroundColor).toBeUndefined();
    expect(thumbStyle().boxShadow).toBeUndefined();
    const ink = screen.getByTestId("speed-thumb-ink", hidden);
    for (const label of within(ink).getAllByText("Economy", hidden)) {
      expect(StyleSheet.flatten(label.props.style).color).toBe(colors.text.secondary);
    }
    // Nothing hides the segment under the thumb any more: it draws the bold label alone, never its
    // semi-bold one under the thumb's bold copy.
    const chosen = within(screen.getByTestId("speed-slow")).getAllByText("Economy", hidden);
    expect(chosen).toHaveLength(1);
    expect(StyleSheet.flatten(chosen[0].props.style).opacity).toBeUndefined();
    expect(StyleSheet.flatten(chosen[0].props.style).color).toBe(colors.text.secondary);
  });

  it("is as wide as its segments when not stretched", async () => {
    await render(
      <SegmentedControl
        options={[
          { value: "color", label: "Colour", icon: "palette" },
          { value: "image", label: "Image", icon: "image" }
        ]}
        value="color"
        onChange={() => undefined}
        label="Look"
        testID="kind"
      />
    );
    expect(StyleSheet.flatten(screen.getByTestId("kind-group").props.style).alignSelf).toBe(
      "flex-start"
    );
    expect(segmentStyle("kind-color").flexGrow).toBeUndefined();
  });

  // "Fast / Normal / Economy" of the send sheet: 342 px of the 316 px of a 360 px phone.
  describe("without icons, never wider than its parent", () => {
    // Three segments of 100 px: 4 + 100 + 4 + 100 + 4 + 100 + 4 = 316 px.
    const segment = { width: 100, height: 44 };

    it("takes 9 px inside its segments only when the 22 px ones are wider than its room", () => {
      expect(tightSegments([segment, segment, segment], 316)).toBe(false);
      expect(tightSegments([segment, segment, segment], 315)).toBe(true);
      // Not measured yet: as drawn by the design.
      expect(tightSegments([segment, segment, segment], null)).toBe(false);
      expect(tightSegments([segment, undefined, segment], 100)).toBe(false);
    });

    function layout(testID: string, width: number) {
      fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } }
      });
    }

    it('measures its segments and its room, then tightens them, a label ending in "…" last', async () => {
      await render(
        <SegmentedControl
          options={[
            { value: "fast", label: "Fast" },
            { value: "medium", label: "Normal" },
            { value: "slow", label: "Economy" }
          ]}
          value="medium"
          onChange={() => undefined}
          label="Speed"
          testID="speed"
        />
      );
      await act(async () => {
        layout("speed-measure-fast", 104);
        layout("speed-measure-medium", 115);
        layout("speed-measure-slow", 123);
        layout("speed-fit", 316);
      });
      for (const id of ["speed-fast", "speed-medium", "speed-slow"]) {
        expect(segmentStyle(id)).toMatchObject({ paddingHorizontal: space[4], flexShrink: 1 });
        const label = within(screen.getByTestId(id)).getByText(/.+/);
        expect(label.props.numberOfLines).toBe(1);
        expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
      }
      // The control itself: never wider than its parent.
      expect(
        StyleSheet.flatten(screen.getByTestId("speed-fast").parent!.props.style).maxWidth
      ).toBe("100%");

      // A wider room (a desktop dialog): the design's 22 px again.
      await act(async () => layout("speed-fit", 520));
      expect(segmentStyle("speed-slow").paddingHorizontal).toBe(space[8]);
    });
  });

  // The point of sale's "Amount" / "Items".
  it("draws each option's icon before its label, in tighter segments, and changes on a tap", async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        options={[
          { value: "amount", label: "Amount", icon: "calculator" },
          { value: "articles", label: "Items", icon: "tags" }
        ]}
        value="articles"
        onChange={onChange}
        label="Entry mode"
        testID="mode"
      />
    );
    const amount = within(screen.getByTestId("mode-amount"));
    const articles = within(screen.getByTestId("mode-articles"));
    expect(amount.getByText(CALCULATOR)).toBeTruthy();
    expect(amount.getByText("Amount")).toBeTruthy();
    expect(articles.getByText(TAGS)).toBeTruthy();
    // The chosen option's icon in ink, the other's in stone, as their labels.
    expect(StyleSheet.flatten(articles.getByText(TAGS).props.style).color).toBe(
      colors.text.primary
    );
    expect(StyleSheet.flatten(amount.getByText(CALCULATOR).props.style).color).toBe(
      colors.text.secondary
    );
    const style = segmentStyle("mode-amount");
    expect(style.paddingHorizontal).toBe(space[4]);
    expect(style.flexDirection).toBe("row");
    // Still the touch floor.
    expect(style.minHeight).toBe(44);
    // The icon is not read: the option's name is its label.
    expect(amount.getByText(CALCULATOR).props.accessible).toBe(false);

    await fireEvent.press(screen.getByTestId("mode-amount"));
    expect(onChange).toHaveBeenCalledWith("amount");
  });

  describe("fitted to its parent (larger text sizes)", () => {
    // Two segments of 90 × 44: 4 + 90 + 4 + 90 + 4 = 192 px wide with both labels; 4 + 90 + 4 +
    // 44 + 4 = 146 px with the chosen one's alone; 4 + 44 + 4 + 44 + 4 = 100 px with icons only.
    const normal = { width: 90, height: 44 };

    it("shows every label while the whole control fits, as tall as its header at most", () => {
      expect(fittedLabels([normal, normal], 1, 192, 64)).toBe("all");
      expect(fittedLabels([normal, normal], 1, 191, 64)).toBe("selected");
      expect(fittedLabels([normal, normal], 1, 146, 64)).toBe("selected");
      expect(fittedLabels([normal, normal], 1, 145, 64)).toBe("none");
    });

    it("leaves the labels out that would make it taller than its header", () => {
      // A label on two lines' height: 4 + 57 + 4 = 65 > 64.
      const tall = { width: 90, height: 57 };
      expect(fittedLabels([tall, tall], 0, 400, 64)).toBe("none");
      expect(fittedLabels([normal, tall], 0, 400, 64)).toBe("selected");
      expect(fittedLabels([{ width: 90, height: 56 }, normal], 0, 400, 64)).toBe("all");
    });

    it("shows every label until it has measured its room and its segments", () => {
      expect(fittedLabels([normal, normal], 0, null, 64)).toBe("all");
      expect(fittedLabels([normal, undefined], 0, 50, 64)).toBe("all");
    });

    function layout(testID: string, width: number, height: number) {
      // The measures are out of reach of screen readers (outOfReach): hidden for the queries too.
      fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width, height } }
      });
    }

    async function renderFitted(value: "amount" | "articles") {
      const options = [
        { value: "amount", label: "Amount", icon: "calculator" },
        { value: "articles", label: "Items", icon: "tags" }
      ] as const;
      const element = (chosen: "amount" | "articles") => (
        <SegmentedControl
          options={options}
          value={chosen}
          onChange={() => undefined}
          label="Entry mode"
          fit={{ maxHeight: 64 }}
          testID="mode"
        />
      );
      const view = await render(element(value));
      return { rerender: (chosen: "amount" | "articles") => view.rerender(element(chosen)) };
    }

    it("keeps the chosen option's label alone when both do not fit, the other an icon", async () => {
      const { rerender } = await renderFitted("articles");
      await act(async () => {
        layout("mode-measure-amount", 90, 44);
        layout("mode-measure-articles", 90, 44);
        layout("mode-fit", 160, 52);
      });
      const amount = screen.getByTestId("mode-amount");
      expect(within(amount).queryByText("Amount")).toBeNull();
      expect(within(amount).getByText(CALCULATOR)).toBeTruthy();
      // Still named for screen readers, in its 44 px circle.
      expect(amount.props.accessibilityLabel).toBe("Amount");
      expect(segmentStyle("mode-amount").width).toBe(44);
      expect(within(screen.getByTestId("mode-articles")).getByText("Items")).toBeTruthy();

      // The label follows the option chosen.
      await act(async () => rerender("amount"));
      expect(within(screen.getByTestId("mode-amount")).getByText("Amount")).toBeTruthy();
      expect(within(screen.getByTestId("mode-articles")).queryByText("Items")).toBeNull();
    });

    it("shows only icons when even one label does not fit, and every label again with room", async () => {
      await renderFitted("articles");
      await act(async () => {
        // A much larger text size: each label 150 px wide.
        layout("mode-measure-amount", 190, 44);
        layout("mode-measure-articles", 180, 44);
        layout("mode-fit", 212, 52);
      });
      for (const [id, name] of [
        ["mode-amount", "Amount"],
        ["mode-articles", "Items"]
      ] as const) {
        expect(within(screen.getByTestId(id)).queryByText(name)).toBeNull();
        expect(screen.getByTestId(id).props.accessibilityLabel).toBe(name);
      }

      // The text size back to normal: measured again.
      await act(async () => {
        layout("mode-measure-amount", 90, 44);
        layout("mode-measure-articles", 90, 44);
      });
      expect(within(screen.getByTestId("mode-amount")).getByText("Amount")).toBeTruthy();
      expect(within(screen.getByTestId("mode-articles")).getByText("Items")).toBeTruthy();
      // Named by its label, shown or not: it also holds a hidden copy of it (the ink).
      expect(screen.getByTestId("mode-amount").props.accessibilityLabel).toBe("Amount");
    });

    it("stays centred in the width it measures, however wide", async () => {
      await renderFitted("amount");
      await act(async () => {
        layout("mode-measure-amount", 90, 44);
        layout("mode-measure-articles", 90, 44);
        layout("mode-fit", 300, 52);
      });
      expect(StyleSheet.flatten(screen.getByTestId("mode-fit").props.style).alignSelf).toBe(
        "stretch"
      );
      expect(segmentStyle("mode-group").alignSelf).toBe("center");
    });

    it("measures nothing without `fit`", async () => {
      await render(
        <SegmentedControl
          options={[{ value: "amount", label: "Amount", icon: "calculator" }]}
          value="amount"
          onChange={() => undefined}
          label="Entry mode"
          testID="mode"
        />
      );
      expect(screen.queryByTestId("mode-fit")).toBeNull();
      expect(screen.queryByTestId("mode-measure-amount")).toBeNull();
    });
  });

  describe("the thumb carrying the ink", () => {
    const hidden = { includeHiddenElements: true };
    // 4 + 90 + 4 + 84 + 4 = 186 px: "Amount" at x = 4, "Items" at x = 98.
    const AMOUNT = { x: 4, width: 90 };
    const ARTICLES = { x: 98, width: 84 };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.mocked(useReducedMotion).mockReturnValue(false);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function advance(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    }

    const element = (value: "amount" | "articles", onChange = jest.fn()) => (
      <SegmentedControl
        options={[
          { value: "amount", label: "Amount", icon: "calculator" },
          { value: "articles", label: "Items", icon: "tags" }
        ]}
        value={value}
        onChange={onChange}
        label="Entry mode"
        testID="mode"
      />
    );

    async function layout(testID: string, box: { x: number; width: number }) {
      await fireEvent(screen.getByTestId(testID, hidden), "layout", {
        nativeEvent: { layout: { x: box.x, y: 4, width: box.width, height: 44 } }
      });
    }

    async function measure(amount = AMOUNT, articles = ARTICLES) {
      await layout("mode-amount", amount);
      await layout("mode-articles", articles);
      await layout("mode-group", { x: 0, width: articles.x + articles.width + 4 });
    }

    function thumb() {
      const style = getAnimatedStyle(screen.getByTestId("mode-thumb", hidden)) as {
        width: number;
        opacity: number;
        transform: { translateX: number }[];
      };
      return { left: style.transform[0]!.translateX, width: style.width, opacity: style.opacity };
    }

    function inkOffset() {
      const style = getAnimatedStyle(screen.getByTestId("mode-thumb-ink", hidden)) as {
        transform: { translateX: number }[];
      };
      return style.transform[0]!.translateX;
    }

    it("draws the option chosen raised in place until its segments are measured", async () => {
      await render(element("articles"));
      expect(screen.queryByTestId("mode-thumb", hidden)).toBeNull();
      expect(segmentStyle("mode-articles").backgroundColor).toBe(colors.background.surface);
      const label = within(screen.getByTestId("mode-articles")).getByText("Items");
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({
        ...sans(700),
        color: colors.text.primary
      });
      expect(segmentStyle("mode-amount").backgroundColor).toBeUndefined();
    });

    it("then puts the thumb under it at once, the segments idle and the ink in the thumb", async () => {
      await render(element("articles"));
      await measure();
      // Placed, not slid in.
      expect(thumb()).toEqual({ left: ARTICLES.x, width: ARTICLES.width, opacity: 1 });
      // The ink copy over the segments it copies, as wide as the control inside its padding.
      expect(inkOffset()).toBe(4 - ARTICLES.x);
      const ink = screen.getByTestId("mode-thumb-ink", hidden);
      expect(StyleSheet.flatten(ink.props.style).width).toBe(ARTICLES.x + ARTICLES.width - 4);
      expect(StyleSheet.flatten(within(ink).getByText("Items", hidden).props.style)).toMatchObject({
        ...sans(700),
        color: colors.text.primary
      });
      // The segment itself idle: the thumb draws the white and the ink above it.
      expect(segmentStyle("mode-articles").backgroundColor).toBeUndefined();
      const label = within(screen.getByTestId("mode-articles")).getByText("Items");
      expect(StyleSheet.flatten(label.props.style)).toMatchObject({
        ...sans(600),
        color: colors.text.secondary
      });
      // Neither read nor touched: the segments below are the control.
      expect(screen.queryByTestId("mode-thumb")).toBeNull();
      expect(
        StyleSheet.flatten(screen.getByTestId("mode-thumb", hidden).props.style)
      ).toMatchObject({ pointerEvents: "none" });
      expect(screen.getByRole("radio", { name: "Items" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Amount" })).not.toBeChecked();
    });

    it("keeps each label as wide in both weights: the bold one, hidden, sets its width", async () => {
      await render(element("articles"));
      await measure();
      const segment = within(screen.getByTestId("mode-amount"));
      const [reserved, idle] = segment.getAllByText("Amount", hidden);
      expect(StyleSheet.flatten(reserved!.props.style)).toMatchObject({
        ...sans(700),
        opacity: 0
      });
      expect(reserved!.props["aria-hidden"]).toBe(true);
      expect(StyleSheet.flatten(idle!.props.style)).toMatchObject({
        ...sans(600),
        textAlign: "center"
      });
      // Over the bold one, a little wider on each side, into the segment's padding: a semi-bold
      // label can be a fraction of a pixel wider ("CHF" ended in "C…" on the web).
      expect(StyleSheet.flatten(idle!.parent!.props.style)).toMatchObject({
        position: "absolute",
        left: -LABEL_SLACK,
        right: -LABEL_SLACK
      });
      expect(LABEL_SLACK).toBeGreaterThan(0);
      expect(LABEL_SLACK).toBeLessThanOrEqual(space[3]);
      // Read once, by the segment's name.
      expect(segment.getAllByText("Amount")).toHaveLength(1);
    });

    it("slides to the option chosen, the ink staying over its segments, and taps go through", async () => {
      const onChange = jest.fn();
      const view = await render(element("articles", onChange));
      await measure();
      await fireEvent.press(screen.getByTestId("mode-amount"));
      expect(onChange).toHaveBeenCalledWith("amount");

      await view.rerender(element("amount", onChange));
      await advance(motion.segmentInk / 2);
      const halfway = thumb();
      expect(halfway.left).toBeGreaterThan(AMOUNT.x);
      expect(halfway.left).toBeLessThan(ARTICLES.x);
      expect(halfway.width).toBeGreaterThan(ARTICLES.width);
      expect(halfway.width).toBeLessThan(AMOUNT.width);
      expect(inkOffset()).toBeCloseTo(4 - halfway.left);

      await advance(motion.segmentInk);
      expect(thumb()).toEqual({ left: AMOUNT.x, width: AMOUNT.width, opacity: 1 });
      expect(inkOffset()).toBe(4 - AMOUNT.x);
    });

    it("turns back from where it is when the other option is chosen during the slide", async () => {
      const view = await render(element("articles"));
      await measure();
      await view.rerender(element("amount"));
      await advance(motion.segmentInk / 3);
      const before = thumb().left;
      expect(before).toBeLessThan(ARTICLES.x - 20);

      await view.rerender(element("articles"));
      await advance(16);
      // No jump: it goes on from where it was (neither from "Amount" nor at "Items"), back
      // towards "Items". One frame of the ease-out covers about a quarter of the way.
      const after = thumb().left;
      expect(after).toBeGreaterThan(before);
      expect(after).toBeLessThan(before + (ARTICLES.x - before) / 2);
      await advance(motion.segmentInk);
      expect(thumb()).toEqual({ left: ARTICLES.x, width: ARTICLES.width, opacity: 1 });
    });

    it("follows its segment when it moves for the same option, without fading", async () => {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      await render(element("articles"));
      await measure();
      // A larger text size: the segments wider.
      await measure({ x: 4, width: 110 }, { x: 118, width: 100 });
      await advance(1);
      expect(thumb()).toEqual({ left: 118, width: 100, opacity: 1 });
    });

    it("jumps with its segment laid out again for the same option, not sliding in", async () => {
      await render(element("articles"));
      await measure();
      // The segments laid out again once measured (`tight`, `fit`) or with a larger text size.
      await measure({ x: 4, width: 110 }, { x: 118, width: 100 });
      await advance(16);
      expect(thumb()).toEqual({ left: 118, width: 100, opacity: 1 });
      expect(inkOffset()).toBe(4 - 118);
    });

    it("moves with its segment pushed by a neighbour, its own size unchanged", async () => {
      await render(element("articles"));
      await measure({ x: 4, width: 44 }, { x: 52, width: 84 });
      expect(thumb().left).toBe(52);
      // "Amount" gains its label (`fit`): on the web, only the segment resized reports a
      // layout (react-native-web's ResizeObserver), not "Items" moved by it.
      await layout("mode-amount", AMOUNT);
      await advance(16);
      expect(thumb()).toEqual({ left: ARTICLES.x, width: ARTICLES.width, opacity: 1 });
      expect(inkOffset()).toBe(4 - ARTICLES.x);
    });

    it("during a slide, follows its target moved for the same option within the slide", async () => {
      const view = await render(element("articles"));
      await measure();
      await view.rerender(element("amount"));
      await advance(motion.segmentInk / 3);
      // "Amount" laid out again once chosen (its label shown, with `fit`).
      await measure({ x: 4, width: 100 }, { x: 108, width: 84 });
      await advance(16);
      const moving = thumb();
      expect(moving.left).toBeGreaterThan(4);
      expect(moving.left).toBeLessThan(ARTICLES.x);
      await advance(motion.segmentInk);
      expect(thumb()).toEqual({ left: 4, width: 100, opacity: 1 });
    });

    it("with Reduce Motion, never slides: it fades in at its new place", async () => {
      jest.mocked(useReducedMotion).mockReturnValue(true);
      const view = await render(element("articles"));
      await measure();

      await view.rerender(element("amount"));
      await advance(motion.fast / 2);
      const shown = thumb();
      expect(shown.left).toBe(AMOUNT.x);
      expect(shown.width).toBe(AMOUNT.width);
      expect(shown.opacity).toBeGreaterThan(0);
      expect(shown.opacity).toBeLessThan(1);
      expect(inkOffset()).toBe(4 - AMOUNT.x);
      await advance(motion.fast);
      expect(thumb().opacity).toBe(1);
    });

    it("draws a thumb for options without icons too (the send sheet's speeds)", async () => {
      await render(
        <SegmentedControl
          options={[
            { value: "fast", label: "Fast" },
            { value: "slow", label: "Slow" }
          ]}
          value="slow"
          onChange={() => undefined}
          label="Speed"
          testID="speed"
        />
      );
      await layout("speed-fast", { x: 4, width: 94 });
      await layout("speed-slow", { x: 102, width: 78 });
      await layout("speed-group", { x: 0, width: 184 });
      const style = getAnimatedStyle(screen.getByTestId("speed-thumb", hidden)) as {
        width: number;
        transform: { translateX: number }[];
      };
      expect(style.width).toBe(78);
      expect(style.transform[0]!.translateX).toBe(102);
    });

    // "Currency shown first" on the web: the thumb stayed as narrow as the
    // segments were `tight`, between the two options, once they had their 22 px again.
    describe("on the web, where onLayout tells a change of the content box only", () => {
      // Each segment measured with its 22 px: 4 + 72 + 4 + 71 + 4 = 155 px.
      const element = (value: "fiat" | "sats", onChange = jest.fn()) => (
        <SegmentedControl
          options={[
            { value: "fiat", label: "CHF" },
            { value: "sats", label: "sats" }
          ]}
          value={value}
          onChange={onChange}
          label="Currency shown first"
          testID="unit"
        />
      );

      async function measureSegments() {
        await layout("unit-measure-fiat", { x: 0, width: 72 });
        await layout("unit-measure-sats", { x: 0, width: 71 });
      }

      it("keeps the design's 22 px while hidden (a room of 0), not tight until shown", async () => {
        await render(element("sats"));
        await measureSegments();
        await layout("unit-fit", { x: 0, width: 0 });
        expect(segmentStyle("unit-fiat").paddingHorizontal).toBe(space[8]);
        expect(segmentStyle("unit-sats").paddingHorizontal).toBe(space[8]);
      });

      it("mounts a segment again when its padding changes, the thumb taking its new width", async () => {
        await render(element("sats"));
        await measureSegments();
        // A room too narrow for 155 px: tight, each segment 9 px inside.
        await layout("unit-fit", { x: 0, width: 120 });
        expect(segmentStyle("unit-sats").paddingHorizontal).toBe(space[4]);
        await layout("unit-fiat", { x: 4, width: 46 });
        await layout("unit-sats", { x: 54, width: 45 });
        await layout("unit-group", { x: 0, width: 103 });
        expect(thumbOf("unit")).toMatchObject({ left: 54, width: 45 });

        // Wider (a desktop window widened): 22 px again. Only the padding changed, so the web
        // tells nothing of the segments it already observes: new ones are mounted, which it does.
        const tight = screen.getByTestId("unit-sats");
        await layout("unit-fit", { x: 0, width: 400 });
        expect(segmentStyle("unit-sats").paddingHorizontal).toBe(space[8]);
        expect(screen.getByTestId("unit-sats")).not.toBe(tight);
        await layout("unit-fiat", { x: 4, width: 72 });
        await layout("unit-sats", { x: 80, width: 71 });
        await advance(16);
        expect(thumbOf("unit")).toMatchObject({ left: 80, width: 71 });

        // A change of option keeps the segments mounted (their padding unchanged).
        const wide = screen.getByTestId("unit-sats");
        await act(async () => screen.rerender(element("fiat")));
        expect(screen.getByTestId("unit-sats")).toBe(wide);
      });
    });

    function thumbOf(testID: string) {
      const style = getAnimatedStyle(screen.getByTestId(`${testID}-thumb`, hidden)) as {
        width: number;
        transform: { translateX: number }[];
      };
      return { left: style.transform[0]!.translateX, width: style.width };
    }
  });
});
