import "@/i18n";

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NavigationProps } from "@/features/navigation/AppShell";
import { DESTINATION_ICONS, type Destination } from "@/features/navigation/destinations";
import { ICON_GESTURES } from "@/features/navigation/icon-gestures";
import { destinationIcon } from "@/features/navigation/invoice-wait";
import { markDuration } from "@/features/navigation/motion";
import { Sidebar, SIDEBAR_WIDTH } from "@/features/navigation/Sidebar";
import { PosProvider } from "@/features/terminal/pos";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";
import { lightColors as colors, motion, sans, palette, type } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";
import { drawn, svgColour } from "../../jest/svg";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

// No rate is read: the side bar does not show it.
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: undefined, hour: undefined, loading: true, current: () => undefined })
}));

const PROFILE: OwnerTerminalProfile = {
  version: 2,
  walletId: "02".padEnd(66, "a"),
  backupKey: "b".repeat(64),
  lightningAddress: "sattleme02aaaaaaaa@breez.tips",
  businessName: "Fine Bakery",
  currency: "CHF"
};

/** The pill and the rows it copies are decorative: found with the hidden elements only. */
const HIDDEN = { includeHiddenElements: true };

function sidebar(
  current: Destination | null,
  member = false,
  { kind = "merchant", unlocked = true, lock = jest.fn() }: Partial<NavigationProps> = {}
) {
  const props: NavigationProps = {
    kind,
    current,
    unlocked,
    unlocking: false,
    preparing: false,
    invoiceShown: false,
    fullScreen: false,
    navigate: jest.fn(),
    unlock: jest.fn(),
    lock
  };
  return (
    <PosProvider profile={PROFILE}>
      <Sidebar {...props} member={member} />
    </PosProvider>
  );
}

/**
 * Jest has no layout: where the groups sit in the list, and the rows in their group. In the list:
 * "Charge" 22, "Wallet" 102, "Employees" 148, "Integrations" 194, "Settings" 278.
 */
async function layOut() {
  const at = async (testID: string, y: number) =>
    fireEvent(screen.getByTestId(testID), "layout", {
      nativeEvent: { layout: { x: 0, y, width: 216, height: 44 } }
    });
  await at("sidebar-group-sales", 0);
  await at("sidebar-group-manage", 80);
  await at("sidebar-group-account", 240);
  await at("sidebar-pos", 22);
  await at("sidebar-wallet", 22);
  await at("sidebar-employees", 68);
  await at("sidebar-integrations", 114);
  await at("sidebar-settings", 38);
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

type Style = { opacity: number; transform: { translateY: number }[] };
const animated = (testID: string) => getAnimatedStyle(screen.getByTestId(testID, HIDDEN)) as Style;
const mark = () => animated("sidebar-mark");
const markTop = () => mark().transform[0].translateY;
const opacity = (testID: string) => animated(testID).opacity;
const labelStyle = (element: ReturnType<typeof screen.getByText>) =>
  StyleSheet.flatten(element.props.style);

type Pose = [{ translateX: number }, { translateY: number }, { rotate: string }, { scale: number }];
/** An icon of the pill's copy: how its gesture moves it now. */
function pose(destination: Destination) {
  const [x, y, rotate, scale] = getAnimatedStyle(
    screen.getByTestId(`sidebar-ink-${destination}-icon`, HIDDEN)
  ).transform as Pose;
  return {
    x: x.translateX,
    y: y.translateY,
    rotate: parseFloat(rotate.rotate),
    scale: scale.scale
  };
}
const REST = { x: 0, y: 0, rotate: 0, scale: 1 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Sidebar's pill", () => {
  it("is placed on the row shown once laid out, without sliding from the top, then slides", async () => {
    const view = await render(sidebar("settings"));
    // Nothing to place before the rows are laid out.
    expect(screen.queryByTestId("sidebar-mark", HIDDEN)).toBeNull();

    // Shown below a screen of the whole window, a window widened: "Settings" at once (240 + 38),
    // where it slid down from the top of the list.
    await layOut();
    expect(markTop()).toBe(278);
    await advance(motion.navMarkMin / 2);
    expect(markTop()).toBe(278);
    await advance(motion.navMarkMax);
    expect(markTop()).toBe(278);
    expect(mark().opacity).toBe(1);

    // To another row: it slides there.
    await view.rerender(sidebar("employees"));
    await advance(motion.navMarkMin / 2);
    expect(markTop()).toBeLessThan(278);
    expect(markTop()).toBeGreaterThan(148);
    await advance(motion.navMarkMax);
    expect(markTop()).toBe(148);
  });

  it("slides for longer the further it goes, within its bounds", async () => {
    expect(markDuration(0)).toBe(motion.navMarkMin);
    expect(markDuration(46)).toBe(Math.round(motion.navMarkMin + 46 * motion.navMarkPerPx));
    expect(markDuration(-46)).toBe(markDuration(46));
    expect(markDuration(10_000)).toBe(motion.navMarkMax);

    const view = await render(sidebar("employees"));
    await layOut();
    // Next row: there in markDuration(46).
    await view.rerender(sidebar("integrations"));
    await advance(markDuration(46) + 1);
    expect(markTop()).toBe(194);
    // Across the list (194 to 22): still on its way then, there in markDuration(172).
    await view.rerender(sidebar("pos"));
    await advance(markDuration(46) + 1);
    expect(markTop()).toBeGreaterThan(22);
    await advance(markDuration(172) - markDuration(46));
    expect(markTop()).toBe(22);
  });

  it("holds the rows in their active look, over the rows they copy, the list's rows idle", async () => {
    await render(sidebar("integrations"));
    // Not laid out yet: the row shown draws its own active look, as the pill will.
    expect(labelStyle(screen.getByText("Integrations"))).toMatchObject({
      fontFamily: sans(700).fontFamily,
      color: colors.sidebar.labelActive
    });

    await layOut();
    // The list's rows all idle: the pill above draws the active one.
    expect(labelStyle(screen.getByText("Integrations"))).toMatchObject({
      fontFamily: sans(500).fontFamily,
      color: colors.sidebar.label
    });
    expect(opacity("sidebar-mark")).toBe(1);
    // Its copy, out of reach: every row in white bold, held where the rows are.
    const ink = screen.getByTestId("sidebar-ink", HIDDEN);
    for (const name of ["Charge", "Wallet", "Integrations", "Settings"]) {
      expect(labelStyle(within(ink).getByText(name, HIDDEN))).toMatchObject({
        fontFamily: sans(700).fontFamily,
        color: colors.sidebar.labelActive
      });
    }
    expect(animated("sidebar-ink").transform[0].translateY).toBe(-194);
  });

  it("gives way to the row's own fill with Reduce Motion: no slide, a fade", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await render(sidebar("pos"));
    await layOut();
    expect(screen.queryByTestId("sidebar-mark", HIDDEN)).toBeNull();
    expect(labelStyle(screen.getByText("Charge"))).toMatchObject({
      fontFamily: sans(700).fontFamily
    });

    await view.rerender(sidebar("wallet"));
    expect(labelStyle(screen.getByText("Wallet"))).toMatchObject({
      fontFamily: sans(700).fontFamily,
      color: colors.sidebar.labelActive
    });
    expect(labelStyle(screen.getByText("Charge"))).toMatchObject({
      color: colors.sidebar.label
    });
  });
});

describe("Sidebar's icons", () => {
  it("make their gesture as the pill reaches their row, never as they mount, once", async () => {
    const view = await render(sidebar("employees"));
    await layOut();
    await advance(2_000);
    expect(pose("employees")).toEqual(REST);

    // "Integrations", the next row: its plug moves once the pill is half way (118 ms).
    await view.rerender(sidebar("integrations"));
    const delay = Math.round(markDuration(46) / 2);
    await advance(delay - 20);
    expect(pose("integrations")).toEqual(REST);
    await advance(20 + ICON_GESTURES.plug!.duration * 0.42);
    expect(Math.abs(pose("integrations").y)).toBeGreaterThan(0.5);
    await advance(ICON_GESTURES.plug!.duration);
    expect(pose("integrations")).toEqual(REST);

    // Another row chosen: its own gesture; the plug's is not played again by the new slide.
    await view.rerender(sidebar("settings"));
    await advance(Math.round(markDuration(130) / 2) + motion.navGestureTurn / 2);
    expect(pose("settings").rotate).toBeGreaterThan(0);
    expect(pose("integrations")).toEqual(REST);
    await advance(motion.navGestureTurn);
    expect(pose("settings").rotate).toBe(360);
    expect(pose("employees")).toEqual(REST);
  });

  it("make their gesture at once on a row the pill already reached, hidden", async () => {
    const view = await render(sidebar("employees"));
    await layOut();
    // A destination of another kind of device: the pill fades out, going home on its way.
    await view.rerender(sidebar(null));
    await advance(motion.navMarkMax);
    expect(markTop()).toBe(22);
    expect(mark().opacity).toBe(0);

    // Back home: the pill fades in where it is, the calculator pressed without waiting for a slide.
    await view.rerender(sidebar("pos"));
    await advance(100);
    expect(pose("pos").scale).toBeLessThan(1);
    expect(markTop()).toBe(22);
  });

  it("have a gesture for every row of every side bar, starting and ending at rest", () => {
    // The owner's and a card holder's rows, and an employee's "My activity".
    const icons = [
      ...(Object.keys(DESTINATION_ICONS) as Destination[]).map((d) => destinationIcon(d)),
      destinationIcon("wallet", true)
    ];
    for (const icon of icons)
      expect([icon, ICON_GESTURES[icon] !== undefined]).toEqual([icon, true]);

    for (const [name, gesture] of Object.entries(ICON_GESTURES)) {
      const { at } = gesture;
      expect([name, at[0], at[at.length - 1]]).toEqual([name, 0, 1]);
      for (const [channel, rest] of [
        ["x", 0],
        ["y", 0],
        ["rotate", 0],
        ["scale", 1]
      ] as const) {
        const values = gesture[channel];
        if (!values) continue;
        expect([name, channel, values.length]).toEqual([name, channel, at.length]);
        expect([name, channel, values[0]]).toEqual([name, channel, rest]);
        // A turn ends where it started: a whole number of turns.
        const last = values[values.length - 1]!;
        const end = channel === "rotate" ? Math.abs(last % 360) : last;
        expect([name, channel, end]).toEqual([name, channel, rest]);
      }
    }
  });
});

describe("Sidebar's frame", () => {
  it("is as wide as the design, its list scrolling in a window too short for its rows", async () => {
    await render(sidebar("pos"));
    // A scroll view grows by default: in the app's row, it would take room from the screen.
    expect(StyleSheet.flatten(screen.getByTestId("sidebar-frame").props.style)).toMatchObject({
      width: SIDEBAR_WIDTH,
      flexGrow: 0,
      flexShrink: 0
    });
    const list = screen.getByTestId("sidebar");
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({
      flex: 1,
      backgroundColor: colors.sidebar.bg
    });
    // At least as tall as the window: the business card stays at the bottom while it fits.
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    expect(list.props.role).toBe("navigation");
  });

  it("leaves the band under a tablet's status bar cream: its dark content stays readable", async () => {
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation()!;
    insets.mockReturnValue({ top: 24, right: 0, bottom: 20, left: 0 });
    try {
      await render(sidebar("pos"));
      expect(StyleSheet.flatten(screen.getByTestId("sidebar-frame").props.style)).toMatchObject({
        paddingTop: 24,
        backgroundColor: colors.background.app
      });
      expect(
        StyleSheet.flatten(screen.getByTestId("sidebar").props.contentContainerStyle)
      ).toMatchObject({ paddingTop: 22, paddingBottom: 22 + 20 });
    } finally {
      insets.mockImplementation(original);
    }
  });

  it('draws the logo\'s "sattle" in white over the ink, its ".me" orange', async () => {
    await render(sidebar("pos"));
    const fills = drawn("RNSVGPath", screen.getByLabelText("sattle.me")).map(
      (path) => svgColour(path.props.fill).rgb
    );
    expect(fills).toEqual([palette.white, palette.orange, palette.orange]);
  });

  it("draws the build small and dimmed right of the logo, along its bottom", async () => {
    await render(sidebar("pos"));
    const row = screen.getByTestId("sidebar-logo");
    const version = within(row).getByTestId("sidebar-version");
    // Beside the logo, in the same row.
    expect(within(row).getByLabelText("sattle.me")).toBeTruthy();
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({
      flexDirection: "row",
      alignItems: "flex-end"
    });
    // The version is "unknown" in Jest: whatever it says, on one line.
    const [text] = within(version).getAllByText(/.+/);
    expect(labelStyle(text)).toMatchObject({
      fontSize: type.overline,
      color: colors.onDark.muted
    });
  });

  it.each([
    ["an owner's", false],
    ["an employee's", true]
  ])("links the terms and the privacy policy over the ink in %s side bar", async (_, member) => {
    await render(sidebar("pos", member));
    expect(screen.getByTestId("sidebar-legal-terms")).toHaveTextContent("Terms and conditions");
    const privacy = screen.getByTestId("sidebar-legal-privacy");
    expect(privacy).toHaveTextContent("Privacy policy");
    expect(privacy.props.accessibilityRole).toBe("link");
    expect(labelStyle(within(privacy).getByText("Privacy policy"))).toMatchObject({
      color: colors.onDark.muted
    });
    // At the start, on the rows' icons.
    expect(StyleSheet.flatten(screen.getByTestId("sidebar-legal").props.style)).toMatchObject({
      justifyContent: "flex-start",
      paddingLeft: 14
    });
  });
});

describe("Sidebar's business card", () => {
  it("ends with the padlock that switches to till mode, named for screen readers", async () => {
    const lock = jest.fn();
    await render(sidebar("pos", false, { lock }));
    const card = screen.getByTestId("business-card");
    expect(within(card).getByText("Fine Bakery")).toBeTruthy();
    // The card itself is no button: nothing to edit there.
    expect(card.props.accessibilityRole).toBeUndefined();
    const till = within(card).getByTestId("till-mode");
    expect(till).toHaveAccessibleName("Switch to till mode");
    expect(till.props.accessibilityRole).toBe("button");
    await fireEvent.press(till);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("names the padlock in a tip while pointed at or focused, out of reach of screen readers", async () => {
    await render(sidebar("pos"));
    const till = screen.getByTestId("till-mode");
    expect(screen.queryByTestId("till-mode-tip", HIDDEN)).toBeNull();

    await fireEvent(till, "hoverIn");
    const tip = screen.getByTestId("till-mode-tip", HIDDEN);
    expect(tip).toHaveTextContent("Switch to till mode");
    expect(tip.props.accessibilityElementsHidden).toBe(true);
    // Over the card's end, never taking a click.
    expect(StyleSheet.flatten(tip.props.style)).toMatchObject({
      position: "absolute",
      bottom: "100%",
      alignItems: "flex-end",
      pointerEvents: "none"
    });
    await fireEvent(till, "hoverOut");
    expect(screen.queryByTestId("till-mode-tip", HIDDEN)).toBeNull();

    await fireEvent(till, "focus");
    expect(screen.getByTestId("till-mode-tip", HIDDEN)).toBeTruthy();
    await fireEvent(till, "blur");
    expect(screen.queryByTestId("till-mode-tip", HIDDEN)).toBeNull();
  });

  it("fades the padlock out in till mode, keeping its room, out of reach", async () => {
    const view = await render(sidebar("pos"));
    await advance(motion.navTillDelay + motion.navDock);
    expect(opacity("till-mode-wrap")).toBe(1);

    await view.rerender(sidebar("pos", false, { unlocked: false }));
    await advance(motion.navDock);
    expect(opacity("till-mode-wrap")).toBe(0);
    // Still laid out: the business's name does not move.
    expect(screen.getByTestId("till-mode", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("till-mode")).toBeNull();
    expect(screen.getByTestId("till-mode", HIDDEN)).toBeDisabled();
    // No tip for a padlock that is not there.
    await fireEvent(screen.getByTestId("till-mode", HIDDEN), "hoverIn");
    expect(screen.queryByTestId("till-mode-tip", HIDDEN)).toBeNull();
  });

  it("has no padlock on an employee's device: no till mode there", async () => {
    await render(sidebar("pos", true));
    expect(within(screen.getByTestId("business-card")).getByText("Fine Bakery")).toBeTruthy();
    expect(screen.queryByTestId("till-mode", HIDDEN)).toBeNull();
  });

  it('gives way to "Lock the app" on a card holder\'s device, which has no business', async () => {
    const lock = jest.fn();
    await render(sidebar("cards", false, { kind: "cardHolder", lock }));
    expect(screen.queryByTestId("business-card")).toBeNull();
    const action = screen.getByTestId("till-mode");
    expect(within(action).getByText("Lock the app")).toBeTruthy();
    await fireEvent.press(action);
    expect(lock).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar's rows", () => {
  it("name the other rows in the design's Medium, dimmed, the active one in its Bold white", async () => {
    await render(sidebar("pos"));
    expect(labelStyle(screen.getByText("Wallet"))).toMatchObject({
      fontFamily: sans(500).fontFamily,
      color: colors.sidebar.label
    });
    expect(labelStyle(screen.getByText("Charge"))).toMatchObject({
      fontFamily: sans(700).fontFamily,
      color: colors.sidebar.labelActive
    });
  });

  it("fade their hover in and out, never on the row shown", async () => {
    await render(sidebar("pos"));
    await layOut();
    await fireEvent(screen.getByTestId("sidebar-wallet"), "hoverIn");
    await advance(motion.fast / 2);
    expect(opacity("sidebar-wallet-hover")).toBeGreaterThan(0);
    expect(opacity("sidebar-wallet-hover")).toBeLessThan(1);
    await advance(motion.fast);
    expect(opacity("sidebar-wallet-hover")).toBe(1);
    await fireEvent(screen.getByTestId("sidebar-wallet"), "hoverOut");
    await advance(motion.fast);
    expect(opacity("sidebar-wallet-hover")).toBe(0);

    await fireEvent(screen.getByTestId("sidebar-pos"), "hoverIn");
    await advance(motion.fast);
    expect(opacity("sidebar-pos-hover")).toBe(0);
  });

  it("keep room for a padlock on the owner's device only", async () => {
    const view = await render(sidebar("pos"));
    const padlock = (destination: Destination) =>
      screen.queryByTestId(`sidebar-${destination}-padlock`, HIDDEN);
    // Unlocked, the owner's padlocks are faded out but keep their room.
    expect(padlock("wallet")).toBeTruthy();
    expect(padlock("settings")).toBeTruthy();

    // Never locked on an employee's device: its rows give that room to their names.
    await view.rerender(sidebar("pos", true));
    expect(screen.getByText("My activity")).toBeTruthy();
    expect(padlock("pos")).toBeNull();
    expect(padlock("wallet")).toBeNull();
    expect(padlock("settings")).toBeNull();
  });
});
