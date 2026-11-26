import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { QuietAction } from "@/components/ui/QuietAction";
import { lightColors as colors, control, type } from "@/theme";

const LABEL = "Show expired (2)";

function labelStyle() {
  return StyleSheet.flatten(screen.getByText(LABEL).props.style);
}

describe("QuietAction", () => {
  it("is a button, the caption's grey text on a 44 px target", async () => {
    const onPress = jest.fn();
    await render(<QuietAction label={LABEL} onPress={onPress} testID="q" />);
    const action = screen.getByRole("button", { name: LABEL });
    expect(action).toBe(screen.getByTestId("q"));
    expect(StyleSheet.flatten(action.props.style)).toMatchObject({
      minHeight: control.min,
      maxWidth: "100%"
    });
    expect(labelStyle()).toMatchObject({
      fontSize: type.caption,
      color: colors.text.secondary
    });
    expect(screen.getByText(LABEL).props.numberOfLines).toBe(1);

    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("darkens while hovered, never underlined", async () => {
    await render(<QuietAction label={LABEL} onPress={() => {}} testID="q" />);
    await fireEvent(screen.getByTestId("q"), "hoverIn");
    expect(labelStyle().color).toBe(colors.text.primary);
    expect(labelStyle().textDecorationLine).toBeUndefined();
    await fireEvent(screen.getByTestId("q"), "hoverOut");
    expect(labelStyle().color).toBe(colors.text.secondary);
  });

  it("takes its place from `style`, keeping its target", async () => {
    await render(
      <QuietAction label={LABEL} onPress={() => {}} style={{ alignSelf: "center" }} testID="q" />
    );
    expect(StyleSheet.flatten(screen.getByTestId("q").props.style)).toMatchObject({
      alignSelf: "center",
      minHeight: control.min
    });
  });
});
