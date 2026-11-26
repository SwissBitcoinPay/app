import { render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { TextField } from "@/components/ui/TextField";
import { sans } from "@/theme";

async function inputOutlineStyle() {
  await render(<TextField label="IBAN" value="" testID="field" />);
  return StyleSheet.flatten(screen.getByTestId("field").props.style).outlineStyle as unknown;
}

describe("TextField", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // `outline-width: 0` does not hide an `outline-style: auto` focus ring in every browser.
  it("removes the browser's focus ring on the web: the frame shows the focus", async () => {
    jest.replaceProperty(Platform, "OS", "web");

    expect(await inputOutlineStyle()).toBe("none");
  });

  it("sets no outline style on native, whose types do not take none", async () => {
    expect(await inputOutlineStyle()).toBeUndefined();
  });

  // "Items": the description, 3 lines; its value in 600 once filled.
  it("draws several lines, the text from the top", async () => {
    await render(<TextField label="Description" value="All butter" multiline={3} testID="field" />);
    const input = screen.getByTestId("field");
    expect(input.props.multiline).toBe(true);
    expect(input.props.numberOfLines).toBe(3);
    const style = StyleSheet.flatten(input.props.style);
    expect(style.textAlignVertical).toBe("top");
    expect(style.fontFamily).toBe(sans(600).fontFamily);
    // 3 lines of 21 pt, 14 pt above and below inside a border of 1.5 pt.
    const frame = StyleSheet.flatten(input.parent?.props.style);
    expect(frame.height).toBe(3 * 21 + 2 * (14 + 1.5));
  });

  it("stays on one line by default", async () => {
    await render(<TextField label="Name" value="" testID="field" />);
    expect(screen.getByTestId("field").props.multiline).toBe(false);
  });
});
