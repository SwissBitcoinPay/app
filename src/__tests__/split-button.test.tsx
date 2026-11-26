import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { SplitButton, type SplitButtonSide } from "@/components/ui/SplitButton";
import { lightColors as colors, control, lightShadow as shadow, motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

/*
 * The screen's primary action and, at its end, a choice that goes with it, in one filled button.
 */

const REMIND = "Send a reminder by email";
const hidden = { includeHiddenElements: true };
const primary = colors.button.primary;

function side(overrides: Partial<SplitButtonSide> = {}): SplitButtonSide {
  return {
    label: "FR",
    accessibilityLabel: "Email language: French. Change",
    onPress: jest.fn(),
    testID: "language",
    ...overrides
  };
}

const style = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style);
/** The button itself: around its two parts. */
const frame = () => StyleSheet.flatten(screen.getByTestId("action", hidden).parent!.props.style);
/** The line between the parts: the frame's second child. */
function divider() {
  const line = screen.getByTestId("action", hidden).parent!.children[1];
  if (typeof line === "string") throw new Error("a view expected");
  return StyleSheet.flatten(line.props.style);
}
const textColor = (text: string) =>
  StyleSheet.flatten(screen.getByText(text, hidden).props.style).color;

describe("SplitButton", () => {
  it("is two buttons in one: its action and its choice, each pressed on its own", async () => {
    const onPress = jest.fn();
    const choose = jest.fn();
    await render(
      <SplitButton onPress={onPress} side={side({ onPress: choose })} testID="action">
        {REMIND}
      </SplitButton>
    );
    // Each named for screen readers: the action by its label, the choice by what it holds.
    expect(screen.getByRole("button", { name: REMIND })).toBeTruthy();
    const language = screen.getByRole("button", { name: "Email language: French. Change" });
    expect(within(language).getByText("FR")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("action"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    await fireEvent.press(language);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("looks as the primary Button: its fill, its ring, a thin line of its ring between its parts", async () => {
    await render(
      <SplitButton side={side()} testID="action">
        {REMIND}
      </SplitButton>
    );
    expect(frame()).toMatchObject({
      height: control.lg,
      width: "100%",
      backgroundColor: primary.bg,
      borderColor: primary.ring,
      boxShadow: shadow.buttonInnerHighlight
    });
    expect(divider()).toMatchObject({ width: 1, height: 28, backgroundColor: primary.divider });
    // The choice in the label's own type, not the code's mono.
    const label = StyleSheet.flatten(screen.getByText(REMIND).props.style);
    const code = StyleSheet.flatten(screen.getByText("FR").props.style);
    expect(code).toMatchObject({
      fontFamily: label.fontFamily,
      fontSize: label.fontSize,
      letterSpacing: label.letterSpacing,
      color: primary.label,
      textShadowColor: primary.labelShadow
    });
    // Neither part drawn pressed or hovered at rest: the button's fill shows.
    expect(style("action").backgroundColor).toBeUndefined();
    expect(style("language").backgroundColor).toBeUndefined();
    // Each part at least the touch floor wide; a language's code never cut.
    expect(style("action").minWidth).toBe(control.min);
    expect(style("language").minWidth).toBe(control.min);
    expect(code.flexShrink).toBe(0);
    expect(screen.getByText(REMIND).props.numberOfLines).toBe(1);
  });

  it("is as tall as Button at its size, as wide as its content when not full width", async () => {
    await render(
      <SplitButton size="md" fullWidth={false} side={side()} testID="action">
        {REMIND}
      </SplitButton>
    );
    expect(frame()).toMatchObject({
      height: control.md,
      alignSelf: "flex-start",
      maxWidth: "100%"
    });
    expect(frame().width).toBeUndefined();
    expect(divider().height).toBe(24);
  });

  it("draws the hover of the part under the pointer only (web)", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    await render(
      <SplitButton side={side()} testID="action">
        {REMIND}
      </SplitButton>
    );
    await fireEvent(screen.getByTestId("language"), "hoverIn");
    expect(style("language").backgroundColor).toBe(primary.bgHover);
    expect(style("action").backgroundColor).toBeUndefined();
    await fireEvent(screen.getByTestId("language"), "hoverOut");
    await fireEvent(screen.getByTestId("action"), "hoverIn");
    expect(style("action").backgroundColor).toBe(primary.bgHover);
    expect(style("language").backgroundColor).toBeUndefined();
  });

  it("draws its choice pressed, and says it expanded, while its menu shows", async () => {
    const { rerender } = await render(
      <SplitButton side={side()} testID="action">
        {REMIND}
      </SplitButton>
    );
    expect(screen.getByTestId("language").props.accessibilityState).toMatchObject({
      expanded: false
    });
    await rerender(
      <SplitButton side={side({ expanded: true })} testID="action">
        {REMIND}
      </SplitButton>
    );
    expect(screen.getByTestId("language").props.accessibilityState).toMatchObject({
      expanded: true
    });
    expect(style("language")).toMatchObject({
      backgroundColor: primary.bgActive,
      boxShadow: shadow.buttonPressInset
    });
    expect(style("action").backgroundColor).toBeUndefined();
  });

  it("disabled, is sand, neither its action nor its choice pressed", async () => {
    const onPress = jest.fn();
    const choose = jest.fn();
    await render(
      <SplitButton disabled onPress={onPress} side={side({ onPress: choose })} testID="action">
        {REMIND}
      </SplitButton>
    );
    expect(frame()).toMatchObject({
      backgroundColor: colors.background.subtle,
      borderColor: "transparent"
    });
    expect(frame().boxShadow).toBeUndefined();
    expect(divider().backgroundColor).toBe(colors.border.subtle);
    expect(textColor(REMIND)).toBe(colors.text.disabled);
    expect(textColor("FR")).toBe(colors.text.disabled);
    expect(StyleSheet.flatten(screen.getByText("FR").props.style).textShadowColor).toBeUndefined();
    for (const testID of ["action", "language"]) {
      expect(screen.getByTestId(testID).props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(screen.getByTestId(testID));
    }
    expect(onPress).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
  });

  describe("waiting (loading)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const button = (loading: boolean, onPress?: () => void, choose?: () => void) => (
      <SplitButton
        icon="file-pdf"
        loading={loading}
        onPress={onPress}
        side={side({ onPress: choose ?? jest.fn() })}
        testID="action"
      >
        Download the PDF
      </SplitButton>
    );
    const spinner = () => screen.queryByTestId("action-spinner", hidden);
    const shown = () =>
      Number(getAnimatedStyle(screen.getByText("Download the PDF", hidden).parent!).opacity);

    it("waits as Button does: a spinner in place of its label, both parts disabled", async () => {
      const onPress = jest.fn();
      const choose = jest.fn();
      const { rerender } = await render(button(false, onPress, choose));
      expect(spinner()).toBeNull();
      expect(shown()).toBe(1);

      await rerender(button(true, onPress, choose));
      await act(async () => {
        jest.advanceTimersByTime(motion.fast);
      });
      // In the action's part, the label keeping its room, unseen, and its name.
      expect(
        within(screen.getByTestId("action")).getByTestId("action-spinner", hidden)
      ).toBeTruthy();
      expect(shown()).toBe(0);
      expect(screen.getByTestId("action").props.accessibilityLabel).toBe("Download the PDF");
      expect(screen.getByTestId("action").props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true
      });
      expect(screen.getByTestId("language").props.accessibilityState).toMatchObject({
        disabled: true
      });
      expect(frame().backgroundColor).toBe(colors.background.subtle);
      // The choice stays in sight: what the file is being made in.
      expect(screen.getByText("FR")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("action"));
      await fireEvent.press(screen.getByTestId("language"));
      expect(onPress).not.toHaveBeenCalled();
      expect(choose).not.toHaveBeenCalled();

      // Done: pressable again, its label back once the spinner has faded out.
      await rerender(button(false, onPress, choose));
      await act(async () => {
        jest.advanceTimersByTime(motion.fast * 2);
      });
      expect(spinner()).toBeNull();
      expect(shown()).toBe(1);
      expect(screen.getByTestId("action").props.accessibilityLabel).toBeUndefined();
      await fireEvent.press(screen.getByTestId("action"));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
