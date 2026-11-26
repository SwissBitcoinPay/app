import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { Notification, NotificationAmount } from "@/components/ui/Notification";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "@/components/ui/Switch";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { lightColors as colors, motion, tracked, type, palette } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";
import { drawn, svgColour } from "../../jest/svg";

// Four points where the app follows the design system.

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual("react-native-reanimated"),
  useReducedMotion: jest.fn(() => false)
}));

const flat = (style: unknown) => StyleSheet.flatten(style as StyleProp<ViewStyle>) ?? {};
const HIDDEN = { includeHiddenElements: true };

describe("the tabs' line", () => {
  const ITEMS: TabItem<"business" | "charging">[] = [
    { value: "business", label: "Business", icon: "store", testID: "tab-business" },
    { value: "charging", label: "Payments", icon: "coins", testID: "tab-charging" }
  ];

  // The row's scroll view clips what overhangs its content: the line, 1 px below its tab, stays
  // inside it, its 3 px over the hairline.
  it("is drawn whole, over the row's hairline", async () => {
    await render(
      <Tabs items={ITEMS} value="business" onChange={() => undefined} label="Settings" testID="t" />
    );
    const content = flat(screen.getByTestId("t").props.contentContainerStyle);
    const line = flat(screen.getByTestId("tab-business-line").props.style);
    expect(line.height).toBe(3);
    // Within the scroll view's content: its 1 px below the tabs takes the line's overhang.
    expect(Number(content.paddingBottom) + Number(line.bottom)).toBeGreaterThanOrEqual(0);
    expect(line.bottom).toBe(-1);

    // The hairline: the row's last pixel, the one the line covers.
    const hairline = flat(screen.getByTestId("t-hairline").props.style);
    expect(hairline).toMatchObject({
      position: "absolute",
      bottom: 0,
      height: 1,
      backgroundColor: colors.border.subtle
    });
    expect(screen.queryByTestId("tab-charging-line")).toBeNull();
  });
});

describe("a spinner over ink", () => {
  const rail = () =>
    svgColour(drawn("RNSVGCircle", screen.getByTestId("s", HIDDEN))[0].props.stroke);

  it("turns on an ink rail by default", async () => {
    await render(<Spinner size={12} testID="s" />);
    expect(rail()).toEqual({ rgb: palette.ink, alpha: expect.closeTo(0.1, 2) });
  });

  // The side bar's padlocks and the scanner wait on ink, where ink at 10 % could not be seen.
  it("turns on the rail it is given: white at 25 % over ink", async () => {
    await render(<Spinner size={12} rail={colors.onDark.ring} testID="s" />);
    expect(rail()).toEqual({ rgb: palette.white, alpha: expect.closeTo(0.25, 2) });
  });
});

describe("the switch with Reduce Motion", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(useReducedMotion).mockReturnValue(true);
  });

  afterEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
    jest.useRealTimers();
  });

  const toggle = (value: boolean) => (
    <Switch value={value} onValueChange={() => undefined} label="On-chain payments" testID="sw" />
  );
  const knobX = () => {
    const transform = getAnimatedStyle(screen.getByTestId("sw-knob")).transform as {
      translateX: number;
    }[];
    return transform[0].translateX;
  };
  const track = () => getAnimatedStyle(screen.getByTestId("sw-track")).backgroundColor;

  // The track's colour fades, a fade kept with Reduce Motion; only the knob jumps.
  it("puts the knob at its place at once, and fades the track's colour", async () => {
    const { rerender } = await render(toggle(false));
    const off = track();
    expect(knobX()).toBe(0);

    await rerender(toggle(true));
    // One frame later (an animated style is applied at the next frame), 52 wide, 3 inside, a knob
    // of 26: the 20 of its travel, all of it.
    await act(async () => {
      jest.advanceTimersByTime(16);
    });
    expect(knobX()).toBe(20);
    expect(track()).not.toBe("rgba(247, 147, 26, 1)");
    await act(async () => {
      jest.advanceTimersByTime(motion.fast / 2);
    });
    expect(knobX()).toBe(20);
    const halfway = track();
    expect(halfway).not.toBe(off);
    expect(halfway).not.toBe("rgba(247, 147, 26, 1)");

    await act(async () => {
      jest.advanceTimersByTime(motion.fast);
    });
    expect(track()).toBe("rgba(247, 147, 26, 1)");
  });
});

describe("a notification's body", () => {
  // The label role, tightened as Callout's and ErrorMessage's text of the same size.
  it("is tightened as a label, an amount in it keeping mono's spacing", async () => {
    await render(
      <Notification
        tone="success"
        title="Payment received"
        body={
          <>
            Received <NotificationAmount>24.50 CHF</NotificationAmount>
          </>
        }
      />
    );
    const body = flat(screen.getByText(/Received/).props.style) as { fontSize?: number };
    expect(body.fontSize).toBe(type.label);
    expect((body as { letterSpacing?: number }).letterSpacing).toBe(tracked.label);
    const amount = flat(screen.getByText("24.50 CHF").props.style) as { letterSpacing?: number };
    expect(amount.letterSpacing).toBe(0);
  });
});
