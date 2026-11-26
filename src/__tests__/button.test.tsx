import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { Button } from "@/components/ui/Button";
import { lightColors as colors, motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

const LONG = "Creating the integration…";
const CREATE = "Create the integration";

function labelStyle(text: string) {
  return StyleSheet.flatten(screen.getByText(text).props.style);
}

describe("Button", () => {
  // "Creating the integration…" ran out of its 180 px button.
  it('keeps its label within itself: one line, ending in "…" when too long', async () => {
    await render(
      <Button size="sm" fullWidth={false} style={{ width: 180 }} testID="b">
        {LONG}
      </Button>
    );
    const label = screen.getByText(LONG);
    expect(label.props.numberOfLines).toBe(1);
    expect(labelStyle(LONG).flexShrink).toBe(1);
    // The row around the label: never wider than the button.
    expect(StyleSheet.flatten(label.parent!.props.style).maxWidth).toBe("100%");
  });

  // "Move your online shop's integration" on a phone.
  it("takes as many lines as its label needs when asked, its height the least", async () => {
    await render(
      <Button variant="secondary" size="sm" wrap testID="w">
        Move your online shop&apos;s integration
      </Button>
    );
    const label = screen.getByText("Move your online shop's integration");
    expect(label.props.numberOfLines).toBeUndefined();
    expect(labelStyle("Move your online shop's integration").textAlign).toBe("center");
    const frame = StyleSheet.flatten(screen.getByTestId("w").props.style);
    expect(frame.height).toBeUndefined();
    expect(frame.minHeight).toBe(44);
  });

  // "Change", of a card's mode: its name says which card's.
  it("is named as asked when its label alone does not say what it does", async () => {
    await render(
      <>
        <Button accessibilityLabel="Change the confirmation mode of Everyday" testID="named">
          Change
        </Button>
        <Button caption="2'000 sats" testID="captioned">
          Top up
        </Button>
      </>
    );
    expect(screen.getByTestId("named").props.accessibilityLabel).toBe(
      "Change the confirmation mode of Everyday"
    );
    expect(screen.getByTestId("captioned").props.accessibilityLabel).toBe("Top up, 2'000 sats");
  });

  // Alone on a wrapped line (ConfirmDialog), a label wider than the line ran out of its card.
  it("as wide as its label, never wider than its parent", async () => {
    await render(
      <>
        <Button size="sm" fullWidth={false} testID="fit">
          {LONG}
        </Button>
        <Button testID="full">{CREATE}</Button>
      </>
    );
    expect(StyleSheet.flatten(screen.getByTestId("fit").props.style)).toMatchObject({
      maxWidth: "100%",
      alignSelf: "flex-start"
    });
    expect(StyleSheet.flatten(screen.getByTestId("full").props.style).width).toBe("100%");
  });

  // "Migrate from Swiss Bitcoin Pay": white on ink, lighter when hovered
  // or pressed; disabled, the sand of every button.
  it("draws the ink variant white on ink", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const ink = colors.button.ink;
    const { rerender } = await render(
      <Button variant="ink" testID="b">
        {CREATE}
      </Button>
    );
    const background = () =>
      StyleSheet.flatten(screen.getByTestId("b").props.style).backgroundColor;
    expect(background()).toBe(ink.bg);
    expect(labelStyle(CREATE).color).toBe(ink.label);
    await fireEvent(screen.getByTestId("b"), "hoverIn");
    expect(background()).toBe(ink.bgHover);
    await rerender(
      <Button variant="ink" disabled testID="b">
        {CREATE}
      </Button>
    );
    expect(background()).toBe(colors.background.subtle);
    expect(labelStyle(CREATE).color).toBe(colors.text.disabled);
  });

  describe("waiting (loading)", () => {
    const hidden = { includeHiddenElements: true };
    const spinner = () => screen.queryByTestId("b-spinner", hidden);
    /** How much of a label shows: the opacity of the view it fades with, around it. */
    const shown = (text: string) =>
      Number(getAnimatedStyle(screen.getByText(text, hidden).parent!).opacity);
    /** How much of the spinner shows: the opacity of its layer. */
    const spinnerShown = () => Number(getAnimatedStyle(spinner()!.parent!).opacity);
    const button = (loading: boolean, onPress?: () => void) => (
      <Button onPress={onPress} loading={loading} testID="b">
        {CREATE}
      </Button>
    );

    async function advance(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("waits with a spinner in place of its label, which keeps its room: the same width", async () => {
      const onPress = jest.fn();
      const { rerender } = await render(button(false, onPress));
      expect(spinner()).toBeNull();
      expect(labelStyle(CREATE).color).toBe(colors.button.primary.label);
      expect(shown(CREATE)).toBe(1);

      await rerender(button(true, onPress));
      await advance(motion.fast);
      const pressable = screen.getByTestId("b");
      expect(within(pressable).getByTestId("b-spinner", hidden)).toBeTruthy();
      expect(spinnerShown()).toBe(1);
      // The same label, laid out as before, unseen; still its name.
      expect(within(pressable).getByText(CREATE)).toBeTruthy();
      expect(shown(CREATE)).toBe(0);
      // Faded out, never in a "transparent" colour: Android draws it black.
      expect(labelStyle(CREATE).color).toBe(colors.text.disabled);
      expect(labelStyle(CREATE).textShadowColor).toBeUndefined();
      expect(screen.getByRole("button", { name: CREATE })).toBeTruthy();
      expect(pressable.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
      // The sand of a disabled button.
      expect(StyleSheet.flatten(pressable.props.style).backgroundColor).toBe(
        colors.background.subtle
      );
      await fireEvent.press(pressable);
      expect(onPress).not.toHaveBeenCalled();
    });

    // The label goes away, animated.
    it("fades its label out as the spinner fades in, and back once done", async () => {
      const { rerender } = await render(button(false));
      await rerender(button(true));
      await advance(motion.fast / 2);
      expect(shown(CREATE)).toBeGreaterThan(0);
      expect(shown(CREATE)).toBeLessThan(1);
      expect(spinnerShown()).toBeGreaterThan(0);
      expect(spinnerShown()).toBeLessThan(1);
      await advance(motion.fast);
      expect(shown(CREATE)).toBe(0);
      expect(spinnerShown()).toBe(1);

      // Done: pressable at once, the spinner there until it has faded out.
      await rerender(button(false));
      expect(screen.getByTestId("b").props.accessibilityState).toMatchObject({
        disabled: false,
        busy: false
      });
      await advance(motion.fast / 2);
      expect(spinner()).toBeTruthy();
      expect(spinnerShown()).toBeGreaterThan(0);
      expect(spinnerShown()).toBeLessThan(1);
      expect(shown(CREATE)).toBeGreaterThan(0);
      expect(shown(CREATE)).toBeLessThan(1);
      await advance(motion.fast);
      expect(spinner()).toBeNull();
      expect(shown(CREATE)).toBe(1);
      expect(labelStyle(CREATE).color).toBe(colors.button.primary.label);
    });

    it("waits again from where its fade is, when it starts waiting again meanwhile", async () => {
      const { rerender } = await render(button(true));
      await rerender(button(false));
      await advance(motion.fast / 2);
      await rerender(button(true));
      await advance(motion.fast * 2);
      expect(spinner()).toBeTruthy();
      expect(spinnerShown()).toBe(1);
      expect(shown(CREATE)).toBe(0);
    });

    it("shown waiting, shows its spinner at once, without a fade", async () => {
      await render(button(true));
      expect(spinnerShown()).toBe(1);
      expect(shown(CREATE)).toBe(0);
    });

    // TalkBack skips a text in a view of opacity 0 (View.isVisibleToUser): the button would have
    // no name left on Android.
    it("is named by its label as long as the label is not all back", async () => {
      const { rerender } = await render(button(false));
      // Named by its text, as any button.
      expect(screen.getByTestId("b").props.accessibilityLabel).toBeUndefined();
      await rerender(button(true));
      expect(screen.getByTestId("b").props.accessibilityLabel).toBe(CREATE);
      await advance(motion.fast);
      await rerender(button(false));
      await advance(motion.fast / 2);
      expect(screen.getByTestId("b").props.accessibilityLabel).toBe(CREATE);
      await advance(motion.fast);
      expect(screen.getByTestId("b").props.accessibilityLabel).toBeUndefined();
      expect(screen.getByRole("button", { name: CREATE })).toBeTruthy();
    });

    it("keeps its icon's room too, faded with its label", async () => {
      await render(
        <Button icon="copy" loading testID="b">
          Copy the key
        </Button>
      );
      expect(spinner()).toBeTruthy();
      const [icon, label] = screen.getByText("Copy the key").parent!.children;
      if (typeof icon === "string" || typeof label === "string") throw new Error("views expected");
      expect(StyleSheet.flatten(icon.props.style).color).toBe(colors.text.disabled);
      expect(StyleSheet.flatten(label.props.style).color).toBe(colors.text.disabled);
      expect(shown("Copy the key")).toBe(0);
    });

    it("fades a caption, and an amount, with their label", async () => {
      await render(
        <>
          <Button caption="Redirecting to shop.example" loading testID="b">
            Continue
          </Button>
          <Button amount="12.50 CHF" loading testID="charge">
            Charge
          </Button>
        </>
      );
      // The caption's view holds the label's row: both fade.
      const captioned = screen.getByText("Redirecting to shop.example").parent!;
      expect(within(captioned).getByText("Continue")).toBeTruthy();
      expect(shown("Redirecting to shop.example")).toBe(0);
      const amount = screen.getByText("12.50 CHF").parent!;
      expect(within(amount).getByText("Charge")).toBeTruthy();
      expect(shown("12.50 CHF")).toBe(0);
      // Their names as before.
      expect(
        screen.getByRole("button", { name: "Continue, Redirecting to shop.example" })
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Charge 12.50 CHF" })).toBeTruthy();
    });
  });

  describe("leading somewhere (href)", () => {
    const URI = "bitcoin:bc1qexample?amount=0.00049&lightning=lnbc490n1example";

    // Platform.OS back to the apps' for the next test.
    afterEach(() => jest.restoreAllMocks());

    // Browser wallets (Alby) open a payment link from its click on the window: a Pressable's click
    // handler stops it (react-native-web), the browser follows the link itself.
    it("is a link on the web, which the browser follows: never onPress", async () => {
      jest.replaceProperty(Platform, "OS", "web");
      const onPress = jest.fn();
      await render(
        <Button href={URI} onPress={onPress} icon="wallet" testID="b">
          Open my wallet
        </Button>
      );
      const link = screen.getByTestId("b");
      expect(link.props.href).toBe(URI);
      expect(link.props.accessibilityRole).toBeUndefined();
      // No press handler of its own (fireEvent.press would reach Button's own onPress prop); its
      // onClick only lets go of the focus (below).
      for (const handler of ["onPress", "onResponderRelease", "onStartShouldSetResponder"]) {
        expect(link.props[handler]).toBeUndefined();
      }

      // Hovered by a mouse, pressed by the pointer, as a Pressable button.
      const primary = colors.button.primary;
      const background = () =>
        StyleSheet.flatten(screen.getByTestId("b").props.style).backgroundColor;
      expect(background()).toBe(primary.bg);
      await fireEvent(link, "pointerEnter", { nativeEvent: { pointerType: "touch" } });
      expect(background()).toBe(primary.bg);
      await fireEvent(link, "pointerEnter", { nativeEvent: { pointerType: "mouse" } });
      expect(background()).toBe(primary.bgHover);
      await fireEvent(link, "pointerDown", { nativeEvent: { button: 2 } });
      expect(background()).toBe(primary.bgHover);
      await fireEvent(link, "pointerDown", { nativeEvent: { button: 0 } });
      expect(background()).toBe(primary.bgActive);
      await fireEvent(link, "pointerUp");
      expect(background()).toBe(primary.bgHover);
      await fireEvent(link, "pointerLeave");
      expect(background()).toBe(primary.bg);
    });

    // The wallet opens in another app: back from it, a browser may draw the focus ring around the
    // link, as if focused from the keyboard.
    it("lets go of the focus once clicked or tapped, not from the keyboard; the click goes on", async () => {
      jest.replaceProperty(Platform, "OS", "web");
      await render(
        <Button href={URI} testID="b">
          Open my wallet
        </Button>
      );
      const click = (detail: number) => {
        const event = {
          detail,
          currentTarget: { blur: jest.fn() },
          preventDefault: jest.fn(),
          stopPropagation: jest.fn()
        };
        screen.getByTestId("b").props.onClick(event);
        return event;
      };
      // A mouse click or a tap: `detail` counts the clicks.
      const pointer = click(1);
      expect(pointer.currentTarget.blur).toHaveBeenCalledTimes(1);
      // Enter on the focused link: a click whose `detail` is 0.
      const keyboard = click(0);
      expect(keyboard.currentTarget.blur).not.toHaveBeenCalled();
      // The click goes on, to the window and to the link's address.
      for (const event of [pointer, keyboard]) {
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
      }
    });

    // Disabled meanwhile (a payment seen is checked), its link goes without a pointerleave.
    it("comes back unhovered after being disabled", async () => {
      jest.replaceProperty(Platform, "OS", "web");
      const button = (disabled: boolean) => (
        <Button href={URI} disabled={disabled} testID="b">
          Open my wallet
        </Button>
      );
      const { rerender } = await render(button(false));
      const background = () =>
        StyleSheet.flatten(screen.getByTestId("b").props.style).backgroundColor;
      await fireEvent(screen.getByTestId("b"), "pointerEnter", {
        nativeEvent: { pointerType: "mouse" }
      });
      expect(background()).toBe(colors.button.primary.bgHover);
      await rerender(button(true));
      await rerender(button(false));
      expect(background()).toBe(colors.button.primary.bg);
    });

    it("leads nowhere while disabled", async () => {
      jest.replaceProperty(Platform, "OS", "web");
      const onPress = jest.fn();
      await render(
        <Button href={URI} onPress={onPress} disabled testID="b">
          Open my wallet
        </Button>
      );
      const button = screen.getByRole("button", { name: "Open my wallet" });
      expect(button.props.href).toBeUndefined();
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("calls onPress in the apps", async () => {
      const onPress = jest.fn();
      await render(
        <Button href={URI} onPress={onPress} testID="b">
          Open my wallet
        </Button>
      );
      const button = screen.getByRole("button", { name: "Open my wallet" });
      expect(button.props.href).toBeUndefined();
      await fireEvent.press(button);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
