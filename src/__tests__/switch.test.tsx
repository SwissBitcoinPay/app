import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Switch } from "@/components/ui/Switch";
import { lightColors as colors, motion, lightShadow as shadow, palette } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

/*
 * The on/off switch waiting for its value to be read or saved (`loading`): the app's Spinner in
 * its knob.
 */

const hidden = { includeHiddenElements: true };
const spinner = () => screen.queryByTestId("s-spinner", hidden);
/** How much of the spinner shows: the opacity of its layer. */
const spinnerShown = () => Number(getAnimatedStyle(spinner()!.parent!).opacity);
const trackColour = () => getAnimatedStyle(screen.getByTestId("s-track")).backgroundColor;
const knob = () => StyleSheet.flatten(screen.getByTestId("s-knob").props.style);

function toggle(
  props: { value?: boolean; loading?: boolean; disabled?: boolean },
  onValueChange: (value: boolean) => void = () => undefined
) {
  return (
    <Switch
      value={props.value ?? true}
      onValueChange={onValueChange}
      label="Pause"
      loading={props.loading}
      disabled={props.disabled}
      testID="s"
    />
  );
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("Switch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits with the spinner centred in its knob, its track in its colour, pressing nothing", async () => {
    const onValueChange = jest.fn();
    const { rerender } = await render(toggle({ value: true }, onValueChange));
    await advance(motion.fast);
    const on = trackColour();
    expect(on).toBe("rgba(247, 147, 26, 1)");
    expect(spinner()).toBeNull();

    await rerender(toggle({ value: true, loading: true }, onValueChange));
    await advance(motion.fast);
    expect(spinnerShown()).toBe(1);
    // In the knob, over all of it, centred: 14 in 26, 6 on each side. Jest has no layout: what
    // centres it is said here, and seen on the web build.
    const layer = spinner()!.parent!;
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center"
    });
    expect(StyleSheet.flatten(spinner()!.props.style)).toMatchObject({ width: 14, height: 14 });
    expect(StyleSheet.flatten(layer.parent!.props.style)).toMatchObject({
      width: 26,
      height: 26,
      backgroundColor: palette.white
    });
    // Its colour kept: the sand says it cannot be used, not that it waits.
    expect(trackColour()).toBe(on);
    expect(trackColour()).not.toBe(colors.background.subtle);
    const pressable = screen.getByTestId("s");
    expect(pressable.props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
      busy: true
    });
    await fireEvent.press(pressable);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("waits off in the colour of off", async () => {
    const { rerender } = await render(toggle({ value: false }));
    await advance(motion.fast);
    const off = trackColour();
    expect(off).toMatch(/^rgba\(11, 26, 51, 0\.14/);
    await rerender(toggle({ value: false, loading: true }));
    await advance(motion.fast);
    expect(spinner()).toBeTruthy();
    expect(trackColour()).toBe(off);
    expect(screen.getByTestId("s").props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
      busy: true
    });
  });

  it("fades its spinner in, and out once done, pressable at once", async () => {
    const onValueChange = jest.fn();
    const { rerender } = await render(toggle({}, onValueChange));
    await rerender(toggle({ loading: true }, onValueChange));
    await advance(motion.fast / 2);
    expect(spinnerShown()).toBeGreaterThan(0);
    expect(spinnerShown()).toBeLessThan(1);
    await advance(motion.fast);
    expect(spinnerShown()).toBe(1);

    await rerender(toggle({}, onValueChange));
    expect(screen.getByTestId("s").props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
      busy: false
    });
    await advance(motion.fast / 2);
    expect(spinner()).toBeTruthy();
    expect(spinnerShown()).toBeGreaterThan(0);
    expect(spinnerShown()).toBeLessThan(1);
    await advance(motion.fast);
    expect(spinner()).toBeNull();
    await fireEvent.press(screen.getByTestId("s"));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("shown waiting, shows its spinner at once, without a fade", async () => {
    await render(toggle({ loading: true }));
    expect(spinnerShown()).toBe(1);
  });

  it("waits again from where its fade is, when it starts waiting again meanwhile", async () => {
    const { rerender } = await render(toggle({ loading: true }));
    await rerender(toggle({}));
    await advance(motion.fast / 2);
    await rerender(toggle({ loading: true }));
    await advance(motion.fast * 2);
    expect(spinner()).toBeTruthy();
    expect(spinnerShown()).toBe(1);
  });

  it("can be used: its knob white, raised", async () => {
    await render(toggle({ value: false }));
    expect(knob()).toMatchObject({ backgroundColor: palette.white, boxShadow: shadow.raised });
  });

  it("cannot be used: the sand track, its knob flat in grey, without a spinner", async () => {
    const onValueChange = jest.fn();
    await render(toggle({ disabled: true }, onValueChange));
    await advance(motion.fast);
    expect(trackColour()).toBe(colors.background.subtle);
    // Greyed, not faded: no white, no relief (disabled = sand and no relief, never opacity).
    expect(knob().backgroundColor).toBe(palette.ink35);
    expect(knob().boxShadow).toBeUndefined();
    expect(knob().opacity).toBeUndefined();
    expect(spinner()).toBeNull();
    expect(screen.getByTestId("s").props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
      busy: false
    });
    await fireEvent.press(screen.getByTestId("s"));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("cannot be used off: its grey knob on the left", async () => {
    await render(toggle({ value: false, disabled: true }));
    expect(knob().backgroundColor).toBe(palette.ink35);
    expect(getAnimatedStyle(screen.getByTestId("s-knob")).transform).toEqual([{ translateX: 0 }]);
  });

  it("becomes usable again: its knob white and raised again", async () => {
    const { rerender } = await render(toggle({ disabled: true }));
    expect(knob().backgroundColor).toBe(palette.ink35);
    await rerender(toggle({}));
    await advance(motion.fast);
    expect(knob()).toMatchObject({ backgroundColor: palette.white, boxShadow: shadow.raised });
    expect(trackColour()).toBe("rgba(247, 147, 26, 1)");
  });

  it("cannot be used while its value is read: the sand track, the spinner in its grey knob", async () => {
    await render(toggle({ disabled: true, loading: true }));
    expect(trackColour()).toBe(colors.background.subtle);
    expect(knob().backgroundColor).toBe(palette.ink35);
    expect(spinnerShown()).toBe(1);
  });
});
