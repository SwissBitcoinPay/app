import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";

import type { NavigationProps } from "@/features/navigation/AppShell";
import { DockAreaProvider } from "@/features/navigation/dock-area";
import { MEMBER_DESTINATIONS, type Destination } from "@/features/navigation/destinations";
import {
  DOCK,
  MEMBER_DOCK,
  memberDockLayout,
  type PillSizes
} from "@/features/navigation/dock-layout";
import { MemberNavigation } from "@/features/navigation/MemberNavigation";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

// Reanimated runs for real here (driven by fake timers); only Reduce Motion is switchable.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

/**
 * Widths of the icons (Font Awesome at 16 px, as the slot of the screen shown draws them) and of
 * the names (Poppins Bold 13.5 px) of an employee's dock in French, measured in Chromium: names
 * narrower than in the app's Plus Jakarta Sans, widths the layout must handle all the same.
 */
const ICONS: Partial<Record<Destination, number>> = { pos: 12, wallet: 16, settings: 16 };
const NAMES: Partial<Record<Destination, number>> = { pos: 66.9, wallet: 86, settings: 64.5 };
const SIZES: PillSizes[] = MEMBER_DESTINATIONS.map((d) => ({ icon: ICONS[d]!, label: NAMES[d]! }));

/** The slot of the screen shown: its icon and name, 18 pt on each side, 8 pt between them. */
const pillOf = (destination: Destination) => 2 * 18 + ICONS[destination]! + 8 + NAMES[destination]!;
/** The dock with that slot, the two others and its padding. */
const dockOf = (destination: Destination) =>
  2 * DOCK.padding + pillOf(destination) + 2 * MEMBER_DOCK.slot + 2 * MEMBER_DOCK.between;

describe("memberDockLayout", () => {
  it("fits the slot of the screen shown to its icon and name, the others 54 pt wide", () => {
    const layout = memberDockLayout(3, 1, SIZES);
    expect(layout.labelled).toBe(1);
    expect(layout.slots[0]).toEqual({ left: 0, width: 54 });
    expect(layout.slots[1]!.left).toBe(58);
    expect(layout.slots[1]!.width).toBeCloseTo(pillOf("wallet"));
    expect(layout.slots[2]!.left).toBeCloseTo(58 + pillOf("wallet") + 4);
    expect(layout.slots[2]!.width).toBe(54);
    expect(layout.width).toBeCloseTo(dockOf("wallet"));
    for (const slot of layout.slots) expect(slot.width).toBeGreaterThanOrEqual(DOCK.minSlot);
  });

  it("is as wide as its slots: its width follows the name of the screen shown", () => {
    for (const [index, destination] of MEMBER_DESTINATIONS.entries()) {
      expect(memberDockLayout(3, index, SIZES).width).toBeCloseTo(dockOf(destination));
    }
  });

  it("stays 12 pt from the screen's edges: past that, the name of the screen shown is cut", () => {
    const fits = dockOf("wallet");
    expect(memberDockLayout(3, 1, SIZES, fits).labelWidth).toBe(NAMES.wallet);
    const layout = memberDockLayout(3, 1, SIZES, fits - 20);
    expect(layout.width).toBeCloseTo(fits - 20);
    expect(layout.slots[1]!.width).toBeCloseTo(pillOf("wallet") - 20);
    expect(layout.labelWidth).toBeCloseTo(NAMES.wallet! - 20);
    expect(layout.slots[2]).toMatchObject({ width: 54 });
    // Never under a slot's width: the name then has no room.
    const narrow = memberDockLayout(3, 1, SIZES, 100);
    expect(narrow.slots[1]!.width).toBe(54);
    expect(narrow.labelWidth).toBe(0);
  });

  it("names no slot before the names are measured, nor for a screen out of the dock", () => {
    for (const layout of [memberDockLayout(3, 0, null), memberDockLayout(3, -1, SIZES)]) {
      expect(layout.labelled).toBe(-1);
      expect(layout.slots).toEqual([
        { left: 0, width: 54 },
        { left: 58, width: 54 },
        { left: 116, width: 54 }
      ]);
      expect(layout.width).toBe(182);
    }
  });
});

type Node = ReturnType<typeof screen.getByTestId>;

function dock(current: Destination | null, navigate = jest.fn()) {
  const props: NavigationProps = {
    kind: "merchant",
    current,
    unlocked: true,
    unlocking: false,
    preparing: false,
    invoiceShown: false,
    fullScreen: false,
    navigate,
    unlock: () => undefined,
    lock: () => undefined
  };
  // As the shell draws it (AppShell): in its dock's area.
  return (
    <DockAreaProvider docked hidden={false}>
      <MemberNavigation {...props} />
    </DockAreaProvider>
  );
}

const hidden = { includeHiddenElements: true };

/** Jest has no layout: the dock's off-screen icons and names get the widths above. */
async function measure() {
  const layout = (width: number) => ({
    nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } }
  });
  for (const destination of MEMBER_DESTINATIONS) {
    await fireEvent(
      screen.getByTestId(`dock-measure-icon-${destination}`, hidden),
      "layout",
      layout(ICONS[destination]!)
    );
    await fireEvent(
      screen.getByTestId(`dock-measure-label-${destination}`, hidden),
      "layout",
      layout(NAMES[destination]!)
    );
  }
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Long enough for any change to settle: the slots, the name's delay and its fade. */
const SETTLE = motion.navIndicator + motion.navEnterDelay + motion.navLabelIn;

const style = (node: Node) => getAnimatedStyle(node) as Record<string, number>;
/** A slot's place in the dock (its padding included). */
const slot = (index: number) => style(screen.getByTestId(`dock-slot-${index}`).parent as Node);
const mark = () => style(screen.getByTestId("dock-mark", hidden));
const dockWidth = () => style(screen.getByTestId("dock-slot-0").parent!.parent as Node).width!;
const nameOpacity = (index: number) =>
  style(screen.getByTestId(`dock-label-${index}`).parent as Node).opacity!;
const iconScale = (index: number) =>
  (
    getAnimatedStyle(screen.getByTestId(`dock-slot-${index}-icon`, hidden)).transform as {
      scale: number;
    }[]
  )[0]!.scale;

describe("MemberNavigation (an employee's dock, mobile)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("names the screen shown in its pill once the names are measured", async () => {
    await render(dock("pos"));
    // Before: no name, the slots side by side.
    expect(screen.queryByTestId("dock-label-0")).toBeNull();
    expect(slot(0)).toMatchObject({ left: DOCK.padding, width: 54 });
    expect(dockWidth()).toBe(182);

    await measure();
    expect(screen.getByTestId("dock-label-0")).toHaveTextContent("Charge");
    expect(nameOpacity(0)).toBe(1);
    // Placed at once, nothing slides.
    expect(slot(0).width).toBeCloseTo(pillOf("pos"));
    expect(slot(1).left).toBeCloseTo(DOCK.padding + pillOf("pos") + 4);
    expect(mark()).toMatchObject({ left: DOCK.padding, opacity: 1 });
    expect(mark().width).toBeCloseTo(pillOf("pos"));
    expect(dockWidth()).toBeCloseTo(dockOf("pos"));
    expect(screen.queryByTestId("dock-label-1")).toBeNull();
  });

  it("slides to the screen chosen: its pill, the slots, the dock's width and the names", async () => {
    const view = await render(dock("pos"));
    await measure();
    const dockNode = screen.getByTestId("dock");

    await view.rerender(dock("wallet"));
    await advance(motion.navIndicator / 2);
    // On the way: the pill between the two slots, each slot between its widths.
    expect(mark().left).toBeGreaterThan(DOCK.padding);
    expect(mark().left).toBeLessThan(DOCK.padding + 58);
    expect(slot(0).width).toBeGreaterThan(54);
    expect(slot(0).width).toBeLessThan(pillOf("pos"));
    expect(slot(1).width).toBeGreaterThan(54);
    expect(slot(1).width).toBeLessThan(pillOf("wallet"));
    expect(dockWidth()).toBeGreaterThan(dockOf("pos"));
    expect(dockWidth()).toBeLessThan(dockOf("wallet"));
    // The name left goes at once, the one shown comes in once its slot has room.
    expect(nameOpacity(0)).toBe(0);
    expect(nameOpacity(1)).toBeGreaterThan(0);
    expect(nameOpacity(1)).toBeLessThan(1);
    // The icons ease to their sizes: 16 pt beside the name, 18 pt alone.
    expect(iconScale(1)).toBeGreaterThan(1);
    expect(iconScale(1)).toBeLessThan(18 / 16);
    expect(iconScale(0)).toBeLessThan(1);
    expect(iconScale(0)).toBeGreaterThan(16 / 18);

    await advance(SETTLE);
    expect(slot(0)).toMatchObject({ left: DOCK.padding, width: 54 });
    expect(slot(1).left).toBe(DOCK.padding + 58);
    expect(slot(1).width).toBeCloseTo(pillOf("wallet"));
    expect(mark().left).toBe(DOCK.padding + 58);
    expect(mark().width).toBeCloseTo(pillOf("wallet"));
    expect(dockWidth()).toBeCloseTo(dockOf("wallet"));
    expect(nameOpacity(1)).toBe(1);
    expect(screen.getByTestId("dock-label-1")).toHaveTextContent("My activity");
    expect([iconScale(0), iconScale(1)]).toEqual([1, 1]);
    // The same dock all along: it is never mounted again.
    expect(screen.getByTestId("dock")).toBe(dockNode);
  });

  it("with Reduce Motion, places the slots at once and only fades the names", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(dock("pos"));
    await measure();

    await view.rerender(dock("settings"));
    await advance(1);
    expect(slot(2).width).toBeCloseTo(pillOf("settings"));
    expect(mark().left).toBe(DOCK.padding + 116);
    expect(dockWidth()).toBeCloseTo(dockOf("settings"));
    expect(iconScale(2)).toBe(1);
    expect(nameOpacity(2)).toBeLessThan(1);
    await advance(SETTLE);
    expect(nameOpacity(2)).toBe(1);
  });

  it("hides its pill out of the destinations, and goes where it is asked", async () => {
    const navigate = jest.fn();
    const view = await render(dock("pos", navigate));
    await measure();

    await view.rerender(dock(null, navigate));
    await advance(SETTLE);
    expect(mark().opacity).toBe(0);
    expect(nameOpacity(0)).toBe(0);
    expect(dockWidth()).toBe(182);

    await fireEvent.press(screen.getByLabelText("Settings"));
    expect(navigate).toHaveBeenCalledWith("settings");
  });
});
