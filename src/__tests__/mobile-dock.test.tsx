import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import type { NavigationProps } from "@/features/navigation/AppShell";
import { DockAreaProvider } from "@/features/navigation/dock-area";
import type { Destination } from "@/features/navigation/destinations";
import { DOCK } from "@/features/navigation/dock-layout";
import { MobileNavigation } from "@/features/navigation/MobileNavigation";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

// Reanimated runs for real here (driven by fake timers); only Reduce Motion is switchable.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

type Node = ReturnType<typeof screen.getByTestId>;

/**
 * The till-mode layer as Chromium lays it out (Pixel 7): "Charge" after the
 * dock's padding, then "Settings" 4 pt further, as wide as the padlock.
 */
const CHARGE = { left: DOCK.padding, width: 104 };
const SETTINGS = { left: DOCK.padding + 104 + 4, width: DOCK.lock };

function dock({
  current,
  unlocked = false,
  navigate = () => undefined
}: {
  current: Destination | null;
  unlocked?: boolean;
  navigate?: (destination: Destination) => void;
}) {
  const props: NavigationProps = {
    kind: "merchant",
    current,
    unlocked,
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
      <MobileNavigation {...props} />
    </DockAreaProvider>
  );
}

const hidden = { includeHiddenElements: true };

/** Jest has no layout: the till-mode layer's "Charge" and "Settings" get the places above. */
async function layOutTill() {
  const layout = ({ left, width }: { left: number; width: number }) => ({
    nativeEvent: { layout: { x: left, y: DOCK.padding, width, height: DOCK.item } }
  });
  await fireEvent(screen.getByTestId("dock-charge"), "layout", layout(CHARGE));
  await fireEvent(screen.getByTestId("dock-settings"), "layout", layout(SETTINGS));
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const mark = () =>
  getAnimatedStyle(screen.getByTestId("dock-till-mark", hidden)) as Record<string, number>;
const fill = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style).backgroundColor;

describe("MobileNavigation (an owner's dock, mobile)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks the till's screen before the layer is laid out, then by a mark placed at once", async () => {
    const view = await render(dock({ current: "pos" }));
    // Before the layout: the sand fill on "Charge" itself, no mark yet.
    expect(screen.queryByTestId("dock-till-mark", hidden)).toBeNull();
    expect(fill("dock-charge")).toBeDefined();
    expect(fill("dock-settings")).toBeUndefined();
    await view.rerender(dock({ current: "settings" }));
    expect(fill("dock-charge")).toBeUndefined();
    expect(fill("dock-settings")).toBeDefined();

    await layOutTill();
    // Under "Settings" at once, nothing slides; the buttons lose their own fill.
    expect(mark()).toMatchObject(SETTINGS);
    expect(fill("dock-charge")).toBeUndefined();
    expect(fill("dock-settings")).toBeUndefined();
  });

  it("slides the till's mark to Settings and back", async () => {
    const navigate = jest.fn();
    const view = await render(dock({ current: "pos", navigate }));
    await layOutTill();
    expect(mark()).toMatchObject(CHARGE);

    await fireEvent.press(screen.getByTestId("dock-settings"));
    expect(navigate).toHaveBeenCalledWith("settings");
    await view.rerender(dock({ current: "settings", navigate }));
    await advance(motion.navIndicator / 2);
    // On the way: between the two, narrowing from the width of "Charge" to the padlock's.
    expect(mark().left).toBeGreaterThan(CHARGE.left);
    expect(mark().left).toBeLessThan(SETTINGS.left);
    expect(mark().width).toBeLessThan(CHARGE.width);
    expect(mark().width).toBeGreaterThan(SETTINGS.width);
    await advance(motion.navIndicator);
    expect(mark()).toMatchObject(SETTINGS);

    // Back to the till, and a route outside the destinations: under "Charge", as before.
    await view.rerender(dock({ current: null, navigate }));
    await advance(motion.navIndicator);
    expect(mark()).toMatchObject(CHARGE);
  });

  it("with Reduce Motion, moves the till's mark at once", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(dock({ current: "pos" }));
    await layOutTill();

    await view.rerender(dock({ current: "settings" }));
    await advance(1);
    expect(mark()).toMatchObject(SETTINGS);
  });

  it("lets the slots take taps once unlocked: their box-none from a sheet, never inline", async () => {
    const navigate = jest.fn();
    const view = await render(dock({ current: "settings", navigate }));
    // The slots' container (above each slot's place).
    const slots = () => screen.getByTestId("dock-slot-0", hidden).parent!.parent as Node;
    expect(StyleSheet.flatten(slots().props.style).pointerEvents).toBe("none");

    // The web drops an inline box-none, which leaves till mode's `none` in place: the dock would
    // take no tap after the passkey. ESLint refuses an inline one (eslint.config.js); here,
    // the style's entry that sets it is a sheet's, the same object at every render.
    await view.rerender(dock({ current: "settings", navigate, unlocked: true }));
    const entries = () =>
      (slots().props.style as object[]).flat().filter((entry) => entry && "pointerEvents" in entry);
    const [boxNone] = entries();
    expect(entries()).toEqual([{ pointerEvents: "box-none" }]);
    await view.rerender(dock({ current: "wallet", navigate, unlocked: true }));
    expect(entries()[0]).toBe(boxNone);

    await fireEvent.press(screen.getByTestId("dock-slot-2"));
    expect(navigate).toHaveBeenCalledWith("employees");
  });
});
