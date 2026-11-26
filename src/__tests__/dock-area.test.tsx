import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NavigationProps } from "@/features/navigation/AppShell";
import {
  DockActions,
  DockAreaProvider,
  DockScrollView,
  ShellMain
} from "@/features/navigation/dock-area";
import { DOCK_HEIGHT, DOCK_TOP } from "@/features/navigation/dock-layout";
import { MemberNavigation } from "@/features/navigation/MemberNavigation";
import { PosFrame } from "@/features/terminal/PosFrame";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));

/** An iPhone's home indicator: the dock keeps it below itself. */
const HOME_INDICATOR = 34;
/** The dock over the screens, from the window's bottom edge. */
const CLEARANCE = HOME_INDICATOR + DOCK_TOP + DOCK_HEIGHT;

/** One frame at 60 Hz. */
const FRAME = 17;

type Node = ReturnType<typeof screen.getByTestId>;

/** The `nth` view above `node` whose style Reanimated animates (1: the nearest). */
function animatedAbove(node: Node, nth = 1): Node {
  let found = 0;
  for (let at = node.parent; at; at = at.parent) {
    if (typeof at.type === "string" && "jestAnimatedStyle" in at.props && ++found === nth) {
      return at;
    }
  }
  throw new Error("No animated view above");
}

const paddingBottom = (node: Node) => Number(getAnimatedStyle(node).paddingBottom ?? 0);
/** PosFrame's root, then the shell's screens (ShellMain). */
const frame = () => paddingBottom(animatedAbove(screen.getByTestId("content")));
const main = () => paddingBottom(animatedAbove(screen.getByTestId("content"), 2));

/** A list's own bottom padding (its contentContainerStyle). */
const LIST_END = 16;

/** The list's bottom padding and scroll bars' inset, as drawn. */
function listEnd() {
  const list = screen.getByTestId("list");
  return {
    padding: StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom as number,
    bars: (list.props.scrollIndicatorInsets as { bottom: number }).bottom
  };
}

function Shell({
  docked = true,
  hidden = false,
  list = false,
  actions = false
}: {
  docked?: boolean;
  hidden?: boolean;
  list?: boolean;
  actions?: boolean;
}) {
  return (
    <DockAreaProvider docked={docked} hidden={hidden}>
      <ShellMain style={{ flex: 1 }}>
        <PosFrame title="Settings">
          <View testID="content" />
          {list ? (
            <DockScrollView testID="list" contentContainerStyle={{ paddingBottom: LIST_END }} />
          ) : null}
          {actions ? (
            <DockActions>
              <View testID="action" />
            </DockActions>
          ) : null}
        </PosFrame>
      </ShellMain>
    </DockAreaProvider>
  );
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("the dock over the screens (mobile)", () => {
  const insets = jest.mocked(useSafeAreaInsets);
  const original = insets.getMockImplementation();

  beforeEach(() => {
    jest.useFakeTimers();
    insets.mockReturnValue({ top: 47, right: 0, bottom: HOME_INDICATOR, left: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
    insets.mockImplementation(original);
  });

  it("keeps what does not scroll above the dock, as when it was laid out below the screens", async () => {
    const view = await render(<Shell />);
    expect(frame()).toBe(CLEARANCE);
    expect(main()).toBe(0);

    // The dock leaving (an invoice): the band below it stays, the room above it eases away.
    await view.rerender(<Shell hidden />);
    await advance(motion.navDock / 2);
    const shown = frame() / CLEARANCE;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(1);
    // Together, the height of the dock's area as it eased below the screens.
    expect(frame() + main()).toBeCloseTo(HOME_INDICATOR + shown * (DOCK_TOP + DOCK_HEIGHT));
    await advance(motion.navDock);
    expect(frame()).toBe(0);
    expect(main()).toBe(HOME_INDICATOR);

    await view.rerender(<Shell />);
    await advance(motion.navDock);
    expect(frame()).toBe(CLEARANCE);
    expect(main()).toBe(0);
  });

  it("lets a DockScrollView run under the dock, its content ending above it", async () => {
    const view = await render(<Shell list />);
    // Reanimated applies a style whose inputs changed at the next frame.
    await advance(FRAME);
    // Nothing below the screen: it reaches the window's edge, under the dock.
    expect(frame()).toBe(0);
    expect(main()).toBe(0);
    expect(listEnd()).toEqual({ padding: LIST_END + CLEARANCE, bars: CLEARANCE });

    // Gone (a screen's loading in its place): what shows ends above the dock again, by itself.
    await view.rerender(<Shell />);
    await advance(FRAME);
    expect(frame()).toBe(CLEARANCE);
  });

  it("keeps the bottom safe area without a dock (a card holder's phone)", async () => {
    const view = await render(<Shell docked={false} />);
    expect(frame()).toBe(HOME_INDICATOR);
    expect(main()).toBe(0);

    // A scroll view under the home indicator, its content ending above it.
    await view.rerender(<Shell docked={false} list />);
    await advance(FRAME);
    expect(frame()).toBe(0);
    expect(listEnd()).toEqual({ padding: LIST_END + HOME_INDICATOR, bars: HOME_INDICATOR });
  });

  it("is a plain scroll view outside a screen's frame (a computer's layout)", async () => {
    await render(
      <DockAreaProvider docked hidden={false}>
        <DockScrollView testID="list" contentContainerStyle={{ paddingBottom: LIST_END }} />
      </DockAreaProvider>
    );
    const list = screen.getByTestId("list");
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom).toBe(LIST_END);
    expect(list.props.scrollIndicatorInsets).toBeUndefined();
  });

  it("takes taps on its pill only: around it, the screen under it gets them", async () => {
    const props: NavigationProps = {
      kind: "merchant",
      current: "pos",
      unlocked: true,
      unlocking: false,
      preparing: false,
      invoiceShown: false,
      fullScreen: false,
      navigate: jest.fn(),
      unlock: () => undefined,
      lock: () => undefined
    };
    await render(
      <DockAreaProvider docked hidden={false}>
        <MemberNavigation {...props} />
      </DockAreaProvider>
    );
    const row = screen.getByTestId("dock").parent as Node;
    const area = row.parent as Node;
    // From a sheet, on a plain view: the web's box-none needs a class (an inline one is no CSS).
    expect(StyleSheet.flatten(area.props.style)).toMatchObject({
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: "box-none"
    });
    // A prop on the animated row, for the same reason.
    expect(row.props.pointerEvents).toBe("box-none");
  });

  it("floats a screen's actions above the dock, its list ending above them", async () => {
    const view = await render(<Shell list actions />);
    const actions = screen.getByTestId("action").parent as Node;
    // Just above the dock, taking taps on its actions only (box-none from a sheet: see the dock).
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({
      position: "absolute",
      left: 0,
      right: 0,
      bottom: CLEARANCE,
      pointerEvents: "box-none"
    });
    // Before they are laid out, the dock's room only; then theirs too.
    expect(listEnd().padding).toBe(LIST_END + CLEARANCE);
    await fireEvent(actions, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 62 } }
    });
    expect(listEnd()).toEqual({ padding: LIST_END + CLEARANCE + 62, bars: CLEARANCE + 62 });

    // Gone: the list no longer leaves their room.
    await view.rerender(<Shell list />);
    expect(listEnd().padding).toBe(LIST_END + CLEARANCE);
  });
});
