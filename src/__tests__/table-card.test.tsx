import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { TableCard, TableRow } from "@/components/ui/TableCard";
import { lightColors as colors } from "@/theme";

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe("TableCard", () => {
  it("gives its head and its rows the same insets, a line above each row", async () => {
    await render(
      <TableCard endInset={16} testID="card" headTestID="head" head={<Text>Name</Text>}>
        <TableRow height={64} testID="first">
          <Text>Ada</Text>
        </TableRow>
        <TableRow height={64} testID="second">
          <Text>Linus</Text>
        </TableRow>
      </TableCard>
    );
    expect(styleOf("card")).toMatchObject({
      backgroundColor: colors.background.surface,
      overflow: "hidden",
      paddingTop: 6
    });
    // Nothing under the last row: its hover tint reaches the card's edge.
    expect(styleOf("card").paddingBottom).toBeUndefined();
    expect(styleOf("card").paddingVertical).toBeUndefined();
    // The head's height is its ColumnHeaders' (44 px), never a fixed one.
    expect(styleOf("head")).toMatchObject({
      paddingLeft: 22,
      paddingRight: 16,
      gap: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle
    });
    expect(styleOf("head").height).toBeUndefined();
    for (const row of ["first", "second"]) {
      expect(styleOf(row)).toMatchObject({
        height: 64,
        paddingLeft: 22,
        paddingRight: 16,
        gap: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border.subtle
      });
      // Nothing under a row: whichever row shows last (others folding away below it, "To follow up"),
      // the card has no line under it.
      expect(styleOf(row).borderBottomWidth).toBeUndefined();
    }
    // The first row's line, under the head's, is hidden: its body clips 1 px above its rows.
    const body = screen.getByTestId("first").parent;
    expect(StyleSheet.flatten(body?.props.style)).toEqual({ marginTop: -1 });
    expect(StyleSheet.flatten(body?.parent?.props.style)).toEqual({ overflow: "hidden" });
  });

  it("keeps 22 px after the cells by default", async () => {
    await render(
      <TableCard headTestID="head" head={<Text>Date</Text>}>
        <TableRow height={52} testID="row">
          <Text>Today</Text>
        </TableRow>
      </TableCard>
    );
    expect(styleOf("head").paddingRight).toBe(22);
    expect(styleOf("row").paddingRight).toBe(22);
  });

  it("is a button with onPress, else not one, and tints under a pointer", async () => {
    const onPress = jest.fn();
    await render(
      <TableCard head={<Text>Label</Text>}>
        <TableRow height={52} onPress={onPress} testID="pressed">
          <Text>Payment</Text>
        </TableRow>
        <TableRow height={64} testID="plain">
          <Text>Ada</Text>
        </TableRow>
      </TableCard>
    );
    expect(screen.getByTestId("pressed").props.accessibilityRole).toBe("button");
    await fireEvent.press(screen.getByTestId("pressed"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("plain").props.accessible).toBe(false);

    expect(styleOf("plain").backgroundColor).toBeUndefined();
    await fireEvent(screen.getByTestId("plain"), "hoverIn");
    expect(styleOf("plain").backgroundColor).toBe(colors.hoverOverlay);
    await fireEvent(screen.getByTestId("plain"), "hoverOut");
    expect(styleOf("plain").backgroundColor).toBeUndefined();
  });
});
