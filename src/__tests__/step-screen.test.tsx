import { act, render, screen } from "@testing-library/react-native";
import { Dimensions, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { STEP_CONTENT_WIDTH, StepScreen } from "@/components/layout/StepScreen";

// The tests' window (a phone's), given back after each test.
const PHONE_WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };

/** A computer's window, as the designs draw it. */
function computerWindow() {
  Dimensions.set({
    window: { ...PHONE_WINDOW.window, width: 1440, height: 900 },
    screen: { ...PHONE_WINDOW.screen, width: 1440, height: 900 }
  });
}

afterEach(async () => {
  await act(async () => Dimensions.set(PHONE_WINDOW));
});

describe("StepScreen on a computer", () => {
  beforeEach(() => computerWindow());

  it("starts its content at the top, as every step: its title never moves from one to the next", async () => {
    await render(
      <StepScreen>
        <Text>Title</Text>
      </StepScreen>
    );
    const column = screen.getByText("Title").parent!;
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({ width: STEP_CONTENT_WIDTH });
    expect(StyleSheet.flatten(column.props.style).flexGrow).toBeUndefined();
    // 24 px under the header, whatever the content's height: never centred in the screen.
    let scroll = column.parent;
    while (scroll && scroll.props.contentContainerStyle === undefined) scroll = scroll.parent;
    const body = StyleSheet.flatten(scroll!.props.contentContainerStyle as StyleProp<ViewStyle>);
    expect(body).toMatchObject({ paddingTop: 24, alignItems: "center" });
    expect(body?.justifyContent).toBeUndefined();
  });

  it("gives its content the screen's whole height with `fill`", async () => {
    await render(
      <StepScreen fill>
        <Text>Title</Text>
      </StepScreen>
    );
    const column = screen.getByText("Title").parent!;
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({
      width: STEP_CONTENT_WIDTH,
      flexGrow: 1
    });
  });
});
