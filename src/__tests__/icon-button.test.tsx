import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { IconButton } from "@/components/ui/IconButton";
import { lightColors as colors } from "@/theme";

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe("IconButton", () => {
  it("fills its whole 44 px target with its tone by default", async () => {
    await render(<IconButton icon="minus" tone="filled" label="Less" testID="b" />);
    const style = styleOf("b");
    expect(style.width).toBe(44);
    expect(style.backgroundColor).toBe(colors.background.subtle);
  });

  // A tile's "−" of the point of sale's articles: a 24 px disc in a 44 px target.
  it("draws a smaller disc in the tone, the rest of its 44 px target transparent", async () => {
    const onPress = jest.fn();
    await render(
      <IconButton icon="minus" tone="filled" disc={24} label="Less" onPress={onPress} testID="b" />
    );
    const style = styleOf("b");
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(style.backgroundColor).toBe("transparent");
    // The target's one child: the disc, the glyph in it.
    const [child] = screen.getByTestId("b").children;
    if (typeof child === "string") throw new Error("a disc expected");
    const disc = StyleSheet.flatten(child.props.style);
    expect(disc).toMatchObject({ width: 24, height: 24, borderRadius: 12 });
    expect(disc.backgroundColor).toBe(colors.background.subtle);
    expect(screen.getByLabelText("Less")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("b"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // "Zoom out" and "Zoom in" of "Frame the image" on a desktop.
  it("draws a white disc ringed as a secondary button with the outline tone", async () => {
    await render(<IconButton icon="plus" tone="outline" label="Zoom in" testID="b" />);
    const style = styleOf("b");
    expect(style).toMatchObject({ width: 44, height: 44, borderRadius: 22 });
    expect(style.backgroundColor).toBe(colors.background.surface);
    expect(style.boxShadow).toBe(`inset 0 0 0 1.5px ${colors.border.subtle}`);
  });

  it("keeps a ring of 1 px for the tone over a screen of ink", async () => {
    await render(<IconButton icon="plus" tone="onDark" label="Zoom in" testID="b" />);
    expect(styleOf("b").boxShadow).toBe(`inset 0 0 0 1px ${colors.onDark.ring}`);
  });
});
