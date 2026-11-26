import "@/i18n";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { SettingsTiles, type SettingsTileItem } from "@/features/settings/parts";

type Node = ReturnType<typeof screen.getByTestId>;

const item = (key: string): SettingsTileItem => ({
  key,
  title: key,
  summary: `${key}…`,
  icon: "circle-info",
  onPress: jest.fn(),
  testID: `tile-${key}`
});

const style = (node: Node) => StyleSheet.flatten(node.props.style) ?? {};
/** The host View a tile sits in: its share of the row. */
const hostParent = (node: Node) => {
  let parent = node.parent;
  while (parent && typeof parent.type !== "string") parent = parent.parent;
  return parent as Node;
};
const cellOf = (testID: string) => hostParent(screen.getByTestId(testID));
const hostChildren = (node: Node) =>
  node.children.filter((child): child is Node => typeof child !== "string");

describe('SettingsTiles ("Settings" on a phone)', () => {
  it("gives a lone tile the same half of its row as a tile beside another", async () => {
    // Yoga starts a flex item at its padding at least: a padded tile next to an empty spacer
    // took more than half its row ("Help" alone, Android). Each share is a cell without padding.
    await render(<SettingsTiles items={["a", "b", "c"].map(item)} />);
    const full = cellOf("tile-a");
    const lone = cellOf("tile-c");
    const loneRow = hostChildren(hostParent(lone));
    expect(loneRow).toHaveLength(2);
    const [, neighbour] = loneRow;
    for (const share of [full, cellOf("tile-b"), lone, neighbour!]) {
      expect(style(share)).toEqual({ flex: 1, minWidth: 0 });
    }
    // The padding is the tile's, inside its cell, which it fills.
    const tile = style(screen.getByTestId("tile-c"));
    expect(tile.padding).toBeGreaterThan(0);
    expect(tile.flexGrow).toBe(1);
    expect(tile.flex).toBeUndefined();
  });
});
