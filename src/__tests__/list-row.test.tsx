import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { ListRow } from "@/components/ui/ListRow";
import { lightColors as colors } from "@/theme";

const rowStyle = () => StyleSheet.flatten(screen.getByTestId("row").props.style);

describe("ListRow", () => {
  it("is pressed over its container's padding, its content in place", async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        inset={24}
        accessibilityRole="button"
        onPress={onPress}
        style={{ height: 50, borderBottomWidth: 1 }}
        containerStyle={{ marginBottom: 8 }}
        testID="row"
      >
        <Text>Open</Text>
      </ListRow>
    );
    // The press area takes the padding back; the line stays under the content.
    expect(rowStyle()).toMatchObject({ paddingHorizontal: 24, marginBottom: 8 });
    expect(rowStyle().borderBottomWidth).toBeUndefined();
    expect(rowStyle().backgroundColor).toBeUndefined();
    const content = StyleSheet.flatten(screen.getByText("Open").parent?.props.style);
    expect(content).toMatchObject({ height: 50, borderBottomWidth: 1 });

    fireEvent.press(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("tints the whole row while pressed, not while disabled", async () => {
    const { rerender } = await render(
      <ListRow inset={16} onPress={() => undefined} testOnly_pressed testID="row">
        <Text>Underpaid</Text>
      </ListRow>
    );
    expect(rowStyle()).toMatchObject({
      paddingHorizontal: 16,
      backgroundColor: colors.hoverOverlay
    });

    await rerender(
      <ListRow inset={16} onPress={() => undefined} disabled testOnly_pressed testID="row">
        <Text>Underpaid</Text>
      </ListRow>
    );
    expect(rowStyle().backgroundColor).toBeUndefined();
  });
});
