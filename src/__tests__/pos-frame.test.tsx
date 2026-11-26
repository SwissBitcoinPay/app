import "@/i18n";

import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { PosFrame } from "@/features/terminal/PosFrame";
import { gutter } from "@/theme";

import { sideInsetsOf } from "../../jest/layout";

const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

/** The desktop's centred body: its side padding (PosFrame's `desktopBody`). */
const DESKTOP_GUTTER = 38;

/** How far from the window's edges the frame lays out its content, with `flush`. */
async function insetsWith(flush?: "mobile" | "always") {
  await render(
    <PosFrame title="Cards" flush={flush}>
      <View testID="content" />
    </PosFrame>
  );
  return sideInsetsOf(screen.getByTestId("content"));
}

describe("PosFrame", () => {
  afterEach(() => mockDesktop.mockReturnValue(false));

  it("lays its content out at the screen's gutter, unless the screen draws it (`flush`)", async () => {
    expect(await insetsWith()).toEqual({ left: gutter, right: gutter });
    expect(await insetsWith("mobile")).toEqual({ left: 0, right: 0 });
    expect(await insetsWith("always")).toEqual({ left: 0, right: 0 });
  });

  it("draws two actions on the header's right, the second at the edge, the left keeping as much room", async () => {
    const pressed: string[] = [];
    const action = (name: string) => ({
      icon: "map" as const,
      label: name,
      onPress: () => pressed.push(name),
      testID: name
    });
    await render(
      <PosFrame title="Cards" trailing={[action("inner"), action("edge")]}>
        <View />
      </PosFrame>
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.props.testID)).toEqual(["inner", "edge"]);
    // Only the edge one is pulled outward (IconButton's `overhang`).
    expect(screen.getByTestId("edge")).toHaveStyle({ marginRight: -12 });
    expect(screen.getByTestId("inner")).not.toHaveStyle({ marginRight: -12 });
    await fireEvent.press(screen.getByTestId("inner"));
    await fireEvent.press(screen.getByTestId("edge"));
    expect(pressed).toEqual(["inner", "edge"]);
    // The title stays centred: the left side as wide as the right, two spacers.
    const header = screen.getByText("Cards").parent!.parent!;
    const [left] = header.children;
    expect(typeof left === "object" ? left.children : []).toHaveLength(2);
  });

  it('keeps its centred body\'s padding on a computer, but for "always"', async () => {
    mockDesktop.mockReturnValue(true);
    const padded = { left: DESKTOP_GUTTER, right: DESKTOP_GUTTER };
    expect(await insetsWith()).toEqual(padded);
    expect(await insetsWith("mobile")).toEqual(padded);
    expect(await insetsWith("always")).toEqual({ left: 0, right: 0 });
  });
});
