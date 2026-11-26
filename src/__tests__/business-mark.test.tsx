import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { BusinessMark } from "@/components/ui/BusinessMark";
import { lightColors as colors, palette } from "@/theme";

const LOGO = "data:image/jpeg;base64,/9j/";

/** Beside the business's name: found with the hidden elements only. */
const hidden = { includeHiddenElements: true };

describe("BusinessMark", () => {
  it("shows the logo, round, at its size", async () => {
    await render(<BusinessMark name="Lakeside Bakery" image={LOGO} size={88} testID="mark" />);
    const image = screen.getByTestId("mark-logo-image", hidden);
    expect(image.props.source).toEqual({ uri: LOGO });
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({
      width: 88,
      height: 88,
      borderRadius: 44
    });
    expect(screen.queryByTestId("mark-store", hidden)).toBeNull();
  });

  it("shows the shop's icon on a sand disc without a logo, scaled with the disc", async () => {
    await render(<BusinessMark name="Lakeside Bakery" image={null} size={72} testID="mark" />);
    const disc = screen.getByTestId("mark-store", hidden);
    expect(StyleSheet.flatten(disc.props.style)).toMatchObject({
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.background.subtle
    });
    // 34 pt in 88 pt ("Join a team"): 28 pt in 72 pt.
    expect(StyleSheet.flatten(screen.getByText("", hidden).props.style)).toMatchObject({
      fontSize: 28,
      color: palette.orange
    });
    expect(screen.queryByTestId("mark-logo", hidden)).toBeNull();
  });

  it("is hidden from screen readers: the name beside it says the same", async () => {
    await render(<BusinessMark name="Lakeside Bakery" image={LOGO} size={72} testID="mark" />);
    expect(screen.queryByTestId("mark-logo")).toBeNull();
    expect(screen.getByTestId("mark-logo", hidden)).toBeTruthy();
  });
});
