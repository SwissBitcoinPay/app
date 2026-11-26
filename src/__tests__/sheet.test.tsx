import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, StyleSheet, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeMutable } from "react-native-reanimated";

import { OverlayModal } from "@/components/ui/overlay";
import { escapeRichText } from "@/components/ui/RichText";
import { Sheet } from "@/components/ui/Sheet";
import { resizeTransition } from "@/components/ui/sheet-layout";
import { TextField } from "@/components/ui/TextField";
import { palette, motion, space, type } from "@/theme";

import { keyboardFields } from "../../jest/soft-keyboard";

function sheet(visible: boolean, onClose = jest.fn()) {
  return (
    <Sheet
      title="Country of residence"
      closeLabel="Close"
      visible={visible}
      onClose={onClose}
      testID="sheet"
    >
      <Text>Content</Text>
    </Sheet>
  );
}

/** Jest has no layout: the sheet waits for its height before sliding in. */
async function measure() {
  await fireEvent(screen.getByTestId("sheet"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } }
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("Sheet", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing while closed", async () => {
    await render(sheet(false));
    expect(screen.queryByText("Content")).toBeNull();
  });

  it("shows its title and content, and asks to close from its button", async () => {
    const onClose = jest.fn();
    await render(sheet(true, onClose));
    expect(screen.getByRole("header", { name: "Country of residence" })).toBeTruthy();
    expect(screen.getByText("Content")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("goes a step back from the arrow before its title, without closing", async () => {
    const onClose = jest.fn();
    const onBack = jest.fn();
    await render(
      <Sheet
        title="WooCommerce"
        closeLabel="Close"
        visible
        onClose={onClose}
        back={{ label: "Back", onPress: onBack }}
        testID="sheet"
      >
        <Text>Content</Text>
      </Sheet>
    );
    expect(screen.getByRole("header", { name: "WooCommerce" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // Without it, no arrow.
    await render(sheet(true));
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  // A payment being sent: the panel stays, its cross and arrow disabled.
  it("keeps its close button and its arrow, disabled, while it cannot be dismissed", async () => {
    const onClose = jest.fn();
    const onBack = jest.fn();
    await render(
      <Sheet
        title="Send"
        closeLabel="Close"
        visible
        onClose={onClose}
        dismissible={false}
        back={{ label: "Back", onPress: onBack }}
        testID="sheet"
      >
        <Text>Content</Text>
      </Sheet>
    );
    const close = screen.getByRole("button", { name: "Close" });
    const back = screen.getByRole("button", { name: "Back" });
    expect(close).toBeDisabled();
    expect(back).toBeDisabled();
    await fireEvent.press(close);
    await fireEvent.press(back);
    expect(onClose).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("says under its title what the panel is of", async () => {
    await render(
      <Sheet
        title="Payments without confirmation"
        subtitle="Card Everyday"
        closeLabel="Close"
        visible
        onClose={() => undefined}
        back={{ label: "Back", onPress: () => undefined }}
      >
        <Text>Content</Text>
      </Sheet>
    );
    expect(screen.getByRole("header", { name: "Payments without confirmation" })).toBeTruthy();
    expect(screen.getByText("Card Everyday")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("sets its title's spans with `titleMarkup`, shows its title as it is without", async () => {
    const name = "<strong>Q</strong>";
    const shown = (markup: boolean) => (
      <Sheet
        title={`Top up <accent>${escapeRichText(name)}</accent>`}
        titleMarkup={markup}
        closeLabel="Close"
        visible
        onClose={() => undefined}
      >
        <Text>Content</Text>
      </Sheet>
    );
    const view = await render(shown(true));
    const header = screen.getByRole("header", { name: `Top up ${name}` });
    // The size of every title (ConfirmDialog's too): an orange span is readable at it (RichText).
    expect(StyleSheet.flatten(header.props.style).fontSize).toBe(type.title);
    // The name typed by a user in one orange span, as it is.
    expect(StyleSheet.flatten(screen.getByText(name).props.style).color).toBe(palette.orange);

    // A name read from the relays may hold a line separator: still one span, no markup shown.
    await view.rerender(
      <Sheet
        title={`Top up <accent>${escapeRichText("A B")}</accent>`}
        titleMarkup
        closeLabel="Close"
        visible
        onClose={() => undefined}
      >
        <Text>Content</Text>
      </Sheet>
    );
    expect(StyleSheet.flatten(screen.getByText("A B").props.style).color).toBe(palette.orange);

    await view.rerender(shown(false));
    expect(
      screen.getByRole("header", { name: `Top up <accent>${escapeRichText(name)}</accent>` })
    ).toBeTruthy();
  });

  it("keeps its content while it slides out, then unmounts it", async () => {
    const view = await render(sheet(true));
    await measure();
    await advance(motion.sheet + 100);

    await view.rerender(sheet(false));
    await advance(motion.sheet / 2);
    expect(screen.getByText("Content")).toBeTruthy();
    await advance(motion.sheet);
    expect(screen.queryByText("Content")).toBeNull();
  });

  it("keeps its margin above the keyboard, its safe area under it", async () => {
    // An iPhone's home indicator.
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    insets.mockReturnValue({ top: 47, right: 0, bottom: 34, left: 0 });
    try {
      await render(sheet(true));
      await measure();
      const panel = screen.getByTestId("sheet");
      // Keyboard closed: the safe area and the sheet's margin.
      expect(StyleSheet.flatten(panel.props.style).paddingBottom).toBe(34 + space[5]);
      // The keyboard's height includes the safe area, which it covers: the avoiding view (a
      // plain view in Jest) rises that much less, and the sheet's margin alone stays above it.
      const avoiding = panel.parent?.parent;
      expect(avoiding?.props.behavior).toBe("padding");
      expect(avoiding?.props.keyboardVerticalOffset).toBe(-34);
    } finally {
      insets.mockImplementation(original);
    }
  });

  it("focuses its field once shown, not as it mounts, so that the keyboard opens", async () => {
    // In the apps, React Native's Modal is not focusable yet while its content mounts: the field
    // would be focused without its keyboard, and a later focus() would do nothing. The Modal's
    // onShow (the event goes up from the panel to it) says when it is.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    try {
      await render(
        <Sheet title="Send" closeLabel="Close" visible onClose={jest.fn()} testID="sheet">
          <TextField label="Recipient" value="" autoFocus testID="field" />
        </Sheet>
      );
      expect(screen.getByTestId("field")).toHaveProp("autoFocus", false);
      expect(focus).not.toHaveBeenCalled();
      await fireEvent(screen.getByTestId("sheet"), "show");
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      focus.mockRestore();
    }
  });

  it("asks for its field's keyboard again once shown, for when its window takes the focus", async () => {
    // Android gives the Modal's window the focus after its onShow (later still after the barcode
    // scanner's Modal), and ignores the keyboard the field's focus asked for before that.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    try {
      await render(
        <Sheet title="Send" closeLabel="Close" visible onClose={jest.fn()} testID="sheet">
          <TextField label="Recipient" value="" autoFocus testID="field" />
          <TextField label="Note" value="" testID="note" />
        </Sheet>
      );
      expect(keyboardFields()).toEqual([]);
      await fireEvent(screen.getByTestId("sheet"), "show");
      expect(keyboardFields()).toEqual(["field"]);
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      focus.mockRestore();
    }
  });

  it("focuses its field when its autoFocus turns on while it shows", async () => {
    // "Items": the name, once Open Food Facts does not know a scanned product.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    const panel = (autoFocus: boolean) => (
      <Sheet title="Send" closeLabel="Close" visible onClose={jest.fn()} testID="sheet">
        <TextField label="Recipient" value="" autoFocus={autoFocus} testID="field" />
      </Sheet>
    );
    try {
      await render(panel(false));
      await fireEvent(screen.getByTestId("sheet"), "show");
      expect(focus).not.toHaveBeenCalled();
      expect(keyboardFields()).toEqual([]);
      await screen.rerender(panel(true));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(keyboardFields()).toEqual(["field"]);
    } finally {
      focus.mockRestore();
    }
  });

  it("focuses a field of a panel opened over it once that panel's own Modal is shown", async () => {
    // Each Modal is a window of its own: a field follows the Modal it is in, not the sheet's.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    try {
      await render(
        <Sheet title="Send" closeLabel="Close" visible onClose={jest.fn()} testID="sheet">
          <OverlayModal mounted visible onRequestClose={jest.fn()}>
            <TextField label="Note" value="" autoFocus testID="inner" />
          </OverlayModal>
        </Sheet>
      );
      await fireEvent(screen.getByTestId("sheet"), "show");
      expect(focus).not.toHaveBeenCalled();
      // The event goes up from the field to the nearest Modal, its own.
      await fireEvent(screen.getByTestId("inner"), "show");
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      focus.mockRestore();
    }
  });
});

describe("a dialog's height on a computer (`dialogMaxHeight`)", () => {
  // A computer's window, given back after each test.
  const WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };
  beforeEach(() => {
    Dimensions.set({
      window: { ...WINDOW.window, width: 1440, height: 900 },
      screen: { ...WINDOW.screen, width: 1440, height: 900 }
    });
  });
  afterEach(async () => {
    await act(async () => Dimensions.set(WINDOW));
  });

  function dialog(maxHeight?: number) {
    return (
      <Sheet
        title="Invite an employee"
        closeLabel="Close"
        visible
        onClose={jest.fn()}
        dialogMaxHeight={maxHeight}
        testID="sheet"
      >
        <Text>Content</Text>
      </Sheet>
    );
  }

  const panelStyle = () => StyleSheet.flatten(screen.getByTestId("sheet").props.style);

  it("stays at most 640 high without it, and never shrinks", async () => {
    await render(dialog());
    expect(panelStyle().maxHeight).toBe(640);
    expect(panelStyle().flexShrink).toBeUndefined();
  });

  it("takes the height it asks for, and shrinks to the room the window and the keyboard leave", async () => {
    // Jest has no layout: the shrink itself is Yoga's (and the browser's), from `flexShrink`,
    // inside the layer the keyboard's avoiding view pads, not a height read from the window.
    await render(dialog(880));
    expect(panelStyle().maxHeight).toBe(880);
    expect(panelStyle().flexShrink).toBe(1);
  });
});

describe("a panel's layout change (resizeTransition)", () => {
  /** A bottom sheet's frame before and after the change, on a 390 × 844 window. */
  function change(
    current: { y: number; height: number },
    target: { y: number; height: number }
  ): Parameters<ReturnType<typeof resizeTransition>>[0] {
    return {
      currentOriginX: 0,
      currentOriginY: current.y,
      currentWidth: 390,
      currentHeight: current.height,
      currentBorderRadius: 0,
      currentGlobalOriginX: 0,
      currentGlobalOriginY: current.y,
      targetOriginX: 0,
      targetOriginY: target.y,
      targetWidth: 390,
      targetHeight: target.height,
      targetBorderRadius: 0,
      targetGlobalOriginX: 0,
      targetGlobalOriginY: target.y,
      windowWidth: 390,
      windowHeight: 844
    };
  }

  /**
   * Each of `animations` at its value of `target` from its first frame: at once. Started over one
   * under way to another value (Reanimated merges a panel's animations into those running), it
   * replaces it.
   */
  function expectAtOnce(animations: Record<string, unknown>, target: Record<string, number>) {
    expect(Object.keys(animations).sort()).toEqual(Object.keys(target).sort());
    for (const [key, value] of Object.entries(target)) {
      const animation = animations[key] as {
        toValue: number;
        current: number;
        onStart: (animation: unknown, value: number, now: number, previous: unknown) => void;
        onFrame: (animation: unknown, now: number) => boolean;
      };
      const running = { type: "timing", toValue: value + 200, startTime: 900, startValue: 0 };
      animation.onStart(animation, value + 100, 1000, running);
      expect(animation.onFrame(animation, 1000)).toBe(true);
      expect(animation.current).toBe(value);
    }
  }

  it("eases a change of its height from where it was, its top edge with it", () => {
    const transition = resizeTransition(makeMutable(false));
    const taller = transition(change({ y: 444, height: 400 }, { y: 244, height: 600 }));
    expect(taller.initialValues).toEqual({ originX: 0, originY: 444, width: 390, height: 400 });
    expect(Object.keys(taller.animations).sort()).toEqual([
      "height",
      "originX",
      "originY",
      "width"
    ]);
  });

  it("follows a change of its place alone at once: the keyboard moves it frame by frame", () => {
    const transition = resizeTransition(makeMutable(false));
    const moved = transition(change({ y: 444, height: 400 }, { y: 140, height: 400 }));
    expect(moved.initialValues).toEqual({ originX: 0, originY: 140, width: 390, height: 400 });
    expectAtOnce(moved.animations, { originX: 0, originY: 140, width: 390, height: 400 });
  });

  it("follows any change at once while the keyboard moves", () => {
    const transition = resizeTransition(makeMutable(true));
    const squeezed = transition(change({ y: 120, height: 700 }, { y: 120, height: 420 }));
    expect(squeezed.initialValues).toEqual({ originX: 0, originY: 120, width: 390, height: 420 });
    // An ease under way (the panel grew as the keyboard began to rise) stops where the keyboard
    // leaves room, never at the height it was going to.
    expectAtOnce(squeezed.animations, { originX: 0, originY: 120, width: 390, height: 420 });
  });
});
