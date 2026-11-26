import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createContext, useContext, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Sheet } from "@/components/ui/Sheet";
import { PAGE_TRANSITION, SheetPages } from "@/components/ui/sheet-pages";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Instance = ReturnType<typeof screen.getByText>;

/** The page holding `text`: the nearest view above it that says whether it is out of reach. */
function pageOf(text: string): Instance {
  let node: Instance | null = screen.getByText(text, { includeHiddenElements: true });
  while (node && node.props.importantForAccessibility === undefined) node = node.parent;
  if (!node) throw new Error(`No page holds ${text}`);
  return node;
}

function opacityOf(text: string): number {
  return Number(getAnimatedStyle(pageOf(text)).opacity);
}

/** The panel's own style, its animated part aside. */
function panelStyle() {
  return StyleSheet.flatten(screen.getByTestId("sheet").props.style);
}

/** A panel of pages, `page` its key; each page counts its own presses. */
function Panel({ page, label = `Page ${page}` }: { page: string; label?: string }) {
  return (
    <Sheet title="Sell" closeLabel="Close" visible onClose={jest.fn()} page={page} testID="sheet">
      <Counter label={label} />
    </Sheet>
  );
}

function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <Text onPress={() => setCount(count + 1)}>
      {label} · {count}
    </Text>
  );
}

describe("a panel's pages (Sheet's `page`)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("changes its content in place while its page stays, the page's state kept", async () => {
    await render(<Panel page="phone" label="Number" />);
    await fireEvent.press(screen.getByText("Number · 0"));
    await screen.rerender(<Panel page="phone" label="Number, verified" />);
    // The same page, drawn again: its count kept, nothing left behind, never faded.
    expect(screen.getByText("Number, verified · 1")).toBeTruthy();
    expect(screen.queryByText("Number · 1", { includeHiddenElements: true })).toBeNull();
    expect(opacityOf("Number, verified · 1")).toBe(1);
    expect(panelStyle().overflow).toBeUndefined();
  });

  it("fades the page left out and the new one in, mounted afresh, the panel clipped meanwhile", async () => {
    await render(<Panel page="phone" label="Number" />);
    await fireEvent.press(screen.getByText("Number · 0"));
    await screen.rerender(<Panel page="code" label="Code" />);

    // The new page, from nothing: its own state, transparent at first.
    expect(screen.getByText("Code · 0")).toBeTruthy();
    expect(opacityOf("Code · 0")).toBe(0);
    // The page left, as it was, over it: out of reach (screen readers, touches, queries).
    expect(screen.queryByText("Number · 1")).toBeNull();
    const left = pageOf("Number · 1");
    expect(left.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(StyleSheet.flatten(left.props.style)).toMatchObject({
      position: "absolute",
      pointerEvents: "none"
    });
    expect(panelStyle().overflow).toBe("hidden");

    await advance(motion.sheetPageOut + 50);
    expect(opacityOf("Number · 1")).toBe(0);
    // The new page waits for the old one to be mostly gone, then fades in.
    await advance(motion.sheetPageInDelay + motion.sheetPageIn);
    expect(opacityOf("Code · 0")).toBe(1);

    // Gone once the transition is over; the panel no longer clipped.
    await advance(PAGE_TRANSITION);
    expect(screen.queryByText("Number · 1", { includeHiddenElements: true })).toBeNull();
    expect(panelStyle().overflow).toBeUndefined();
    expect(screen.getByText("Code · 0")).toBeTruthy();
  });

  it("keeps the size the page left last showed, so that its list does not grow", async () => {
    await render(<Panel page="list" label="List" />);
    await fireEvent(pageOf("List · 0"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 312 } }
    });
    await screen.rerender(<Panel page="detail" label="Detail" />);
    expect(StyleSheet.flatten(pageOf("List · 0").props.style).height).toBe(312);
  });

  it("draws a page left with what it was given, never with what came since", async () => {
    // "Sell"'s pages read their state from a context provided within the panel's content.
    const Step = createContext("phone");
    function Reader() {
      return <Text>Step {useContext(Step)}</Text>;
    }
    const panel = (step: string) => (
      <Sheet title="Sell" closeLabel="Close" visible onClose={jest.fn()} page={step}>
        <Step.Provider value={step}>
          <Reader />
        </Step.Provider>
      </Sheet>
    );
    await render(panel("phone"));
    await screen.rerender(panel("code"));
    expect(screen.getByText("Step code")).toBeTruthy();
    expect(screen.getByText("Step phone", { includeHiddenElements: true })).toBeTruthy();
  });

  it("starts each opening from its page, without a transition", async () => {
    const panel = (visible: boolean, page: string) => (
      <Sheet title="Sell" closeLabel="Close" visible={visible} onClose={jest.fn()} page={page}>
        <Text>{page}</Text>
      </Sheet>
    );
    await render(panel(true, "sale"));
    await screen.rerender(panel(false, "sale"));
    await advance(motion.sheet + 100);
    await screen.rerender(panel(false, "settings"));
    await screen.rerender(panel(true, "settings"));
    expect(screen.queryByText("sale", { includeHiddenElements: true })).toBeNull();
    expect(opacityOf("settings")).toBe(1);
  });

  it("goes back to a page left that is still fading, mounted afresh beside it", async () => {
    await render(<Panel page="list" label="List" />);
    await fireEvent.press(screen.getByText("List · 0"));
    await screen.rerender(<Panel page="detail" label="Detail" />);
    await advance(motion.sheetPageOut / 2);
    await screen.rerender(<Panel page="list" label="List" />);
    // The list shown anew, its first copy and the detail both fading out.
    expect(screen.getByText("List · 0")).toBeTruthy();
    expect(screen.getByText("List · 1", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Detail · 0", { includeHiddenElements: true })).toBeTruthy();
    await advance(PAGE_TRANSITION);
    expect(screen.queryByText("List · 1", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText("Detail · 0", { includeHiddenElements: true })).toBeNull();
  });
});

describe("pages deeper in a panel (SheetPages)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** A form whose own state chooses its page ("Send": the form, its scanner). */
  function Form() {
    const [scanning, setScanning] = useState(false);
    const [typed, setTyped] = useState("");
    return (
      <SheetPages page={scanning ? "scan" : "form"}>
        {scanning ? (
          <Text
            onPress={() => {
              setTyped("bc1q");
              setScanning(false);
            }}
          >
            Scan
          </Text>
        ) : (
          <Text onPress={() => setScanning(true)}>Recipient {typed}</Text>
        )}
      </SheetPages>
    );
  }

  it("fades from one to the other, their owner's state kept, the panel clipped meanwhile", async () => {
    await render(
      <Sheet title="Send" closeLabel="Close" visible onClose={jest.fn()} testID="sheet">
        <Form />
      </Sheet>
    );
    expect(panelStyle().overflow).toBeUndefined();
    await fireEvent.press(screen.getByText("Recipient"));
    expect(opacityOf("Scan")).toBe(0);
    expect(panelStyle().overflow).toBe("hidden");
    await fireEvent.press(screen.getByText("Scan"));
    // What the scanner read, in the form shown again: the owner kept it.
    expect(screen.getByText("Recipient bc1q")).toBeTruthy();
    await advance(PAGE_TRANSITION);
    expect(panelStyle().overflow).toBeUndefined();
    expect(opacityOf("Recipient bc1q")).toBe(1);
  });

  it("works outside a panel too, its fades alone", async () => {
    await render(<Form />);
    await fireEvent.press(screen.getByText("Recipient"));
    expect(screen.getByText("Scan")).toBeTruthy();
    await advance(PAGE_TRANSITION);
    expect(opacityOf("Scan")).toBe(1);
  });
});

describe("a panel's title", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const panel = (title: string, extra: { steps?: boolean; subtitle?: string } = {}) => (
    <Sheet
      title={title}
      subtitle={extra.subtitle}
      steps={extra.steps ? { count: 3, current: 0 } : undefined}
      closeLabel="Close"
      visible
      onClose={jest.fn()}
    >
      <Text>Content</Text>
    </Sheet>
  );

  it("fades the title before out and the new one in, the new one the header at once", async () => {
    await render(panel("Sell", { steps: true }));
    expect(opacityOf("Sell")).toBe(1);
    await screen.rerender(panel("Add an account", { steps: true }));

    expect(screen.getByRole("header", { name: "Add an account" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Sell" })).toBeNull();
    expect(pageOf("Sell").props.importantForAccessibility).toBe("no-hide-descendants");
    expect(opacityOf("Add an account")).toBe(0);

    await advance(motion.sheetPageOut + 50);
    expect(opacityOf("Sell")).toBe(0);
    await advance(motion.sheetPageInDelay + motion.sheetPageIn);
    expect(opacityOf("Add an account")).toBe(1);
    await advance(PAGE_TRANSITION);
    expect(screen.queryByText("Sell", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the title before at its width, centred where it was", async () => {
    await render(panel("Sell", { steps: true }));
    await fireEvent(pageOf("Sell"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 24 } }
    });
    await screen.rerender(panel("Add an account", { steps: true }));
    // A pixel more than measured (the web rounds it to a whole pixel, see below).
    expect(StyleSheet.flatten(pageOf("Sell").props.style)).toMatchObject({
      position: "absolute",
      width: 121,
      left: "50%",
      marginLeft: -60.5,
      pointerEvents: "none"
    });
  });

  it("never breaks the title before onto a new line: the web rounds its width to a whole pixel", async () => {
    // A title 82.09 px wide in the browser: react-native-web measures offsetWidth, 82.
    await render(panel("Limits"));
    await fireEvent(pageOf("Limits"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 82, height: 24 } }
    });
    await screen.rerender(panel("Over 24 hours"));
    expect(StyleSheet.flatten(pageOf("Limits").props.style).width).toBe(83);
  });

  it("keeps the title before at its width from the left, beside the close button", async () => {
    await render(panel("Merchants", { subtitle: "Everyday card" }));
    await fireEvent(pageOf("Merchants"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 24 } }
    });
    // A merchant's page has no subtitle: still the same title, fading.
    await screen.rerender(panel("Bakery"));
    expect(StyleSheet.flatten(pageOf("Merchants").props.style)).toMatchObject({
      position: "absolute",
      left: 0,
      width: 301
    });
    expect(opacityOf("Bakery")).toBe(0);
  });

  it("stays as it is when the title does not change", async () => {
    await render(panel("Sell"));
    await screen.rerender(panel("Sell", { subtitle: "Step 2" }));
    expect(screen.getAllByText("Sell", { includeHiddenElements: true })).toHaveLength(1);
    expect(opacityOf("Sell")).toBe(1);
  });
});
